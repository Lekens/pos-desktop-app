# Desktop App — Native Features

## Overview

These are the features that exist in the desktop app but **not** in the web frontend. Each is implemented in the Electron main process and exposed to the React renderer via the `window.electronAPI` IPC bridge.

---

## 1. Thermal Receipt Printer (ESC/POS)

### Why This Matters

A web browser can only print via the system print dialog (a modal that the cashier must click through). A thermal printer needs to receive raw ESC/POS commands over USB. The desktop app eliminates the dialog entirely — the receipt prints instantly when a sale completes.

### How Thermal Printers Connect

Most thermal printers (58mm and 80mm) connect via USB (which appears as a virtual serial port) or network:

| Connection | Windows | macOS |
|-----------|---------|-------|
| USB-to-Serial | `COM3`, `COM4`… (Device Manager) | `/dev/tty.usbserial-XXXXXXXX` or `/dev/cu.*` |
| Built-in USB | `COM3`, `COM4`… | `/dev/tty.SLAB_USBtoUART` or `/dev/tty.usbmodem*` |
| Network TCP | IP:9100 | IP:9100 (same) |

**macOS USB driver note:** Many thermal printers use CH340 or CP210x USB-to-Serial chips. macOS needs the driver installed:
- CH340: https://www.wch-ic.com/downloads/CH341SER_MAC_ZIP.html (free)
- CP210x: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers (free)

After installing the driver, the port appears as `/dev/tty.usbserial-*` or `/dev/cu.usbserial-*`. Both work; `tty.*` is preferred for write operations.

**Finding the port path:**
```bash
# macOS: list all serial ports
ls /dev/tty.* /dev/cu.*

# Windows: shown in Device Manager → Ports (COM & LPT)
# Or via PowerShell: Get-PnpDevice -Class 'Ports' | Select FriendlyName
```

`SerialPort.list()` (called by `printer:get-list` IPC handler) returns the correct paths for whichever platform the app is running on — **no code change needed between platforms**.

### IPC Handler — `src/main/ipc-handlers/printer.handler.ts`

```typescript
import { ipcMain, BrowserWindow } from 'electron'
import { SerialPort } from 'serialport'
import * as net from 'net'
import Store from 'electron-store'

const store = new Store()

// ESC/POS command constants
const ESC = 0x1b
const GS = 0x1d

const CMD = {
  INIT:       Buffer.from([ESC, 0x40]),               // Initialize printer
  BOLD_ON:    Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF:   Buffer.from([ESC, 0x45, 0x00]),
  ALIGN_LEFT:   Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
  ALIGN_RIGHT:  Buffer.from([ESC, 0x61, 0x02]),
  DOUBLE_HEIGHT: Buffer.from([ESC, 0x21, 0x10]),
  NORMAL_SIZE:   Buffer.from([ESC, 0x21, 0x00]),
  LINE_FEED:     Buffer.from([0x0a]),
  CUT_PARTIAL:   Buffer.from([GS, 0x56, 0x01]),       // Partial cut
  CUT_FULL:      Buffer.from([GS, 0x56, 0x00]),       // Full cut
}

interface ReceiptLine {
  type: 'text' | 'divider' | 'barcode'
  content?: string
  bold?: boolean
  center?: boolean
  right?: boolean
  doubleHeight?: boolean
}

function buildReceiptBuffer(lines: ReceiptLine[], paperWidth: 58 | 80): Buffer {
  const charsPerLine = paperWidth === 80 ? 48 : 32
  const parts: Buffer[] = [CMD.INIT]

  for (const line of lines) {
    if (line.type === 'divider') {
      const divider = '-'.repeat(charsPerLine)
      parts.push(CMD.ALIGN_LEFT, Buffer.from(`${divider}\n`, 'utf-8'))
      continue
    }

    if (line.type === 'barcode') {
      // CODE128 barcode
      const barcodeData = line.content ?? ''
      parts.push(
        CMD.ALIGN_CENTER,
        Buffer.from([GS, 0x68, 0x40]),                // Height: 64 dots
        Buffer.from([GS, 0x77, 0x02]),                // Width: medium
        Buffer.from([GS, 0x6b, 0x49, barcodeData.length, ...Buffer.from(barcodeData)]),
        CMD.LINE_FEED,
        CMD.ALIGN_LEFT,
      )
      continue
    }

    // Text line
    if (line.bold) parts.push(CMD.BOLD_ON)
    if (line.doubleHeight) parts.push(CMD.DOUBLE_HEIGHT)
    if (line.center) parts.push(CMD.ALIGN_CENTER)
    else if (line.right) parts.push(CMD.ALIGN_RIGHT)
    else parts.push(CMD.ALIGN_LEFT)

    const text = (line.content ?? '') + '\n'
    parts.push(Buffer.from(text, 'utf-8'))

    if (line.bold) parts.push(CMD.BOLD_OFF)
    if (line.doubleHeight) parts.push(CMD.NORMAL_SIZE)
  }

  parts.push(CMD.LINE_FEED, CMD.LINE_FEED, CMD.LINE_FEED)
  parts.push(CMD.CUT_PARTIAL)

  return Buffer.concat(parts)
}

async function sendToUSBPrinter(data: Buffer): Promise<void> {
  const port = store.get('printerPort') as string
  const baudRate = (store.get('printerBaudRate') as number) || 9600

  if (!port) throw new Error('No printer port configured')

  return new Promise((resolve, reject) => {
    const serial = new SerialPort({ path: port, baudRate, autoOpen: false })

    serial.open((err) => {
      if (err) return reject(new Error(`Cannot open ${port}: ${err.message}`))
      serial.write(data, (writeErr) => {
        if (writeErr) return reject(writeErr)
        serial.drain(() => {
          serial.close()
          resolve()
        })
      })
    })
  })
}

async function sendToNetworkPrinter(data: Buffer): Promise<void> {
  const host = store.get('printerNetworkHost') as string
  const port = (store.get('printerNetworkPort') as number) || 9100

  if (!host) throw new Error('No network printer host configured')

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.write(data, (err) => {
        socket.destroy()
        if (err) reject(err)
        else resolve()
      })
    })
    socket.setTimeout(5000)
    socket.on('timeout', () => { socket.destroy(); reject(new Error('Printer connection timeout')) })
    socket.on('error', reject)
  })
}

export function registerPrinterHandlers() {
  // Get available serial ports
  ipcMain.handle('printer:get-list', async () => {
    const ports = await SerialPort.list()
    return ports.map(p => ({ path: p.path, manufacturer: p.manufacturer }))
  })

  // Print receipt
  ipcMain.handle('printer:print-receipt', async (_, receiptLines: ReceiptLine[]) => {
    const paperWidth = (store.get('printerPaperWidth') as 58 | 80) || 80
    const printerType = store.get('printerType') as 'usb' | 'network' | 'browser'
    const buffer = buildReceiptBuffer(receiptLines, paperWidth)

    if (printerType === 'network') {
      await sendToNetworkPrinter(buffer)
    } else {
      await sendToUSBPrinter(buffer)
    }

    return { success: true }
  })

  // Test print
  ipcMain.handle('printer:test-print', async () => {
    const testLines: ReceiptLine[] = [
      { type: 'text', content: 'POS v2 Test Print', center: true, bold: true, doubleHeight: true },
      { type: 'divider' },
      { type: 'text', content: 'Printer is working correctly!', center: true },
      { type: 'text', content: new Date().toLocaleString('en-NG'), center: true },
      { type: 'divider' },
      { type: 'barcode', content: 'TEST-001' },
    ]
    const paperWidth = (store.get('printerPaperWidth') as 58 | 80) || 80
    const buffer = buildReceiptBuffer(testLines, paperWidth)
    const printerType = store.get('printerType') as 'usb' | 'network' | 'browser'

    if (printerType === 'network') {
      await sendToNetworkPrinter(buffer)
    } else {
      await sendToUSBPrinter(buffer)
    }

    return { success: true }
  })
}
```

