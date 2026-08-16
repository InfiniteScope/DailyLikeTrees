<template>
  <!-- Browser mode: render inline via Teleport -->
  <Teleport to="body">
    <Transition name="fb">
      <div
        v-if="visible"
        class="floating-ball"
        :class="{ expanded: expanded }"
        :style="ballStyle"
        @click="handleBallClick"
        @mousedown="startDrag"
        @touchstart="startDrag"
      >
        <div v-if="!expanded" class="fb-mini">
          <div class="fb-mini-timer">{{ timer.formattedTime }}</div>
          <div v-if="activeTodoText" class="fb-mini-todo" :title="activeTodoText">{{ activeTodoText }}</div>
        </div>
        <div v-else class="fb-panel">
          <div class="fb-panel-header">
            <span class="fb-timer">{{ timer.formattedTime }}</span>
            <button class="fb-close" @click.stop="expanded = false" title="收起">
              <IconSvg name="close" :size="14" />
            </button>
          </div>
          <div v-if="todos.items.length === 0" class="fb-empty">暂无待办</div>
          <ul v-else class="fb-todo-list">
            <li
              v-for="item in todos.items"
              :key="item.id"
              class="fb-todo-item"
              :class="{ active: todos.activeTodoId === item.id, completed: item.completed }"
              @click.stop="todos.setActiveTodo(item.id)"
            >
              <span class="fb-dot" />
              <span class="fb-todo-text">{{ item.content }}</span>
              <button
                v-if="todos.activeTodoId === item.id"
                class="fb-clear-active"
                @click.stop="todos.setActiveTodo(null)"
                title="取消正在做"
              >✕</button>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { useTimerStore } from '../../stores/timer'
import { useTodosStore } from '../../stores/todos'
import IconSvg from '../icons/IconSvg.vue'

const settings = useSettingsStore()
const timer = useTimerStore()
const todos = useTodosStore()

// ── Runtime detection (Electron / Browser) ──
const isElectron = typeof window !== 'undefined' && 'electronAPI' in window
const electronAPI = isElectron ? (window as any).electronAPI : null

// ── Browser state ──
const visible = ref(false)
const expanded = ref(false)
const pos = ref({ x: window.innerWidth - 120, y: 120 })
const dragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })

// ── Floating-window state ──
let windowOpen = false
let unlistenSetActive: (() => void) | null = null

// ── Open / close the floating window ──

async function openFloatingWindow() {
  if (windowOpen) return
  windowOpen = true

  // ── Electron path ──
  if (isElectron && electronAPI) {
    const sw = window.screen.availWidth
    const sh = window.screen.availHeight
    electronAPI.openFloating({ width: 130, height: 75, x: sw - 160, y: sh - 140 })
    if (electronAPI.onEvent) {
      const unsub = electronAPI.onEvent((name: string, payload: any) => {
        if (name === 'fb:set-active') { todos.setActiveTodo(payload?.todoId ?? null) }
        if (name === 'fb:request-state') { emitStateToFloating() }
      })
      unlistenSetActive = unsub
    }
    return
  }

  // Browser fallback: inline ball (no native window support)
  windowOpen = false
}

async function closeFloatingWindow() {
  if (!windowOpen) return
  windowOpen = false

  if (unlistenSetActive) { unlistenSetActive(); unlistenSetActive = null }

  if (isElectron && electronAPI) {
    electronAPI.closeFloating()
    return
  }
}

async function emitStateToFloating() {
  if (!windowOpen) return

  const state = {
    timerStatus: timer.status,
    elapsedSeconds: timer.elapsedSeconds,
    targetSeconds: timer.targetSeconds,
    mode: timer.mode,
    todos: todos.items,
    activeTodoId: todos.activeTodoId,
  }

  if (isElectron && electronAPI) {
    electronAPI.sendEvent('fb:state', state)
  }
}

// ── Focus tracking ──

let lastFocused = true
let focusCheckTimer: ReturnType<typeof setInterval> | null = null

async function checkFocus() {
  const focused = document.hasFocus()

  if (isElectron) {
    if (!focused && lastFocused && settings.floatingBallEnabled) {
      await openFloatingWindow()
    } else if (focused && !lastFocused) {
      await closeFloatingWindow()
    }
  } else {
    if (settings.floatingBallEnabled) {
      visible.value = !focused
    } else {
      visible.value = false
    }
  }

  lastFocused = focused
}

