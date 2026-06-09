import { ipcMain, BrowserWindow } from 'electron'
import { SerialPort } from 'serialport'
import * as net from 'net'
import { store } from './config.handler'
import type { ReceiptLine } from '../types'

// ─── ESC/POS Command constants ────────────────────────────────────────────────
const ESC = 0x1b
const GS  = 0x1d

const CMD = {
  INIT:            Buffer.from([ESC, 0x40]),
  BOLD_ON:         Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF:        Buffer.from([ESC, 0x45, 0x00]),
  ALIGN_LEFT:      Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_CENTER:    Buffer.from([ESC, 0x61, 0x01]),
  ALIGN_RIGHT:     Buffer.from([ESC, 0x61, 0x02]),
  DOUBLE_HEIGHT:   Buffer.from([ESC, 0x21, 0x10]),
  NORMAL_SIZE:     Buffer.from([ESC, 0x21, 0x00]),
  LINE_FEED:       Buffer.from([0x0a]),
  // CODE128 barcode: GS k m n d1...dk
  BARCODE_HEIGHT:  Buffer.from([GS, 0x68, 0x40]),    // 64 dot height
  BARCODE_WIDTH:   Buffer.from([GS, 0x77, 0x02]),    // Medium width
  BARCODE_HRI_BELOW: Buffer.from([GS, 0x48, 0x02]),  // Print HRI below barcode
  CUT_PARTIAL:     Buffer.from([GS, 0x56, 0x01]),
}

// ─── Build ESC/POS buffer from receipt lines ──────────────────────────────────
function buildReceiptBuffer(lines: ReceiptLine[], paperWidth: 58 | 80): Buffer {
  const charsPerLine = paperWidth === 80 ? 48 : 32
  const parts: Buffer[] = [CMD.INIT]

  for (const line of lines) {
    if (line.type === 'divider') {
      parts.push(CMD.ALIGN_LEFT, Buffer.from('-'.repeat(charsPerLine) + '\n', 'latin1'))
      continue
    }

    if (line.type === 'barcode' && line.content) {
      const data = line.content
      // CODE128 length is encoded as a single byte — max 255 characters.
      if (data.length > 255) {
        console.warn(`[printer] Barcode data truncated: ${data.length} chars exceeds 255-byte ESC/POS limit`)
        continue
      }
      // CODE128 automatic mode
      parts.push(
        CMD.ALIGN_CENTER,
        CMD.BARCODE_HEIGHT,
        CMD.BARCODE_WIDTH,
        CMD.BARCODE_HRI_BELOW,
        Buffer.from([GS, 0x6b, 0x49, data.length]),
        Buffer.from(data, 'ascii'),
        CMD.LINE_FEED,
        CMD.ALIGN_LEFT,
      )
      continue
    }

    if (line.bold) parts.push(CMD.BOLD_ON)
    if (line.doubleHeight) parts.push(CMD.DOUBLE_HEIGHT)
    if (line.center) parts.push(CMD.ALIGN_CENTER)
    else if (line.right) parts.push(CMD.ALIGN_RIGHT)
    else parts.push(CMD.ALIGN_LEFT)

    parts.push(Buffer.from((line.content ?? '') + '\n', 'utf-8'))

    if (line.bold) parts.push(CMD.BOLD_OFF)
    if (line.doubleHeight) parts.push(CMD.NORMAL_SIZE)
  }

  // Feed 3 lines before cut
  parts.push(CMD.LINE_FEED, CMD.LINE_FEED, CMD.LINE_FEED)
  parts.push(CMD.CUT_PARTIAL)

  return Buffer.concat(parts)
}

// ─── Send via USB/Serial ──────────────────────────────────────────────────────
async function sendViaSerial(data: Buffer): Promise<void> {
  const portPath = store.get('printerPort') as string
  const baudRate = (store.get('printerBaudRate') as number) || 9600

  if (!portPath) throw new Error('No printer port configured. Go to Settings → Desktop to select a port.')

  return new Promise((resolve, reject) => {
    const serial = new SerialPort({ path: portPath, baudRate, autoOpen: false })
    serial.open((err) => {
      if (err) return reject(new Error(`Cannot open ${portPath}: ${err.message}`))
      serial.write(data, (writeErr) => {
        if (writeErr) return reject(writeErr)
        serial.drain(() => { serial.close(); resolve() })
      })
    })
  })
}

// ─── Send via Network (TCP) ───────────────────────────────────────────────────
async function sendViaNetwork(data: Buffer): Promise<void> {
  const host = store.get('printerNetworkHost') as string
  const port = (store.get('printerNetworkPort') as number) || 9100

  if (!host) throw new Error('No network printer host configured.')

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.write(data, (err) => { socket.destroy(); err ? reject(err) : resolve() })
    })
    socket.setTimeout(5000)
    socket.on('timeout', () => { socket.destroy(); reject(new Error('Printer connection timeout')) })
    socket.on('error', reject)
  })
}

// ─── Send to configured printer ──────────────────────────────────────────────
async function sendToPrinter(data: Buffer): Promise<void> {
  const printerType = (store.get('printerType') as string) || 'browser'
  if (printerType === 'network') {
    await sendViaNetwork(data)
  } else if (printerType === 'usb') {
    await sendViaSerial(data)
  } else {
    throw new Error('Printer type is set to "browser" — use window.print() in the renderer instead')
  }
}

// ─── IPC Registration ─────────────────────────────────────────────────────────
export function registerPrinterHandlers() {
  // List available serial ports
  ipcMain.handle('printer:get-list', async () => {
    try {
      const ports = await SerialPort.list()
      return ports.map(port => ({ path: port.path, manufacturer: port.manufacturer ?? 'Unknown' }))
    } catch {
      return []
    }
  })

  // Print receipt
  ipcMain.handle('printer:print-receipt', async (event, lines: ReceiptLine[]) => {
    if (!Array.isArray(lines) || lines.length === 0) {
      return { success: false, error: 'Invalid or empty lines array' }
    }
    const paperWidth = (store.get('printerPaperWidth') as 58 | 80) || 80
    const buffer = buildReceiptBuffer(lines, paperWidth)

    try {
      await sendToPrinter(buffer)
      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown printer error'
      console.error('[printer] Print failed:', message)

      // Notify renderer of printer error
      const win = BrowserWindow.fromWebContents(event.sender)
      win?.webContents.send('printer:error', message)

      return { success: false, error: message }
    }
  })

  // Test print
  ipcMain.handle('printer:test-print', async (event) => {
    const testLines: ReceiptLine[] = [
      { type: 'text', content: 'POS v2', center: true, bold: true, doubleHeight: true },
      { type: 'text', content: 'Test Print', center: true, bold: true },
      { type: 'divider' },
      { type: 'text', content: 'Printer is working correctly!', center: true },
      { type: 'text', content: new Date().toLocaleString('en-NG'), center: true },
      { type: 'divider' },
      { type: 'barcode', content: 'TEST-001' },
      { type: 'text', content: '', center: true },
    ]

    const paperWidth = (store.get('printerPaperWidth') as 58 | 80) || 80
    const buffer = buildReceiptBuffer(testLines, paperWidth)

    try {
      await sendToPrinter(buffer)
      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const win = BrowserWindow.fromWebContents(event.sender)
      win?.webContents.send('printer:error', message)
      return { success: false, error: message }
    }
  })
}
