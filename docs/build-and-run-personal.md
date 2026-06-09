# Build & Run — Personal Mac and Windows Setup

This guide is for running the POS desktop app on your own development machines.
It covers two scenarios:

- **Mac laptop** — build and launch a `.dmg` on macOS
- **Windows laptop** — build and install the `.exe` on Windows

No code signing or Apple Developer account is required for personal use.
The only one-time warning you will see is from macOS Gatekeeper or Windows SmartScreen,
which you bypass once (instructions below).

---

## Before You Start — What You Need on Both Machines

| Requirement | Mac | Windows |
|---|---|---|
| Node.js v25+ | ✅ Required | ✅ Required |
| Git | ✅ Required | ✅ Required |
| Xcode Command Line Tools | ✅ Required | ✗ Not needed |
| Visual Studio Build Tools 2022 | ✗ Not needed | ✅ Required |
| The full project folder (`POS_CHOICES`) | ✅ | ✅ |

---

## Part 1 — Building on Your Mac Laptop

### Step 1.1 — Install Prerequisites (Mac, one-time)

Open Terminal and run:

```bash
# Check if Xcode Command Line Tools are already installed
xcode-select -p
```

**If you see a path like `/Library/Developer/CommandLineTools` or `/Applications/Xcode.app/...` — you're done, skip to Step 1.2.**

If you see `xcode-select: error: unable to find utility...` then install:

```bash
xcode-select --install
# A dialog will appear — click Install, wait ~3 minutes
```

```bash
# Verify it installed
xcode-select -p
# Expected output: /Library/Developer/CommandLineTools
```
> The message *"Command line tools are already installed"* also means you can skip this — proceed to Step 1.2.

Install Node.js v25+ if you haven't already:

```bash
# Check your current version
node --version   # Should be v25.x or higher

# If not installed or outdated, download from https://nodejs.org
# Or via nvm (recommended):
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.zshrc
nvm install 25
nvm use 25
```

### Step 1.2 — Install Dependencies (Mac)

```bash
# Navigate to the desktop app folder
cd /path/to/POS_CHOICES/POS-desktop-app

# Install all dependencies (this compiles serialport's native code for macOS)
npm install

# If serialport fails to compile, run the native rebuild explicitly:
npm run rebuild-native
```

The first `npm install` downloads Electron (~120 MB) and compiles `serialport` for your
Mac's architecture. This takes 2–5 minutes on the first run.

### Step 1.3 — Build the React Frontend (Mac)

The desktop app embeds a production build of `POS-frontend-v2`.
You must build it before packaging the Electron app.

```bash
cd /path/to/POS_CHOICES/POS-frontend-v2

# Install frontend dependencies if you haven't yet
npm install

# Build the React app — output goes to POS-frontend-v2/dist/
npm run build
```

When it finishes you should see:
```
✓ built in ~450ms
```

### Step 1.4 — Configure the Backend URL (Mac)

The app needs to know where your NestJS API is running.

```bash
cd /path/to/POS_CHOICES/POS-desktop-app

# Create your local .env (do this once)
cp .env.example .env
```

Open `.env` in any text editor and set:

```env
NODE_ENV=production
ELECTRON_BACKEND_URL=http://localhost:3003
ELECTRON_KIOSK_MODE=false
```

Change `ELECTRON_BACKEND_URL` to match wherever your backend is actually running:

| Your setup | Value to use |
|---|---|
| Backend on the same Mac | `http://localhost:3003` |
| Backend on another machine on your home network | `http://192.168.x.x:3003` |
| Cloud-hosted backend | `https://api.yourstore.com` |

### Step 1.5 — Build the macOS App

```bash
cd /path/to/POS_CHOICES/POS-desktop-app

# Build a .dmg disk image for your Mac
npm run build:mac-dmg
```

This command:
1. Builds the Electron main process TypeScript (`src/main/` → `dist-electron/`)
2. Packages everything into a `.dmg` disk image

**Build output location:**
```
POS-desktop-app/release/
  POS-1.0.0.dmg          ← Intel Mac (x64)
  POS-1.0.0-arm64.dmg    ← Apple Silicon Mac (M1/M2/M3/M4)
```

The build takes 2–5 minutes on the first run (downloads packaging tools).
Subsequent builds take under 60 seconds.

> **Which .dmg to use?**
> - MacBook Pro / Air with M1, M2, M3, or M4 chip → use `arm64.dmg`
> - Older Intel MacBook → use the non-arm64 `.dmg`
> - Not sure? Click Apple menu → About This Mac → look for "Apple M..." (arm64) or "Intel" (x64)

### Step 1.6 — Launch on Your Mac

1. Open `POS-desktop-app/release/` in Finder
2. Double-click the correct `.dmg` for your Mac
3. A disk image window opens — drag **POS v2** into **Applications**
4. Eject the disk image
5. Open your Applications folder and double-click **POS v2**

**First launch: macOS Gatekeeper warning**

