# POS v2 — Desktop App (Windows & macOS)

> An Electron-based cross-platform desktop application that wraps the POS v2 frontend,
> adds native hardware access (thermal printers, cash drawers), and ships as a
> standalone installer — no browser required.
>
> **Platforms:** Windows 10/11 (`.exe` NSIS installer) · macOS 10.15+ (`.dmg` disk image)

---

## Why a Desktop App?

The web frontend ([POS-frontend-v2](../POS-frontend-v2)) already runs in any browser. So why build a desktop app at all?

| Limitation (Web/Browser) | Desktop App Solution |
|--------------------------|---------------------|
| Thermal printer requires browser print dialog | Direct ESC/POS commands over USB — silent, instant |
| Cash drawer needs manual trigger | Opens automatically on sale completion |
| Browser caches limited; offline unreliable | Full local file access; embedded backend option |
| User can accidentally close the tab | App stays running; system tray / dock; hard to accidentally exit |
| Auto-update requires deployment + manual refresh | `electron-updater` pushes updates silently in background |
| No OS notifications | Native toast notifications (low stock, shift reminders) |
| Barcode scanner keyboard conflicts with browser | Dedicated input interception without focus issues |
| No OS integration | Start menu shortcut (Windows) · Dock icon (macOS) · Auto-start option |

For **Nigerian retail specifically**, the desktop app solves a real problem: thermal receipt printers connected via USB cannot be driven silently from a browser — every print requires a dialog. A desktop app eliminates that dialog entirely, making checkout 3–5 seconds faster per transaction.

---

## Technology Choice — Electron

**Electron** was chosen over Tauri and NW.js for this project for the following reasons:

| Factor | Electron | Tauri | Decision |
|--------|----------|-------|---------|
| Language | TypeScript / Node.js | Rust (backend) + TypeScript (frontend) | **Electron** — team already knows TypeScript; no Rust learning curve |
| Frontend reuse | 100% reuse of React/Vite app | 100% reuse | Both equal |
| Bundle size | ~80–120 MB installer | ~5–15 MB installer | Tauri wins, but acceptable on modern PCs |
| Native USB/serial | `serialport` (MIT, Node.js) | `tauri-plugin-serialport` (Rust) | **Electron** — more mature; more examples |
| Windows support | Excellent | Very good | Both fine |
| Community | Very large | Growing | **Electron** — more resources for troubleshooting |
| Security model | Manual (contextIsolation) | Allowlist by default | Comparable when configured correctly |
| License | MIT | MIT + Apache 2.0 | Both free |

All Electron dependencies are free and open-source.

---

## How It Fits With the Other Two Projects

This is the third project in the POS v2 system:

```
POS-backend-v2/          ← NestJS REST API (the brain)
POS-frontend-v2/         ← React web app (browser access)
POS-desktop-app/         ← Electron Windows app (cashier terminal)
```

The desktop app is **not a new frontend** — it is an Electron shell that loads the **same built output** of `POS-frontend-v2`. All business logic stays in the backend. The desktop app adds only native capabilities on top.

```
┌─────────────────────────────────────────────────────────┐
│  Windows PC (Electron App)                               │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Renderer Process (BrowserWindow)                │   │
│  │  Loads: POS-frontend-v2/dist/index.html          │   │
│  │  Same React app — cashier screen + admin portal  │   │
│  └─────────────────┬────────────────────────────────┘   │
│                    │  IPC (contextBridge)                │
│  ┌─────────────────▼────────────────────────────────┐   │
│  │  Main Process (Node.js)                          │   │
│  │  Thermal printer via serialport                  │   │
│  │  Cash drawer via printer serial port             │   │
│  │  electron-store (local config)                   │   │
│  │  electron-updater (auto-update)                  │   │
│  │  System tray, notifications                      │   │
│  └─────────────────┬────────────────────────────────┘   │
└────────────────────│────────────────────────────────────┘
                     │  HTTP / REST
                     ▼
             POS-backend-v2 API
             (local LAN or cloud)
```

---

## Three Deployment Scenarios

### Scenario A — Cloud Backend (Recommended for Most Stores)

```
Store PC 1 (Electron) ──┐
Store PC 2 (Electron) ──┼──── Internet ───► Cloud VPS (NestJS API + MongoDB)
Store PC 3 (Electron) ──┘
```

- Backend deployed once on a VPS (e.g., DigitalOcean, Hetzner — budget-friendly)
- All terminals connect over the internet
- Easy to manage; automatic backups on server
- Requires stable internet (4G hotspot as backup recommended)

### Scenario B — LAN Backend (For Stores With Unreliable Internet)

