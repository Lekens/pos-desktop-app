import 'dotenv/config'
import { app, BrowserWindow, shell, session, Menu } from 'electron'
import { join } from 'path'
import { setupTray } from './tray-manager'
import { setupUpdater } from './updater'
import { registerPrinterHandlers } from './ipc-handlers/printer.handler'
import { registerDrawerHandlers } from './ipc-handlers/drawer.handler'
import { registerConfigHandlers } from './ipc-handlers/config.handler'
import { registerWindowHandlers } from './ipc-handlers/window.handler'

const isDev    = process.env.NODE_ENV === 'development'
const isMac    = process.platform === 'darwin'
const isWin    = process.platform === 'win32'
const backendUrl  = process.env.ELECTRON_BACKEND_URL ?? 'http://localhost:3003'
const kioskMode   = process.env.ELECTRON_KIOSK_MODE === 'true'

let mainWindow: BrowserWindow | null = null
let isQuitting = false

// ─── macOS App Menu ────────────────────────────────────────────────────────────
// macOS requires an application menu for copy/paste and standard shortcuts.
// Windows/Linux get no native menu (we use a custom frameless header instead).
function setupAppMenu() {
  if (isMac) {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      // View menu (dev tools in development only)
      ...(isDev ? [{
        label: 'View',
        submenu: [
          { role: 'reload' as const },
          { role: 'forceReload' as const },
          { role: 'toggleDevTools' as const },
          { type: 'separator' as const },
          { role: 'togglefullscreen' as const },
        ],
      }] : []),
    ] as Electron.MenuItemConstructorOptions[]))
  } else {
    // Windows/Linux: no native menu bar (frameless app uses custom header)
    Menu.setApplicationMenu(null)
  }
}

// ─── Content Security Policy ───────────────────────────────────────────────────
function applyContentSecurityPolicy() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; ` +
          `script-src 'self'; ` +
          `style-src 'self' 'unsafe-inline'; ` +     // Tailwind CSS requires this
          `img-src 'self' data: blob:; ` +
          `connect-src 'self' ${backendUrl} ws://localhost:5173 wss://localhost:5173; ` +
          `font-src 'self' data:; ` +
          `object-src 'none';`,
        ],
      },
    })
  })
}

// ─── Platform-correct icon path ────────────────────────────────────────────────
function getAppIcon(): string {
  // icon.icns for macOS; icon.ico for Windows; icon.png for Linux
  const iconName = isMac ? 'icon.icns' : isWin ? 'icon.ico' : 'icon.png'
  return join(__dirname, '../../resources', iconName)
}

// ─── Create main window ───────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    kiosk: kioskMode,
    backgroundColor: '#0f172a',    // slate-950 — matches cashier dark theme
    icon: getAppIcon(),

    // macOS: 'hiddenInset' shows native traffic lights (⊗ ⊖ ⊞) in the inset area.
    // Windows/Linux: 'hidden' removes the native title bar entirely; we render custom controls.
    frame: isMac ? true : false,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    // Position traffic lights so they don't overlap the React title bar
    trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,

    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,       // Security: isolate renderer from main
      nodeIntegration: false,       // Security: no Node in renderer
      // sandbox:false is required because our preload.ts uses CommonJS require() (via tsc/CJS output).
      // Chromium's sandbox mode only supports ESM preloads. Tracked as a future hardening task:
      // migrate preload to ESM output so sandbox:true can be enabled.
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: isDev,
    },
  })

  // ── Load the frontend ────────────────────────────────────────────────────────
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    const frontendPath = join(process.resourcesPath, 'frontend-dist', 'index.html')
    mainWindow.loadFile(frontendPath)
  }

  // ── Security: external links open in system browser ──────────────────────────
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedPrefixes = [
      'http://localhost:5173',
      `file://${join(process.resourcesPath, 'frontend-dist')}`,
    ]
    if (!allowedPrefixes.some(prefix => url.startsWith(prefix))) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  // ── Close behaviour (platform-specific) ──────────────────────────────────────
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
      // On macOS, app stays in dock; on Windows, stays in system tray
    }
  })
}

// ─── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  setupAppMenu()
  applyContentSecurityPolicy()
  createWindow()

  if (mainWindow) {
    setupTray(mainWindow, () => { isQuitting = true })
    if (!isDev) setupUpdater(mainWindow)
    registerWindowHandlers(mainWindow)
  }

  registerPrinterHandlers()
  registerDrawerHandlers()
  registerConfigHandlers()
})

// macOS: re-open window when user clicks dock icon and no windows are open
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  } else {
    mainWindow?.show()
    mainWindow?.focus()
  }
})

app.on('before-quit', () => {
  isQuitting = true
})

// Windows/Linux: quit when all windows closed
// macOS: keep running (standard macOS behaviour — user Cmd+Q to quit)
app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})

// Security: prevent new BrowserWindow creation from renderer
app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
})
