# Desktop App — Architecture

## Overview

An Electron application has two JavaScript runtime contexts that run in separate OS processes and communicate only through controlled IPC (Inter-Process Communication):

```
┌──────────────────────────────────────────────────────────────────┐
│  Main Process (Node.js)                                           │
│  Entry: src/main/main.ts                                          │
│                                                                   │
│  Responsibilities:                                                │
│  • Create and manage BrowserWindow                                │
│  • Native OS integration (system tray, notifications, menus)     │
│  • Hardware access (serialport → thermal printer, cash drawer)   │
│  • electron-store (local config persistence)                      │
│  • electron-updater (auto-update checks)                          │
│  • IPC handlers (respond to renderer requests)                    │
│  • Spawn child backend process (Scenario C only)                  │
│                                                                   │
│  Security: Full Node.js — never exposed to renderer directly      │
└────────────────────┬─────────────────────────────────────────────┘
                     │  IPC (ipcMain / ipcRenderer)
                     │  Bridge: src/main/preload.ts
                     │  contextBridge.exposeInMainWorld('electronAPI', ...)
                     │
┌────────────────────▼─────────────────────────────────────────────┐
│  Renderer Process (Chromium)                                      │
│  Loads: POS-frontend-v2/dist/index.html (prod)                   │
│      or http://localhost:5173           (dev)                     │
│                                                                   │
│  This is the full React POS application — cashier + admin        │
│  Communicates with:                                               │
│    • POS-backend-v2 API (HTTP, same as web version)               │
│    • Main process (via window.electronAPI — controlled IPC)       │
│                                                                   │
│  Security: contextIsolation=true, nodeIntegration=false          │
│  No direct Node.js access                                         │
└──────────────────────────────────────────────────────────────────┘
```

---

## Project File Structure

```
POS-desktop-app/
├── src/
│   └── main/
│       ├── main.ts                 # Electron entry point
│       ├── preload.ts              # contextBridge — controlled IPC
│       ├── window-manager.ts       # BrowserWindow creation and config
│       ├── tray-manager.ts         # System tray icon and menu
│       ├── updater.ts              # electron-updater auto-update
│       └── ipc-handlers/
│           ├── printer.handler.ts  # ESC/POS thermal printing
│           ├── drawer.handler.ts   # Cash drawer open command
│           ├── config.handler.ts   # electron-store read/write
│           ├── window.handler.ts   # Frameless window controls
│           └── update.handler.ts   # Manual update check
├── resources/
│   ├── icon.ico                    # Windows app icon (256×256)
│   ├── icon.png                    # Tray icon (16×16, 32×32)
│   └── installer-banner.bmp        # NSIS installer banner (optional)
├── docs/                           # This documentation
├── .env.example
├── .env                            # gitignored
├── package.json
├── electron-builder.yml            # Windows installer configuration
├── tsconfig.json                   # TypeScript for main process
└── .gitignore
```

---

## Main Process — `src/main/main.ts`

```typescript
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { setupTray } from './tray-manager'
import { setupUpdater } from './updater'
import { registerPrinterHandlers } from './ipc-handlers/printer.handler'
import { registerDrawerHandlers } from './ipc-handlers/drawer.handler'
import { registerConfigHandlers } from './ipc-handlers/config.handler'
import { registerWindowHandlers } from './ipc-handlers/window.handler'

const isDev = process.env.NODE_ENV === 'development'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    frame: false,             // Frameless — custom title bar in React
    titleBarStyle: 'hidden',
    backgroundColor: '#0f172a', // slate-950 — cashier dark theme
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,   // Security: isolate renderer from main
      nodeIntegration: false,   // Security: no Node in renderer
      sandbox: false,           // Must be false to allow preload with IPC
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')    // Vite dev server
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(
      join(__dirname, '../../POS-frontend-v2/dist/index.html')
    )
  }

  // Prevent navigation to external URLs (security)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost:5173') && !url.startsWith('file://')) {
      event.preventDefault()
    }
  })
}

app.whenReady().then(() => {
  createWindow()
  setupTray(mainWindow!)
  setupUpdater(mainWindow!)

  // Register all IPC handlers
  registerPrinterHandlers()
  registerDrawerHandlers()
  registerConfigHandlers()
  registerWindowHandlers(mainWindow!)
})

// Quit when all windows closed (Windows behaviour)
app.on('window-all-closed', () => {
  app.quit()
})

// Security: prevent new window creation
app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
})
```

