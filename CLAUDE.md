# POS-desktop-app — Project Guide for Claude

## Project Overview

POS-desktop-app is an Electron-based **cross-platform** desktop application (Windows + macOS) that wraps the `POS-frontend-v2` React app and adds native hardware capabilities (thermal printer, cash drawer, system tray/menu bar, auto-update).

- **Platforms:** Windows 10/11 · macOS 10.15+ (Intel + Apple Silicon)
- **Runtime:** Node.js v25+ (dev/build); Electron's bundled Node.js (runtime inside app)
- **Framework:** Electron 33
- **Language:** TypeScript (main process, strict mode)
- **Frontend:** Loads `POS-frontend-v2/dist/` (built React app) — do NOT duplicate frontend code here
- **Package manager:** npm

## Non-Negotiable Coding Rules

All code MUST follow the rules in:
```
../POS-backend-v2/docs/rules/rule_practice.md
```

Key rules for the Electron main process:
- Rule 25: Dev-only logging — never swallow errors silently
- Rule 30: `crypto.randomUUID()` for any IDs
- Rule 38: `let`/`const` only — no `var`

## CRITICAL Architecture Rules

### 1. Types live in `src/main/types.ts` — NEVER in preload.ts
`preload.ts` runs in an isolated context. Types defined there cannot be safely imported by main-process handlers. All shared types (`AppConfig`, `ReceiptLine`, `ElectronAPI`, etc.) live in `src/main/types.ts` only.

### 2. electron-store MUST be v8.x (NOT v9+ or v10)
`electron-store` v9+ dropped CommonJS support. Our tsconfig uses `"module": "CommonJS"`. Always use `^8.2.0`.

### 3. contextIsolation MUST remain true
Never set `contextIsolation: false`. The renderer (React app) has zero Node.js access. All native capabilities are exposed through the controlled `contextBridge` in `preload.ts`.

### 4. Never put business logic in the main process
Business logic belongs in `POS-backend-v2`. The Electron main process only:
- Creates/manages the BrowserWindow
- Handles native OS calls (serialport, tray, notifications)
- Reads/writes `electron-store` config
- Relays IPC between renderer and OS

### 5. Runtime backend URL (critical integration point)
The React app's Axios instance CANNOT use `VITE_API_BASE_URL` in Electron — that variable is frozen at build time. Instead, the Axios `baseURL` must be fetched at runtime via `window.electronAPI.getBackendUrl()` and set before the first API call. See `docs/frontend-integration.md`.

## Folder Structure

```
src/
└── main/
    ├── types.ts               # ALL shared types — import from here, not from preload
    ├── main.ts                # Entry point — creates BrowserWindow
    ├── preload.ts             # contextBridge — exposes window.electronAPI
    ├── tray-manager.ts        # System tray setup
    ├── updater.ts             # electron-updater auto-update
    └── ipc-handlers/
        ├── window.handler.ts  # Frameless window controls, app version
        ├── config.handler.ts  # electron-store read/write
        ├── printer.handler.ts # ESC/POS thermal printing (USB + network)
        └── drawer.handler.ts  # Cash drawer via printer port
resources/                     # App icons and installer assets (see resources/README.md)
docs/
├── architecture.md            # Main/renderer process architecture, IPC, security
├── native-features.md         # Printer, cash drawer, notifications, auto-start
├── frontend-integration.md    # How the React frontend integrates with Electron
├── setup.md                   # Developer setup guide
├── deployment.md              # Build, sign, and distribute for Windows
└── phases.md                  # Development phases and task list
```

## Development Commands

```bash
npm run dev                  # Start Electron (Vite dev server must be running first)
npm run build:win            # Build NSIS .exe installer for Windows
npm run build:win-portable   # Build portable .exe for Windows
npm run build:mac            # Build .dmg for macOS (x64 + arm64)
npm run build:all            # Build for BOTH Windows and macOS
npm run rebuild-native       # Rebuild serialport for current Electron version
npm run typecheck            # TypeScript check without emit
npm run lint                 # ESLint
```

## Platform-Specific Notes

### Windows
- Serial port paths: `COM1`, `COM2`, `COM3`… (shown in Device Manager)
- Tray icon shows balloon notification on first hide
- Title bar: fully custom frameless (`frame: false`, `titleBarStyle: 'hidden'`)
- No native app menu — React renders custom header

### macOS
- Serial port paths: `/dev/tty.usbserial-*` or `/dev/cu.*` (shown in `ls /dev/tty.*`)
- Tray icon is in the macOS menu bar (top-right); uses template image for dark/light adaptation
- Title bar: `frame: true`, `titleBarStyle: 'hiddenInset'` — native traffic lights (⊗ ⊖ ⊞) are kept; React title bar hides custom buttons on macOS
- macOS app menu is set via `Menu.setApplicationMenu()` for Edit (copy/paste) and app commands
- `window-all-closed` does NOT quit on macOS — app stays in dock (standard macOS behaviour)
- `activate` event re-opens window when dock icon is clicked
- Entitlements (`resources/entitlements.mac.plist`) required for hardened runtime + serial port access
- Code signing requires Apple Developer Program; without it users must right-click → Open

## Key Documentation

| Doc | Must-Read? | Purpose |
|-----|-----------|---------|
| `docs/architecture.md` | ✅ | Main/renderer architecture, IPC channels, security config |
| `docs/frontend-integration.md` | ✅ | How React detects Electron; dynamic backend URL; TitleBar |
| `docs/native-features.md` | Reference | ESC/POS printer code, cash drawer, notifications |
| `docs/setup.md` | ✅ (first time) | Step-by-step dev setup; serialport compilation |
| `docs/deployment.md` | Reference | Build and distribute for Windows |
| `docs/phases.md` | Reference | All 48 desktop tasks + 10 frontend tasks |

## Environment Variables

```
NODE_ENV=development | production
ELECTRON_BACKEND_URL=http://localhost:3003
ELECTRON_KIOSK_MODE=false | true
ELECTRON_UPDATE_URL=  (leave blank in dev)
```

## IPC Channel Naming Convention

All channels are prefixed by their domain:
- `app:*` — app info (version, backend URL)
- `window:*` — window management
- `printer:*` — thermal printer operations
- `drawer:*` — cash drawer
- `config:*` — electron-store operations
- `update:*` — auto-updater
- `network:*` — connectivity status (main → renderer events)

## Related Projects

| Project | Relationship |
|---------|-------------|
| `POS-frontend-v2` | React app loaded by this Electron shell. Do NOT copy frontend code here. |
| `POS-backend-v2` | NestJS API that both this app and the web app connect to. |
