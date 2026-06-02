# resources/ — Required Assets

This directory contains static assets used by `electron-builder` when packaging the Windows installer. The files must be placed here before running `npm run build:win`.

---

## Required Files

### App Icons

| File | Platform | Size | Format | Purpose |
|------|----------|------|--------|---------|
| `icon.ico` | Windows | Multi-size ICO | ICO (256, 128, 64, 48, 32, 16 px) | Windows app icon, Start menu, taskbar, title bar |
| `icon.icns` | macOS | Multi-size ICNS | ICNS (1024, 512, 256, 128, 32, 16 px) | macOS dock, Launchpad, Finder, DMG |
| `icon.png` | Both (tray) | 512×512 px | PNG, transparent background | System tray icon (resized to 16×16 by Electron); macOS uses as template image |

**How to create all icon formats from a single 1024×1024 PNG:**

Option A — `electron-icon-builder` (MIT, generates ico + icns + png):
```bash
npx electron-icon-builder --input=source-icon-1024px.png --output=./resources
# Generates: icon.ico, icon.icns, icons/ (various PNG sizes)
```

Option B — `png2icons` npm package (MIT):
```bash
npx png2icons source-icon-1024px.png resources/icon --icns --ico
# Creates: resources/icon.icns + resources/icon.ico
```

Option C — Manual with ImageMagick (free):
```bash
# Windows .ico
magick convert source-icon-1024px.png \
  -define icon:auto-resize=256,128,64,48,32,16 icon.ico

# macOS .icns (requires macOS + iconutil)
mkdir icon.iconset
sips -z 16 16   source-icon-1024px.png --out icon.iconset/icon_16x16.png
sips -z 32 32   source-icon-1024px.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32   source-icon-1024px.png --out icon.iconset/icon_32x32.png
sips -z 64 64   source-icon-1024px.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 source-icon-1024px.png --out icon.iconset/icon_128x128.png
sips -z 256 256 source-icon-1024px.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 source-icon-1024px.png --out icon.iconset/icon_256x256.png
sips -z 512 512 source-icon-1024px.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 source-icon-1024px.png --out icon.iconset/icon_512x512.png
cp source-icon-1024px.png icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset
```

> **Tip:** `electron-icon-builder` is the easiest option — run once, get all three formats.

**Icon design guidelines:**
- Square format — works at all sizes
- Simple design — readable at 16×16
- Matches the POS v2 brand colours (deep indigo/emerald)
- Transparent background preferred

---

### Optional — NSIS Installer Graphics

These are only needed for a professional installer appearance (Phase D4, task DE-4.02):

| File | Size | Format | Purpose |
|------|------|--------|---------|
| `installer-banner.bmp` | 164×314 px | BMP (24-bit) | Left sidebar image in NSIS installer |
| `installer-header.bmp` | 150×57 px | BMP (24-bit) | Top-right image in NSIS installer |
| `LICENSE.txt` | any | Plain text | Shown in installer if configured |

NSIS installer without these files still works — it uses default NSIS styling.

---

### Optional — Code Signing Certificate

| File | Format | Purpose |
|------|--------|---------|
| `certificate.pfx` | PFX/PKCS#12 | Windows code signing (reduces SmartScreen warning) |

> **Never commit `certificate.pfx` to Git.** It is in `.gitignore`. Store in a password manager. Pass `CERTIFICATE_PASSWORD` as an environment variable during CI builds.

---

## Development Without Icon Files

During development, the app will launch without icons — Electron uses a default icon. The NSIS build will fail if `icon.ico` is missing.

**Temporary workaround for development builds:**
1. Use any free 256×256 ICO file (e.g., from [icons8.com](https://icons8.com/icons/set/store) — free for personal/commercial use)
2. Rename to `icon.ico` and place here
3. Replace with the real branded icon before any public release
