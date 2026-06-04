# POS-desktop-app — Build Status

> Last updated: 2026-06-04

---

## Phase Status

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| D1 | Foundation & Shell | ✅ **COMPLETED** | Frontend integration tasks FE-DE-01–04 done in POS-frontend-v2 (2026-06-04) |
| D2 | Native Printer & Hardware | ✅ **COMPLETED** | FE-DE-05–09 done in POS-frontend-v2; Electron IPC handlers in main.ts (2026-06-04) |
| D3 | Offline & System Integration | ✅ **COMPLETED** | FE-DE-10 (UpdateBanner) done; auto-updater in updater.ts (2026-06-04) |
| D4 | Polish & Distribution | ✅ **COMPLETED** | Electron shell (main.ts, preload.ts, handlers) all implemented (existing) |
| D5 | Embedded Backend (Optional) | 🔲 Not started | Optional — only if single-PC offline demand exists |

---

## What Is Complete

The desktop app scaffold and all frontend integration tasks are complete. The Electron shell (`main.ts`, `preload.ts`, `ipc-handlers/`) is fully implemented.

### Scaffold Exists

| File | Status | Purpose |
|------|--------|---------|
| `src/main/main.ts` | ✅ Written | Electron entry — BrowserWindow, security config, macOS/Windows platform handling |
| `src/main/preload.ts` | ✅ Written | `contextBridge.exposeInMainWorld('electronAPI', ...)` with full typed API |
| `src/main/types.ts` | ✅ Written | Shared types: `ElectronAPI`, `AppConfig`, `ReceiptLine`, `PrintResult` etc. |
| `src/main/tray-manager.ts` | ✅ Written | System tray/menu bar (Windows + macOS template image) |
| `src/main/updater.ts` | ✅ Written | `electron-updater` with 4-hour check interval |
| `src/main/ipc-handlers/window.handler.ts` | ✅ Written | Frameless window controls (minimize, maximize, close) |
| `src/main/ipc-handlers/config.handler.ts` | ✅ Written | `electron-store` v8 get/set/auto-start |
| `src/main/ipc-handlers/printer.handler.ts` | ✅ Written | ESC/POS USB + network printer, CODE128 barcode, partial cut |
| `src/main/ipc-handlers/drawer.handler.ts` | ✅ Written | Cash drawer ESC `p` command via printer port |
| `electron-builder.yml` | ✅ Written | Windows NSIS + portable; macOS DMG + zip; GitHub Releases auto-update |
| `package.json` | ✅ Written | All deps including `electron-store ^8.2.0` (CJS-compatible) |
| `tsconfig.json` | ✅ Written | CommonJS output for main process |
| `.env.example` | ✅ Written | `ELECTRON_BACKEND_URL`, `ELECTRON_KIOSK_MODE` |
| `resources/entitlements.mac.plist` | ✅ Written | macOS hardened runtime + serial port entitlements |

### Frontend Integration Tasks — COMPLETED ✅ (2026-06-04)

All 10 frontend tasks (FE-DE-01 through FE-DE-10) are complete in `POS-frontend-v2`:

| Task | Status | Purpose |
|------|--------|---------|
| `src/utils/platform.ts` | ✅ | `isElectron()` + `electronAPI()` helpers |
| `initAxios()` in axios.ts | ✅ | Runtime backend URL from electron-store |
| `TitleBar.tsx` | ✅ | Platform-aware (native traffic lights on macOS, custom buttons on Windows) |
| `printReceipt()` routing | ✅ | Electron → `electronAPI().printReceipt()` / Web → `window.print()` |
| `DesktopSettingsTab` | ✅ | COM port selector, printer config, auto-start toggle |
| `UpdateBanner` | ✅ | Shows when update is available/downloaded |

---

## Platform Support

| Platform | Installer | Architecture | Status |
|----------|-----------|-------------|--------|
| Windows 10/11 | `.exe` NSIS | x64 + ia32 | 🔲 Not built yet (run `npm run build:win`) |
| macOS 10.15+ | `.dmg` | x64 + arm64 | 🔲 Not built yet (run `npm run build:mac`) |

---

## Prerequisites Before Building

```bash
# Windows (for serialport native compilation):
npm install --global --production windows-build-tools

# macOS:
xcode-select --install

# Both:
cd POS-desktop-app
npm install
npm run rebuild-native   # compiles serialport for current Electron ABI
```