// ── State-change watchers → emit updates to floating window ──
watch(() => timer.status, () => { if (windowOpen) emitStateToFloating() })
watch(() => todos.activeTodoId, () => { if (windowOpen) emitStateToFloating() })
let lastTickEmit = 0
watch(() => timer.elapsedSeconds, () => {
  if (!windowOpen) return
  const now = Date.now()
  if (now - lastTickEmit > 3000) {
    lastTickEmit = now
    emitStateToFloating()
  }
})

// ── Browser-only helpers ──

const activeTodoText = computed(() => {
  const todo = todos.items.find(t => t.id === todos.activeTodoId)
  return todo ? todo.content : ''
})

const ballStyle = computed(() => ({ left: `${pos.value.x}px`, top: `${pos.value.y}px` }))

function handleBallClick() {
  if (!dragging.value) expanded.value = !expanded.value
}

function startDrag(e: MouseEvent | TouchEvent) {
  dragging.value = false
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
  dragOffset.value = { x: clientX - pos.value.x, y: clientY - pos.value.y }

  const moveHandler = (ev: MouseEvent | TouchEvent) => {
    dragging.value = true
    const cx = 'touches' in ev ? ev.touches[0].clientX : ev.clientX
    const cy = 'touches' in ev ? ev.touches[0].clientY : ev.clientY
    pos.value = {
      x: Math.max(0, Math.min(window.innerWidth - 60, cx - dragOffset.value.x)),
      y: Math.max(0, Math.min(window.innerHeight - 60, cy - dragOffset.value.y)),
    }
  }

  const upHandler = () => {
    document.removeEventListener('mousemove', moveHandler)
    document.removeEventListener('mouseup', upHandler)
    document.removeEventListener('touchmove', moveHandler)
    document.removeEventListener('touchend', upHandler)
    setTimeout(() => { dragging.value = false }, 50)
  }

  document.addEventListener('mousemove', moveHandler)
  document.addEventListener('mouseup', upHandler)
  document.addEventListener('touchmove', moveHandler)
  document.addEventListener('touchend', upHandler)
}

// ── Lifecycle ──

onMounted(() => {
  checkFocus()
  window.addEventListener('blur', checkFocus)
  window.addEventListener('focus', checkFocus)
  focusCheckTimer = setInterval(checkFocus, 1000)
})

onUnmounted(() => {
  window.removeEventListener('blur', checkFocus)
  window.removeEventListener('focus', checkFocus)
  if (focusCheckTimer) clearInterval(focusCheckTimer)
  closeFloatingWindow()
})
</script>

<style scoped>
/* Browser-only inline floating ball styles */
.floating-ball {
  position: fixed;
  z-index: 5000;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.fb-mini {
  width: 90px;
  min-height: 50px;
  padding: 8px 10px;
  border-radius: 18px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  backdrop-filter: blur(12px);
}

.fb-mini:hover { transform: scale(1.03); }

.fb-mini-timer {
  font-size: 15px;
  font-weight: var(--fw-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--color-primary);
}

.fb-mini-todo {
  font-size: 10px;
  color: var(--color-text-secondary);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fb-panel {
  width: 220px;
  max-height: 320px;
  padding: 10px 12px;
  border-radius: 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(16px);
}

.fb-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 8px;
}

.fb-timer {
  font-size: 16px;
  font-weight: var(--fw-semibold);
  color: var(--color-primary);
  font-variant-numeric: tabular-nums;
}

.fb-close {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.fb-close:hover { background: var(--color-hover-bg); }

.fb-empty {
  font-size: 12px;
  color: var(--color-text-secondary);
  text-align: center;
  padding: 12px 0;
}

.fb-todo-list {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  max-height: 220px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fb-todo-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background .15s;
  font-size: 12px;
  color: var(--color-text);
}

.fb-todo-item:hover { background: var(--color-hover-bg); }
.fb-todo-item.active { background: var(--color-primary); color: white; }
.fb-todo-item.completed { opacity: 0.45; text-decoration: line-through; }

.fb-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
  opacity: 0.6;
}

.fb-todo-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fb-clear-active {
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: currentColor;
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Transitions */
.fb-enter-active, .fb-leave-active {
  transition: opacity .25s ease, transform .25s ease;
}
.fb-enter-from, .fb-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>
