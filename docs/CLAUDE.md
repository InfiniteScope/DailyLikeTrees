# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DailyLikeTrees is a multi-platform focus/productivity app inspired by the Forest app. Users set a focus timer → complete it → plant a tree in their isometric "Focus Forest."

**Platforms:** Web (SPA + PWA), Electron desktop (Windows), Android (Capacitor).

**Tech stack:** Vue 3 Composition API + TypeScript + Vite 8 (frontend), FastAPI + SQLite3 (backend), PixiJS 7.4.3 for isometric forest rendering, Web Audio API for ambient audio mixing, Electron 33 for desktop, Capacitor 8 for Android.

## Development Commands

```bash
# === Frontend (Web) ===
cd frontend
npm run dev              # Vite dev server (http://localhost:5173)
npm run build            # Type-check + production build (base: './')
npm run build:pwa        # PWA build (VITE_LOCAL_BACKEND=true, IndexedDB)
npx vue-tsc --noEmit    # TypeScript check only

# === Backend ===
cd backend
uvicorn app.main:app --reload   # FastAPI (http://localhost:8000)

# === Electron ===
cd electron-app
npm start                # Dev mode (loads localhost:5173, falls back to dist)
npm run build            # Build frontend + copy dist + electron-builder (NSIS)
# Output: release/DailyLikeTrees Setup X.X.X.exe (installer)
#         release/win-unpacked/DailyLikeTrees.exe (portable)

# === Android ===
cd frontend
npm run android:sync     # Sync built frontend into Capacitor android/
npm run android:build    # Full: build:pwa → sync → Gradle debug APK
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

The frontend dev server proxies to `localhost:8000` for API calls (hardcoded baseURL in `api.ts`). Both servers must be running for full functionality in web dev mode.

## Architecture

### Runtimes & Platform Detection

The app supports 3 runtime environments, detected at startup:

| Priority | Runtime | Detection | `usePlatform()` |
|----------|---------|-----------|-----------------|
| 1 | **Electron** | `window.electronAPI` (contextBridge) | `pc` |
| 2 | **Capacitor** | `window.Capacitor` | `mobile` |
| 3 | **Browser** | UA sniffing + screen touch heuristic | `pc` or `mobile` |

Key files:
- [`usePlatform.ts`](frontend/src/composables/usePlatform.ts) — detection composable + `detectPlatform()` pure function used by router at module load
- [`CustomTitleBar.vue`](frontend/src/components/layout/CustomTitleBar.vue) — window controls only render when Electron detected
- [`FloatingBall.vue`](frontend/src/components/layout/FloatingBall.vue) — uses `electronAPI.openFloating()` / `electronAPI.sendEvent()` for IPC
- [`main.ts`](frontend/src/main.ts) — adds `electron-app` class to `<html>` when Electron detected

### Dual-Backend API Layer

[`api.ts`](frontend/src/services/api.ts) supports two backends transparently:

| Mode | Trigger | Storage |
|------|---------|---------|
| **Remote HTTP** | Default (dev/Electron) | FastAPI at `localhost:8000` |
| **Local IndexedDB** | `VITE_LOCAL_BACKEND=true` (PWA/mobile) | Browser IndexedDB via `localDb.ts` |

All API functions (`completeSession`, `getTrees`, `getTodos`, `updateSettings`, etc.) check `USE_LOCAL` at call time and route to the appropriate backend. The PWA build sets `VITE_LOCAL_BACKEND=true` via `.env.pwa`.

### Electron App (`electron-app/`)

- **`main.js`** — Main process: creates frameless `BrowserWindow` with custom title bar (`frame: false`), spawns backend (dev: Python uvicorn, prod: `backend.exe` from `process.resourcesPath`), manages floating window lifecycle, relays IPC events between main ↔ floating windows
- **`preload.js`** — contextBridge exposing `window.electronAPI`: window controls, floating window ops, FB event relay (`sendEvent`/`onEvent`)
- **`package.json`** — `"type": "commonjs"`, electron-builder config: NSIS target, `extraResources` for `backend.exe`, `files` includes local `dist/` copy

**Build flow:** `build:frontend` → `copy:dist` (copies `../frontend/dist` → local `dist/`) → `electron-builder --win`. In production, `DIST_DIR = path.join(__dirname, 'dist')` (inside asar).

**Critical:** `ELECTRON_RUN_AS_NODE=1` env var makes Electron behave as plain Node.js — `npm start` clears it (`set ELECTRON_RUN_AS_NODE=`).

### Frontend (`frontend/src/`)

**Router** ([`router/index.ts`](frontend/src/router/index.ts)): Hash-based (`createWebHashHistory`) for PWA compatibility. Platform-aware: PC and mobile get different view components for `/` and `/forest`. Three routes:

| Path | PC View | Mobile View |
|------|---------|-------------|
| `/` | `HomeView.vue` | `mobile/HomeView.vue` |
| `/forest` | `ForestViewPage.vue` (lazy) | `mobile/ForestViewPage.vue` (lazy) |
| `/floating` | `FloatingBallView.vue` (lazy) | same |

**Vite config:** `base: './'` is REQUIRED — without it, Electron's `file://` protocol can't resolve absolute asset paths.

