# Desktop App — Frontend Integration Guide

## Overview

The desktop app loads `POS-frontend-v2/dist/index.html` — the same React application used in the browser. No React code lives in this repo. The integration works through two mechanisms:

1. **`window.electronAPI`** — The preload script exposes native capabilities as typed async functions. The React app detects Electron and calls these functions instead of browser equivalents.
2. **Platform detection (`isElectron()`)** — The React app checks whether it is running inside Electron and conditionally shows or hides Electron-only UI (title bar, desktop settings tab, print service path).

This document specifies every change needed in `POS-frontend-v2` to support the desktop app.

---

## 1. Platform Detection Utility

**File to create in POS-frontend-v2:** `src/utils/platform.ts`

```typescript
// src/utils/platform.ts

import type { ElectronAPI } from '../../../POS-desktop-app/src/main/types'

/**
 * Returns true when the React app is running inside Electron.
 * Safe to call on the server (SSR) — always returns false.
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window
}

/**
 * Returns the window.electronAPI object or null when running in a browser.
 * Use with isElectron() guard: const api = electronAPI(); if (!api) return;
 */
export function electronAPI(): ElectronAPI | null {
  if (!isElectron()) return null
  return (window as typeof window & { electronAPI: ElectronAPI }).electronAPI
}
```

**Usage pattern throughout the React app:**
```typescript
import { isElectron, electronAPI } from '@/utils/platform'

// Conditional feature
if (isElectron()) {
  await electronAPI()!.openCashDrawer()
}

// Conditional render
{isElectron() && <TitleBar />}
```

---

## 2. Dynamic Backend URL (Critical — Solves the VITE_API_BASE_URL Problem)

**The Problem:**

`VITE_API_BASE_URL` is baked into the built JavaScript at compile time. When the desktop app builds the frontend once and distributes it, the URL is frozen. But different stores need different backend URLs, and the admin can change the URL via Desktop Settings — this new URL must be used immediately without rebuilding.

**The Solution:**

The Axios instance defers setting its `baseURL` until startup. If running in Electron, it fetches the URL from `electron-store` (which the admin can update). If in a browser, it uses the Vite env var.

**File to update in POS-frontend-v2:** `src/lib/axios.ts`

```typescript
// src/lib/axios.ts
import axios, { AxiosInstance } from 'axios'
import { isElectron, electronAPI } from '@/utils/platform'
import { authStore } from '@/store/auth.store'

// Create instance without baseURL — set via initAxios() before first request
export const axiosInstance: AxiosInstance = axios.create({
  withCredentials: true,    // Send refresh token cookie on admin routes
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

/**
 * Must be called ONCE before any API request — typically in main.tsx.
 * Sets the correct baseURL for the current runtime environment.
 */
export async function initAxios(): Promise<void> {
  let baseURL: string

  if (isElectron()) {
    // Get runtime-configurable URL from electron-store (user can change in Desktop Settings)
    baseURL = await electronAPI()!.getBackendUrl()
  } else {
    // Browser: use the build-time Vite env var
    baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3003'
  }

  axiosInstance.defaults.baseURL = baseURL
}

// ─── Auth interceptors (same for both environments) ──────────────────────────

let refreshPromise: Promise<string> | null = null

axiosInstance.interceptors.request.use((config) => {
  const token = authStore.getState().accessToken
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }
    original._retry = true

    // Singleton mutex — only ONE refresh fires even if multiple tabs/requests get 401
    if (!refreshPromise) {
      refreshPromise = axiosInstance
        .post('/api/v1/auth/refresh', {}, { withCredentials: true })
        .then((res) => {
          const newToken: string = res.data.data.accessToken
          authStore.getState().setAccessToken(newToken)
          return newToken
        })
        .finally(() => { refreshPromise = null })
    }

    try {
      const newToken = await refreshPromise
      original.headers['Authorization'] = `Bearer ${newToken}`
      return axiosInstance(original)
    } catch {
      // Refresh failed — clear session and redirect to login
      authStore.getState().clearSession()
      window.location.href = isElectron() ? '/cashier/login' : '/admin/login'
      return Promise.reject(error)
    }
  }
)
```

