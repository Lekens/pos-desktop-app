# Desktop App — Building & Distributing for Windows

## Platform Overview

| Platform | Output | Architecture | Signing |
|---------|--------|-------------|---------|
| Windows | `POS-Setup-1.0.0.exe` (NSIS) + `POS-1.0.0.exe` (portable) | x64 + ia32 | Optional PFX certificate |
| macOS | `POS-1.0.0.dmg` | x64 (Intel) + arm64 (Apple Silicon) | Optional Apple Developer ID |

Both platforms support the same auto-update mechanism via GitHub Releases. A single release contains both Windows and macOS artifacts.

---

## Build Pipeline Overview

```
Development code (TypeScript)
        │
        │  tsc → compiles src/main/ to dist-electron/main/
        │  Vite → bundles POS-frontend-v2 to dist-frontend/
        │
        ▼
electron-builder
        │
        ├── NSIS installer (.exe)        ← Recommended for stores
        ├── Portable (.exe)              ← No install, run from USB
        └── ZIP archive                  ← For manual distribution
```

---

## 1. Prepare for a Release Build

### 1a. Build the Frontend

```bash
cd ../POS-frontend-v2
npm run build
# Output: POS-frontend-v2/dist/
```

The `electron-builder.yml` config tells electron-builder to copy this `dist/` folder into the packaged app.

### 1b. Set Production Environment Variables

Create a `.env.production` or set these before building:

```env
NODE_ENV=production
ELECTRON_BACKEND_URL=https://api.yourstore.com
# OR for LAN deployment:
# ELECTRON_BACKEND_URL=http://192.168.1.100:3003
ELECTRON_UPDATE_URL=https://releases.yourstore.com/updates
```

> `ELECTRON_BACKEND_URL` is baked into the build. For stores with different backend URLs, build a separate installer per store OR use the Desktop Settings page to change the URL after installation.

### 1c. Build the Desktop App

```bash
cd POS-desktop-app
npm run build:win
```

Output: `POS-desktop-app/release/POS-Setup-1.0.0.exe`

---

## 2. electron-builder Configuration

The full build config is in `electron-builder.yml`:

```yaml
# electron-builder.yml

appId: com.pos.v2.desktop
productName: POS v2
copyright: "Copyright © 2026 Your Store Name"

# Where to find the built frontend
directories:
  output: release
  buildResources: resources

# Files to include in the packaged app
files:
  - dist-electron/**/*          # Compiled main process
  - "!dist-electron/**/*.map"   # Exclude source maps
  - node_modules/**/*
  - package.json

# Copy the built React frontend into the app
extraResources:
  - from: ../POS-frontend-v2/dist
    to: frontend-dist
    filter:
      - "**/*"

# Windows-specific configuration
win:
  target:
    - target: nsis            # Standard installer (.exe)
      arch: [x64, ia32]       # 64-bit and 32-bit support
    - target: portable        # No-install .exe
      arch: [x64]
  icon: resources/icon.ico
  requestedExecutionLevel: asInvoker   # Don't request admin (UAC)
  signAndEditExecutable: false          # Set to true when you have a code signing cert

# NSIS installer config
nsis:
  oneClick: false                    # Show installation wizard (not one-click)
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: "POS v2"
  installerIcon: resources/icon.ico
  uninstallerIcon: resources/icon.ico
  installerHeader: resources/installer-banner.bmp
  license: resources/LICENSE.txt      # Optional: show license in installer
  artifactName: "POS-Setup-${version}.exe"
  deleteAppDataOnUninstall: false     # Keep user data on uninstall

# Auto-update publish config (GitHub Releases — free)
publish:
  provider: github
  owner: your-github-username
  repo: pos-v2-releases
  private: false                       # Can be private repo too
  releaseType: release
```

---

## 3. Code Signing (Recommended, Not Mandatory)

Without a code signing certificate, Windows SmartScreen shows a blue warning on first install ("Windows protected your PC"). Users click "More info → Run anyway." This is acceptable for internal tools.

**For a professional installation experience**, get a code signing certificate:

| Option | Cost | Notes |
|--------|------|-------|
| Sectigo OV | ~$100/year | Industry standard; eliminates SmartScreen warning after reputation builds |
| DigiCert | ~$300/year | Same |
| Sigstore (experimental) | Free | Open-source; not yet widely trusted by Windows |
| Self-signed (dev only) | Free | Only for internal testing; always triggers warning |