Because the app is not signed with an Apple Developer certificate, macOS will block it
with a message like *"POS v2 cannot be opened because it is from an unidentified developer"*.

Fix this once:

```bash
# Remove the quarantine flag from the app (one-time per machine)
xattr -cr /Applications/POS\ v2.app
```

Then double-click POS v2 normally — it will open.

Alternatively: right-click the app → **Open** → click **Open** in the dialog.

---

## Part 2 — Building on Your Windows Laptop

> **Cross-compiling note:** You can also build the Windows `.exe` from your Mac using
> Wine/Docker, but it is simpler and more reliable to build it on an actual Windows machine.
> This section assumes you are sitting at your Windows laptop.

### Step 2.1 — Install Prerequisites (Windows, one-time)

**Node.js v25+**
1. Download from https://nodejs.org (choose the Windows Installer, 64-bit)
2. Run the installer — accept defaults, keep "Add to PATH" checked
3. Open Command Prompt and verify: `node --version`

**Visual Studio Build Tools** (needed to compile `serialport` native code)

Option A — via npm (easiest):
```powershell
# Run as Administrator
npm install --global --production windows-build-tools
# This takes 5–10 minutes and installs everything needed
```

Option B — manual:
1. Go to https://visualstudio.microsoft.com/visual-cpp-build-tools/
2. Download and run the installer
3. Select **"Desktop development with C++"** workload
4. Install — this takes 5–15 minutes

**Git**
Download from https://git-scm.com/download/win and install with defaults.

### Step 2.2 — Get the Project on Your Windows Laptop

If the project is on your Mac, the easiest way to get it to Windows is:

**Option A — USB drive or network share:**
Copy the `POS_CHOICES` folder to your Windows laptop.
Delete `node_modules` folders before copying (they are large and platform-specific).

**Option B — Git:**
```bash
# Clone the repository on Windows
git clone https://your-repo-url.com/POS_CHOICES.git
```

### Step 2.3 — Install Dependencies (Windows)

Open Command Prompt (or PowerShell) and run:

```cmd
cd C:\path\to\POS_CHOICES\POS-desktop-app

npm install
```

If `serialport` compilation fails:

```cmd
# Rebuild native modules for the installed Electron version
npm run rebuild-native
```

### Step 2.4 — Build the React Frontend (Windows)

```cmd
cd C:\path\to\POS_CHOICES\POS-frontend-v2

npm install
npm run build
```

### Step 2.5 — Configure the Backend URL (Windows)

```cmd
cd C:\path\to\POS_CHOICES\POS-desktop-app

copy .env.example .env
```

Open `.env` in Notepad (or VS Code) and set:

```env
NODE_ENV=production
ELECTRON_BACKEND_URL=http://localhost:3003
ELECTRON_KIOSK_MODE=false
```

Same rules as Mac — set the URL to wherever your backend is running.

### Step 2.6 — Build the Windows Installer

```cmd
cd C:\path\to\POS_CHOICES\POS-desktop-app

rem Build the NSIS installer (.exe) — recommended
npm run build:win

rem OR build a portable .exe (no installation needed, runs directly)
npm run build:win-portable
```

**Build output location:**
```
POS-desktop-app\release\
  POS-Setup-1.0.0.exe      ← Standard installer (double-click to install)
  POS-1.0.0.exe             ← Portable (run directly, no installation)
```

### Step 2.7 — Launch on Your Windows Laptop

**Standard installer (recommended):**
1. Open `POS-desktop-app\release\` in File Explorer
2. Double-click `POS-Setup-1.0.0.exe`
3. The installer wizard opens — choose install location, click Install
4. After installation, a desktop shortcut is created
5. Double-click **POS v2** on your desktop

**Portable .exe (no installation):**
1. Double-click `POS-1.0.0.exe` directly
2. It runs without installing anything — useful for testing

**First launch: Windows SmartScreen warning**

Without a code signing certificate, Windows SmartScreen shows:
*"Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting."*

To open it anyway:
1. Click **"More info"**
2. Click **"Run anyway"**

This appears once per machine. After that, the app opens normally.

---

## Part 3 — Running in Development Mode (No Build Required)

If you just want to test the app quickly without building an installer, use development mode.
This loads the React app from the Vite dev server instead of a built file.

You need three terminals running simultaneously:

**Terminal 1 — Start the backend:**
```bash
cd POS_CHOICES/POS-backend-v2
npm run start:dev
# NestJS starts on port 3003
```

**Terminal 2 — Start the frontend dev server:**
```bash
cd POS_CHOICES/POS-frontend-v2
npm run dev
# Vite starts on http://localhost:5173
```

**Terminal 3 — Start Electron:**
```bash
cd POS_CHOICES/POS-desktop-app
npm run dev
# Waits for Vite to be ready, then launches Electron
# Electron loads http://localhost:5173
```

Changes to React components hot-reload inside the Electron window automatically.

---

## Quick Command Reference

| What you want to do | Command | Run from |
|---|---|---|
| Run in development (all three terminals needed) | `npm run dev` | `POS-desktop-app/` |
| Build React frontend (required before packaging) | `npm run build` | `POS-frontend-v2/` |
| Build macOS .dmg | `npm run build:mac-dmg` | `POS-desktop-app/` |
| Build macOS .dmg + .zip (both) | `npm run build:mac` | `POS-desktop-app/` |
| Build Windows installer (.exe) | `npm run build:win` | `POS-desktop-app/` |
| Build Windows portable .exe | `npm run build:win-portable` | `POS-desktop-app/` |
| Build for both Mac and Windows at once | `npm run build:all` | `POS-desktop-app/` |
| Recompile serialport after Node.js upgrade | `npm run rebuild-native` | `POS-desktop-app/` |
| TypeScript check (no output) | `npm run typecheck` | `POS-desktop-app/` |

---

## Where the Built Files Land

After a successful build, all output is in:

```
POS-desktop-app/
  release/
    POS-1.0.0.dmg            ← macOS Intel
    POS-1.0.0-arm64.dmg      ← macOS Apple Silicon
    POS-Setup-1.0.0.exe      ← Windows installer
    POS-1.0.0.exe             ← Windows portable
    mac/                     ← macOS .app bundle (inside DMG)
    win-unpacked/            ← Windows unpacked (no installer needed)
