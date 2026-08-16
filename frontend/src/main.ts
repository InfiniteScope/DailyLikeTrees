import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { initPlatform } from './composables/usePlatform'

// Global styles
import './styles/variables.css'
import './styles/base.css'

// Detect platform early (before router resolves)
initPlatform()

// Detect Electron environment for frameless window styling
if ('electronAPI' in window) {
  document.documentElement.classList.add('electron-app')
}

// Register Service Worker for PWA offline support
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // SW registration failure is non-fatal (e.g. dev mode, HTTP)
  })
}

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
