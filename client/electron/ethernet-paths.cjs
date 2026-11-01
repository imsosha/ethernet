// Пути к пользовательским ассетам и первичный сидинг из assets-bundle.

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const isPackaged = Boolean(app && app.isPackaged);
const ROOT = process.env.PORTABLE_EXECUTABLE_DIR
  || (process.env.APPIMAGE ? path.dirname(process.env.APPIMAGE) : undefined)
  || (isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..', '..'));
const DIST = path.join(__dirname, '..', 'dist');
const THEMES_DIR = path.join(ROOT, 'themes');
const PLUGINS_DIR = path.join(ROOT, 'plugins');
const WALLPAPERS_DIR = path.join(ROOT, 'wallpapers');

function ensureAssetDirs() {
  if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR, { recursive: true });
  if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  if (!fs.existsSync(WALLPAPERS_DIR)) fs.mkdirSync(WALLPAPERS_DIR, { recursive: true });
}

// Распаковываем дефолтные темы/плагины/обои из assets-bundle при первом запуске.
function seedDefaultAssets(hermesSettings) {
  try {
    const candidates = [
      path.join(__dirname, '..', 'assets-bundle'),
      process.resourcesPath ? path.join(process.resourcesPath, 'assets-bundle') : null,
      path.join(__dirname, '..', '..', 'assets-bundle'),
    ].filter(Boolean);

    const bundleDir = candidates.find((dir) => fs.existsSync(dir));
    if (!bundleDir) return;

    ensureAssetDirs();

    // 1. Settings
    const rootSettings = path.join(ROOT, 'ethernet-settings.json');
    const bundleSettings = path.join(bundleDir, 'ethernet-settings.json');
    if (!fs.existsSync(rootSettings) && fs.existsSync(bundleSettings)) {
      try { fs.copyFileSync(bundleSettings, rootSettings); } catch {}
    }

    // 2. Themes
    const bundleThemes = path.join(bundleDir, 'themes');
    if (fs.existsSync(bundleThemes)) {
      const themes = fs.readdirSync(bundleThemes);
      for (const t of themes) {
        const dest = path.join(THEMES_DIR, t);
        if (!fs.existsSync(dest)) {
          try { fs.copyFileSync(path.join(bundleThemes, t), dest); } catch {}
        }
      }
    }

    // 3. Wallpapers
    const bundleWallpapers = path.join(bundleDir, 'wallpapers');
    if (fs.existsSync(bundleWallpapers)) {
      const wps = fs.readdirSync(bundleWallpapers);
      for (const w of wps) {
        const dest = path.join(WALLPAPERS_DIR, w);
        if (!fs.existsSync(dest)) {
          try { fs.copyFileSync(path.join(bundleWallpapers, w), dest); } catch {}
        }
      }
    }

    // 4. Plugins (учитываем удалённые пользователем)
    const bundlePlugins = path.join(bundleDir, 'plugins');
    if (fs.existsSync(bundlePlugins)) {
      const s = hermesSettings && hermesSettings.read ? hermesSettings.read() : {};
      const deleted = new Set(s.deletedPlugins || []);
      const plugins = fs.readdirSync(bundlePlugins);
      for (const p of plugins) {
        if (deleted.has(p)) continue;
        const srcP = path.join(bundlePlugins, p);
        const destP = path.join(PLUGINS_DIR, p);
        if (fs.statSync(srcP).isDirectory() && !fs.existsSync(destP)) {
          try { fs.cpSync(srcP, destP, { recursive: true }); } catch {}
        }
      }
    }
  } catch (err) {
    console.error('[Asset Seeding Error]', err);
  }
}

module.exports = {
  ROOT,
  DIST,
  THEMES_DIR,
  PLUGINS_DIR,
  WALLPAPERS_DIR,
  ensureAssetDirs,
  seedDefaultAssets,
};
