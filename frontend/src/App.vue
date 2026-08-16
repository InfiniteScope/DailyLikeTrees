<!-- Root App component — renders platform-aware shell.
     PC    → AppShell (top header nav)
     Mobile → AppShellMobile (bottom tab nav)

     Special case: the /floating route boots a separate Electron window.
     It must bypass AppShell so it doesn't try to spawn another FloatingBall. -->

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useSettingsStore } from './stores/settings'
import { usePlatform } from './composables/usePlatform'
import { useAmbianceController } from './composables/useAmbianceController'
import AppShell from './components/layout/AppShell.vue'
import AppShellMobile from './components/mobile/layout/AppShellMobile.vue'

const route = useRoute()
const settings = useSettingsStore()
const { isMobile } = usePlatform()

// Floating-ball window: render just the view, no shell.
const isFloating = computed(() => route.name === 'floating')

// Global audio controller — only in the main window.
if (!isFloating.value) {
  useAmbianceController()
}

onMounted(() => {
  if (!isFloating.value) {
    settings.loadSettings()
  }
})
</script>

<template>
  <router-view v-if="isFloating" />
  <AppShell v-else-if="!isMobile" />
  <AppShellMobile v-else />
</template>
