// Ethernet mod settings — файловые операции для тем и плагинов.
// Всё через main-процесс: рендерер не имеет доступа к файловой системе.

const { ipcMain, dialog, BrowserWindow, app } = require('electron');
const fs = require('fs');
const path = require('path');
const ethernetSettings = require('./ethernet-settings.cjs');
const proxyEngine = require('./proxy-engine.cjs');
const proxyParser = require('./proxy-parser.cjs');

const isPackaged = app ? app.isPackaged : false;
const ROOT = process.env.PORTABLE_EXECUTABLE_DIR || (process.env.APPIMAGE ? path.dirname(process.env.APPIMAGE) : (isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..', '..')));
const THEMES_DIR = path.join(ROOT, 'themes');
const PLUGINS_DIR = path.join(ROOT, 'plugins');
const WALLPAPERS_DIR = path.join(ROOT, 'wallpapers');

function ensureDirs() {
  [THEMES_DIR, PLUGINS_DIR, WALLPAPERS_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));
}

function readJsonSafe(pluginId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(PLUGINS_DIR, pluginId, 'manifest.json'), 'utf8'));
  } catch {
    return {};
  }
}

function safeName(name, ext) {
  const base = path.basename(String(name || ''), path.extname(String(name || '')))
    .replace(/[^\w\u0400-\u04FF -]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'untitled';
  return base + ext;
}

function registerHermesFsHandlers() {
  ensureDirs();

  const regHandle = (channel, fn) => {
    ipcMain.handle(channel, fn);
    if (channel.startsWith('hermes:')) {
      ipcMain.handle(channel.replace('hermes:', 'ethernet:'), fn);
    }
  };

  // --- Темы ---
  regHandle('hermes:themes-list', () => {
    ensureDirs();
    const activeTheme = ethernetSettings.getTheme();
    return fs.readdirSync(THEMES_DIR)
      .filter((f) => f.endsWith('.css'))
      .map((f) => ({ name: f, active: activeTheme === f.replace(/\.css$/, '') }));
  });

  regHandle('hermes:theme-read', (_e, name) => {
    const clean = path.basename(String(name || ''));
    if (!clean.endsWith('.css') || clean.includes('..')) throw new Error('bad name');
    return fs.readFileSync(path.join(THEMES_DIR, clean), 'utf8');
  });

  regHandle('hermes:theme-save', (_e, name, css, wallpaperInfo) => {
    const safe = safeName(name, '.css');
    fs.writeFileSync(path.join(THEMES_DIR, safe), String(css), 'utf8');
    const cleanThemeName = safe.replace(/\.css$/, '');
    if (wallpaperInfo) {
      ethernetSettings.setThemeWallpaper(cleanThemeName, wallpaperInfo);
    } else {
      const currentWp = ethernetSettings.getThemeWallpaper();
      if (currentWp) {
        ethernetSettings.setThemeWallpaper(cleanThemeName, currentWp);
      }
    }
    return safe;
  });

  regHandle('hermes:theme-delete', (_e, name) => {
    const clean = path.basename(String(name || ''));
    if (!clean.endsWith('.css') || clean.includes('..')) throw new Error('bad name');
    fs.unlinkSync(path.join(THEMES_DIR, clean));
    ethernetSettings.setThemeWallpaper(clean.replace(/\.css$/, ''), null);
    return true;
  });

  regHandle('hermes:theme-activate', (_e, name) => {
    // name = "amoled" (без .css) или null чтобы сбросить
    if (name !== null) {
      const clean = path.basename(String(name || ''));
      if (clean.includes('..')) throw new Error('bad name');
      ethernetSettings.setTheme(clean);
      const wp = ethernetSettings.getThemeWallpaper(clean);
      return { theme: clean, wallpaper: wp };
    } else {
      ethernetSettings.setTheme(null);
      return { theme: null, wallpaper: null };
    }
  });

  // --- Плагины ---
  regHandle('hermes:plugins-list', () => {
    ensureDirs();
    return fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const manifest = readJsonSafe(d.name);
        return {
          id: d.name,
          name: manifest.name || d.name,
          description: manifest.description || '',
          version: manifest.version || '',
          enabled: ethernetSettings.isPluginEnabled(d.name),
        };
      });
  });

  regHandle('hermes:plugin-read', (_e, id) => {
    if (!/^[\w-]+$/.test(id)) throw new Error('bad id');
    const read = (f) => { try { return fs.readFileSync(path.join(PLUGINS_DIR, id, f), 'utf8'); } catch { return ''; } };
    return { manifest: read('manifest.json') || '{}', code: read('index.js') };
  });

  // Сохранение плагина: { name, description, code } -> plugins/<id>/{manifest.json,index.js}
  regHandle('hermes:plugin-save', (_e, plugin) => {
    const id = safeName(plugin.name || 'plugin', '').toLowerCase();
    if (!id) throw new Error('bad name');
    const dir = path.join(PLUGINS_DIR, id);
    fs.mkdirSync(dir, { recursive: true });
    const manifest = {
      name: plugin.name || id,
      description: plugin.description || '',
      version: plugin.version || '0.1.0',
      author: 'user',
    };
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    fs.writeFileSync(path.join(dir, 'index.js'), String(plugin.code || ''), 'utf8');
    return id;
  });

  regHandle('hermes:plugin-delete', (_e, id) => {
    if (!/^[\w-]+$/.test(id)) throw new Error('bad id');
    fs.rmSync(path.join(PLUGINS_DIR, id), { recursive: true, force: true });
    ethernetSettings.removePlugin(id);
    return true;
  });

  regHandle('hermes:plugin-toggle', (_e, id) => {
    if (!/^[\w-]+$/.test(id)) throw new Error('bad id');
    return ethernetSettings.togglePlugin(id);
  });

  // Диалог выбора файла (для загрузки .css/.js с диска)
  regHandle('hermes:pick-file', async (_e, kind) => {
    let filters = [{ name: 'All Files', extensions: ['*'] }];
    let isBinary = false;

    if (kind === 'css') {
      filters = [{ name: 'CSS Theme', extensions: ['css'] }];
    } else if (kind === 'wallpaper' || kind === 'media' || kind === 'image' || kind === 'video') {
      filters = [{ name: 'Images and Videos', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm'] }];
      isBinary = true;
    } else if (kind === 'json' || kind === 'theme-json') {
      filters = [{ name: 'JSON Theme', extensions: ['json'] }];
    } else if (kind === 'js' || kind === 'plugin') {
      filters = [{ name: 'Plugin (JS)', extensions: ['js'] }];
    }

    const res = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters,
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const file = res.filePaths[0];
    if (isBinary) {
      const buf = fs.readFileSync(file);
      return { name: path.basename(file), content: buf.toString('base64') };
    }
    return { name: path.basename(file), content: fs.readFileSync(file, 'utf8') };
  });

  // Диалог сохранения файла (для экспорта .css тем на диск)
  regHandle('hermes:save-file', async (_e, payload) => {
    const defaultName = payload.defaultName || 'theme.css';
    const ext = payload.ext || 'css';
    const filterName = payload.filterName || 'CSS Theme';
    const res = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: filterName, extensions: [ext] }],
    });
    if (res.canceled || !res.filePath) return false;
    fs.writeFileSync(res.filePath, String(payload.content || ''), 'utf8');
    return true;
  });

  // --- Настройки мода (скругления, блюр, анимации) ---
  regHandle('hermes:mod-get', () => ethernetSettings.getMod());
  regHandle('hermes:mod-set', (_e, mod) => ethernetSettings.setMod(mod));

  // --- Ethernet-обои: медиафайлы в wallpapers/ ---
  regHandle('hermes:wallpaper-set-file', (_e, payload) => {
    // payload = { name, content/base64, originalPath, themeName }
    const rawData = payload.base64 || payload.content;
    const ext = (path.extname(payload.name || '') || '.png').toLowerCase().replace(/[^\w.]/g, '');
    if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm'].includes(ext)) {
      throw new Error('bad media type');
    }
    const slug = `ethernet-${Date.now()}`;
    const filename = slug + ext;

    // Храним ТОЛЬКО последние выбранные обои: удаляем старые файлы из wallpapers/
    try {
      if (fs.existsSync(WALLPAPERS_DIR)) {
        const existing = fs.readdirSync(WALLPAPERS_DIR);
        for (const oldFile of existing) {
          try {
            fs.unlinkSync(path.join(WALLPAPERS_DIR, oldFile));
          } catch {}
        }
      }
    } catch {}

    fs.writeFileSync(path.join(WALLPAPERS_DIR, filename), Buffer.from(rawData, 'base64'));
    const isVideo = ['.mp4', '.webm'].includes(ext);
    const wallpaperInfo = {
      slug,
      file: filename,
      kind: isVideo ? 'video' : 'image',
      originalPath: payload.originalPath || payload.name,
    };
    const currentTheme = payload.themeName || ethernetSettings.getTheme() || 'default';
    ethernetSettings.setThemeWallpaper(currentTheme, wallpaperInfo);
    return wallpaperInfo;
  });

  regHandle('hermes:wallpaper-clear', (_e, themeName) => {
    const currentTheme = themeName || ethernetSettings.getTheme() || 'default';
    ethernetSettings.setThemeWallpaper(currentTheme, null);
    try {
      if (fs.existsSync(WALLPAPERS_DIR)) {
        const existing = fs.readdirSync(WALLPAPERS_DIR);
        for (const oldFile of existing) {
          try {
            fs.unlinkSync(path.join(WALLPAPERS_DIR, oldFile));
          } catch {}
        }
      }
    } catch {}
    return { slug: null, file: null };
  });

  // Перезагрузка окна (после установки темы/плагина)
  regHandle('hermes:reload', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) win.webContents.reload();
    return true;
  });

  // --- Управление окном (кастомный топбар) ---
  regHandle('hermes:window-minimize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) win.minimize();
    return true;
  });

  regHandle('hermes:window-maximize-toggle', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    } else {
      win.maximize();
      return true;
    }
  });

  regHandle('hermes:window-close', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) win.close();
    return true;
  });

  regHandle('hermes:window-is-maximized', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return win ? win.isMaximized() : false;
  });

  // --- Гео-IP информация о текущем соединении ---
  regHandle('hermes:network-geo-info', async () => {
    return proxyEngine.getNetworkGeoInfo();
  });

  // --- Пользовательский прокси (SOCKS5, HTTP) ---

  regHandle('hermes:proxy-get-state', () => {
    return ethernetSettings.getProxySettings();
  });

  regHandle('hermes:proxy-save', async (_e, proxyConfig) => {
    const state = ethernetSettings.saveProxy(proxyConfig);
    await proxyEngine.applyNetworkState();
    return state;
  });

  regHandle('hermes:proxy-delete', async (_e, id) => {
    const state = ethernetSettings.deleteProxy(id);
    await proxyEngine.applyNetworkState();
    return state;
  });

  regHandle('hermes:proxy-set-active', async (_e, id) => {
    const state = ethernetSettings.setActiveProxy(id);
    await proxyEngine.applyNetworkState();
    return state;
  });

  regHandle('hermes:proxy-toggle', async (_e, enabled) => {
    const state = ethernetSettings.toggleProxy(enabled);
    await proxyEngine.applyNetworkState();
    return state;
  });

  regHandle('hermes:proxy-parse-link', (_e, rawLink) => {
    return proxyParser.parseProxyUri(rawLink);
  });

  regHandle('hermes:proxy-test-ping', async (_e, proxy) => {
    return proxyEngine.testPing(proxy);
  });

  // --- Глобальное отключение уведомлений ---
  regHandle('hermes:notifications-disabled-get', () => {
    return ethernetSettings.getNotificationsDisabled();
  });

  regHandle('hermes:notifications-disabled-set', (_e, disabled) => {
    const res = ethernetSettings.setNotificationsDisabled(disabled);
    if (typeof global.updateEthernetTrayMenu === 'function') {
      global.updateEthernetTrayMenu();
    }
    return res;
  });

  // --- Не сворачивать в трей (закрывать по крестику) ---
  regHandle('hermes:close-to-tray-disabled-get', () => {
    return ethernetSettings.getCloseToTrayDisabled();
  });

  regHandle('hermes:close-to-tray-disabled-set', (_e, disabled) => {
    return ethernetSettings.setCloseToTrayDisabled(disabled);
  });

  // --- Безопасный режим (Safe Mode) ---
  regHandle('hermes:safemode-get', () => {
    return ethernetSettings.getSafeMode();
  });

  regHandle('hermes:safemode-set', (_e, enabled) => {
    return ethernetSettings.setSafeMode(enabled);
  });

  regHandle('hermes:last-crashed-plugin-get', () => {
    return ethernetSettings.getLastCrashedPlugin();
  });

  regHandle('hermes:clear-last-crashed-plugin', () => {
    ethernetSettings.clearLastCrashedPlugin();
    return true;
  });

  regHandle('hermes:report-plugin-crash', (_e, pluginId, error) => {
    return ethernetSettings.reportPluginCrash(pluginId, error);
  });
}

module.exports = { registerHermesFsHandlers, registerEthernetFsHandlers: registerHermesFsHandlers };