**Asset paths** ([`assetPaths.ts`](frontend/src/utils/assetPaths.ts)): All paths use `${import.meta.env.BASE_URL}assets/...` — evaluates to `/assets/...` in dev, `./assets/...` in production. Never hardcode absolute paths.

**Pinia Stores** (5 modules, composable pattern — `ref` + `computed` + functions inside `defineStore`):
| Store | Key State | Notes |
|-------|-----------|-------|
| `timer.ts` | mode, status, targetSeconds, elapsedSeconds | State machine: idle→running→paused→completed. Auto-completes on reaching target for countdown/countup. `complete()` calls POST `/api/sessions`. Sessions under 30s are silently discarded. |
| `todos.ts` | items[] | Full CRUD with optimistic updates + revert on error. |
| `forest.ts` | trees[], terrain, weather, timeFilter, forceRefresh | `fetchTrees()` loads trees for current filter. `refreshAnimation()` forces re-animation on re-click. |
| `audio.ts` | masterVolume, isMuted, bgmEnabled, ambianceEnabled | UI-level audio state. The actual Web Audio API lives in the composable. |
| `settings.ts` | theme ('light'\|'dark') | Loads from localStorage first, then syncs backend. Watch persists theme to both. |

**Key Composables:**
- `useAudioEngine.ts` — Singleton Web Audio API engine. `init()` must be called from a user gesture (browser autoplay policy). Plays ambiance layers simultaneously via looping `AudioBufferSourceNode`s. Handles missing audio files gracefully (returns null, no crash).

**Key Components:**
- `CircularTimer.vue` — SVG ring with `createSVGPoint()` + `getScreenCTM().inverse()` for accurate drag coordinate mapping. Drag activates only when click distance from center is 85-145px (center is reserved for TreePreview). Uses `setPointerCapture` for reliable drag. Snaps to preset durations (15/25/30/45/60/90/120 min).
- `IsometricGrid.vue` — PixiJS v7 canvas rendering the isometric forest. See "PixiJS v7 Critical Notes" below.
- `BackgroundForest.vue` — Fixed-position forest at low opacity (0.22) on the home page. Has a contrast veil layer and CSS-animated weather overlay for visual separation from main UI.

### Backend (`backend/app/`)

Four ORM models: `FocusSession`, `PlantedTree`, `Todo`, `UserSetting`. SQLite with `check_same_thread: false` for FastAPI async compatibility.

**Core transaction** (`services/session_service.py`):
1. Insert `FocusSession` → flush to get ID
2. Calculate growth stage from `actual_seconds / 60` (0-14min→seed, 15-29→sprout, 30-59→sapling, 60+→mature)
3. Assign grid position (sequential, row by row, 8 cols)
4. Insert `PlantedTree` with computed time_filter_key (server-side today→`2026-06-15`, week→`2026-W24`, month→`2026-06`, total→`total`)

**Trees API**: `GET /api/trees?filter=today|week|month|total` — The router converts named filters to actual date-based DB keys before querying. Frontend MUST call with named filters, not raw dates.

## PixiJS v7 Critical Notes

**This project uses pixi.js ^7.4.3, NOT v8.** The v8 API is completely different and will fail silently or throw.