### Frontend Integration

In the React app, the print service detects Electron and routes accordingly:

```typescript
// src/services/print.service.ts  (in POS-frontend-v2)
import { isElectron, electronAPI } from '@/utils/platform'

export async function printReceipt(receiptLines: ReceiptLine[]): Promise<void> {
  if (isElectron()) {
    // Desktop: direct ESC/POS — no dialog
    const api = electronAPI()!
    await api.printReceipt(receiptLines)
  } else {
    // Web: browser print dialog
    window.print()
  }
}
```

---

## 2. Cash Drawer

### How Cash Drawers Work

Most cash drawers connect via a cable to the receipt printer (RJ11 connector). The drawer opens when the printer sends a specific ESC/POS command. There is no separate USB connection.

```
Cash Drawer ──RJ11──► Thermal Printer ──USB──► PC
```

The drawer trigger command:
```typescript
// DLE EOT command (most universal)
const DRAWER_OPEN_CMD = Buffer.from([
  0x10, 0x14, 0x01,  // DLE DC4 — open cash drawer pin 2
  0x00, 0x01
])

// Alternative: ESC p command
const DRAWER_OPEN_ALT = Buffer.from([
  0x1b, 0x70,        // ESC p
  0x00,              // Pin 2 (0) or Pin 5 (1)
  0x19, 0xfa         // On time (25ms), Off time (250ms)
])
```

### IPC Handler — `src/main/ipc-handlers/drawer.handler.ts`

```typescript
import { ipcMain } from 'electron'
import { SerialPort } from 'serialport'
import * as net from 'net'
import Store from 'electron-store'

const store = new Store()

export function registerDrawerHandlers() {
  ipcMain.handle('drawer:open', async () => {
    if (!store.get('cashDrawerEnabled')) {
      return { success: false, reason: 'Cash drawer not enabled' }
    }

    const pulse = (store.get('cashDrawerPulse') as 0 | 1) ?? 0
    const drawerCmd = Buffer.from([0x1b, 0x70, pulse, 0x19, 0xfa])
    const printerType = store.get('printerType') as 'usb' | 'network'

    // Send through same printer connection
    if (printerType === 'network') {
      const host = store.get('printerNetworkHost') as string
      const port = (store.get('printerNetworkPort') as number) || 9100
      await sendViaNetwork(drawerCmd, host, port)
    } else {
      await sendViaSerial(drawerCmd)
    }

    return { success: true }
  })
}
```

