const { app, BrowserWindow, protocol, net, shell, nativeTheme, Menu, Tray, nativeImage, globalShortcut, screen, ipcMain } = require('electron');
const { pathToFileURL } = require('url');
const fs = require('fs');
const path = require('path');

if (app) {
  app.name = 'Ethernet';
  if (process.platform === 'win32') {
    app.setAppUserModelId('org.ethernet.desktop');
  }

  // Сохраняем существующий профиль и базу данных сессии, чтобы аккаунт не разлогинивался
  try {
    const legacyUserData = path.join(app.getPath('appData'), 'telegram-t');
    if (fs.existsSync(legacyUserData)) {
      app.setPath('userData', legacyUserData);
    }
  } catch {}
}

const { registerHermesFsHandlers } = require('./hermes-fs.cjs');
const hermesSettings = require('./hermes-settings.cjs');

// Полностью отключаем стандартное меню Electron (File, Edit, View, Window)
Menu.setApplicationMenu(null);

const isPackaged = app.isPackaged;
const DIST = path.join(__dirname, '..', 'dist');
const ROOT = process.env.PORTABLE_EXECUTABLE_DIR || (process.env.APPIMAGE ? path.dirname(process.env.APPIMAGE) : (isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..', '..')));
const THEMES_DIR = path.join(ROOT, 'themes');
const PLUGINS_DIR = path.join(ROOT, 'plugins');
const WALLPAPERS_DIR = path.join(ROOT, 'wallpapers');
const LOADER_PATH = path.join(__dirname, 'loader.js');

try {
  if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR, { recursive: true });
  if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  if (!fs.existsSync(WALLPAPERS_DIR)) fs.mkdirSync(WALLPAPERS_DIR, { recursive: true });
} catch {}

// Регистрируем кастомный протокол как стандартный, безопасный и поддерживающий fetch/WASM/Workers
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function listPlugins() {
  let dirs = [];
  try { dirs = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const m = readJson(path.join(PLUGINS_DIR, d.name, 'manifest.json'), null);
    if (m) out.push({ id: d.name, enabled: hermesSettings.isPluginEnabled(d.name), ...m });
  }
  return out;
}

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      const pathname = decodeURIComponent(url.pathname);

      // --- Служебные ethernet / hermes-маршруты ---
      if (pathname === '/ethernet/loader.js' || pathname === '/hermes/loader.js') {
        return new Response(fs.readFileSync(LOADER_PATH), {
          headers: { 'content-type': 'application/javascript; charset=utf-8' },
        });
      }

      if (pathname === '/ethernet/themes.css' || pathname === '/hermes/themes.css') {
        let css = '';
        try {
          fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith('.css')).sort().forEach((f) => {
            css += `/* theme: ${f} */\n` + fs.readFileSync(path.join(THEMES_DIR, f), 'utf8') + '\n';
          });
        } catch {}
        return new Response(css, {
          headers: { 'content-type': 'text/css; charset=utf-8' },
        });
      }

      if (pathname === '/ethernet/plugins/manifests.json' || pathname === '/hermes/plugins/manifests.json') {
        const isSafeMode = hermesSettings.getSafeMode();
        const plugins = listPlugins().map(({ enabled, ...rest }) => ({
          enabled: isSafeMode ? false : hermesSettings.isPluginEnabled(rest.id),
          id: rest.id,
          name: rest.name,
        }));
        return new Response(JSON.stringify(plugins), {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }

      if (pathname === '/ethernet/config.json' || pathname === '/hermes/config.json') {
        return new Response(JSON.stringify({ theme: hermesSettings.getTheme() }), {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }

      if ((pathname.startsWith('/ethernet/theme/') || pathname.startsWith('/hermes/theme/')) && pathname.endsWith('.css')) {
        try {
          const prefix = pathname.startsWith('/ethernet/theme/') ? '/ethernet/theme/' : '/hermes/theme/';
          const themeRawName = decodeURIComponent(pathname.slice(prefix.length, -4));
          const target = path.join(THEMES_DIR, `${themeRawName}.css`);
          if (fs.existsSync(target)) {
            return new Response(fs.readFileSync(target, 'utf8'), {
              headers: { 'content-type': 'text/css; charset=utf-8' },
            });
          }
        } catch {}
        return new Response('Not Found', { status: 404 });
      }

      if (pathname === '/ethernet/mod.json' || pathname === '/hermes/mod.json') {
        const mod = hermesSettings.getMod() || {};
        const wp = hermesSettings.getThemeWallpaper();
        if (wp && (wp.file || wp.slug)) {
          const files = fs.existsSync(WALLPAPERS_DIR) ? fs.readdirSync(WALLPAPERS_DIR) : [];
          const file = (wp.file && files.includes(wp.file)) ? wp.file : files.find((f) => f === wp.file || f.startsWith(wp.file || wp.slug) || (wp.slug && f.startsWith(wp.slug)));
          if (file) {
            mod.wallpaperFile = file;
            mod.wallpaperKind = wp.kind || (/\.(mp4|webm)$/i.test(file) ? 'video' : 'image');
          }
        }
        return new Response(JSON.stringify(mod), {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }

      if (pathname === '/ethernet/wallpaper.json' || pathname === '/hermes/wallpaper.json') {
        const themeParam = url.searchParams.get('theme') || hermesSettings.getTheme();
        const wp = hermesSettings.getThemeWallpaper(themeParam);
        if (!wp || (!wp.file && !wp.slug)) {
          return new Response(JSON.stringify({ slug: null, file: null }), {
            headers: { 'content-type': 'application/json; charset=utf-8' },
          });
        }
        const files = fs.existsSync(WALLPAPERS_DIR) ? fs.readdirSync(WALLPAPERS_DIR) : [];
        const file = (wp.file && files.includes(wp.file)) ? wp.file : files.find((f) => f === wp.file || f.startsWith(wp.file || wp.slug) || (wp.slug && f.startsWith(wp.slug)));
        if (!file) {
          return new Response(JSON.stringify({ slug: null, file: null }), {
            headers: { 'content-type': 'application/json; charset=utf-8' },
          });
        }
        const isVideo = wp.kind === 'video' || /\.(mp4|webm)$/i.test(file);
        return new Response(JSON.stringify({ slug: wp.slug || file, file, kind: isVideo ? 'video' : 'image', ext: path.extname(file), originalPath: wp.originalPath }), {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }

      if (pathname.startsWith('/ethernet/wallpapers/') || pathname.startsWith('/hermes/wallpapers/')) {
        const file = path.basename(decodeURIComponent(pathname));
        const target = path.join(WALLPAPERS_DIR, file);
        if (fs.existsSync(target)) {
          const ext = path.extname(file).toLowerCase();
          const mimeTypes = {
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
          };
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          const buffer = fs.readFileSync(target);
          return new Response(buffer, {
            headers: {
              'content-type': contentType,
              'content-length': buffer.length.toString(),
              'accept-ranges': 'bytes',
            },
          });
        }
        return new Response('Not Found', { status: 404 });
      }

      const pluginMatch = pathname.match(/^\/(?:ethernet|hermes)\/plugins\/([\w-]+)\/(manifest\.json|index\.js)$/);
      if (pluginMatch) {
        const [, id, file] = pluginMatch;
        const target = path.join(PLUGINS_DIR, id, file);
        if (fs.existsSync(target)) {
          return new Response(fs.readFileSync(target, 'utf8'), {
            headers: { 'content-type': file.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'application/json; charset=utf-8' },
          });
        }
        return new Response('Not Found', { status: 404 });
      }

      // --- Файлы dist клиента ---
      const relPath = pathname.replace(/^\/+/, '');
      let filePath = path.join(DIST, relPath);

      // Если файл существует на диске — отдаём его:
      if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
        return net.fetch(pathToFileURL(filePath).toString());
      }

      // Если это запрос к медиа, прогрессивным потокам, ассетам или файлу с расширением — отдаём 404
      if (relPath.startsWith('progressive/') || relPath.startsWith('download/') || relPath.startsWith('assets/') || path.extname(relPath)) {
        return new Response('Not Found', { status: 404 });
      }

      // index.html (fallback для SPA-роутинга):
      const indexPath = path.join(DIST, 'index.html');
      if (fs.existsSync(indexPath)) {
        let html = fs.readFileSync(indexPath, 'utf8');
        const inject = `<script src="/ethernet/loader.js"></script>`;
        if (!html.includes(inject)) html = html.replace('</head>', `${inject}\n</head>`);
        return new Response(html, {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      return new Response('dist not built — run: npm run app:build', { status: 404 });
    } catch (e) {
      console.error('[Hermes protocol error]', e);
      return new Response('Internal error', { status: 500 });
    }
  });
}

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'ethernet.ico');
  const appIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;
  const win = new BrowserWindow({
    width: 1280,
    height: 832,
    minWidth: 480,
    minHeight: 400,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    icon: appIcon || (fs.existsSync(iconPath) ? iconPath : undefined),
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  if (appIcon && typeof win.setIcon === 'function') {
    try { win.setIcon(appIcon); } catch {}
  }

  win.setMenu(null);
  if (typeof win.removeMenu === 'function') {
    win.removeMenu();
  }

  win.on('maximize', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('hermes:window-maximized-changed', true);
    }
  });

  win.on('unmaximize', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('hermes:window-maximized-changed', false);
    }
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    // Reload: Ctrl+R, Ctrl+Shift+R, F5
    if ((input.control && input.key.toLowerCase() === 'r') || input.key === 'F5') {
      win.webContents.reloadIgnoringCache();
      event.preventDefault();
      return;
    }

    // DevTools: Ctrl+Shift+I, F12
    if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
      return;
    }
  });

  win.loadURL('app://telegram/');

  win.on('close', (event) => {
    const disableCloseToTray = hermesSettings.getCloseToTrayDisabled();
    if (!app.isQuitting && !disableCloseToTray) {
      event.preventDefault();
      win.hide();
      return false;
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('app://')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

let tray = null;
let trayMenuWindow = null;
let mainWindow = null;

function createTrayMenuWindow() {
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) return trayMenuWindow;

  trayMenuWindow = new BrowserWindow({
    width: 190,
    height: 120,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    show: false,
    focusable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
    },
  });

  trayMenuWindow.setMenu(null);
  trayMenuWindow.loadFile(path.join(__dirname, 'tray-menu.html'));

  trayMenuWindow.on('blur', () => {
    if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
      trayMenuWindow.hide();
    }
  });

  trayMenuWindow.on('closed', () => {
    trayMenuWindow = null;
  });

  return trayMenuWindow;
}

function showTrayMenu(trayBounds) {
  const win = createTrayMenuWindow();
  if (!win) return;

  if (win.isVisible()) {
    win.hide();
    return;
  }

  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y }) || screen.getPrimaryDisplay();
  const workArea = display.workArea;

  const menuWidth = 190;
  const menuHeight = 120;

  let x = Math.round(trayBounds.x + (trayBounds.width / 2) - (menuWidth / 2));
  let y = Math.round(trayBounds.y - menuHeight - 6);

  if (y < workArea.y) {
    y = Math.round(trayBounds.y + trayBounds.height + 6);
  }
  if (x + menuWidth > workArea.x + workArea.width) {
    x = Math.round(workArea.x + workArea.width - menuWidth - 8);
  }
  if (x < workArea.x) {
    x = Math.round(workArea.x + 8);
  }

  win.setBounds({ x, y, width: menuWidth, height: menuHeight });
  win.showInactive();
  win.webContents.send('tray:set-state', {
    notificationsDisabled: hermesSettings.getNotificationsDisabled(),
  });
  win.focus();
}

