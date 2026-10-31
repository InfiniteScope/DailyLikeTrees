<!-- Mobile Home View — touch-optimized focus screen with bottom nav.
     Reuses the same core components as the PC version but with
     full-width layout, larger touch targets, and scrollable content. -->
<template>
  <div class="mobile-home">
    <!-- Status bar (compact) -->
    <div class="mh-status-bar">
      <span class="mh-status-label">
        <IconSvg name="timer" :size="10" /> {{ modeLabel }}
      </span>
      <span class="mh-status-stats">已种 {{ forestStore.stats.count }} 棵</span>
    </div>

    <!-- Timer (dominates the screen) -->
    <div class="mh-timer-area">
      <CircularTimer />
    </div>

    <!-- Scrollable lower section -->
    <div class="mh-lower">
      <TodoBoard />
    </div>

    <!-- Settings FAB -->
    <button class="mh-fab" @click="showSettings = !showSettings" title="设置">
      <IconSvg name="settings" :size="20" />
    </button>

    <!-- Settings slide-up panel -->
    <Transition name="slide-up">
      <SettingsPanel v-if="showSettings" open-on-mount @close="showSettings = false" />
    </Transition>

    <!-- Dev test button (hidden in production) -->
    <DevToolsPanel v-if="settings.devMode" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useForestStore } from '../../stores/forest'
import { useTimerStore } from '../../stores/timer'
import CircularTimer from '../../components/timer/CircularTimer.vue'
import TodoBoard from '../../components/board/TodoBoard.vue'
import SettingsPanel from '../../components/settings/SettingsPanel.vue'
import DevToolsPanel from '../../components/settings/DevToolsPanel.vue'
import IconSvg from '../../components/icons/IconSvg.vue'
import { useSettingsStore } from '../../stores/settings'

const settings = useSettingsStore()

const forestStore = useForestStore()
const timerStore = useTimerStore()
const showSettings = ref(false)

const modeLabel = computed(() => {
  const labels: Record<string, string> = { countdown: '倒计时', countup: '正计时', free: '自由专注' }
  return labels[timerStore.mode] || '专注'
})

onMounted(() => {
  // Audio & BGM handled globally by useAmbianceController in App.vue
})
</script>

<style scoped>
.mobile-home {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  padding: 0 12px 100px; /* bottom padding for tab bar */
  gap: 16px;
  position: relative;
  z-index: 1;
}

/* ── Status bar ── */
.mh-status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 4px;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--color-text-secondary);
}
.mh-status-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: var(--fw-medium);
}
.mh-status-stats {
  font-weight: var(--fw-light);
  opacity: 0.8;
}

/* ── Timer ── */
.mh-timer-area {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}

/* ── Lower scrollable area ── */
.mh-lower {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* ── FAB ── */
.mh-fab {
  position: fixed;
  bottom: 90px;
  right: 20px;
  z-index: 200;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(12px);
  transition: transform 0.2s;
}
.mh-fab:active {
  transform: scale(0.92);
}

/* ── Slide-up transition ── */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