**File to update in POS-frontend-v2:** `src/main.tsx`

```tsx
// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { initAxios } from '@/lib/axios'
import App from './App'
import '@fontsource/inter/400.css'
// ...

async function bootstrap() {
  // Set the correct API base URL BEFORE rendering (Electron reads from electron-store)
  await initAxios()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

bootstrap()
```

**What happens when admin changes the backend URL in Desktop Settings:**

```typescript
// In DesktopSettingsTab
async function handleBackendUrlSave(newUrl: string) {
  await electronAPI()!.setConfig('backendUrl', newUrl)
  // Update Axios immediately without restarting the app
  axiosInstance.defaults.baseURL = newUrl
  toast.success('Backend URL updated. Reconnecting...')
}
```

---

## 3. Custom Title Bar (Platform-Aware)

The Electron window uses different title bar strategies per platform:

| Platform | `frame` | `titleBarStyle` | Traffic lights | Custom buttons |
|---------|---------|----------------|----------------|----------------|
| Windows / Linux | `false` | `'hidden'` | None (hidden) | React renders [─][□][✕] |
| macOS | `true` | `'hiddenInset'` | Native ⊗ ⊖ ⊞ in top-left | React hides custom buttons |

On macOS, native traffic lights are kept — this matches macOS UX conventions and avoids the accessibility issues of custom close/minimize buttons. The React title bar only renders the **drag region** and the app name on macOS; the custom buttons are only shown on Windows/Linux.

**File to create in POS-frontend-v2:** `src/components/layout/TitleBar.tsx`

```tsx
// src/components/layout/TitleBar.tsx
import { useState, useEffect } from 'react'
import { isElectron, electronAPI } from '@/utils/platform'
import { Minus, Square, X } from 'lucide-react'

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)

  // Detect platform via the Electron API
  const api = electronAPI()
  const isMac = api?.platform === 'darwin'

  useEffect(() => {
    if (!api) return
    api.isMaximized().then(setIsMaximized)
    api.onMaximizeChange(setIsMaximized)
    return () => api.removeAllListeners('window:maximize-change')
  }, [api])

  if (!isElectron()) return null   // Not in Electron — render nothing

  return (
    <div
      className="h-9 flex items-center justify-between bg-slate-900 border-b border-slate-800 select-none"
      // Entire bar is draggable; buttons override with no-drag
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* macOS: leave space for native traffic lights (positioned at x:12 y:12 in main.ts) */}
      {isMac ? (
        <div className="w-20" />   // spacer for traffic lights
      ) : null}

      {/* App name / store name — centered */}
      <span className="text-xs text-slate-400 font-medium flex-1 text-center">
        POS v2
      </span>

      {/* Windows/Linux only: custom window control buttons */}
      {!isMac && (
        <div
          className="flex items-center gap-1 pr-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={() => api?.minimizeWindow()}
            className="w-8 h-7 flex items-center justify-center rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            aria-label="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => api?.maximizeWindow()}
            className="w-8 h-7 flex items-center justify-center rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
          >
            <Square size={11} />
          </button>
          <button
            onClick={() => api?.closeWindow()}
            className="w-8 h-7 flex items-center justify-center rounded hover:bg-red-600 text-slate-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
```

**On macOS**, the native traffic lights (⊗ ⊖ ⊞) appear at `x:12, y:12` (configured in `main.ts`) and handle minimize/maximize/close. The drag region allows the user to move the window by dragging the title bar. The `w-20` spacer ensures the app name doesn't overlap the traffic lights.

**Integration in App.tsx or layout component:**

```tsx
import TitleBar from '@/components/layout/TitleBar'
import { isElectron } from '@/utils/platform'

function AppShell() {
  return (
    <div className="flex flex-col h-screen">
      {isElectron() && <TitleBar />}   {/* Only shows in Electron */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
```

---

## 4. Print Service — Conditional ESC/POS vs Browser Print

**File to update in POS-frontend-v2:** `src/services/print.service.ts`