---

## Preload Script — `src/main/preload.ts`

The preload script is the **only bridge** between the renderer (React app) and the main process. It uses `contextBridge` to expose a controlled, typed API:

```typescript
import { contextBridge, ipcRenderer } from 'electron'

// Type-safe API exposed to the React renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Printer
  printReceipt: (receiptData: ReceiptData) =>
    ipcRenderer.invoke('printer:print-receipt', receiptData),

  testPrint: () =>
    ipcRenderer.invoke('printer:test-print'),

  getPrinters: () =>
    ipcRenderer.invoke('printer:get-list'),

  // Cash drawer
  openCashDrawer: () =>
    ipcRenderer.invoke('drawer:open'),

  // App config (stored locally via electron-store)
  getConfig: (key: string) =>
    ipcRenderer.invoke('config:get', key),

  setConfig: (key: string, value: unknown) =>
    ipcRenderer.invoke('config:set', key, value),

  // Window controls (for frameless window)
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),

  // App info
  getVersion: () => ipcRenderer.invoke('app:version'),
  platform: process.platform,   // 'win32' | 'darwin' | 'linux'

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.send('update:install'),

  // Events from main → renderer
  onUpdateAvailable: (callback: (version: string) => void) =>
    ipcRenderer.on('update:available', (_, version) => callback(version)),

  onUpdateDownloaded: (callback: () => void) =>
    ipcRenderer.on('update:downloaded', () => callback()),

  onPrinterError: (callback: (error: string) => void) =>
    ipcRenderer.on('printer:error', (_, error) => callback(error)),

  // Remove listeners (important for React cleanup)
  removeAllListeners: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),
})
```

**In the React app**, this API is available as `window.electronAPI`. The frontend detects whether it is running in Electron:

```typescript
// src/utils/platform.ts  (in POS-frontend-v2)
export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && 'electronAPI' in window
}

export const electronAPI = (): ElectronAPI | null => {
  if (!isElectron()) return null
  return (window as Window & { electronAPI: ElectronAPI }).electronAPI
}
```

---

## IPC Channels Reference

All communication between renderer and main uses named channels.

| Channel | Direction | Type | Purpose |
|---------|-----------|------|---------|
| `printer:print-receipt` | Renderer → Main | invoke | Send receipt data; main prints to thermal |
| `printer:test-print` | Renderer → Main | invoke | Print test page |
| `printer:get-list` | Renderer → Main | invoke | List available serial ports |
| `printer:error` | Main → Renderer | event | Printer error notification |
| `drawer:open` | Renderer → Main | invoke | Open cash drawer |
| `config:get` | Renderer → Main | invoke | Read from electron-store |
| `config:set` | Renderer → Main | invoke | Write to electron-store |
| `window:minimize` | Renderer → Main | send | Minimize frameless window |
| `window:maximize` | Renderer → Main | send | Toggle maximize |
| `window:close` | Renderer → Main | send | Close window |
| `window:is-maximized` | Renderer → Main | invoke | Check maximized state |
| `app:version` | Renderer → Main | invoke | Get app version string |
| `update:check` | Renderer → Main | invoke | Trigger update check |
| `update:install` | Renderer → Main | send | Quit and install update |
| `update:available` | Main → Renderer | event | New version found |
| `update:downloaded` | Main → Renderer | event | Update ready to install |

---

## Window Manager — `src/main/window-manager.ts`

### Frameless Window with Custom Title Bar

The app uses `frame: false` for a clean, full-screen POS feel. The React frontend renders its own title bar with:

```
┌─────────────────────────────────────────────────────┐
│ [Logo] POS v2  ─  Main Branch   [─][□][✕]          │
│ (draggable region via -webkit-app-region: drag)      │
└─────────────────────────────────────────────────────┘
```

The custom title bar is part of `POS-frontend-v2`. It detects `isElectron()` and shows window controls; in the browser, it shows nothing.

```css
/* In React app — makes the title bar draggable */
.electron-title-bar {
  -webkit-app-region: drag;
}
.electron-title-bar button {
  -webkit-app-region: no-drag;
}
```

### Window State Persistence

The last window size and position are saved in `electron-store` and restored on next launch:

