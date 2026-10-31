/** Service Worker — offline PWA support for DailyLikeTrees.
 *
 *  Strategy:
 *  - App shell (HTML/CSS/JS) → Cache First (precached at install)
 *  - Tree sprites / audio → Cache First (rarely change)
 *  - API calls → Network First (not cached; local mode uses IndexedDB)
 */

// Bump this whenever shipped static assets change, otherwise cache-first
// keeps serving the old files to returning users.
const CACHE_NAME = 'dlt-v2'
const PRECACHE_URLS = [
  './',
  './index.html',
]

// ── Install: precache the app shell ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // Some URLs may 404 in dev mode — that's fine
      })
    })
  )
  // Activate immediately (don't wait for old SW to close)
  self.skipWaiting()
})

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    })
  )
  // Claim all clients so the SW controls the page immediately
  self.clients.claim()
})

// ── Fetch ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // API calls — pass through (local mode uses IndexedDB)
  if (url.pathname.startsWith('/api/')) {
    return // don't intercept
  }

  // Static assets — Cache First
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached

      return fetch(event.request).then((response) => {
        // Cache successful responses for future offline use
        if (response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone)
          })
        }
        return response
      }).catch(() => {
        // Offline and not in cache — return nothing
        return new Response('', { status: 503 })
      })
    })
  )
})
