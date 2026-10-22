// Единый менеджер настроек hermes-settings.json.
// main.cjs и hermes-fs.cjs оба импортируют этот модуль — состояние всегда одно.
// Файл перечитывается при каждом обращении (источник истины — диск).

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const isPackaged = app ? app.isPackaged : false;
const ROOT = process.env.PORTABLE_EXECUTABLE_DIR || (process.env.APPIMAGE ? path.dirname(process.env.APPIMAGE) : (isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..', '..')));

const ENC_PREFIX = 'enc:';

function encryptSecret(str) {
  if (!str || typeof str !== 'string') return str;
  if (str.startsWith(ENC_PREFIX)) return str;
  try {
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
      const buf = safeStorage.encryptString(str);
      return ENC_PREFIX + buf.toString('base64');
    }
  } catch (err) {
    console.warn('[ethernet-settings] safeStorage encryption failed, saving in memory:', err.message);
  }
  return str;
}

function decryptSecret(str) {
  if (!str || typeof str !== 'string') return str;
  if (!str.startsWith(ENC_PREFIX)) return str;
  try {
    if (safeStorage && typeof safeStorage.decryptString === 'function') {
      const buf = Buffer.from(str.slice(ENC_PREFIX.length), 'base64');
      return safeStorage.decryptString(buf);
    }
  } catch (err) {
    console.warn('[ethernet-settings] safeStorage decryption failed:', err.message);
  }
  return '';
}

function prepareSettingsForDisk(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const clone = JSON.parse(JSON.stringify(settings));
  if (clone.proxySettings && Array.isArray(clone.proxySettings.proxies)) {
    for (const p of clone.proxySettings.proxies) {
      if (p.auth && p.auth.password) {
        p.auth.password = encryptSecret(p.auth.password);
      }
    }
  }
  return clone;
}

function restoreSettingsFromDisk(settings) {
  if (settings && settings.proxySettings && Array.isArray(settings.proxySettings.proxies)) {
    for (const p of settings.proxySettings.proxies) {
      if (p.auth && p.auth.password) {
        p.auth.password = decryptSecret(p.auth.password);
      }
    }
  }
  return settings;
}

function getWritableSettingsPath() {
  const rootSettingsPath = path.join(ROOT, 'ethernet-settings.json');
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return rootSettingsPath;
  }
  try {
    if (fs.existsSync(rootSettingsPath)) {
      fs.accessSync(rootSettingsPath, fs.constants.R_OK | fs.constants.W_OK);
      return rootSettingsPath;
    }
  } catch {}

  try {
    const testFile = path.join(ROOT, `.test-write-${Date.now()}.tmp`);
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return rootSettingsPath;
  } catch {}

  if (app && typeof app.getPath === 'function') {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      try { fs.mkdirSync(userDataPath, { recursive: true }); } catch {}
    }
    return path.join(userDataPath, 'ethernet-settings.json');
  }

  return rootSettingsPath;
}

const SETTINGS_PATH = getWritableSettingsPath();

function read() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return restoreSettingsFromDisk(JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')));
    }
  } catch {}

  try {
    const rootPath = path.join(ROOT, 'ethernet-settings.json');
    if (fs.existsSync(rootPath)) {
      return restoreSettingsFromDisk(JSON.parse(fs.readFileSync(rootPath, 'utf8')));
    }
  } catch {}

  try {
    if (app && typeof app.getPath === 'function') {
      const userPath = path.join(app.getPath('userData'), 'ethernet-settings.json');
      if (fs.existsSync(userPath)) {
        return restoreSettingsFromDisk(JSON.parse(fs.readFileSync(userPath, 'utf8')));
      }
    }
  } catch {}

  return { enabledPlugins: [], theme: null };
}

