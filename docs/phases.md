# Desktop App — Development Phases & Task Breakdown

## Overview

Desktop development runs **in parallel** with the main web phases. Most desktop phases depend on the corresponding web phase completing first (since the desktop app embeds the web frontend), but scaffolding and native feature work can start independently.

| Phase | Name | Parallel With | Tasks |
|-------|------|--------------|-------|
| D1 | Foundation & Shell | Web Phase 1 | 14 tasks |
| D2 | Native Printer & Hardware | Web Phase 2 | 10 tasks |
| D3 | Offline & System Integration | Web Phase 3 | 9 tasks |
| D4 | Polish & Distribution | Web Phase 4 | 8 tasks |
| D5 | Embedded Backend (Optional) | Web Phase 5 | 7 tasks |

---

## Desktop Phase 1 — Foundation & Shell

**Duration:** Parallel with Web Phase 1 (can start after Week 1)

**Goal:** A working Electron app that loads the POS frontend, shows a frameless window with a custom title bar, runs in the system tray, and can be built into a Windows `.exe` installer.

**Done when:**
- `npm run dev` opens Electron with the React POS frontend
- Window can be minimised, maximised, and closed using custom controls
- App minimises to system tray instead of closing
- `npm run build:win` produces a working NSIS installer
- App loads the correct backend URL from config
- Version is displayed in the app

### Phase D1 — Tasks

| ID | Task | Detail |
|----|------|--------|
| DE-1.01 | Project scaffolding | Init npm project; install `electron`, `electron-builder`, `typescript`, `concurrently`, `wait-on`; configure `tsconfig.json` for main process; create `src/main/` structure |
| DE-1.02 | Main process entry | `src/main/main.ts` — create `BrowserWindow` with correct security settings (`contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`); load Vite URL in dev, `file://` in prod |
| DE-1.03 | Preload script | `src/main/preload.ts` — `contextBridge.exposeInMainWorld('electronAPI', {...})`; expose all IPC channels with correct types; export TypeScript interface for `window.electronAPI` |
| DE-1.04 | Window manager | `src/main/window-manager.ts` — frameless window, window state persistence via `electron-store`, restore last size/position on launch |
| DE-1.05 | Frameless window IPC | `src/main/ipc-handlers/window.handler.ts` — handle `window:minimize`, `window:maximize`, `window:close`, `window:is-maximized` |
| DE-1.06 | System tray | `src/main/tray-manager.ts` — tray icon, context menu (Open, Check for Updates, Quit); intercept window close → hide to tray; balloon notification on first hide |
| DE-1.07 | electron-store setup | Install `electron-store`; define `DesktopConfig` interface; default config values; `config:get` and `config:set` IPC handlers |
| DE-1.08 | Environment config | `.env.example` with `ELECTRON_BACKEND_URL`, `ELECTRON_KIOSK_MODE`; load with `dotenv` in main process; pass `backendUrl` to renderer via IPC on startup |
| DE-1.09 | CSP in main process | `session.defaultSession.webRequest.onHeadersReceived` — strict CSP that allows `connect-src` to `ELECTRON_BACKEND_URL` only |
| DE-1.10 | Frontend: isElectron() detection | In `POS-frontend-v2`: add `src/utils/platform.ts` — `isElectron()`, `electronAPI()` helpers; define `ElectronAPI` TypeScript interface |
| DE-1.11 | Frontend: custom title bar | In `POS-frontend-v2`: `TitleBar` component — shows only when `isElectron()` is true; uses `window.electronAPI.minimizeWindow()` etc.; drag region via `-webkit-app-region: drag` |
| DE-1.12 | electron-builder config | `electron-builder.yml` — NSIS + portable targets; `extraResources` copies `POS-frontend-v2/dist`; app icon; shortcut names |
| DE-1.13 | Dev script | `package.json` scripts — `dev` uses `concurrently` to run Vite + Electron; `wait-on` waits for Vite before launching Electron |
| DE-1.14 | First Windows installer | `npm run build:win` produces working `.exe`; test install on Windows 10 VM; verify app loads and connects to backend |