| v7 (correct) | v8 (wrong, don't use) |
|---|---|
| `new PIXI.Application({ view: canvas })` synchronous constructor | `new PIXI.Application()` then `await app.init()` |
| `g.beginFill(color, alpha)` / `g.endFill()` | `g.fill({ color, alpha })` |
| `g.lineStyle(width, color, alpha)` | `g.stroke({ width, color })` |
| `g.drawCircle(x, y, r)` | Same, but fill/stroke setup differs |
| `g.moveTo()` / `g.lineTo()` | `g.moveTo()` / `g.lineTo()` (same) |

**Isometric coordinate system** (`utils/isometric.ts`):
- Grid→screen: `sx = (gx - gy) * (tileWidth/2) + offsetX`, `sy = (gx + gy) * (tileHeight/2) + offsetY`
- Depth sort: `depthSortKey(gx, gy) = gx + gy` (higher renders later = in front)
- Cube faces: top (brightest), left (medium), right (darkest)

**Architecture constraint:** `gridGraphics` has camera transform applied (`gridGraphics.x = camX`, `gridGraphics.y = camY`, `gridGraphics.scale.set(zoomLevel)`). `weatherGraphics` MUST stay at (0,0) in screen space — it covers the full viewport. Camera pan/zoom only affects grid + trees.

**Canvas sizing:** The PixiJS Application reads `containerRef.value.clientWidth` on mount and resize. The container must have a real width before initialization.

**Weather effects:**
- Rain is drawn as thin lines directly on `weatherGraphics` in screen coordinates (no camera offset!)
- Lightning uses exponential decay: `alpha *= Math.pow(0.015, dt)`
- Splash particles spawn when raindrops reach screen bottom
- Sunny sparkles use life-cycle animation (fade in → sustain → fade out)
- Zoom wheel uses `e.deltaY` with factor 0.92/1.08, clamped to 0.5–3.0

## Theme System

CSS custom properties on `[data-theme="dark"]` / `[data-theme="light"]` (or `:root` default light). The `settingsStore.applyTheme()` sets `document.documentElement.setAttribute('data-theme', t)`. All components use `var(--color-*)` tokens.

## Common Pitfalls

1. **`getGrowthStage` must be imported** in any component that uses it. CircularTimer.vue's celebration watch calls it but the import was historically missing — this causes a runtime ReferenceError that silently breaks the completion flow.

2. **Do NOT add CSS to `#app` element.** The `#app` div must not have `display: flex` or `align-items: center` — this constrains the AppShell width and collapses the entire layout to mobile proportions. Centering is handled by `.main-content` inside AppShell.

3. **Do NOT add global `button:active { transform: scale() }`** — it conflicts with per-component button transforms. Each component manages its own button press micro-interactions.

4. **The frontend randomizes tree positions on render.** The backend stores `grid_x`/`grid_y` but the frontend ignores them and assigns random positions via Fisher-Yates shuffle. Only non-water tiles are valid. Positions are reassigned on terrain change or force-refresh.

5. **Terrain random seed** is generated on every mount (`Math.random() * 1000`), influencing peak positions, creek paths, and noise offsets. This means each visit to `/forest` produces different terrain layout.

6. **Audio files exist** under `frontend/public/assets/audio/` (7 ambiance tracks + 3 BGM). The engine still tolerates missing files gracefully (returns null, no crash) — don't remove that tolerance.

7. **Tree growth animation** uses PixiJS ticker with ease-out cubic. Duration 700ms/tree, 55ms stagger. `forceRefresh` prop → `startGrowthAnimation()` called for all trees. Without `forceRefresh`, only new trees animate.

8. **`base: './'` in vite.config.ts is mandatory** for Electron. Without it, `file://` protocol resolves `/assets/...` to the filesystem root. All JS-side asset paths must use `import.meta.env.BASE_URL` (via `assetPaths.ts`).

9. **Electron `ELECTRON_RUN_AS_NODE=1`** — if this env var is set in your shell, Electron runs as plain Node.js and `require('electron')` returns a dummy string. Clear it before `npm start` or `electron .`.

10. **electron-app `files` config uses local `dist/**/*`** — the build script copies `../frontend/dist` → local `dist/` before electron-builder runs. Cross-directory globs (`"../frontend/dist/**/*"`) don't work with electron-builder.
