<template>
  <div
    class="custom-titlebar"
    @mousedown="onTitleBarMouseDown"
  >
    <!-- App icon + title -->
    <div class="titlebar-left">
      <img :src="logoPath" alt="" class="titlebar-icon" />
      <span class="titlebar-title">DailyLikeTrees</span>
    </div>

    <!-- Window controls (desktop only) -->
    <div v-if="isDesktop" class="titlebar-controls">
      <button class="ctrl-btn ctrl-min" @mousedown.stop @click.stop="handleMinimize" title="最小化">
        <svg width="12" height="12" viewBox="0 0 12 12"><rect y="5" width="12" height="1.2" rx="0.6" fill="currentColor"/></svg>
      </button>
      <button class="ctrl-btn ctrl-max" @mousedown.stop @click.stop="handleToggleMaximize" title="最大化">
        <svg v-if="!isMax" width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
        <svg v-else width="12" height="12" viewBox="0 0 12 12"><rect x="3" y="0" width="9" height="9" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="0" y="3" width="9" height="9" rx="1.2" fill="var(--color-bg)"/><rect x="0" y="3" width="9" height="9" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
      </button>
      <button class="ctrl-btn ctrl-close" @mousedown.stop @click.stop="handleClose" title="关闭">
        <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'

const logoPath = computed(() => `${import.meta.env.BASE_URL}assets/logo.png`)

// ── Runtime detection: Electron → Browser ──

interface ElectronAPI {
  minimize(): Promise<void>
  toggleMaximize(): Promise<void>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  onMaximizeChange(cb: (isMax: boolean) => void): () => void
}

function getElectronAPI(): ElectronAPI | null {
  if (typeof window !== 'undefined' && 'electronAPI' in window) {
    return (window as any).electronAPI as ElectronAPI
  }
  return null
}

const electron = getElectronAPI()
const isDesktop = electron !== null

const isMax = ref(false)

async function refreshMaxState() {
  if (electron) {
    try { isMax.value = await electron.isMaximized() } catch { /* ignore */ }
  }
}

async function handleMinimize() {
  if (electron) { await electron.minimize() }
}

async function handleToggleMaximize() {
  if (electron) {
    await electron.toggleMaximize()
    await refreshMaxState()
  }
}

async function handleClose() {
  if (electron) { await electron.close() }
}

function onTitleBarMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.closest('.ctrl-btn')) return
  // Electron handles drag via CSS -webkit-app-region
}

onMounted(() => {
  refreshMaxState()
  // Electron: listen for maximize state changes (OS maximize button, double-click title bar)
  if (electron) {
    electron.onMaximizeChange((max: boolean) => { isMax.value = max })
  }
})
</script>

<style scoped>
.custom-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  padding: 0 8px 0 14px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  user-select: none;
  -webkit-user-select: none;
  flex-shrink: 0;
  /* Electron: make entire title bar draggable */
  -webkit-app-region: drag;
}

.titlebar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.titlebar-icon {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  flex-shrink: 0;
}

.titlebar-title {
  font-size: 12px;
  font-weight: var(--fw-medium);
  color: var(--color-text);
  opacity: 0.8;
  letter-spacing: .02em;
}

.runtime-badge {
  font-size: 10px;
  font-weight: var(--fw-semibold);
  color: #e81123;
  background: rgba(232, 17, 35, 0.12);
  padding: 1px 6px;
  border-radius: 4px;
}

.runtime-badge.electron {
  color: #4a90d9;
  background: rgba(74, 144, 217, 0.12);
}

.titlebar-controls {
  display: flex;
  gap: 2px;
}

.ctrl-btn {
  width: 36px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background .15s, color .15s;
  -webkit-app-region: no-drag;
}

.ctrl-btn:hover {
  background: var(--color-hover-bg);
  color: var(--color-text);
}

.ctrl-close:hover {
  background: #e81123;
  color: #fff;
}
</style>