```

---

## Troubleshooting

### `serialport` fails to compile — `No module named 'distutils'`

This happens when your default Python is 3.12 or higher (3.13, 3.14, etc.) because
`distutils` was removed from the Python standard library. The `gyp` build system
bundled inside `node-gyp` v9.x still imports it directly.
**`pip3 install setuptools` does not fix this** — gyp imports `distutils` before
setuptools can shim it.

Fix: point node-gyp at Python 3.11, which still ships `distutils`.

```bash
# Step 1 — install Python 3.11 (skip if already installed)
brew install python@3.11

# Step 2 — tell npm/node-gyp to always use Python 3.11 (one-time, globally persisted)
npm config set python /opt/homebrew/bin/python3.11

# Step 3 — verify
npm config get python
# Expected: /opt/homebrew/bin/python3.11

# Step 4 — retry
npm run build:mac-dmg
```

Steps 1 and 2 are one-time per machine. All future builds work without repeating them.

### `serialport` fails to compile — other errors

```bash
# macOS: ensure Xcode Command Line Tools are installed
xcode-select -p   # should print a valid path

# Windows: ensure Visual Studio Build Tools are installed (see Step 2.1)

# Both platforms: force a native rebuild
npm run rebuild-native
```

### Blank white screen when the app opens

The React frontend failed to load. Check:
1. Is `ELECTRON_BACKEND_URL` in `.env` correct?
2. Open DevTools inside the Electron window: **Ctrl+Shift+I** (Windows) / **Cmd+Option+I** (Mac)
3. Look for errors in the Console tab
4. Confirm the backend is running and reachable at the configured URL

### `ELECTRON_BACKEND_URL` — what to set

| Where your backend is running | `.env` value |
|---|---|
| Same machine as the Electron app | `http://localhost:3003` |
| Another PC on the same Wi-Fi network | `http://192.168.x.x:3003` (use that PC's local IP) |
| Cloud server | `https://api.yourstore.com` |

To find the local IP of another machine:
- Mac: System Settings → Network → shows IP address
- Windows: `ipconfig` in Command Prompt → look for IPv4 Address

### "Cannot find module 'dist-electron/main/main.js'"

The TypeScript main process was not compiled. Run:

```bash
npm run build:main
# Then re-run your build command
```

### macOS: App crashes on launch after macOS update

Xcode Command Line Tools may need to be re-accepted after a macOS update:

```bash
sudo xcode-select --reset
xcode-select --install
npm run rebuild-native
```

### Windows: Installer says "This app can't run on your PC"

You installed the ia32 (32-bit) version on a 64-bit machine or vice versa.
Use `npm run build:win` which builds both x64 and ia32 — run the x64 installer.

### App settings are lost after reinstalling

Settings are stored in electron-store, separate from the app installation:
- **Mac:** `~/Library/Application Support/POS-v2/`
- **Windows:** `C:\Users\<you>\AppData\Roaming\POS-v2\`

Delete this folder to reset all settings, or leave it — reinstalling the app does not touch it.

### Electron opens but shows "ERR_CONNECTION_REFUSED"

The backend is not running. Start `POS-backend-v2` with `npm run start:dev` before opening the app,
or set `ELECTRON_BACKEND_URL` to your cloud backend URL.

---

## Uninstalling

**Mac:**
1. Drag `POS v2.app` from Applications to Trash
2. To also remove settings: delete `~/Library/Application Support/POS-v2/`

**Windows (installed version):**
1. Settings → Apps → search "POS v2" → Uninstall
2. To also remove settings: delete `C:\Users\<you>\AppData\Roaming\POS-v2\`

**Windows (portable version):**
Simply delete the `.exe` file. No system changes were made.
