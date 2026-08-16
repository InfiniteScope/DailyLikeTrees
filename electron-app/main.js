/** Electron main process for DailyLikeTrees.
 *
 *  - Spawns backend.exe (production) or Python uvicorn (dev)
 *  - Creates frameless BrowserWindow (custom title bar)
 *  - Manages floating-ball second window
 *  - Relays events between main window and floating window
 */

const { app, BrowserWindow, ipcMain, screen } = require('electron')
const path = require('path')
const { spawn, execSync, execFileSync } = require('child_process')
const fs = require('fs')

// ── Paths ────────────────────────────────────────────────────────────
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend')
const DIST_DIR = app.isPackaged ? path.join(__dirname, 'dist') : path.join(FRONTEND_DIR, 'dist')
const BACKEND_DIR = path.join(__dirname, '..', 'backend')
const ICON_PATH = path.join(__dirname, 'icon.ico')

// ── Logging ──────────────────────────────────────────────────────────
function debugLog(msg) {
  try {
    const logPath = path.join(path.dirname(app.getPath('exe')), 'dailyliketrees_debug.log')
    const ts = Math.floor(Date.now() / 1000)
    fs.appendFileSync(logPath, `[${ts}] ${msg}\n`)
  } catch { /* non-fatal */ }
}

// ══════════════════════════════════════════════════════════════════════
//  BACKEND PROCESS
// ══════════════════════════════════════════════════════════════════════

let backendProcess = null

function startBackend() {
  const isDev = !app.isPackaged

  if (!isDev) {
    // ── Production: spawn backend.exe ──
    debugLog('Production mode — starting backend.exe...')

    // Port cleanup
    try { execSync('taskkill /F /T /IM backend.exe 2>nul', { stdio: 'ignore' }) } catch {}
    try { execSync('taskkill /F /T /IM python.exe 2>nul', { stdio: 'ignore' }) } catch {}
    try {
      execFileSync('powershell', [
        '-NoProfile', '-Command',
        '$p=Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue|Select -First 1;if($p){Stop-Process -Id $p.OwningProcess -Force}'
      ], { stdio: 'ignore' })
    } catch {}
    // Brief pause for port release
    const start = Date.now()
    while (Date.now() - start < 800) { /* spin */ }

    const exeDir = path.dirname(app.getPath('exe'))
    const candidates = [
      path.join(process.resourcesPath, 'backend.exe'),
      path.join(exeDir, 'backend.exe'),
    ]

    for (const exe of candidates) {
      debugLog(`  Check ${exe} — exists=${fs.existsSync(exe)}`)
      if (!fs.existsSync(exe)) continue
      try {
        backendProcess = spawn(exe, [], { stdio: 'ignore', windowsHide: true })
        debugLog(`  ✓ Backend started (pid=${backendProcess.pid})`)
        return
      } catch (e) { debugLog(`  ✗ Failed: ${e.message}`) }
    }
    debugLog('  ✗✗✗ BACKEND NOT FOUND ✗✗✗')
  } else {
    // ── Dev mode: spawn Python uvicorn ──
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
    try {
      backendProcess = spawn(pythonCmd, [
        '-m', 'uvicorn', 'app.main:app',
        '--host', '127.0.0.1', '--port', '8000',
      ], {
        cwd: BACKEND_DIR,
        stdio: 'ignore',
        windowsHide: true,
      })
      debugLog(`Dev backend started with ${pythonCmd}, pid: ${backendProcess.pid}`)
    } catch (e) {
      debugLog(`Failed to start dev backend: ${e.message}`)
    }
  }
}

function killBackend() {
  if (!backendProcess) return
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${backendProcess.pid}`, { stdio: 'ignore' })
    } else {
      backendProcess.kill('SIGTERM')
    }
    debugLog('Backend stopped.')
  } catch { /* already dead */ }
}

// ══════════════════════════════════════════════════════════════════════
//  WINDOWS
// ══════════════════════════════════════════════════════════════════════

let mainWindow = null
let floatingWindow = null

function createMainWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const TARGET_W = 1320
  const TARGET_H = 950

  let w = TARGET_W
  let h = TARGET_H
  if (sw < TARGET_W || sh < TARGET_H) {
    const scale = Math.min(sw / TARGET_W, sh / TARGET_H)
    w = Math.max(960, Math.round(TARGET_W * scale))
    h = Math.max(692, Math.round(TARGET_H * scale))
  }

  mainWindow = new BrowserWindow({
    width: w,
    height: h,
    minWidth: 960,
    minHeight: 692,
    center: true,
    frame: false,
    transparent: false,
    hasShadow: true,
    title: 'DailyLikeTrees · 如树日常',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })

  // ── Load frontend ──
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(DIST_DIR, 'index.html'))
  } else {
    // Dev: try Vite dev server first, fall back to built dist
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      mainWindow.loadFile(path.join(DIST_DIR, 'index.html'))
    })
  }

  // Forward maximize state changes to renderer
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximizeChange', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximizeChange', false)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createFloatingWindow(width, height, x, y) {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.focus()
    return
  }

  floatingWindow = new BrowserWindow({
    width: width || 130,
    height: height || 75,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })

  if (app.isPackaged) {
    floatingWindow.loadFile(path.join(DIST_DIR, 'index.html'), { hash: '/floating' })
  } else {
    floatingWindow.loadURL('http://localhost:5173/#/floating').catch(() => {
      floatingWindow.loadFile(path.join(DIST_DIR, 'index.html'), { hash: '/floating' })
    })
  }

  floatingWindow.on('closed', () => {
    floatingWindow = null
  })
}

// ══════════════════════════════════════════════════════════════════════
//  IPC HANDLERS
// ══════════════════════════════════════════════════════════════════════

function setupIPC() {
  // ── Window controls ──
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:toggleMaximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.isMaximized() ? win.unmaximize() : win.maximize()
    }
  })

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('window:isMaximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  // ── Floating window ──
  ipcMain.handle('floating:open', (_event, opts) => {
    const { width, height, x, y } = opts || {}
    createFloatingWindow(width || 130, height || 75, x, y)
  })

  ipcMain.on('floating:close', () => {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      floatingWindow.close()
      floatingWindow = null
    }
  })

  ipcMain.handle('floating:resize', (event, { width, height }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.setSize(width, height)
  })

  // ── FB events relay (main ↔ floating) ──
  ipcMain.on('fb:event', (_event, { name, payload }) => {
    if (name === 'fb:request-state' || name === 'fb:set-active') {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('fb:event', { name, payload })
      }
    }
    if (name === 'fb:state') {
      if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.webContents.send('fb:event', { name, payload })
      }
    }
  })
}

// ══════════════════════════════════════════════════════════════════════
//  APP LIFECYCLE
// ══════════════════════════════════════════════════════════════════════

app.whenReady().then(() => {
  debugLog('App starting...')
  setupIPC()
  startBackend()
  createMainWindow()
  debugLog('App ready.')
})

app.on('before-quit', () => {
  killBackend()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createMainWindow()
})
