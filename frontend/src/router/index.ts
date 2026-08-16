/** Vue Router — hash-based for PWA + Electron file:// compatibility.
 *
 *  Platform-aware routing:
 *    PC    → views/HomeView.vue  / views/ForestViewPage.vue
 *    Mobile → views/mobile/HomeView.vue  / views/mobile/ForestViewPage.vue
 *
 *  The platform is determined once at module load and never changes
 *  during the app lifetime (a user doesn't switch device mid-session).
 */

import { createRouter, createWebHashHistory } from 'vue-router'
import { detectPlatform } from '../composables/usePlatform'

const isMobile = detectPlatform() === 'mobile'

// ── PC views ──
import HomeViewPC from '../views/HomeView.vue'

// ── Mobile views ──
import HomeViewMobile from '../views/mobile/HomeView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: isMobile ? HomeViewMobile : HomeViewPC,
    },
    {
      path: '/forest',
      name: 'forest',
      // Lazy-loaded for both platforms
      component: isMobile
        ? () => import('../views/mobile/ForestViewPage.vue')
        : () => import('../views/ForestViewPage.vue'),
    },
    {
      path: '/floating',
      name: 'floating',
      component: () => import('../views/FloatingBallView.vue'),
    },
  ],
})

export default router
