# Ethernet Telegram Client

<p align="center">
  <img src="docs/eth.svg" width="128" height="128" alt="Ethernet Logo" />
</p>

<p align="center">
  <b>Modern, aesthetic, and customizable Telegram desktop client powered by Web Z & Electron.</b>
</p>

---

## ✨ Features

- **🎨 Advanced Theme & Visual Engine**:
  - Live Theme Editor with customizable palettes, HSL tailoring, and real-time preview.
  - Granular border-radius controls for UI, message bubbles, action buttons, and avatars.
  - Realistic frosted glass effects (ambient blur, edge glare, and refraction lighting).
  - Video & image live wallpapers (supports `.mp4`, `.webm`, `.gif`, `.png`, `.jpg`, `.webp`) with seamless crossfade looping.
  - Chat width modes (`Normal`, `Wide`, `Full width`).
  - Customizable message alignments (Left / Right / Center) with dynamic speech bubble corners.
  - Physics-based smooth animation presets (*Telegram*, *Snappy*, *Smooth*, *Bouncy*, *iOS*).

- **🔌 Plugin System**:
  - Extensible JS plugin API for enhancing chat features and automating workflows.
  - Built-in Safe Mode and automatic crash isolation.

- **🛡️ Built-in Proxy Engine**:
  - SOCKS5 & HTTP/HTTPS proxy support with one-click TG proxy link import (`tg://socks?` / `tg://proxy?`).
  - Ping latency testing and automatic fallback.

- **⚡ Native Desktop Integration**:
  - Frameless window with custom interactive topbar and window controls.
  - System tray support with customizable notifications and close-to-tray behavior.
  - Universal cross-platform packaging for Windows and Linux.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `>= 24.11` or `>= 26.x`
- **npm**: `>= 11.x`

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/ethernet.git
cd ethernet/client
```

2. Install dependencies:
```bash
npm install
```

3. Run in development mode (Vite):
```bash
npm run dev
```

4. Run desktop application in Electron:
```bash
npm run app
```

---

## 📦 Building Releases

### Windows Portable (.exe)
```bash
cd client
npm run app:build
npm run dist:win64
```
The output executable will be created in `release/Ethernet-Windows-x64.exe`.

### Linux (AppImage / tar.gz / deb)
```bash
cd client
npm run app:build
npm run dist:linux
```

---

## 🎨 Themes & Plugins Development

- **Themes**: Save custom CSS themes into the `themes/` folder.
- **Plugins**: Create a folder in `plugins/<plugin-id>/` containing `manifest.json` and `index.js`.
- For detailed specifications and API hooks, see [ARCHITECTURE.md](docs/ARCHITECTURE.md) and [THEMES_AND_PLUGINS.md](docs/THEMES_AND_PLUGINS.md).

---

## 📄 License & Credits

- **Ethernet** is licensed under the [GNU General Public License v3.0 (GPL-3.0)](LICENSE).
- Based on [Telegram Web A / Web Z](https://github.com/Ajaxy/telegram-tt) by Denis Olshin and the Telegram community, licensed under GNU GPL v3.
- This application is an independent client and is not affiliated with, endorsed by, or sponsored by Telegram LLC. Telegram is a registered trademark of Telegram FZ-LLC.
