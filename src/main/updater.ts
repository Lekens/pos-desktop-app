import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours

export function setupUpdater(win: BrowserWindow) {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    })
  })

  autoUpdater.on('update-downloaded', () => {
    win.webContents.send('update:downloaded')
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] Auto-update error:', err.message)
  })

  // Check on launch
  autoUpdater.checkForUpdates().catch(err =>
    console.error('[updater] Initial check failed:', err.message)
  )

  // Check every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(err =>
      console.error('[updater] Scheduled check failed:', err.message)
    )
  }, UPDATE_CHECK_INTERVAL_MS)

  // IPC: manual check from renderer
  ipcMain.handle('update:check', async () => {
    try {
      await autoUpdater.checkForUpdates()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[updater] Manual check failed:', message)
    }
  })

  // IPC: install update
  ipcMain.on('update:install', () => {
    autoUpdater.quitAndInstall(false, true)
  })
}
