/** Web Audio API engine — layered ambiance mixing + BGM.
 *
 *  Singleton — all components share the same AudioContext & layers.
 *
 *  Usage:
 *    const engine = useAudioEngine()
 *    await engine.init()
 *    engine.playAmbiance(['creek', 'rain'])
 *    engine.setMasterVolume(0.8)
 */

import { ref, readonly } from 'vue'
import { ASSET_PATHS } from '../utils/assetPaths'

interface AudioLayer {
  source: AudioBufferSourceNode | null
  gain: GainNode
  buffer: AudioBuffer | null
  path: string
}

const AMBIANCE_GAIN = 0.5
const BGM_GAIN = 0.4
const FADE_IN = 0.3
const FADE_OUT = 0.15
const BGM_FADE_OUT = 0.25

// ── Module-level singleton state ──
let ctx: AudioContext | null = null
const masterGain = ref<GainNode | null>(null)
const initialized = ref(false)
const activeLayers = new Map<string, AudioLayer>()
const audioBuffers = new Map<string, AudioBuffer>()
const inFlightLoads = new Map<string, Promise<AudioBuffer | null>>()

let bgmSource: AudioBufferSourceNode | null = null
let bgmGain: GainNode | null = null
let currentBgmTrack: string | null = null

/** Generation counters — invalidate stale async loads when a newer
 *  playAmbiance / stopAllAmbiance / playBgm call arrives mid-flight. */
let playGeneration = 0
let bgmGeneration = 0

let gestureListenersAttached = false

/** Browsers start an AudioContext suspended until a user gesture. */
function resumeOnGesture() {
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {})
}

function fadeOutAndStop(
  source: AudioBufferSourceNode | null,
  gain: GainNode | null,
  fadeSeconds: number,
) {
  if (!ctx) {
    try { source?.stop() } catch { /* already stopped */ }
    try { source?.disconnect() } catch { /* ok */ }
    try { gain?.disconnect() } catch { /* ok */ }
    return
  }

  const now = ctx.currentTime
  if (gain) {
    try {
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(0, now + fadeSeconds)
    } catch { /* ok */ }
  }
  try { source?.stop(now + fadeSeconds + 0.02) } catch { /* already stopped */ }

  setTimeout(() => {
    try { source?.disconnect() } catch { /* ok */ }
    try { gain?.disconnect() } catch { /* ok */ }
  }, (fadeSeconds + 0.1) * 1000)
}