```
Store Router / Switch
├── Server PC (NestJS API + MongoDB) — IP: 192.168.1.100
├── Cashier Terminal 1 (Electron) — connects to 192.168.1.100
└── Cashier Terminal 2 (Electron) — connects to 192.168.1.100
```

- Backend runs on one PC in the store (or a cheap mini-PC / Raspberry Pi 4)
- All Electron apps configured with the local IP
- Fast, no internet dependency, full offline capability
- Admin can still access the web frontend from any device on the LAN

### Scenario C — Embedded Backend (Single-Terminal Store)

```
One PC:
  Electron App
  └── spawns ──► NestJS process (child_process)
                  └── connects ──► MongoDB (local) + Redis (local)
```

- Everything on one machine
- Electron's main process starts NestJS as a child process on launch
- Good for very small stores (one PC, one cashier)
- Most complex to set up; see [`docs/deployment.md`](docs/deployment.md)

---

## Platform Support

| Feature | Windows 10/11 | macOS 10.15+ |
|---------|:---:|:---:|
| App runs | ✅ | ✅ |
| Cashier POS + admin portal | ✅ | ✅ |
| Frameless custom window | ✅ | ✅ (native traffic lights) |
| System tray (Windows) / Menu bar (macOS) | ✅ | ✅ |
| Thermal printer via USB/Serial | ✅ (COM3, COM4…) | ✅ (/dev/tty.usbserial-*) |
| Network TCP printer | ✅ | ✅ |
| Cash drawer | ✅ | ✅ |
| Auto-update (electron-updater) | ✅ | ✅ |
| Notifications | ✅ (Windows toast) | ✅ (macOS notification centre) |
| Auto-start on login | ✅ (Registry) | ✅ (LaunchAgent) |
| Kiosk mode | ✅ | ✅ |
| Installer | `.exe` NSIS | `.dmg` disk image |
| Architecture | x64, ia32 | x64 (Intel), arm64 (Apple Silicon) |

---

## Getting Started (Development)

### Prerequisites

- Node.js v25+
- `POS-frontend-v2` already set up (the desktop app loads its built output)
- **Windows:** For full native testing (printer, tray balloon notifications)
- **macOS:** For macOS-specific testing; serialport requires Xcode Command Line Tools

### 1. Install

```bash
cd POS-desktop-app
npm install
```

### 2. Build the Frontend First

```bash
cd ../POS-frontend-v2
npm run build
# Output: POS-frontend-v2/dist/
```

### 3. Configure Environment

```bash
cp .env.example .env
```

```env
# .env
ELECTRON_BACKEND_URL=http://localhost:3003
# In production, this becomes the cloud or LAN URL
# e.g. https://api.yourstore.com or http://192.168.1.100:3003
```

### 4. Run in Development

```bash
npm run dev
# Starts Vite (POS-frontend-v2) + Electron simultaneously
# Electron loads http://localhost:5173 in development
```

### 5. Build Windows Installer

```bash
npm run build:win
# Output: dist-electron/POS-Setup-1.0.0.exe  (NSIS installer)
# or:     dist-electron/POS-1.0.0-win.zip    (portable)
```

---

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Electron in development (loads Vite dev server) |
| `npm run build:win` | Build NSIS `.exe` installer for Windows (x64 + ia32) |
| `npm run build:win-portable` | Build portable `.exe` for Windows (no install required) |
| `npm run build:mac` | Build `.dmg` for macOS (x64 + arm64) |
| `npm run build:mac-dmg` | Build `.dmg` disk image only |
| `npm run build:mac-zip` | Build `.app` in zip archive |
| `npm run build:all` | Build for Windows AND macOS in one pass |
| `npm run lint` | ESLint across `src/` |
| `npm run typecheck` | TypeScript check without emit |

---

## Documentation Index

| Document | What it covers |
|----------|---------------|
| [`docs/build-and-run-personal.md`](docs/build-and-run-personal.md) | **Build & launch on your personal Mac and Windows laptop (start here)** |
| [`docs/architecture.md`](docs/architecture.md) | Main/renderer processes, IPC channels, preload, security model |
| [`docs/native-features.md`](docs/native-features.md) | Thermal printer (ESC/POS), cash drawer, barcode scanner, notifications |
| [`docs/setup.md`](docs/setup.md) | Full developer setup guide step-by-step |
| [`docs/deployment.md`](docs/deployment.md) | Building, signing, auto-updates, distributing to stores |
| [`docs/phases.md`](docs/phases.md) | Desktop-specific task phases and numbered task list |

---

## Related Projects

| Project | Description |
|---------|-------------|
| [POS-backend-v2](../POS-backend-v2) | NestJS REST API — the backend this app connects to |
| [POS-frontend-v2](../POS-frontend-v2) | React web app — the frontend this app embeds |
