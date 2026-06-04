/**
 * Shared types for the POS Desktop App main process.
 *
 * These types are imported by both the main process (IPC handlers)
 * and preload.ts. They must NOT import anything from Electron — they
 * are pure TypeScript interfaces.
 *
 * DO NOT import this file in renderer code. Use window.electronAPI instead.
 */

// ─── Receipt ─────────────────────────────────────────────────────────────────

export interface ReceiptLine {
  type: 'text' | 'divider' | 'barcode'
  content?: string
  bold?: boolean
  center?: boolean
  right?: boolean
  doubleHeight?: boolean
}

export interface PrintResult {
  success: boolean
  error?: string
}

export interface DetectedPort {
  path: string
  manufacturer?: string
}

// ─── Cash Drawer ─────────────────────────────────────────────────────────────

export interface CashDrawerResult {
  success: boolean
  reason?: string
}

// ─── Local Config (electron-store) ───────────────────────────────────────────

export interface AppConfig {
  backendUrl: string
  printerPort: string
  printerBaudRate: number
  printerPaperWidth: 58 | 80
  printerType: 'usb' | 'network' | 'browser'
  printerNetworkHost: string
  printerNetworkPort: number
  cashDrawerEnabled: boolean
  cashDrawerPulse: 0 | 1
  autoStartOnBoot: boolean
  windowBounds: { x: number; y: number; width: number; height: number }
  firstLaunchComplete: boolean   // true after setup wizard is finished
}

// ─── Updates ─────────────────────────────────────────────────────────────────

export interface UpdateInfo {
  version: string
  releaseDate: string
  releaseNotes?: string
}

// ─── ElectronAPI (mirrored from preload.ts) ───────────────────────────────────
// This is the typed interface exposed as window.electronAPI in the renderer.
// Kept in sync with preload.ts exposeInMainWorld call.

export interface ElectronAPI {
  platform: string
  getVersion: () => Promise<string>
  getBackendUrl: () => Promise<string>

  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  isMaximized: () => Promise<boolean>

  getPrinters: () => Promise<DetectedPort[]>
  printReceipt: (lines: ReceiptLine[]) => Promise<PrintResult>
  testPrint: () => Promise<PrintResult>

  openCashDrawer: () => Promise<CashDrawerResult>

  getConfig: <K extends keyof AppConfig>(key: K) => Promise<AppConfig[K]>
  setConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<void>
  setAutoStart: (enabled: boolean) => Promise<void>

  checkForUpdates:  () => Promise<void>
  downloadUpdate:   () => Promise<void>
  installUpdate:    () => void

  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void
  onUpdateDownloaded: (callback: () => void) => void
  onPrinterError: (callback: (error: string) => void) => void
  onNetworkStatusChange: (callback: (online: boolean) => void) => void
  onMaximizeChange: (callback: (maximized: boolean) => void) => void

  removeAllListeners: (channel: string) => void
}