ipcMain.on('tray:action-open', () => {
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) trayMenuWindow.hide();
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow();
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.on('tray:action-toggle-notifs', () => {
  const nextVal = !hermesSettings.getNotificationsDisabled();
  hermesSettings.setNotificationsDisabled(nextVal);
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.webContents.send('tray:set-state', { notificationsDisabled: nextVal });
    trayMenuWindow.hide();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hermes:notifications-disabled-changed', nextVal);
  }
  updateTrayMenu();
});

ipcMain.on('tray:action-quit', () => {
  app.isQuitting = true;
  app.quit();
});

let currentUnreadCount = 0;

function updateTaskbarBadge(count) {
  const num = typeof count === 'number' ? count : 0;
  currentUnreadCount = num;

  try {
    app.setBadgeCount(num);
  } catch {}

  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (process.platform === 'win32') {
    if (num <= 0) {
      try {
        mainWindow.setOverlayIcon(null, '');
      } catch {}
    } else {
      try {
        const badgeText = num > 99 ? '99+' : String(num);
        const fontSize = num > 99 ? 11 : (num > 9 ? 13 : 15);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="14" fill="#3390ec"/>
          <text x="16" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff" text-anchor="middle">${badgeText}</text>
        </svg>`;
        const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        const badgeImage = nativeImage.createFromDataURL(dataUrl);
        mainWindow.setOverlayIcon(badgeImage, `${badgeText} непрочитанных`);
      } catch (err) {
        console.error('[Taskbar Badge Error]', err);
      }
    }
  }

  if (tray) {
    tray.setToolTip(num > 0 ? `Ethernet (${num})` : 'Ethernet');
  }
}

ipcMain.on('hermes:set-unread-count', (_e, count) => {
  updateTaskbarBadge(count);
});

function updateTrayMenu() {
  const notificationsDisabled = hermesSettings.getNotificationsDisabled();

  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.webContents.send('tray:set-state', {
      notificationsDisabled,
    });
  }
}

global.updateEthernetTrayMenu = updateTrayMenu;

function createTray() {
  if (tray) return tray;
  const iconPath = path.join(__dirname, '..', 'ethernet.ico');
  if (!fs.existsSync(iconPath)) return null;

  try {
    tray = new Tray(iconPath);
    tray.setToolTip('Ethernet');

    // Предзагружаем окно трея заранее, чтобы при первом открытии не было задержек и двойных анимаций
    createTrayMenuWindow();
    updateTrayMenu();

    tray.on('click', () => {
      if (trayMenuWindow && !trayMenuWindow.isDestroyed() && trayMenuWindow.isVisible()) {
        trayMenuWindow.hide();
        return;
      }
      if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = createWindow();
        return;
      }
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
    });

    tray.on('right-click', (_event, bounds) => {
      showTrayMenu(bounds);
    });

    tray.on('double-click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = createWindow();
        return;
      }
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    });
  } catch (err) {
    console.error('[Tray Create Error]', err);
  }

  return tray;
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    } catch {}
  });

  const proxyEngine = require('./proxy-engine.cjs');
  const notificationManager = require('./notification-manager.cjs');

  app.whenReady().then(async () => {
    registerHermesFsHandlers();
    registerAppProtocol();

    try {
      await proxyEngine.applyNetworkState();
    } catch (err) {
      console.error('[Network Startup Error]', err);
    }

    createTray();

    mainWindow = createWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    notificationManager.setupNotificationIpc(() => mainWindow);

    // Повторно применяем прокси после создания окна — сессия теперь точно готова
    try {
      await proxyEngine.applyNetworkState();
    } catch (err) {
      console.error('[Network Post-Window Error]', err);
    }

    globalShortcut.register('CommandOrControl+Shift+I', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.toggleDevTools();
      }
    });

    globalShortcut.register('F12', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.toggleDevTools();
      }
    });

    globalShortcut.register('CommandOrControl+R', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.reloadIgnoringCache();
      }
    });

    globalShortcut.register('F5', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.reloadIgnoringCache();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      } else if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
      }
    });
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
  });

  app.on('window-all-closed', () => {
    if (app.isQuitting) {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });
}
