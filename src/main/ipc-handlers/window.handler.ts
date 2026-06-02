import { ipcMain, BrowserWindow, app } from 'electron'

export function registerWindowHandlers(win: BrowserWindow) {
  ipcMain.on('window:minimize', () => win.minimize())

  ipcMain.on('window:maximize', () => {
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.on('window:close', () => win.close())

  ipcMain.handle('window:is-maximized', () => win.isMaximized())

  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('app:backend-url', () => process.env.ELECTRON_BACKEND_URL ?? 'http://localhost:3003')

  // Notify renderer when maximise state changes
  win.on('maximize', () => win.webContents.send('window:maximize-change', true))
  win.on('unmaximize', () => win.webContents.send('window:maximize-change', false))
}
