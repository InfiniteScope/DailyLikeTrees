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

// Register Service Worker for PWA offline support (production only —
// a cache-first SW in dev serves stale assets after they change on disk)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    // SW registration failure is non-fatal (e.g. dev mode, HTTP)
  })
}

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