```typescript
// src/services/print.service.ts
import { isElectron, electronAPI } from '@/utils/platform'
import type { ReceiptLine } from '../../../POS-desktop-app/src/main/types'

/**
 * Build the receipt line array from a transaction.
 * This format is used by both browser (via a React component rendered to @media print)
 * and Electron (sent to printer.handler.ts for ESC/POS).
 */
export function buildReceiptLines(transaction: Transaction, config: ReceiptConfig): ReceiptLine[] {
  const lines: ReceiptLine[] = []

  if (config.storeName) {
    lines.push({ type: 'text', content: config.storeName, center: true, bold: true, doubleHeight: true })
  }

  config.phones.forEach(phone =>
    lines.push({ type: 'text', content: phone, center: true })
  )

  lines.push({ type: 'divider' })

  if (config.headerLine1) {
    lines.push({ type: 'text', content: config.headerLine1, center: true, bold: true })
  }

  lines.push({ type: 'divider' })

  if (config.showDateTime) {
    lines.push({ type: 'text', content: formatDateTime(transaction.createdAt), center: false })
  }
  if (config.showInvoiceNumber) {
    lines.push({ type: 'text', content: `Invoice: ${transaction.invoiceId}` })
  }
  if (config.showCashierName) {
    lines.push({ type: 'text', content: `Cashier: ${transaction.cashierName}` })
  }

  lines.push({ type: 'divider' })

  // Items
  transaction.items.forEach(item => {
    lines.push({
      type: 'text',
      content: `${item.productName.substring(0, 20).padEnd(20)} ${formatKoboRight(item.lineTotal, 8)}`,
    })
    if (config.showSellingUnitDetail) {
      lines.push({
        type: 'text',
        content: `  ${item.sellingUnitName} ×${item.sellingUnitQty} @ ${formatKoboRight(item.sellingUnitPrice, 6)}`,
      })
    }
  })

  lines.push({ type: 'divider' })

  lines.push({ type: 'text', content: `Subtotal:${formatKoboRight(transaction.subtotal, 10)}` })
  if (transaction.discountAmount > 0) {
    lines.push({ type: 'text', content: `Discount:${formatKoboRight(-transaction.discountAmount, 10)}` })
  }
  if (config.showTaxBreakdown) {
    lines.push({ type: 'text', content: `VAT (7.5%):${formatKoboRight(transaction.taxAmount, 8)}` })
  }
  if (transaction.transactionCharge) {
    lines.push({ type: 'text', content: `${transaction.transactionCharge.chargeLabel}:${formatKoboRight(transaction.transactionCharge.chargeAmount, 8)}` })
  }
  lines.push({ type: 'divider' })
  lines.push({ type: 'text', content: `TOTAL:${formatKoboRight(transaction.totalAmount, 12)}`, bold: true })
  lines.push({ type: 'divider' })

  if (config.showBarcode) {
    lines.push({ type: 'barcode', content: transaction.invoiceId })
  }

  config.footerLines.filter(Boolean).forEach(line =>
    lines.push({ type: 'text', content: line, center: true })
  )

  return lines
}

/**
 * Primary print function — routes to Electron ESC/POS or browser print dialog.
 */
export async function printReceipt(transaction: Transaction, config: ReceiptConfig): Promise<void> {
  const lines = buildReceiptLines(transaction, config)

  if (isElectron()) {
    // Silent ESC/POS print — no dialog
    const api = electronAPI()!
    const result = await api.printReceipt(lines)
    if (!result.success) {
      throw new Error(result.error ?? 'Printer error')
    }
  } else {
    // Browser: render receipt HTML and invoke print dialog
    window.print()
  }
}
```

---

## 5. Desktop Settings Tab

**File to create in POS-frontend-v2:** `src/pages/admin/settings/DesktopSettingsTab.tsx`

Only rendered when `isElectron()` is true. Provides:
- Backend URL field + [Test Connection] button
- Printer type selector (USB/Serial, Network TCP, Browser)
- COM port selector (fetched from `api.getPrinters()`)
- Baud rate selector
- Paper width selector (58mm / 80mm)
- [Test Print] button
- Cash drawer toggle
- Auto-start on Windows boot toggle
- App version display
- [Check for Updates] button