### How to Sign (if you have a .pfx certificate)

```yaml
# electron-builder.yml — add to win section
win:
  signingHashAlgorithms: [sha256]
  certificateFile: certificate.pfx
  certificatePassword: ${env.CERTIFICATE_PASSWORD}
  signAndEditExecutable: true
  rfc3161TimeStampServer: http://timestamp.sectigo.com
```

For most Nigerian retail deployments (internal business tool, controlled distribution), unsigned builds with the "More info → Run anyway" step are acceptable.

---

## 4. Auto-Update Server

### Option A — GitHub Releases (Free, Recommended)

`electron-updater` supports GitHub Releases out of the box. When you push a new GitHub release with the `.exe` and `latest.yml` files, all installed apps automatically detect and download the update.

```bash
# Build with GitHub publishing
npm run build:win -- --publish=always

# This:
# 1. Builds the installer
# 2. Creates release/latest.yml (update manifest)
# 3. Uploads both to GitHub Releases
```

All clients check `https://github.com/your-username/pos-v2-releases/releases/latest` for updates.

### Option B — Self-Hosted Update Server (Free)

Use `electron-release-server` (open-source, MIT) on your own VPS:

```bash
# On your VPS:
git clone https://github.com/ArekSredzki/electron-release-server
cd electron-release-server
npm install
# Configure and start
```

Point `electron-builder.yml` to your server:
```yaml
publish:
  provider: generic
  url: https://updates.yourstore.com
```

---

## 5. Distribution to Stores

### Method A — Direct Download Link

Upload the installer to any file host (GitHub Releases, Google Drive, own server) and share the link. Store IT staff download and install.

### Method B — USB Drive

Copy the `.exe` installer to USB drives and physically distribute to stores. For stores in areas with slow internet, this is faster and more reliable.

### Method C — Portable .exe

The portable `.exe` requires no installation. Copy it to the POS PC, create a Desktop shortcut, and it runs. User data is stored in the same folder as the `.exe`. Good for stores that can't install software (IT policy restrictions).

---

## 6. Post-Installation Configuration (First Launch)

On first launch, the app shows a **Setup Wizard**:

```
Step 1: Enter Backend URL
  [https://api.yourstore.com          ]
  [Test Connection] → ✓ Connected / ✗ Cannot reach server

Step 2: Configure Printer
  Printer type: ( ) USB/Serial  ( ) Network TCP  ( ) Browser (dialog)

  USB/Serial:
    Port:      [COM3 ▾]  (detected COM ports listed)
    Baud rate: [9600 ▾]
    Paper:     [80mm ▾]
    [Send Test Print]

  Network:
    IP:   [192.168.1.200]
    Port: [9100          ]
    [Send Test Print]

Step 3: Cash Drawer
  [✓] Cash drawer connected to printer

Step 4: Ready
  [Launch POS]
```

Config is saved in `electron-store` on the local PC. Subsequent launches skip the wizard.

---

## 7. Windows Startup Entry

To make the POS app start automatically when Windows starts:

```typescript
// Configured via admin Settings → Desktop tab → "Auto-start on Windows boot"
// OR set manually in registry:
app.setLoginItemSettings({
  openAtLogin: true,
  name: 'POS v2',
  path: app.getPath('exe'),
})
```

For managed deployments, add the app to Windows Startup via Group Policy or a startup script — this is more reliable than the per-user login item.

---

---

## 7. Building for macOS

### 7a. Prerequisites on the Build Machine

```bash
# Must be built on macOS (Electron cannot cross-compile macOS targets on Windows/Linux)
# Install Xcode Command Line Tools
xcode-select --install

# Rebuild serialport for the Electron version
npm run rebuild-native
```

### 7b. Build macOS DMG

```bash
npm run build:mac
# Output:
#   release/POS-1.0.0.dmg          ← universal or separate x64/arm64
#   release/POS-1.0.0-mac.zip      ← zip archive
#   release/latest-mac.yml         ← auto-update manifest
```

### 7c. macOS Code Signing (Optional — for Distribution)

Without signing, Gatekeeper shows: *"POS v2 can't be opened because Apple cannot check it for malicious software."*

**For internal store use (no signing):**
- Build unsigned DMG
- Share with store IT
- Users: right-click the app → Open → Open (one-time bypass)