export function useAudioEngine() {
  // ── Initialization (must be called from a user gesture) ──

  async function init(): Promise<void> {
    if (initialized.value) return
    try {
      ctx = new AudioContext()
      const gain = ctx.createGain()
      gain.gain.value = 0.8
      gain.connect(ctx.destination)
      masterGain.value = gain
      initialized.value = true

      if (!gestureListenersAttached) {
        document.addEventListener('pointerdown', resumeOnGesture, { passive: true })
        document.addEventListener('keydown', resumeOnGesture)
        gestureListenersAttached = true
      }
      resumeOnGesture()
    } catch (err) {
      console.warn('Web Audio API not available:', err)
    }
  }

  // ── Buffer loading (dedupes concurrent loads of the same URL) ──

  async function loadBuffer(url: string): Promise<AudioBuffer | null> {
    if (!ctx) return null
    const cached = audioBuffers.get(url)
    if (cached) return cached

    const pending = inFlightLoads.get(url)
    if (pending) return pending

    const task = (async () => {
      try {
        const response = await fetch(url)
        if (!response.ok) {
          console.warn(`Audio file not found: ${url} (HTTP ${response.status})`)
          return null
        }
        const arrayBuffer = await response.arrayBuffer()
        const buffer = await ctx!.decodeAudioData(arrayBuffer)
        audioBuffers.set(url, buffer)
        return buffer
      } catch (err) {
        console.warn(`Failed to load audio: ${url}`, err)
        return null
      } finally {
        inFlightLoads.delete(url)
      }
    })()

    inFlightLoads.set(url, task)
    return task
  }

  // ── Ambiance layers ──

  function stopAllAmbiance(): void {
    playGeneration++  // invalidate any in-flight async loads
    for (const [, layer] of activeLayers) {
      fadeOutAndStop(layer.source, layer.gain, FADE_OUT)
    }
    activeLayers.clear()
  }

  async function playAmbiance(keys: string[]): Promise<void> {
    if (!ctx || !masterGain.value) return
    resumeOnGesture()

    // Bump generation — in-flight async loads from previous calls are now stale
    const gen = ++playGeneration

    // Stop layers no longer needed
    for (const [key, layer] of activeLayers) {
      if (!keys.includes(key)) {
        fadeOutAndStop(layer.source, layer.gain, FADE_OUT)
        activeLayers.delete(key)
      }
    }

    // Load all new layers concurrently; duplicate URLs share one fetch+decode
    const pending = keys
      .filter(key => !activeLayers.has(key))
      .map(async (key) => {
        const path = (ASSET_PATHS.audio.ambiance as Record<string, string>)[key]
        if (!path) return { key, path: '', buffer: null as AudioBuffer | null }
        return { key, path, buffer: await loadBuffer(path) }
      })
    const loaded = await Promise.all(pending)

    // Guard: discard if a newer playAmbiance / stopAllAmbiance has been called
    // while we were loading the buffers
    if (gen !== playGeneration) return
    if (!ctx || !masterGain.value) return

    for (const { key, path, buffer } of loaded) {
      if (!buffer || !path || activeLayers.has(key)) continue

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true

      const gain = ctx.createGain()
      const now = ctx.currentTime
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(AMBIANCE_GAIN, now + FADE_IN)
      gain.connect(masterGain.value)

      source.connect(gain)
      source.start()

      activeLayers.set(key, { source, gain, buffer, path })
    }
  }

  function setLayerVolume(key: string, vol: number): void {
    const layer = activeLayers.get(key)
    if (layer) layer.gain.gain.value = Math.max(0, Math.min(1, vol))
  }

  // ── BGM ──

  function fadeOutBgm() {
    if (bgmSource || bgmGain) fadeOutAndStop(bgmSource, bgmGain, BGM_FADE_OUT)
    bgmSource = null
    bgmGain = null
  }

  async function playBgm(trackKey: string): Promise<void> {
    if (!ctx || !masterGain.value) return
    resumeOnGesture()

    // Skip if the same track is already playing (avoids restart on view switch)
    if (currentBgmTrack === trackKey && bgmSource) return

    const gen = ++bgmGeneration
    fadeOutBgm()
    currentBgmTrack = null

    const path = (ASSET_PATHS.audio.music as Record<string, string>)[trackKey]
    if (!path) return

    const buffer = await loadBuffer(path)
    if (!buffer || !ctx || !masterGain.value) return

    // A newer playBgm / stopBgm may have arrived while we were loading
    if (gen !== bgmGeneration) return

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true

    const gain = ctx.createGain()
    const now = ctx.currentTime
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(BGM_GAIN, now + FADE_IN)
    gain.connect(masterGain.value)

    source.connect(gain)
    source.start()

    bgmSource = source
    bgmGain = gain
    currentBgmTrack = trackKey
  }

  function stopBgm(): void {
    bgmGeneration++
    fadeOutBgm()
    currentBgmTrack = null
  }

  // ── Master volume ──

  function setMasterVolume(percent: number): void {
    if (masterGain.value) {
      masterGain.value.gain.value = Math.max(0, Math.min(1, percent / 100))
    }
  }

  function mute(): void {
    if (masterGain.value) masterGain.value.gain.value = 0
  }

  function unmute(percent: number = 80): void {
    if (masterGain.value) masterGain.value.gain.value = percent / 100
  }

  // ── Cleanup ──

  function dispose(): void {
    stopAllAmbiance()
    stopBgm()
    if (gestureListenersAttached) {
      document.removeEventListener('pointerdown', resumeOnGesture)
      document.removeEventListener('keydown', resumeOnGesture)
      gestureListenersAttached = false
    }
    ctx?.close()
    ctx = null
    masterGain.value = null
    initialized.value = false
    audioBuffers.clear()
    inFlightLoads.clear()
  }

  return {
    initialized: readonly(initialized),
    init,
    playAmbiance,
    stopAllAmbiance,
    setLayerVolume,
    playBgm,
    stopBgm,
    setMasterVolume,
    mute,
    unmute,
    dispose,
  }
}