```typescript
// src/main/window-manager.ts
import Store from 'electron-store'

const store = new Store<{ windowBounds: Electron.Rectangle }>()

function saveWindowBounds(win: BrowserWindow) {
  store.set('windowBounds', win.getBounds())
}

function restoreWindowBounds(): Partial<Electron.Rectangle> {
  return store.get('windowBounds', { width: 1280, height: 800 })
}
```

---

## System Tray — `src/main/tray-manager.ts`

The app continues running in the system tray when the window is closed. This is important for a POS terminal — cashiers should not be able to accidentally terminate the application.

```typescript
import { Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'

export function setupTray(win: BrowserWindow) {
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
  const tray = new Tray(icon.resize({ width: 16, height: 16 }))

  tray.setToolTip('POS v2 — Running')

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open POS', click: () => { win.show(); win.focus() } },
    { type: 'separator' },
    { label: 'Check for Updates', click: () => win.webContents.send('trigger:update-check') },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ]))

  // Double-click tray icon → show window
  tray.on('double-click', () => { win.show(); win.focus() })

  // Intercept window close → minimise to tray instead of quit
  win.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      win.hide()
      tray.displayBalloon({
        title: 'POS v2',
        content: 'Running in background. Double-click tray icon to reopen.',
        iconType: 'info',
      })
    }
  })
}
```

---

## Auto-Updater — `src/main/updater.ts`

```typescript
import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'

export function setupUpdater(win: BrowserWindow) {
  autoUpdater.autoDownload = true       // download silently in background
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update:available', info.version)
  })

  autoUpdater.on('update-downloaded', () => {
    win.webContents.send('update:downloaded')
  })

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err)
  })

  // Check for updates on launch (production only)
  if (process.env.NODE_ENV === 'production') {
    autoUpdater.checkForUpdates()
    // Also check every 4 hours
    setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000)
  }
}
```

**How updates work:**
1. Admin pushes a new release to the update server (GitHub Releases or self-hosted)
2. App checks for updates on launch and every 4 hours
3. If update found: download silently in background
4. Renderer shows a non-intrusive banner: "Update ready — will install on next restart"
5. Cashier finishes their shift; on next startup the new version is installed

---

## Security Configuration

| Setting | Value | Reason |
|---------|-------|--------|
| `contextIsolation` | `true` | Prevents renderer from accessing Electron internals |
| `nodeIntegration` | `false` | Prevents renderer from using Node.js APIs directly |
| `webSecurity` | `true` | Enforces CORS and same-origin policy |
| `allowRunningInsecureContent` | `false` | No HTTP content in HTTPS app |
| `sandbox` | `false` | Required for preload script; acceptable with contextIsolation=true |
| External navigation | Blocked | `will-navigate` event intercepted; external URLs open in browser |
| New windows | Denied | `setWindowOpenHandler` returns `{ action: 'deny' }` |
| CSP | Strict | Set via Electron's `session.defaultSession.webRequest` |

**Content Security Policy (set in main process):**

```typescript
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +   // Tailwind needs this
        "img-src 'self' data: blob:; " +
        "connect-src 'self' " + process.env.ELECTRON_BACKEND_URL + "; " +
        "font-src 'self'; " +
        "object-src 'none';"
      ]
    }
  })
})
```

---

## Local Config Store (`electron-store`)

Desktop-specific configuration that is stored locally on the PC (not in the backend):

```typescript
interface DesktopConfig {
  backendUrl: string               // POS-backend-v2 URL
  printerPort: string              // Serial port name (e.g. 'COM3')
  printerBaudRate: number          // Usually 9600 or 115200
  printerPaperWidth: 58 | 80       // mm
  cashDrawerEnabled: boolean
  cashDrawerPulse: 0 | 1           // Which pin triggers the drawer
  windowBounds: Electron.Rectangle
  autoStartOnBoot: boolean
  lastCheckForUpdates: number      // timestamp
}

const defaultConfig: DesktopConfig = {
  backendUrl: 'http://localhost:3003',
  printerPort: '',
  printerBaudRate: 9600,
  printerPaperWidth: 80,
  cashDrawerEnabled: false,
  cashDrawerPulse: 0,
  windowBounds: { x: 0, y: 0, width: 1280, height: 800 },
  autoStartOnBoot: false,
  lastCheckForUpdates: 0,
}
```

This config is accessible in the React frontend via `window.electronAPI.getConfig(key)` and `window.electronAPI.setConfig(key, value)`. A "Desktop Settings" section appears in the admin Settings page only when running inside Electron (`isElectron() === true`).
