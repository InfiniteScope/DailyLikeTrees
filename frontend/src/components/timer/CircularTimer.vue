<template>
  <div class="circular-timer" :class="{ dragging: isDragging }">
    <svg
      ref="svgRef"
      class="timer-svg"
      viewBox="0 0 300 300"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
    >
      <!-- Background track -->
      <circle
        cx="150" cy="150" r="120"
        fill="none"
        :stroke="trackColor"
        stroke-width="10"
      />

      <!-- Set-time arc: only for countdown & countup (not free) during idle/completed -->
      <circle
        v-if="showSetTimeArc && store.mode !== 'free'"
        cx="150" cy="150" r="120"
        fill="none"
        :stroke="setTimeArcColor"
        stroke-width="12"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="setTimeDashOffset"
        class="set-time-arc"
        transform="rotate(-90 150 150)"
      />

      <!-- Progress arc: during running/paused -->
      <circle
        v-if="!showSetTimeArc"
        cx="150" cy="150" r="120"
        fill="none"
        :stroke="progressColor"
        stroke-width="12"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="progressDashOffset"
        class="progress-arc"
        :class="{ 'no-transition': isDragging }"
        transform="rotate(-90 150 150)"
      />

      <!-- Drag knob: only for countdown & countup during idle/completed -->
      <circle
        v-if="(store.isIdle || store.isCompleted) && store.mode !== 'free'"
        :cx="dragKnobPosition.x"
        :cy="dragKnobPosition.y"
        r="16"
        :fill="dragKnobColor"
        class="drag-knob"
        stroke="white"
        stroke-width="3"
      />

      <!-- Center content (pointer-events: auto so it intercepts clicks) -->
      <foreignObject x="40" y="70" width="220" height="160">
        <div class="timer-center" xmlns="http://www.w3.org/1999/xhtml">
          <TimerDisplay />
          <TreePreview @click="showPicker = true" />
        </div>
      </foreignObject>
    </svg>

    <!-- Controls -->
    <div class="timer-controls">
      <TimerModeSelector />

      <button
        v-if="store.isIdle || store.isCompleted"
        class="btn btn-start"
        @click="store.start()"
      >
        开始专注
      </button>

      <template v-if="store.isRunning">
        <button class="btn btn-pause" @click="store.pause()">暂停</button>
      </template>

      <template v-if="store.isPaused">
        <button class="btn btn-resume" @click="store.resume()">继续</button>
        <button
          v-if="store.mode === 'free' && store.elapsedSeconds >= 30"
          class="btn btn-complete"
          @click="store.complete()"
        >
          结束
        </button>
        <button v-else class="btn btn-abandon" @click="store.abandon()">放弃</button>
      </template>
    </div>

    <!-- Celebration toast -->
    <Transition name="celebrate">
      <div v-if="showCelebration" class="celebration-toast" @click="showCelebration = false">
        <IconSvg name="sparkle" :size="18" class="celebration-icon" />
        <span>种下了一棵 {{ plantedLabel }}！</span>
      </div>
    </Transition>

    <TreeSpeciesPicker v-if="showPicker" @close="showPicker = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useTimerStore } from '../../stores/timer'
import { useSettingsStore } from '../../stores/settings'
import { TREE_SPECIES } from '../../utils/constants'
import { getGrowthLabel, getGrowthStage } from '../../utils/treeGrowth'
import IconSvg from '../icons/IconSvg.vue'
import TimerDisplay from './TimerDisplay.vue'
import TreePreview from './TreePreview.vue'
import TimerModeSelector from './TimerModeSelector.vue'
import TreeSpeciesPicker from './TreeSpeciesPicker.vue'

const store = useTimerStore()
const settings = useSettingsStore()

const svgRef = ref<SVGSVGElement | null>(null)
const showPicker = ref(false)
const isDragging = ref(false)
const showCelebration = ref(false)
const plantedLabel = ref('')

// ── Constants ──
const RING_RADIUS = 120
const circumference = 2 * Math.PI * RING_RADIUS
const MAX_MINUTES = 120

// ── Colors ──

const colors: Record<string, string> = {
  tree1: '#6B8E23', tree2: '#1B5E20', tree3: '#F5F5F5', tree4: '#FFB7C5',
  tree5: '#5DAE5F', tree6: '#C0392B', tree7: '#D4A017', tree8: '#2E7D32',
  tree9: '#F9A825', tree10: '#D84315', tree11: '#E65100', tree12: '#BF360C',
  tree13: '#1B5E20', tree14: '#D7CCC8', tree15: '#B3E5FC', tree16: '#81D4FA',
  tree17: '#ECEFF1', tree18: '#795548', tree19: '#F48FB1', tree20: '#FF8F00',
  tree21: '#43A047', tree22: '#9B3A6A', tree23: '#66BB6A', tree24: '#2E7D32',
  tree25: '#A5D6A7', tree26: '#388E3C', tree27: '#FFB300', tree28: '#FFC107',
  tree29: '#FF8F00', tree30: '#D4524B', tree31: '#E65100', tree32: '#C62828',
  tree33: '#E1F5FE', tree34: '#EF5350', tree35: '#558B2F', tree36: '#4CAF50',
  tree37: '#C0CA33',
}

const trackColor = computed(() =>
  settings.theme === 'dark' ? '#3a3a3a' : '#e8e8e8'
)
const progressColor = computed(() => colors[store.selectedSpeciesId] || '#6B8E23')
const setTimeArcColor = computed(() => (colors[store.selectedSpeciesId] || '#6B8E23') + '60')
const dragKnobColor = computed(() => colors[store.selectedSpeciesId] || '#6B8E23')