**For signed distribution (requires Apple Developer Program — $99/year):**
1. Enroll in Apple Developer Program at [developer.apple.com](https://developer.apple.com)
2. Create a "Developer ID Application" certificate in Keychain Access
3. Add to `electron-builder.yml`:
   ```yaml
   mac:
     identity: "Developer ID Application: Your Name (TEAM_ID)"
   ```
4. Build and sign:
   ```bash
   npm run build:mac
   ```

### 7d. macOS Notarization (Required for Public Distribution)

Notarization is Apple's malware scan. Without it, even signed apps show a Gatekeeper warning on macOS 10.15+.

Add to `electron-builder.yml`:
```yaml
mac:
  identity: "Developer ID Application: Your Name (TEAM_ID)"
  notarize:
    teamId: "YOUR_TEAM_ID"
```

Set environment variables for the build:
```bash
export APPLE_ID="yourmail@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # App-specific password
export APPLE_TEAM_ID="YOUR_TEAM_ID"
npm run build:mac
```

> **Apple-specific password:** Generate at [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords. This is free; only the $99/year Developer Program membership costs money.

### 7e. Universal Binary (Single DMG for Intel + Apple Silicon)

```bash
# Build a single universal binary covering both x64 and arm64
npm run build:main
electron-builder --mac dmg --universal
# Output: POS-1.0.0-universal.dmg (works on all Mac hardware since 2006)
```

Universal binaries are ~2× larger but eliminate the need for separate Intel/Apple Silicon downloads.

### 7f. macOS Distribution Methods

| Method | Audience | Signing needed |
|--------|---------|---------------|
| Direct DMG download | Store IT (internal) | No |
| GitHub Releases | Wider distribution | Yes (code sign + notarize) |
| USB drive (DMG file) | Offline / rural stores | No (right-click → Open) |
| Mac App Store | General public | Yes + App Store review |

> The Mac App Store requires a separate Provisioning Profile and has stricter sandbox rules that may conflict with `serialport` USB access. Not recommended for this use case.

### 7g. macOS System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| macOS | 10.15 Catalina | 12+ Monterey |
| Architecture | x64 (Intel) or arm64 (Apple Silicon) | Apple Silicon (M1+) |
| RAM | 4 GB | 8 GB |
| Storage | 400 MB free | 1 GB |
| USB | For thermal printer | — |

---

## 8. Build Checklist

Before every release:

**Both platforms:**
- [ ] `POS-frontend-v2` is built with production backend URL (`npm run build`)
- [ ] `POS-backend-v2` is deployed and accessible at the configured `ELECTRON_BACKEND_URL`
- [ ] Version bumped in `POS-desktop-app/package.json`
- [ ] `CHANGELOG.md` updated with what changed

**Windows:**
- [ ] `npm run build:win` succeeds (run on Windows or a Windows CI runner)
- [ ] Installer tested on a clean Windows 10 VM
- [ ] Printer test print works after installation
- [ ] Auto-update: install previous version → confirm update downloads and installs

**macOS:**
- [ ] `npm run build:mac` succeeds (must run on macOS)
- [ ] `icon.icns` present in `resources/`
- [ ] `entitlements.mac.plist` present in `resources/`
- [ ] DMG tested on macOS: mount, drag-to-Applications, launch
- [ ] If signed + notarized: verify no Gatekeeper warning on a clean macOS VM
- [ ] Serial port detected in Desktop Settings (if printer available)
- [ ] Traffic lights (⊗ ⊖ ⊞) visible and functional in macOS window

**Release:**
- [ ] Push Windows + macOS artifacts + both `.yml` manifests to GitHub Releases
- [ ] Auto-update tested from previous version on both platforms

---

## 9. Windows System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Windows 10 (64-bit) | Windows 11 |
| RAM | 2 GB | 4 GB |
| Storage | 300 MB free | 1 GB free |
| CPU | Any dual-core | Intel Core i3+ |
| WebView2 | Auto-installed by Electron | — |
| .NET | Not required | — |
| Internet | For cloud backend | For cloud backend |
| Network | For LAN backend | Ethernet for reliability |

> Electron embeds Chromium, so no separate browser installation is needed. WebView2 is used as an alternative on some platforms — for our config with `contextIsolation: true`, Chromium is bundled.
