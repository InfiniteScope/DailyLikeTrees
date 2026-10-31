/** Timer state machine — the heart of the app.
 *
 *  Modes:
 *    countdown — set target, count down to 0, auto-complete
 *    countup   — set target, count up to target, auto-complete
 *    free      — no target, count up freely, user stops manually
 *
 *  States: idle → running → paused → completed
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TimerMode, TimerStatus } from '../types/timer'
import { completeSession } from '../services/api'
import type { SessionCreateData } from '../services/api'
import {
  enqueuePendingSession,
  readPendingSessions,
  removePendingSession,
} from '../services/pendingSessions'
import { useForestStore } from './forest'

function newClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const useTimerStore = defineStore('timer', () => {
  // ── State ──
  const mode = ref<TimerMode>('countdown')
  const status = ref<TimerStatus>('idle')
  const targetSeconds = ref(25 * 60)
  const elapsedSeconds = ref(0)
  const selectedSpeciesId = ref('tree1')
  const currentSessionId = ref<number | null>(null)

  let startedAt: string | null = null
  let tickInterval: ReturnType<typeof setInterval> | null = null

  // ── Getters ──

  /** The time displayed in the center of the ring. */
  const displaySeconds = computed(() => {
    if (mode.value === 'countdown') {
      return Math.max(0, targetSeconds.value - elapsedSeconds.value)
    }
    // countup / free: show elapsed
    return elapsedSeconds.value
  })

  /** 0–100 progress of the arc. */
  const progressPercent = computed(() => {
    if (mode.value === 'free') {
      // Free: cycle every 60 min, just gives visual feedback
      return (elapsedSeconds.value % 3600) / 3600 * 100
    }
    // countdown / countup: progress toward target
    if (targetSeconds.value <= 0) return 0
    return Math.min(100, (elapsedSeconds.value / targetSeconds.value) * 100)
  })

  const formattedTime = computed(() => {
    const total = displaySeconds.value
    const hrs = Math.floor(total / 3600)
    const mins = Math.floor((total % 3600) / 60)
    const secs = total % 60
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  })

  const isRunning = computed(() => status.value === 'running')
  const isPaused = computed(() => status.value === 'paused')
  const isIdle = computed(() => status.value === 'idle')
  const isCompleted = computed(() => status.value === 'completed')

  // ── Actions ──

  function setMode(newMode: TimerMode) {
    if (status.value === 'running') return
    mode.value = newMode
    reset()
  }

  function setTargetDuration(seconds: number) {
    if (status.value === 'running') return
    targetSeconds.value = Math.max(60, seconds)
    elapsedSeconds.value = 0
  }

  function selectSpecies(speciesId: string) {
    selectedSpeciesId.value = speciesId
  }

  function start() {
    if (status.value === 'running') return

    if (status.value === 'idle' || status.value === 'completed') {
      elapsedSeconds.value = 0
      startedAt = new Date().toISOString()
    }
    // paused → resume keeps elapsedSeconds

    status.value = 'running'
    tickInterval = setInterval(() => {
      elapsedSeconds.value++

      // Auto-complete for countdown and countup when reaching target
      if (mode.value !== 'free' && elapsedSeconds.value >= targetSeconds.value) {
        complete()
      }
    }, 1000)
  }

  function pause() {
    if (status.value !== 'running') return
    status.value = 'paused'
    if (tickInterval) {
      clearInterval(tickInterval)
      tickInterval = null
    }
  }

  function resume() {
    start()
  }

  async function complete() {
    if (tickInterval) {
      clearInterval(tickInterval)
      tickInterval = null
    }
    status.value = 'completed'

    if (elapsedSeconds.value < 30) return

    const endedAt = new Date().toISOString()
    const payload: SessionCreateData = {
      client_id: newClientId(),
      timer_mode: mode.value,
      target_seconds: targetSeconds.value,
      actual_seconds: elapsedSeconds.value,
      species_id: selectedSpeciesId.value,
      started_at: startedAt || endedAt,
      ended_at: endedAt,
    }

    // Persist before sending so a crash/offline failure cannot lose the tree
    enqueuePendingSession(payload)

    try {
      const { data } = await completeSession(payload)
      removePendingSession(payload.client_id)
      currentSessionId.value = data.session.id
      // Refresh forest so the new tree appears
      useForestStore().fetchTrees()
      void flushPendingSessions()
    } catch (err) {
      console.error('Failed to save session (queued for retry):', err)
    }
  }

  let flushing = false

  /** Replay sessions that never reached the backend. Idempotent per client_id. */
  async function flushPendingSessions() {
    if (flushing) return
    flushing = true
    let planted = false
    try {
      for (const item of readPendingSessions()) {
        try {
          await completeSession(item)
          removePendingSession(item.client_id)
          planted = true
        } catch (err) {
          console.error('Failed to replay pending session:', err)
          break
        }
      }
    } finally {
      flushing = false
    }
    if (planted) useForestStore().fetchTrees()
  }

  function abandon() {
    if (tickInterval) {
      clearInterval(tickInterval)
      tickInterval = null
    }
    status.value = 'idle'
    elapsedSeconds.value = 0
    currentSessionId.value = null
  }

  function reset() {
    if (tickInterval) {
      clearInterval(tickInterval)
      tickInterval = null
    }
    status.value = 'idle'
    elapsedSeconds.value = 0
    currentSessionId.value = null
  }

  return {
    mode, status, targetSeconds, elapsedSeconds, selectedSpeciesId, currentSessionId,
    displaySeconds, progressPercent, formattedTime,
    isRunning, isPaused, isIdle, isCompleted,
    setMode, setTargetDuration, selectSpecies,
    start, pause, resume, complete, abandon, reset, flushPendingSessions,
  }
})
