/** Platform detection composable.
 *
 * Detects whether the app is running on PC (desktop) or PE (mobile).
 * Used throughout the app to conditionally render platform-specific
 * components, layouts, and interactions.
 *
 * Detection strategy (in priority order):
 *   1. Electron — window.electronAPI is defined (always PC)
 *   2. Capacitor — window.Capacitor is defined
 *   3. User-Agent sniffing — Android / iPhone / iPad
 *   4. Screen size — narrow screen + touch (fallback heuristic)
 */

import { ref, computed } from 'vue'

// ── Reactive state (initialized on first usePlatform() call) ──
const _platform = ref<'pc' | 'mobile'>('pc')
let _initialized = false

// ════════════════════════════════════════════════════════════════════
//  Pure detection function — no Vue dependency, safe for module load
// ════════════════════════════════════════════════════════════════════

export function detectPlatform(): 'pc' | 'mobile' {
  // 1. Electron (always PC)
  if (typeof window !== 'undefined' && 'electronAPI' in window) {
    return 'pc'
  }

  // 2. Capacitor (Ionic mobile runtime)
  if (typeof window !== 'undefined' && 'Capacitor' in window) return 'mobile'

  // 3. User-Agent
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || ''
    if (/Android|iPhone|iPad|iPod|webOS/i.test(ua)) return 'mobile'
  }

  // 4. Screen size + touch heuristic
  if (
    typeof window !== 'undefined' &&
    'maxTouchPoints' in navigator &&
    navigator.maxTouchPoints > 0 &&
    window.innerWidth < 768
  ) {
    return 'mobile'
  }

  return 'pc'
}

// ════════════════════════════════════════════════════════════════════
//  Vue composable — reactive isPC / isMobile refs
// ════════════════════════════════════════════════════════════════════

export function usePlatform() {
  if (!_initialized) {
    _platform.value = detectPlatform()
    _initialized = true
  }

  const isPC = computed(() => _platform.value === 'pc')
  const isMobile = computed(() => _platform.value === 'mobile')
  const platform = computed(() => _platform.value)

  return { isPC, isMobile, platform }
}

// ════════════════════════════════════════════════════════════════════
//  Bootstrap helpers
// ════════════════════════════════════════════════════════════════════

/** Call once at app startup (from main.ts) to eagerly detect platform. */
export function initPlatform(): void {
  _platform.value = detectPlatform()
  _initialized = true
}

/** Allow overriding platform detection (e.g. for testing). */
export function overridePlatform(p: 'pc' | 'mobile'): void {
  _platform.value = p
  _initialized = true
}