---

## Desktop Phase 2 — Native Printer & Hardware

**Duration:** Parallel with Web Phase 2 (Weeks 6–7)  
**Prerequisite:** Phase D1 complete

**Goal:** Thermal receipt printer works via USB/Serial and Network TCP. Cash drawer opens on sale completion. Configuration UI accessible from admin settings.

**Done when:**
- Admin can detect available COM ports in settings
- Admin can select port, baud rate, and paper width
- Test print button works
- Cash drawer opens when a cash transaction completes
- Receipt prints silently (no dialog) when a sale completes in Electron
- Network printer (TCP) also supported

### Phase D2 — Tasks

| ID | Task | Detail |
|----|------|--------|
| DE-2.01 | serialport integration | Install `serialport` (MIT); configure `electron-rebuild` for native module compilation; add `postinstall` script: `electron-rebuild -f -w serialport` |
| DE-2.02 | Printer IPC handler | `src/main/ipc-handlers/printer.handler.ts` — `printer:get-list`, `printer:print-receipt`, `printer:test-print`; USB/serial via `SerialPort`; network via `net.Socket` |
| DE-2.03 | ESC/POS command builder | `buildReceiptBuffer(lines, paperWidth)` — INIT, ALIGN, BOLD, DOUBLE_HEIGHT, LINE_FEED, CODE128 barcode, PARTIAL_CUT commands |
| DE-2.04 | Cash drawer IPC handler | `src/main/ipc-handlers/drawer.handler.ts` — `drawer:open`; sends ESC `p` command through the printer port |
| DE-2.05 | Frontend: print service | In `POS-frontend-v2`: update `src/services/print.service.ts` — if `isElectron()`: call `window.electronAPI.printReceipt(lines)`; else: `window.print()` |
| DE-2.06 | Frontend: receipt → ESC/POS lines | In `POS-frontend-v2`: `buildEscPosLines(transaction, receiptConfig)` utility — converts receipt data to the `ReceiptLine[]` format expected by the printer handler |
| DE-2.07 | Auto cash drawer on sale | In `POS-frontend-v2` checkout success handler: after successful transaction, call `window.electronAPI?.openCashDrawer()` if payment method is `CASH` |
| DE-2.08 | Desktop settings tab | In `POS-frontend-v2` admin settings: add "Desktop" tab visible only when `isElectron()` — printer type selector, COM port selector, baud rate, paper width, cash drawer toggle, [Test Print] button |
| DE-2.09 | Printer error notification | Main process sends `printer:error` event to renderer on failure; React shows a toast: "Receipt print failed — [Reprint] button available" |
| DE-2.10 | First-launch setup wizard | On first launch (no printer config stored): show setup wizard for backend URL + printer config; guided 3-step flow; save to `electron-store` |

---

## Desktop Phase 3 — Offline & System Integration

**Duration:** Parallel with Web Phase 3 (Weeks 8–10)  
**Prerequisite:** Phase D2 complete

**Goal:** Windows toast notifications for key events. Auto-updater set up. App can be configured to auto-start on Windows boot. Backend URL can be changed after installation.

**Done when:**
- Auto-updater checks for updates every 4 hours silently
- Notification appears when an update is available
- Windows toast notification fires when stock goes below reorder level
- App auto-starts on boot when configured (admin setting)
- Backend URL can be updated via Desktop Settings without reinstalling

### Phase D3 — Tasks

