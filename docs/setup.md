# Desktop App — Developer Setup Guide

## Prerequisites

| Tool | Version | Windows | macOS |
|------|---------|---------|-------|
| Node.js | v25+ | https://nodejs.org | https://nodejs.org |
| npm | v10+ | bundled with Node | bundled with Node |
| Git | any | https://git-scm.com | Xcode CLT or https://git-scm.com |
| Build Tools | — | Visual Studio Build Tools 2022 | Xcode Command Line Tools |

> `serialport` is a native Node.js addon that requires **native compilation** on both platforms. The commands differ by OS.

### Install Build Tools — Windows

```powershell
# Option 1: Via npm (easiest)
npm install --global --production windows-build-tools

# Option 2: Download manually
# https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Select: "Desktop development with C++"
```

### Install Build Tools — macOS

```bash
# Install Xcode Command Line Tools (includes clang, make, git)
xcode-select --install

# Verify installation
xcode-select -p   # Should print: /Library/Developer/CommandLineTools
```

You do NOT need the full Xcode IDE — just the Command Line Tools (free, ~200 MB).

---

## Step 1 — Clone / Navigate to the Desktop App Folder

```bash
cd /path/to/MyProjects/POS-desktop-app
```

---

## Step 2 — Install Dependencies

```bash
npm install
```

This installs Electron, electron-builder, serialport, and all other dependencies. The first install may take 2–3 minutes because Electron downloads its binary (~120 MB) and `serialport` compiles native code.

---

## Step 3 — Set Up Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
NODE_ENV=development

# URL of the POS-backend-v2 API
# Development: your local NestJS server
ELECTRON_BACKEND_URL=http://localhost:3003

# Optional: enable kiosk mode (locks to full-screen, no taskbar)
ELECTRON_KIOSK_MODE=false

# Auto-update server URL (leave blank during development)
ELECTRON_UPDATE_URL=
```

---

## Step 4 — Build the Frontend

The Electron app loads the built output of `POS-frontend-v2`. You must build it first (or run the Vite dev server).

```bash
# Option A: Build the frontend (for production-like testing)
cd ../POS-frontend-v2
npm run build
# Output goes to POS-frontend-v2/dist/

# Option B: Use Vite dev server (faster development loop)
# (Run this in a separate terminal — keep it running)
cd ../POS-frontend-v2
npm run dev
```

---

## Step 5 — Start the Backend

```bash
# In a separate terminal
cd ../POS-backend-v2
npm run start:dev
# Starts NestJS on port 3003
```

---

## Step 6 — Run the Desktop App

### Development Mode (loads Vite dev server)

```bash
# In POS-desktop-app directory
npm run dev
```

This runs `concurrently`:
1. Waits for the Vite server to be ready
2. Starts Electron with `NODE_ENV=development`
3. Electron loads `http://localhost:5173`
4. Hot-reload works — changes to the React app auto-reload in Electron

### Development Mode (loads built frontend)

```bash
# Build frontend first (see Step 4 Option A), then:
npm run electron:dev
# Loads file:// from POS-frontend-v2/dist/index.html
```

---

## Step 7 — Verify Native Features Work

### Test Printer Detection

1. Open the app
2. Log in as admin
3. Go to Settings → Desktop tab
4. Click "Detect Printers"
5. Should show available COM ports

### Test Without a Physical Printer

If you don't have a thermal printer connected, you can verify the serial port code using a virtual COM port:

```bash
# Install com0com (free, open-source virtual COM port driver)
# https://sourceforge.net/projects/com0com/
# Creates a pair of linked virtual COM ports (e.g. COM10 ↔ COM11)
# Monitor one port with a terminal app while the app writes to the other
```

---

## Step 8 — Running All Three Projects Together

For full end-to-end development, run these in three terminals:

**Terminal 1 — Backend:**
```bash
cd POS-backend-v2
npm run start:dev
```

**Terminal 2 — Frontend (Vite dev server):**
```bash
cd POS-frontend-v2
npm run dev
```

**Terminal 3 — Desktop App:**
```bash
cd POS-desktop-app
npm run dev
```

The desktop app loads the Vite dev server. Changes to React components hot-reload inside Electron.

To develop main-process code (anything in `src/main/`), you need to restart Electron manually — main-process changes don't hot-reload. A shortcut:

```bash
# In the Electron terminal, press Ctrl+C, then:
npm run dev
```

---

## Development Scripts Quick Reference

```bash
# Start in development (Vite dev server must be running)
npm run dev

# Start pointing to built frontend (no Vite needed)
npm run electron:dev

# TypeScript type-check (no emit)
npm run typecheck

# Lint
npm run lint

# Build NSIS Windows installer
npm run build:win

# Build portable exe (no installation)
npm run build:win-portable

# Build all Windows targets
npm run build:win-all
```

---

## Recommended VS Code Extensions

```json
// .vscode/extensions.json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next",
    "ElectronForVSCode.electron-build-tools"
  ]
}
```

---

## Common Development Issues

### "Cannot find module 'serialport'"

`serialport` failed to compile. Platform-specific fix:

```bash
# Windows: install build tools first
npm install --global --production windows-build-tools

# macOS: install Xcode Command Line Tools first
xcode-select --install

# Both platforms: rebuild for current Electron version
npm run rebuild-native
# (runs: electron-rebuild -f -w serialport)
```

### macOS: "App is damaged and can't be opened" / Gatekeeper blocking

Without a code signing certificate, macOS Gatekeeper blocks the app. During development:

```bash
# Remove quarantine flag (development only — never for distributed builds)
xattr -cr /path/to/POS\ v2.app

# Or: right-click the app → Open → Open (bypasses Gatekeeper once)
```

For distribution, sign and notarize the app (see `deployment.md`).

### macOS: Serial port `/dev/tty.*` not showing

Thermal printer USB-to-Serial adapters need the CH340/CP210x driver:
- CH340 driver (free): https://www.wch-ic.com/downloads/CH341SER_MAC_ZIP.html
- CP210x driver (free): https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
- After installing, restart and check: `ls /dev/tty.* /dev/cu.*`

### Electron opens a blank white screen

The frontend failed to load. Check:
1. Is Vite dev server running? (`http://localhost:5173`)
2. Is `ELECTRON_BACKEND_URL` correct in `.env`?
3. Open DevTools (`Ctrl+Shift+I`) — look for error in console

### "App was blocked from opening" on Windows

SmartScreen blocks unsigned `.exe` files. During development, click "More info → Run anyway". In production, sign your app (see `deployment.md`).

### `electron-store` data location

Stored in: `%APPDATA%\POS-v2\` on Windows (`C:\Users\<username>\AppData\Roaming\POS-v2\`)
Clear it during testing: delete the folder, then relaunch.

### Hot-reload not working for main process changes

Main process changes require Electron restart. Press Ctrl+C and run `npm run dev` again. Only renderer (React) changes hot-reload automatically.
