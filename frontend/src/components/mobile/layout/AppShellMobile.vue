<!-- Mobile App Shell — bottom tab navigation pattern.
     Typical mobile UX: content area + fixed bottom tab bar. -->
<template>
  <div class="mobile-shell">
    <!-- Main content area -->
    <main class="mobile-content">
      <router-view />
    </main>

    <!-- Bottom tab bar -->
    <nav class="mobile-tab-bar">
      <router-link to="/" class="tab-item" exact-active-class="tab-active">
        <IconSvg name="timer" :size="20" />
        <span class="tab-label">专注</span>
      </router-link>
      <router-link to="/forest" class="tab-item" exact-active-class="tab-active">
        <IconSvg name="tree" :size="20" />
        <span class="tab-label">森林</span>
      </router-link>
      <button class="tab-item" @click="showSettings = true">
        <IconSvg name="settings" :size="20" />
        <span class="tab-label">设置</span>
      </button>
    </nav>

    <SettingsPanel v-if="showSettings" open-on-mount @close="showSettings = false" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import IconSvg from '../../icons/IconSvg.vue'
import SettingsPanel from '../../settings/SettingsPanel.vue'

const showSettings = ref(false)
</script>

<style scoped>
.mobile-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh; /* dynamic viewport height for mobile browsers */
  background: var(--color-bg);
}

/* ── Content ── */
.mobile-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* ── Bottom tab bar ── */
.mobile-tab-bar {
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 64px;
  padding: 0 8px;
  padding-bottom: env(safe-area-inset-bottom, 0px); /* iPhone notch */
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
  z-index: 200;
}

.tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex: 1;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s;
  -webkit-tap-highlight-color: transparent;
}

.tab-label {
  font-size: 10px;
  font-weight: var(--fw-medium);
  letter-spacing: 0.04em;
}

.tab-active {
  color: var(--color-primary);
}
</style>