```tsx
import { useEffect, useState } from 'react'
import { electronAPI } from '@/utils/platform'
import { axiosInstance } from '@/lib/axios'

export default function DesktopSettingsTab() {
  const api = electronAPI()!  // Only rendered when isElectron() is true
  const [backendUrl, setBackendUrl] = useState('')
  const [printerType, setPrinterType] = useState<'usb' | 'network' | 'browser'>('browser')
  const [availablePorts, setAvailablePorts] = useState<{ path: string; manufacturer?: string }[]>([])
  const [version, setVersion] = useState('')

  useEffect(() => {
    Promise.all([
      api.getConfig('backendUrl').then(setBackendUrl),
      api.getConfig('printerType').then(setPrinterType),
      api.getPrinters().then(setAvailablePorts),
      api.getVersion().then(setVersion),
    ])
  }, [])

  async function testConnection() {
    try {
      await axiosInstance.get('/api/v1/health')
      toast.success('Connected to backend successfully')
    } catch {
      toast.error('Cannot reach backend at ' + backendUrl)
    }
  }

  // ... full form UI
  return <div>{/* Desktop settings form */}</div>
}
```

---

## 6. Auto Cash Drawer on Sale

**File to update in POS-frontend-v2:** wherever the checkout success event is handled (likely in `useCart` hook or `CheckoutModal`):

```typescript
// After successful transaction POST
import { isElectron, electronAPI } from '@/utils/platform'

async function onTransactionComplete(paymentMethod: PaymentMethod) {
  // Open cash drawer automatically on cash payments (Electron only)
  if (isElectron() && paymentMethod === 'CASH') {
    const result = await electronAPI()!.openCashDrawer()
    if (!result.success) {
      console.warn('Cash drawer did not open:', result.reason)
      // Non-fatal — do not block the success flow
    }
  }
}
```

---

## 7. Update Banner

**File to create in POS-frontend-v2:** `src/components/common/UpdateBanner.tsx`

```tsx
import { useState, useEffect } from 'react'
import { isElectron, electronAPI } from '@/utils/platform'
import { RefreshCw } from 'lucide-react'

export default function UpdateBanner() {
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(false)

  useEffect(() => {
    if (!isElectron()) return
    const api = electronAPI()!
    api.onUpdateAvailable((info) => setUpdateVersion(info.version))
    api.onUpdateDownloaded(() => setDownloaded(true))
    return () => {
      api.removeAllListeners('update:available')
      api.removeAllListeners('update:downloaded')
    }
  }, [])

  if (!updateVersion) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-indigo-600 text-white rounded-xl px-4 py-3 shadow-lg flex items-center gap-3">
      <RefreshCw size={16} />
      {downloaded
        ? <span>POS v{updateVersion} ready — will install on next restart</span>
        : <span>Downloading POS v{updateVersion}…</span>
      }
      {downloaded && (
        <button
          onClick={() => electronAPI()!.installUpdate()}
          className="ml-2 bg-white text-indigo-600 text-sm font-semibold px-3 py-1 rounded-lg"
        >
          Restart Now
        </button>
      )}
    </div>
  )
}
```

---

## Integration Checklist

When developing desktop features, verify:

- [ ] `isElectron()` returns `true` in Electron, `false` in browser — test both
- [ ] Axios base URL is fetched from `electronAPI().getBackendUrl()`, not hardcoded
- [ ] All ESC/POS print paths fall back to `window.print()` when not in Electron
- [ ] TitleBar only renders in Electron (no extra space in browser)
- [ ] DesktopSettingsTab only renders in Electron (admin settings)
- [ ] Cash drawer call is non-fatal (catch error, log, continue)
- [ ] UpdateBanner cleans up event listeners on unmount
- [ ] All `electronAPI()!` calls are guarded with `isElectron()` first (or null-check)

## TypeScript — Window.electronAPI Type

Add to `POS-frontend-v2/src/types/global.d.ts` (or equivalent global types file):

```typescript
// Import ElectronAPI type from the desktop app types file
import type { ElectronAPI } from '../../../POS-desktop-app/src/main/types'

declare global {
  interface Window {
    electronAPI?: ElectronAPI   // Optional — only present in Electron
  }
}
```
