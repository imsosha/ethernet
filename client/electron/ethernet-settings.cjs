// Единый менеджер настроек hermes-settings.json.
// main.cjs и hermes-fs.cjs оба импортируют этот модуль — состояние всегда одно.
// Файл перечитывается при каждом обращении (источник истины — диск).

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const isPackaged = app ? app.isPackaged : false;
const ROOT = process.env.PORTABLE_EXECUTABLE_DIR || (process.env.APPIMAGE ? path.dirname(process.env.APPIMAGE) : (isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..', '..')));
const SETTINGS_PATH = path.join(ROOT, 'ethernet-settings.json');

function read() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    return { enabledPlugins: [], theme: null };
  }
}

function write(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('[ethernet-settings] write error:', err);
  }
}

module.exports = {
  SETTINGS_PATH,
  get: () => read(),
  set: write,
  getTheme: () => read().theme || null,
  setTheme: (theme) => {
    const s = read();
    const oldTheme = s.theme || 'default';
    s.themeMods = s.themeMods || {};
    if (s.mod) {
      s.themeMods[oldTheme] = { ...(s.themeMods[oldTheme] || {}), ...s.mod };
    }
    s.theme = theme;
    const newTheme = theme || 'default';
    if (s.themeMods[newTheme]) {
      s.mod = { ...s.themeMods[newTheme] };
    }
    write(s);
  },
  // Параметры мода (скругления, блюр, анимации) — применяются лоадером
  getMod: (themeName) => {
    const s = read();
    const t = themeName || s.theme || 'default';
    if (s.themeMods && s.themeMods[t]) {
      return s.themeMods[t];
    }
    return s.mod || null;
  },
  setMod: (mod, themeName) => {
    const s = read();
    const t = themeName || s.theme || 'default';
    s.themeMods = s.themeMods || {};
    s.themeMods[t] = { ...(s.themeMods[t] || s.mod || {}), ...mod };
    s.mod = { ...(s.mod || {}), ...mod };
    write(s);
    return s.themeMods[t];
  },
  // Привязка обоев к конкретной теме
  getThemeWallpaper: (themeName) => {
    const s = read();
    const tw = s.themeWallpapers || {};
    const t = themeName || s.theme || 'default';
    if (tw[t] && (tw[t].file || tw[t].slug)) return tw[t];
    if (s.wallpaper || s.mod?.wallpaperFile) {
      const slug = s.wallpaper || s.mod?.wallpaperFile;
      const file = s.mod?.wallpaperFile || (slug.includes('.') ? slug : `${slug}.png`);
      const kind = s.mod?.wallpaperKind || (/\.(mp4|webm)$/i.test(file) ? 'video' : 'image');
      return { slug, file, kind, originalPath: s.mod?.wallpaperOriginalPath || file };
    }
    return null;
  },
  setThemeWallpaper: (themeName, wallpaperInfo) => {
    const s = read();
    s.themeWallpapers = s.themeWallpapers || {};
    const t = themeName || s.theme || 'default';
    if (wallpaperInfo) {
      s.themeWallpapers[t] = wallpaperInfo;
      s.wallpaper = wallpaperInfo.slug || wallpaperInfo.file;
      s.mod = s.mod || {};
      s.mod.wallpaperFile = wallpaperInfo.file;
      s.mod.wallpaperKind = wallpaperInfo.kind;
      s.mod.wallpaperOriginalPath = wallpaperInfo.originalPath;
    } else {
      delete s.themeWallpapers[t];
      s.wallpaper = null;
      if (s.mod) {
        delete s.mod.wallpaperFile;
        delete s.mod.wallpaperKind;
        delete s.mod.wallpaperOriginalPath;
      }
    }
    write(s);
    return s.themeWallpapers[t] || null;
  },
  // Активные hermes-обои (slug файла в wallpapers/)
  getWallpaper: () => {
    const s = read();
    const t = s.theme || 'default';
    if (s.themeWallpapers && s.themeWallpapers[t]) {
      return s.themeWallpapers[t].slug || s.themeWallpapers[t].file;
    }
    return s.wallpaper || null;
  },
  setWallpaper: (slug) => {
    const s = read();
    s.wallpaper = slug;
    const t = s.theme || 'default';
    if (slug) {
      s.themeWallpapers = s.themeWallpapers || {};
      s.themeWallpapers[t] = {
        slug,
        file: slug.includes('.') ? slug : `${slug}.png`,
        kind: /\.(mp4|webm)$/i.test(slug) ? 'video' : 'image',
      };
    }
    write(s);
  },
  isPluginEnabled: (id) => (read().enabledPlugins || []).includes(id),
  togglePlugin: (id) => {
    const s = read();
    const arr = s.enabledPlugins || [];
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(id);
    s.enabledPlugins = arr;
    write(s);
    return arr.includes(id);
  },
  removePlugin: (id) => {
    const s = read();
    s.enabledPlugins = (s.enabledPlugins || []).filter((x) => x !== id);
    write(s);
  },
  // Настройки встроенного прокси (SOCKS5, HTTP)
  getProxySettings: () => {
    const s = read();
    return s.proxySettings || {
      enabled: false,
      activeProxyId: null,
      proxies: [],
    };
  },
  setProxySettings: (proxySettings) => {
    const s = read();
    s.proxySettings = proxySettings;
    write(s);
    return s.proxySettings;
  },
  saveProxy: (proxyConfig) => {
    const s = read();
    s.proxySettings = s.proxySettings || { enabled: false, activeProxyId: null, proxies: [] };
    const list = s.proxySettings.proxies || [];
    const index = list.findIndex((p) => p.id === proxyConfig.id);
    if (index >= 0) {
      list[index] = proxyConfig;
    } else {
      list.push(proxyConfig);
    }
    s.proxySettings.proxies = list;
    if (!s.proxySettings.activeProxyId) {
      s.proxySettings.activeProxyId = proxyConfig.id;
    }
    write(s);
    return s.proxySettings;
  },
  deleteProxy: (id) => {
    const s = read();
    if (!s.proxySettings) return { enabled: false, activeProxyId: null, proxies: [] };
    s.proxySettings.proxies = (s.proxySettings.proxies || []).filter((p) => p.id !== id);
    if (s.proxySettings.activeProxyId === id || s.proxySettings.proxies.length === 0) {
      s.proxySettings.activeProxyId = null;
      s.proxySettings.enabled = false;
    }
    write(s);
    return s.proxySettings;
  },
  setActiveProxy: (id) => {
    const s = read();
    s.proxySettings = s.proxySettings || { enabled: false, activeProxyId: null, proxies: [] };
    s.proxySettings.activeProxyId = id;
    s.proxySettings.enabled = true; // автоматически включаем при выборе прокси
    write(s);
    return s.proxySettings;
  },
  toggleProxy: (enabled) => {
    const s = read();
    s.proxySettings = s.proxySettings || { enabled: false, activeProxyId: null, proxies: [] };
    s.proxySettings.enabled = typeof enabled === 'boolean' ? enabled : !s.proxySettings.enabled;
    write(s);
    return s.proxySettings;
  },
  // Глобальное отключение уведомлений
  getNotificationsDisabled: () => Boolean(read().disableAllNotifications),
  setNotificationsDisabled: (disabled) => {
    const s = read();
    s.disableAllNotifications = Boolean(disabled);
    write(s);
    return s.disableAllNotifications;
  },
  // Не сворачивать в трей (закрывать приложение по крестику)
  getCloseToTrayDisabled: () => Boolean(read().disableCloseToTray),
  setCloseToTrayDisabled: (disabled) => {
    const s = read();
    s.disableCloseToTray = Boolean(disabled);
    write(s);
    return s.disableCloseToTray;
  },
  // Безопасный режим (Safe Mode) для плагинов
  getSafeMode: () => Boolean(read().safeMode),
  setSafeMode: (enabled) => {
    const s = read();
    s.safeMode = Boolean(enabled);
    write(s);
    return s.safeMode;
  },
  getLastCrashedPlugin: () => read().lastCrashedPlugin || null,
  clearLastCrashedPlugin: () => {
    const s = read();
    delete s.lastCrashedPlugin;
    write(s);
  },
  reportPluginCrash: (pluginId, error) => {
    const s = read();
    // Отключаем упавший плагин
    s.enabledPlugins = (s.enabledPlugins || []).filter((id) => id !== pluginId);
    // Включаем Safe Mode для защиты от повторных крашей
    s.safeMode = true;
    s.lastCrashedPlugin = {
      id: pluginId,
      error: String(error || 'Unknown error'),
      time: Date.now(),
    };
    write(s);
    return s.lastCrashedPlugin;
  },
};