| ID | Task | Detail |
|----|------|--------|
| DE-3.01 | Auto-updater | `src/main/updater.ts` — `electron-updater`; auto-download in background; notify renderer on `update-available` and `update-downloaded`; check on launch + every 4h |
| DE-3.02 | Update notification UI | In `POS-frontend-v2`: `UpdateBanner` component — shows only in Electron; appears when `update:available` event fires; [Install on Restart] button |
| DE-3.03 | Windows toast notifications | `sendNotification(title, body, urgency)` helper in main process; notify on: low stock, shift expiry reminder, offline/online status change, update available |
| DE-3.04 | Online/offline detection | Main process monitors HTTP connectivity to `ELECTRON_BACKEND_URL` every 30s; sends `network:offline` / `network:online` events to renderer; renderer shows status banner |
| DE-3.05 | Auto-start on boot | `app.setLoginItemSettings()` in IPC handler; toggle in Desktop Settings; test on Windows 10 |
| DE-3.06 | Backend URL change at runtime | Desktop Settings → Backend URL field + [Test Connection] button; on save: store in `electron-store` + reload the webview with new URL |
| DE-3.07 | Keyboard shortcut guard | In main process: intercept `Ctrl+W` (close tab) and `Ctrl+R` (reload) in production mode — show confirmation dialog instead of closing/reloading during active shift |
| DE-3.08 | Developer tools control | In production: disable DevTools (`mainWindow.webContents.on('before-input-event')` blocks F12); in development: allow via shortcut |
| DE-3.09 | GitHub Releases publish | Configure `electron-builder.yml` `publish` section with GitHub provider; `npm run build:win -- --publish=always` publishes to GitHub; document release process |

---

## Desktop Phase 4 — Polish & Distribution

**Duration:** Parallel with Web Phase 4 (Weeks 11–13)

**Goal:** Professional Windows installer. App icon. Code signing guidance. Store-specific installer builds. Distribution documentation complete.

**Done when:**
- Installer looks professional (logo, banner, proper shortcut names)
- App icon appears in Start menu and taskbar
- Release build tested on clean Windows 10 and Windows 11 VM
- Release notes in `CHANGELOG.md`
- Distribution guide written for non-technical store owners

### Phase D4 — Tasks

| ID | Task | Detail |
|----|------|--------|
| DE-4.01 | App icons (all platforms) | Run `npx electron-icon-builder` from a 1024×1024 PNG source to generate `icon.ico` (Windows), `icon.icns` (macOS), and `icon.png` (tray); place all in `resources/` |
| DE-4.02 | NSIS installer assets (Windows) | `resources/installer-banner.bmp` (164×314px); `resources/installer-header.bmp` (150×57px); optional `resources/LICENSE.txt` |
| DE-4.03 | macOS entitlements | `resources/entitlements.mac.plist` — already created; verify `com.apple.security.device.serial` and `cs.allow-jit` keys are present |
| DE-4.04 | macOS DMG build | `npm run build:mac` produces universal DMG; test on Intel + Apple Silicon; verify traffic lights (⊗ ⊖ ⊞) work; verify serial port detected |
| DE-4.05 | Kiosk mode | `ELECTRON_KIOSK_MODE=true` → `kiosk: true` in BrowserWindow; works on Windows and macOS; add toggle in Desktop Settings |
| DE-4.06 | Multi-store installer build | NPM script `build:store` accepts `--env BACKEND_URL=https://...`; builds Windows + macOS artifacts with baked-in URL |
| DE-4.07 | Portable `.exe` build (Windows) | `npm run build:win-portable` — single-file `.exe`; no installation; for stores that cannot install software |
| DE-4.08 | CHANGELOG.md | Create `CHANGELOG.md` with initial v1.0.0 entry for both platforms |
| DE-4.09 | Windows release test | Full test on clean Windows 10 VM: install → login → sale → printer → cash drawer → software update |
| DE-4.10 | macOS release test | Full test on clean macOS VM (Intel + Apple Silicon): mount DMG → drag to Applications → login → sale → printer → software update |
| DE-4.11 | Store owner distribution guide | One-page guide per platform (Windows + macOS): how to install, configure printer, troubleshoot; include CH340/CP210x driver links for macOS |