const showSetTimeArc = computed(() => store.isIdle || store.isCompleted)

const setTimeDashOffset = computed(() => {
  const fraction = store.targetSeconds / (MAX_MINUTES * 60)
  return circumference * (1 - Math.min(fraction, 1))
})

const progressDashOffset = computed(() => {
  const pct = store.progressPercent / 100
  return circumference * (1 - pct)
})

// ── Drag knob ──

const angleToSeconds = (angleRad: number): number => {
  let a = angleRad + Math.PI / 2
  if (a < 0) a += 2 * Math.PI
  if (a > 2 * Math.PI) a -= 2 * Math.PI
  const minutes = (a / (2 * Math.PI)) * MAX_MINUTES
  const SNAPS = [15, 25, 30, 45, 60, 90, 120]
  for (const s of SNAPS) {
    if (Math.abs(minutes - s) <= 2) return s * 60
  }
  return Math.max(1, Math.round(minutes)) * 60
}

const secondsToAngle = (seconds: number): number => {
  const fraction = seconds / (MAX_MINUTES * 60)
  return fraction * 2 * Math.PI - Math.PI / 2
}

const dragKnobPosition = computed(() => {
  const angle = secondsToAngle(store.targetSeconds)
  return {
    x: 150 + RING_RADIUS * Math.cos(angle),
    y: 150 + RING_RADIUS * Math.sin(angle),
  }
})

// ── Pointer handling ──

function svgPointFromEvent(e: PointerEvent): { x: number; y: number } | null {
  const svg = svgRef.value
  if (!svg) return null
  const pt = svg.createSVGPoint()
  pt.x = e.clientX; pt.y = e.clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const svgPt = pt.matrixTransform(ctm.inverse())
  return { x: svgPt.x, y: svgPt.y }
}

function onPointerDown(e: PointerEvent) {
  if (!store.isIdle && !store.isCompleted) return
  if (store.mode === 'free') return  // no drag in free mode

  const svgPt = svgPointFromEvent(e)
  if (!svgPt) return

  // Only start drag if clicking near the ring (not in the center area)
  const dist = Math.sqrt((svgPt.x - 150) ** 2 + (svgPt.y - 150) ** 2)
  if (dist < 85 || dist > 145) return  // ignore center & outside clicks

  isDragging.value = true
  svgRef.value?.setPointerCapture?.(e.pointerId)
  const angle = Math.atan2(svgPt.y - 150, svgPt.x - 150)
  store.setTargetDuration(angleToSeconds(angle))
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging.value) return
  const svgPt = svgPointFromEvent(e)
  if (!svgPt) return
  const angle = Math.atan2(svgPt.y - 150, svgPt.x - 150)
  store.setTargetDuration(angleToSeconds(angle))
}

function onPointerUp(e: PointerEvent) {
  isDragging.value = false
  svgRef.value?.releasePointerCapture?.(e.pointerId)
}

// ── Celebration animation ──

let celebrationTimer: ReturnType<typeof setTimeout> | null = null

watch(() => store.isCompleted, (completed) => {
  if (completed && store.elapsedSeconds >= 30) {
    const species = TREE_SPECIES.find(s => s.id === store.selectedSpeciesId)
    const growth = getGrowthStage(store.elapsedSeconds / 60)
    plantedLabel.value = `${species?.name || '树'} · ${getGrowthLabel(growth)}`
    showCelebration.value = true
    if (celebrationTimer) clearTimeout(celebrationTimer)
    celebrationTimer = setTimeout(() => { showCelebration.value = false }, 3000)
  }
})

onUnmounted(() => {
  if (celebrationTimer) clearTimeout(celebrationTimer)
})
</script>

<style scoped>
.circular-timer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  user-select: none;
  -webkit-user-select: none;
}

.timer-svg {
  width: min(340px, 85vw);
  height: min(340px, 85vw);
  cursor: default;
  touch-action: none;
}

.dragging .timer-svg,
.dragging .drag-knob {
  cursor: grabbing;
}

.drag-knob {
  cursor: grab;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.25));
  transition: r 0.12s;
}

.dragging .drag-knob { r: 20; }

.progress-arc {
  transition: stroke-dashoffset 0.3s ease;
}

.progress-arc.no-transition { transition: none; }

.set-time-arc {
  transition: stroke-dashoffset 0.15s ease;
}

.timer-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 4px;
  pointer-events: auto;
  overflow: visible;
}

.timer-controls {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
}

.btn {
  padding: 10px 28px;
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: var(--fw-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn:hover { transform: translateY(-1px); }
.btn:active { transform: scale(0.97); }
.btn-start { background: var(--color-primary); color: white; }
.btn-pause { background: var(--color-warning, #f0ad4e); color: white; }
.btn-resume { background: var(--color-primary); color: white; }
.btn-complete { background: var(--color-primary); color: white; }
.btn-abandon { background: var(--color-muted, #999); color: white; }

/* Celebration toast */
.celebration-toast {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-primary);
  color: white;
  padding: 14px 28px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: var(--fw-medium);
  box-shadow: var(--shadow-md);
  z-index: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.celebration-icon {
  color: white;
}

.celebration-emoji {
  font-size: 22px;
  animation: bounce 0.6s ease infinite alternate;
}

@keyframes bounce {
  from { transform: scale(1); }
  to { transform: scale(1.3); }
}

.celebrate-enter-active { animation: slideDown 0.4s ease; }
.celebrate-leave-active { animation: slideDown 0.3s ease reverse; }

@keyframes slideDown {
  from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>
