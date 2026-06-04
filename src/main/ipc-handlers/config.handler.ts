import { ipcMain, app } from 'electron'
import Store from 'electron-store'
import type { AppConfig } from '../types'

const store = new Store<AppConfig>({
  name: 'pos-desktop-config',
  defaults: {
    backendUrl:          process.env.ELECTRON_BACKEND_URL ?? 'http://localhost:3003',
    printerPort:         '',
    printerBaudRate:     9600,
    printerPaperWidth:   80,
    printerType:         'browser',
    printerNetworkHost:  '',
    printerNetworkPort:  9100,
    cashDrawerEnabled:   false,
    cashDrawerPulse:     0,
    autoStartOnBoot:     false,
    windowBounds:        { x: 0, y: 0, width: 1280, height: 800 },
    firstLaunchComplete: false,
  },
})

// Runtime allowlist — keyof AppConfig is erased at runtime so we enforce it here.
// This prevents a compromised renderer from writing arbitrary keys (e.g. redirecting backendUrl).
const ALLOWED_CONFIG_KEYS = new Set<keyof AppConfig>([
  'backendUrl',
  'printerPort',
  'printerBaudRate',
  'printerPaperWidth',
  'printerType',
  'printerNetworkHost',
  'printerNetworkPort',
  'cashDrawerEnabled',
  'cashDrawerPulse',
  'autoStartOnBoot',
  'windowBounds',
  'firstLaunchComplete',
])

export function registerConfigHandlers() {
  ipcMain.handle('config:get', (_, key: keyof AppConfig) => {
    if (!ALLOWED_CONFIG_KEYS.has(key)) return undefined
    return store.get(key)
  })

  ipcMain.handle('config:set', (_, key: keyof AppConfig, value: unknown) => {
    if (!ALLOWED_CONFIG_KEYS.has(key)) return { success: false, error: `Invalid config key: ${String(key)}` }
    store.set(key, value as AppConfig[typeof key])
    return { success: true }
  })

  ipcMain.handle('config:set-auto-start', (_, enabled: boolean) => {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: false,
      name: 'POS v2',
    })
    store.set('autoStartOnBoot', enabled)
  })
}

// Export store so other handlers can use it
export { store }