function write(settings) {
  const diskPayload = prepareSettingsForDisk(settings);
  const content = JSON.stringify(diskPayload, null, 2);
  try {
    fs.writeFileSync(SETTINGS_PATH, content, 'utf8');
  } catch (err) {
    console.error('[ethernet-settings] write error:', err);
    if (app && typeof app.getPath === 'function') {
      try {
        const userPath = path.join(app.getPath('userData'), 'ethernet-settings.json');
        fs.writeFileSync(userPath, content, 'utf8');
      } catch (err2) {
        console.error('[ethernet-settings] fallback write error:', err2);
      }
    }
  }
}

function resolveThemeWallpaperFromCss(themeName) {
  if (!themeName || typeof themeName !== 'string') return null;
  const safeName = path.basename(themeName.trim()).replace(/\.(css|eth|json|eth-theme)$/i, '');
  if (!safeName || safeName.includes('..')) return null;
  try {
    const THEMES_DIR = path.join(ROOT, 'themes');
    const cssPath = path.normalize(path.join(THEMES_DIR, `${safeName}.css`));
    const resolvedThemes = path.resolve(THEMES_DIR);
    if (!cssPath.toLowerCase().startsWith((resolvedThemes + path.sep).toLowerCase())) return null;
    if (fs.existsSync(cssPath)) {
      const css = fs.readFileSync(cssPath, 'utf8');
      const match = css.match(/\/\*\s*@wallpaper\s*(\{[\s\S]*?\})\s*\*\//i);
      if (match) {
        const parsed = JSON.parse(match[1]);
        if (parsed && parsed.file) {
          return parsed;
        }
      }
      const bgMatch = css.match(/--custom-background\s*:\s*url\s*\(\s*['"]?(data:[^'"]+)['"]?\s*\)/i);
      if (bgMatch) {
        return {
          file: bgMatch[1],
          kind: 'image',
          slug: 'embedded',
        };
      }
    }
  } catch {}
  return null;
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
    } else {
      s.mod = {};
    }
    const tw = (s.themeWallpapers && s.themeWallpapers[newTheme]) || resolveThemeWallpaperFromCss(newTheme) || null;
    if (tw) {
      s.wallpaper = tw.slug || tw.file;
      s.mod.wallpaperFile = tw.file;
      s.mod.wallpaperKind = tw.kind;
      s.mod.wallpaperOriginalPath = tw.originalPath;
      if (s.themeMods[newTheme]) {
        s.themeMods[newTheme].wallpaperFile = tw.file;
        s.themeMods[newTheme].wallpaperKind = tw.kind;
        s.themeMods[newTheme].wallpaperOriginalPath = tw.originalPath;
      }
    } else {
      s.wallpaper = null;
      if (s.mod) {
        delete s.mod.wallpaperFile;
        delete s.mod.wallpaperKind;
        delete s.mod.wallpaperOriginalPath;
      }
      if (s.themeMods[newTheme]) {
        delete s.themeMods[newTheme].wallpaperFile;
        delete s.themeMods[newTheme].wallpaperKind;
        delete s.themeMods[newTheme].wallpaperOriginalPath;
      }
    }
    write(s);
  },
  // Параметры мода (скругления, блюр, анимации) — применяются лоадером
  getMod: (themeName) => {
    const s = read();
    const t = themeName || s.theme || 'default';
    if (s.themeMods && s.themeMods[t] && Object.keys(s.themeMods[t]).length > 0) {
      return s.themeMods[t];
    }
    if (s.mod && Object.keys(s.mod).length > 0) {
      return s.mod;
    }
    return {
      colors: {
        '--color-background': '#16171a',
        '--color-background-secondary': '#212328',
        '--color-background-secondary-accent': '#292c33',
        '--color-background-sidebar': '#1a1b1f',
        '--color-background-selected': '#2a2e37',
        '--color-borders': '#2a2d34',
        '--color-dividers': '#24272e',
        '--color-text': '#f3f4f6',
        '--color-links': '#58a6ff',
        '--color-text-secondary': '#9da7b7',
        '--color-primary': '#3b82f6',
        '--color-icon-buttons': '#9da7b7',
        '--color-text-meta-colored': '#58a6ff',
        '--color-background-own': '#1e3a5f',
        '--color-chat-active': '#2b3d58',
      },
      radii: { ui: 16, topbar: 24, foldersSidebar: 24, messages: 16, buttons: 12, input: 24, avatars: 50 },
    };
  },
  setMod: (mod, themeName) => {
    const s = read();
    const t = themeName || s.theme || 'default';
    s.themeMods = s.themeMods || {};
    s.themeMods[t] = { ...(s.themeMods[t] || {}), ...mod };
    if (!themeName || themeName === (s.theme || 'default')) {
      s.mod = { ...s.themeMods[t] };
    }
    write(s);
    return s.themeMods[t];
  },
  // Привязка обоев к конкретной теме
  getThemeWallpaper: (themeName) => {
    const s = read();
    const tw = s.themeWallpapers || {};
    const t = themeName || s.theme || 'default';
    if (tw[t] && (tw[t].file || tw[t].slug)) {
      return tw[t];
    }
    const fromCss = resolveThemeWallpaperFromCss(t);
    if (fromCss) return fromCss;
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
      if (t === (s.theme || 'default')) {
        s.wallpaper = null;
        if (s.mod) {
          delete s.mod.wallpaperFile;
          delete s.mod.wallpaperKind;
          delete s.mod.wallpaperOriginalPath;
        }
      }
    }
    write(s);
    return s.themeWallpapers[t] || null;
  },
  removeThemeWallpaper: (themeName) => {
    return module.exports.setThemeWallpaper(themeName, null);
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
    s.deletedPlugins = (s.deletedPlugins || []).filter((x) => x !== id);
    write(s);
    return arr.includes(id);
  },
  setPluginEnabled: (id, enabled) => {
    const s = read();
    const arr = s.enabledPlugins || [];
    const idx = arr.indexOf(id);
    if (enabled && idx === -1) {
      arr.push(id);
    } else if (!enabled && idx !== -1) {
      arr.splice(idx, 1);
    }
    s.enabledPlugins = arr;
    s.deletedPlugins = (s.deletedPlugins || []).filter((x) => x !== id);
    write(s);
    return arr.includes(id);
  },
  removePlugin: (id) => {
    const s = read();
    s.enabledPlugins = (s.enabledPlugins || []).filter((x) => x !== id);
    if (s.pluginPermissions) {
      delete s.pluginPermissions[id];
    }
    s.deletedPlugins = s.deletedPlugins || [];
    if (!s.deletedPlugins.includes(id)) {
      s.deletedPlugins.push(id);
    }
    write(s);
  },
  read: () => read(),
  getPluginPermissions: (id) => {
    const s = read();
    return (s.pluginPermissions && s.pluginPermissions[id]) || {};
  },
  setPluginPermission: (id, permission, granted) => {
    const s = read();
    s.pluginPermissions = s.pluginPermissions || {};
    s.pluginPermissions[id] = s.pluginPermissions[id] || {};
    s.pluginPermissions[id][permission] = Boolean(granted);
    write(s);
    return s.pluginPermissions[id];
  },
  setPluginPermissionsMap: (id, map) => {
    const s = read();
    s.pluginPermissions = s.pluginPermissions || {};
    s.pluginPermissions[id] = { ...(s.pluginPermissions[id] || {}), ...map };
    write(s);
    return s.pluginPermissions[id];
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
  // Нативные уведомления ОС (вместо встроенных всплывающих окон)
  getUseNativeNotifications: () => Boolean(read().useNativeNotifications),
  setUseNativeNotifications: (enabled) => {
    const s = read();
    s.useNativeNotifications = Boolean(enabled);
    write(s);
    return s.useNativeNotifications;
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
    if (!enabled && s.lastCrashedPlugin) {
      delete s.lastCrashedPlugin;
    }
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
