import { ipcMain, app } from 'electron'
import Store from 'electron-store'
import type { AppConfig } from '../types'

const store = new Store<AppConfig>({
  name: 'pos-desktop-config',
  defaults: {
    backendUrl: process.env.ELECTRON_BACKEND_URL ?? 'http://localhost:3003',
    printerPort: '',
    printerBaudRate: 9600,
    printerPaperWidth: 80,
    printerType: 'browser',
    printerNetworkHost: '',
    printerNetworkPort: 9100,
    cashDrawerEnabled: false,
    cashDrawerPulse: 0,
    autoStartOnBoot: false,
  },
})

export function registerConfigHandlers() {
  ipcMain.handle('config:get', (_, key: keyof AppConfig) => {
    return store.get(key)
  })

  ipcMain.handle('config:set', (_, key: keyof AppConfig, value: unknown) => {
    store.set(key, value as AppConfig[typeof key])
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
