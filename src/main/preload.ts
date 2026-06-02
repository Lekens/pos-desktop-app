/**
 * Preload script — runs in isolated context between main and renderer.
 * Exposes a typed, controlled API to the React renderer via contextBridge.
 *
 * All types are imported from types.ts (shared with main process handlers).
 * The renderer accesses this API as `window.electronAPI`.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { ReceiptLine, PrintResult, DetectedPort, CashDrawerResult, AppConfig, UpdateInfo, ElectronAPI } from './types'

// Re-export types so legacy imports from preload still compile
export type { ReceiptLine, PrintResult, DetectedPort, CashDrawerResult, AppConfig, UpdateInfo, ElectronAPI }

const api: ElectronAPI = {
  // ── App ──────────────────────────────────────────────────────────────────
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:version'),
  getBackendUrl: () => ipcRenderer.invoke('app:backend-url'),

  // ── Window (frameless) ───────────────────────────────────────────────────
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),

  // ── Printer ───────────────────────────────────────────────────────────────
  getPrinters: () => ipcRenderer.invoke('printer:get-list'),
  printReceipt: (lines: ReceiptLine[]) => ipcRenderer.invoke('printer:print-receipt', lines),
  testPrint: () => ipcRenderer.invoke('printer:test-print'),

  // ── Cash drawer ───────────────────────────────────────────────────────────
  openCashDrawer: () => ipcRenderer.invoke('drawer:open'),

  // ── Local config (electron-store) ────────────────────────────────────────
  getConfig: <K extends keyof AppConfig>(key: K) => ipcRenderer.invoke('config:get', key) as Promise<AppConfig[K]>,
  setConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => ipcRenderer.invoke('config:set', key, value),
  setAutoStart: (enabled: boolean) => ipcRenderer.invoke('config:set-auto-start', enabled),

  // ── Auto-update ───────────────────────────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.send('update:install'),

  // ── Events: main → renderer ───────────────────────────────────────────────
  onUpdateAvailable: (callback) =>
    ipcRenderer.on('update:available', (_, info: UpdateInfo) => callback(info)),
  onUpdateDownloaded: (callback) =>
    ipcRenderer.on('update:downloaded', () => callback()),
  onPrinterError: (callback) =>
    ipcRenderer.on('printer:error', (_, error: string) => callback(error)),
  onNetworkStatusChange: (callback) =>
    ipcRenderer.on('network:status', (_, online: boolean) => callback(online)),
  onMaximizeChange: (callback) =>
    ipcRenderer.on('window:maximize-change', (_, maximized: boolean) => callback(maximized)),

  // ── Cleanup ───────────────────────────────────────────────────────────────
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
}

contextBridge.exposeInMainWorld('electronAPI', api)

// Augment the Window interface for use in POS-frontend-v2
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