**In the React app:** `window.electronAPI.openCashDrawer()` is called automatically after a successful cash transaction in the checkout flow. On web, this call is silently ignored (no-op).

---

## 3. Barcode Scanner

### No Special Code Needed

USB barcode scanners that work in keyboard-emulation mode (HID) require **zero additional code** — they inject keystrokes into the focused window, which Electron's Chromium WebView receives exactly like a browser.

The existing `keydown` event listener in `POS-frontend-v2` that detects rapid keystroke sequences (the barcode scan detection) works identically in Electron.

### What the Desktop App Improves

In a browser, if the scan input field loses focus (e.g., the user clicks elsewhere), scans are missed or go to the wrong field. In Electron, we can ensure the scan input always re-focuses:

```typescript
// Main process — redirect hardware scan to renderer if window is focused
app.on('browser-window-focus', () => {
  mainWindow?.webContents.send('scanner:focus-requested')
})
```

```typescript
// React app — listen for focus request
useEffect(() => {
  if (!isElectron()) return
  const api = electronAPI()!
  const handler = () => searchInputRef.current?.focus()
  api.onScannerFocusRequested(handler)
  return () => api.removeAllListeners('scanner:focus-requested')
}, [])
```

---

## 4. Windows Notifications

The desktop app sends native Windows toast notifications for:

| Event | Notification |
|-------|-------------|
| Low stock alert | "⚠ Low Stock: Sachet Water has 5 pieces left" |
| Shift expiry reminder | "Your shift closes in 30 minutes — remember to reconcile" |
| Auto-update ready | "POS v2 update downloaded — will install on restart" |
| Offline status | "⚠ Lost connection to backend — working offline" |
| Backend reconnected | "✓ Connected — offline transactions are syncing" |

```typescript
// In main process
import { Notification } from 'electron'

export function sendNotification(title: string, body: string, urgency?: 'low' | 'normal' | 'critical') {
  if (!Notification.isSupported()) return

  new Notification({
    title,
    body,
    icon: join(__dirname, '../../resources/icon.ico'),
    urgency,
    timeoutType: urgency === 'critical' ? 'never' : 'default',
  }).show()
}
```

Windows toast notifications appear in the system notification centre even if the app is minimised to the tray.

---

## 5. Auto-Start on Login (Windows & macOS)

`app.setLoginItemSettings()` works on both platforms with no code change:
- **Windows:** Adds/removes a registry entry under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- **macOS:** Adds/removes a LaunchAgent plist in `~/Library/LaunchAgents/`

```typescript
// src/main/ipc-handlers/config.handler.ts
ipcMain.handle('config:set-auto-start', (_, enabled: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false,   // Show window on startup (not hidden to tray/dock)
    name: 'POS v2',
  })
  store.set('autoStartOnBoot', enabled)
  return { success: true }
})
```

This is configurable from the admin Settings page (Desktop Settings section, visible only in Electron).

**macOS note:** `openAsHidden: false` means the app opens with its window visible. If you want the app to start in the dock but not bring up the window (background start), set `openAsHidden: true` — the user can then click the dock icon to open the window.

---

## 6. Kiosk Mode (Optional — Phase 3)

For dedicated cashier terminals that should not be used for anything else:

```typescript
mainWindow = new BrowserWindow({
  kiosk: true,                    // Full-screen, no taskbar
  alwaysOnTop: true,
  // ...
})
```

Kiosk mode prevents:
- Alt+Tab switching
- Taskbar access
- Right-click menus
- F12 developer tools (in production)

Enable via `ELECTRON_KIOSK_MODE=true` in `.env`. Not enabled by default — cashiers should be able to minimise if needed.

---

## 7. Desktop Settings Page (Frontend Addition)

The React app shows a "Desktop" tab in Settings only when running inside Electron:

```typescript
// In admin settings page
{isElectron() && (
  <DesktopSettingsTab
    onPrinterPortChange={port => electronAPI()?.setConfig('printerPort', port)}
    onPrinterTypeChange={type => electronAPI()?.setConfig('printerType', type)}
    onTestPrint={() => electronAPI()?.testPrint()}
    onCashDrawerToggle={v => electronAPI()?.setConfig('cashDrawerEnabled', v)}
    onAutoStartToggle={v => electronAPI()?.invoke('config:set-auto-start', v)}
    onUpdateCheck={() => electronAPI()?.checkForUpdates()}
  />
)}
```

**Desktop Settings fields:**
- Backend URL (e.g., `https://api.yourstore.com` or `http://192.168.1.100:3003`)
- Printer connection type: USB/Serial | Network TCP | Browser (fallback)
- Serial port selector (shows detected COM ports)
- Baud rate (9600 / 115200)
- Paper width (58mm / 80mm)
- Cash drawer enabled: toggle
- Auto-start on Windows boot: toggle
- App version display
- [Check for Updates] button
- [Test Print] button
