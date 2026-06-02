import { ipcMain } from 'electron'
import { SerialPort } from 'serialport'
import * as net from 'net'
import { store } from './config.handler'

// ESC p command — opens cash drawer
// Params: pin (0=pin2, 1=pin5), onTime (ms×2), offTime (ms×2)
function buildDrawerCommand(pulse: 0 | 1): Buffer {
  return Buffer.from([
    0x1b, 0x70,    // ESC p
    pulse,          // Pin selector
    0x19,          // On time:  25ms
    0xfa,          // Off time: 250ms
  ])
}

async function sendViaSerial(data: Buffer): Promise<void> {
  const port = store.get('printerPort') as string
  const baudRate = (store.get('printerBaudRate') as number) || 9600

  if (!port) throw new Error('No printer port configured')

  return new Promise((resolve, reject) => {
    const serial = new SerialPort({ path: port, baudRate, autoOpen: false })
    serial.open((err) => {
      if (err) return reject(new Error(`Cannot open ${port}: ${err.message}`))
      serial.write(data, (writeErr) => {
        if (writeErr) return reject(writeErr)
        serial.drain(() => { serial.close(); resolve() })
      })
    })
  })
}

async function sendViaNetwork(data: Buffer): Promise<void> {
  const host = store.get('printerNetworkHost') as string
  const port = (store.get('printerNetworkPort') as number) || 9100

  if (!host) throw new Error('No network printer host configured')

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.write(data, (err) => { socket.destroy(); err ? reject(err) : resolve() })
    })
    socket.setTimeout(5000)
    socket.on('timeout', () => { socket.destroy(); reject(new Error('Drawer connection timeout')) })
    socket.on('error', reject)
  })
}

export function registerDrawerHandlers() {
  ipcMain.handle('drawer:open', async () => {
    const enabled = store.get('cashDrawerEnabled')
    if (!enabled) return { success: false, reason: 'Cash drawer not enabled in settings' }

    const pulse = (store.get('cashDrawerPulse') as 0 | 1) ?? 0
    const printerType = store.get('printerType') as string
    const cmd = buildDrawerCommand(pulse)

    try {
      if (printerType === 'network') {
        await sendViaNetwork(cmd)
      } else {
        await sendViaSerial(cmd)
      }
      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[drawer] Open failed:', message)
      return { success: false, reason: message }
    }
  })
}