---

## Desktop Phase 5 — Embedded Backend (Optional)

**Duration:** Parallel with Web Phase 5  
**Prerequisites:** Phase D4 complete; Store wants single-PC offline operation

**Goal:** For single-terminal stores with no separate server, the desktop app can spawn the NestJS backend as a child process, making the entire system run on one PC with no internet required.

This is optional and complex — only implement if there is clear demand from single-terminal stores.

**Done when:**
- App launches MongoDB, Redis, and NestJS automatically on startup
- All cashier operations work with no internet connection
- Data is backed up to an external drive automatically
- Admin can export data for manual backup

### Phase D5 — Tasks

| ID | Task | Detail |
|----|------|--------|
| DE-5.01 | Embedded services research | Evaluate: MongoDB embedded (Realm/FerretDB), Redis embedded (ioredis-mock not suitable — use `keyv` with SQLite instead); document decision |
| DE-5.02 | Backend child process | In main process: `child_process.spawn('node', ['dist/main.js'])` pointing to `POS-backend-v2/dist/`; stream stdout/stderr to a log file; restart on crash |
| DE-5.03 | MongoDB local installer | Bundle MongoDB Community portable binary in `resources/mongo/`; start with `--dbpath` pointing to `%APPDATA%/POS-v2/data/db`; stop on app quit |
| DE-5.04 | Redis local instance | Bundle Redis for Windows (unofficial port or use `keyv` with better-sqlite3 as cache backend to avoid Redis dependency) |
| DE-5.05 | Startup orchestration | Startup sequence: MongoDB → Redis → NestJS → wait for health check → load frontend; loading screen during startup; fail gracefully with error message |
| DE-5.06 | Local data backup | Daily backup to configurable external drive path; warn admin if backup drive not connected; show last backup timestamp in Desktop Settings |
| DE-5.07 | Single-PC installer | Separate `electron-builder` target that bundles the backend, MongoDB binary, and frontend; one-click install for fully self-contained store |

---

## Dependency List (All Free)

| Package | Version | Licence | Purpose |
|---------|---------|---------|---------|
| `electron` | ^33.0.0 | MIT | App framework |
| `electron-builder` | ^25.0.0 | MIT | Windows installer / build tool |
| `electron-updater` | ^6.3.0 | MIT | Auto-updates via GitHub Releases |
| `electron-store` | ^10.0.0 | MIT | Local config persistence |
| `serialport` | ^12.0.0 | MIT | USB/Serial thermal printer access |
| `concurrently` | ^9.0.0 | MIT | Run Vite + Electron simultaneously in dev |
| `wait-on` | ^8.0.0 | MIT | Wait for Vite server before starting Electron |
| `dotenv` | ^16.0.0 | BSD-2 | Load `.env` in main process |
| `typescript` | ^5.6.0 | Apache 2.0 | Main process types |
| `electron-rebuild` | ^3.6.0 | MIT | Rebuild native modules (serialport) for Electron |

> No paid dependencies. All tooling is MIT or Apache 2.0 licensed.

---

## Task Summary

| Phase | Frontend Tasks | Backend Tasks | Desktop Tasks | Total |
|-------|--------------|--------------|--------------|-------|
| D1 | 4 (in POS-frontend-v2) | 0 | 14 | 18 |
| D2 | 4 (in POS-frontend-v2) | 0 | 10 | 14 |
| D3 | 2 (in POS-frontend-v2) | 0 | 9 | 11 |
| D4 | 0 | 0 | 8 | 8 |
| D5 | 0 | 0 | 7 | 7 |
| **Total** | **10** | **0** | **48** | **58** |

The 10 frontend tasks in phases D1 and D2 are additions to `POS-frontend-v2` (platform detection, custom title bar, print service update, desktop settings tab). They do not conflict with any existing tasks.
