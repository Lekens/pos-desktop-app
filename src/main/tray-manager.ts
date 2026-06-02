import { Tray, Menu, BrowserWindow, nativeImage, app } from 'electron'
import { join } from 'path'

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'

export function setupTray(win: BrowserWindow, onQuit: () => void) {
  // Platform-appropriate tray icon
  // macOS: PNG (16×16 shown; macOS handles @2x automatically via @2x suffix or NSStatusBar)
  // Windows: ICO
  // Linux: PNG
  const iconFile = isMac ? 'icon.png' : isWin ? 'icon.ico' : 'icon.png'
  const iconPath = join(__dirname, '../../resources', iconFile)

  let trayIcon: nativeImage
  try {
    trayIcon = nativeImage.createFromPath(iconPath)
    // macOS menu bar icons should be 16×16 (or 22×22 for retina)
    // Windows tray icons should be 16×16
    if (isMac) {
      trayIcon = trayIcon.resize({ width: 16, height: 16 })
      // macOS: mark as template image so it adapts to dark/light menu bar
      trayIcon.setTemplateImage(true)
    } else {
      trayIcon = trayIcon.resize({ width: 16, height: 16 })
    }
  } catch {
    trayIcon = nativeImage.createEmpty()
  }

  const tray = new Tray(trayIcon)
  tray.setToolTip('POS v2')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open POS v2',
      click: () => { win.show(); win.focus() },
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => win.webContents.send('trigger:update-check'),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      accelerator: isMac ? 'Cmd+Q' : 'Alt+F4',
      click: () => { onQuit(); app.quit() },
    },
  ])

  tray.setContextMenu(contextMenu)

  // macOS: left-click on menu bar icon shows context menu directly
  // Windows/Linux: double-click opens the window
  if (!isMac) {
    tray.on('double-click', () => { win.show(); win.focus() })
  }

  // macOS: single-click on tray icon shows context menu (already default)
  // Windows: single-click brings window to focus
  if (isWin) {
    tray.on('click', () => { win.show(); win.focus() })
  }

  // Only show the "minimised to tray" balloon on Windows (macOS dock handles this)
  let firstHide = true
  if (isWin) {
    win.on('hide', () => {
      if (firstHide) {
        firstHide = false
        tray.displayBalloon({
          title: 'POS v2',
          content: 'POS is still running. Click the tray icon to reopen.',
          iconType: 'info',
        })
      }
    })
  }

  return tray
}
