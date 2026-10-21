const { app, BrowserWindow, protocol, net, shell, nativeTheme, Menu, Tray, nativeImage, globalShortcut, screen, ipcMain, powerMonitor } = require('electron');
const { pathToFileURL } = require('url');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

if (app) {
  app.name = 'Ethernet';
  if (process.platform === 'win32') {
    app.setAppUserModelId(app.isPackaged ? 'org.ethernet.desktop' : process.execPath);
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

// Отключаем DnsOverHttps и нативную окклюзию окон (вызывающую микрофризы и задержки кликов на Windows, как в Discord)
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'DnsOverHttps,CalculateNativeWinOcclusion');

// Мгновенная доставка кликов и событий мыши в рендерер без задержек буферизации VSync + аппаратный D3D11 декодер видео
app.commandLine.appendSwitch('enable-features', 'RunUnbufferedDispatch,D3D11VideoDecoder');

// Разрешаем воспроизведение аудио/видео без предварительного клика (для кружков и предпросмотров)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Аппаратное ускорение рендеринга, декодирования видео и растрирования слоев через GPU
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

const isPackaged = app.isPackaged;
const DIST = path.join(__dirname, '..', 'dist');
const ROOT = process.env.PORTABLE_EXECUTABLE_DIR || (process.env.APPIMAGE ? path.dirname(process.env.APPIMAGE) : (isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..', '..')));
const THEMES_DIR = path.join(ROOT, 'themes');
const PLUGINS_DIR = path.join(ROOT, 'plugins');
const WALLPAPERS_DIR = path.join(ROOT, 'wallpapers');
const LOADER_PATH = path.join(__dirname, 'loader.js');

function seedDefaultAssets() {
  try {
    const candidates = [
      path.join(__dirname, '..', 'assets-bundle'),
      process.resourcesPath ? path.join(process.resourcesPath, 'assets-bundle') : null,
      path.join(__dirname, '..', '..', 'assets-bundle'),
    ].filter(Boolean);

    const bundleDir = candidates.find((dir) => fs.existsSync(dir));
    if (!bundleDir) return;

    if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR, { recursive: true });
    if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    if (!fs.existsSync(WALLPAPERS_DIR)) fs.mkdirSync(WALLPAPERS_DIR, { recursive: true });

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

    // 4. Plugins
    const bundlePlugins = path.join(bundleDir, 'plugins');
    if (fs.existsSync(bundlePlugins)) {
      const s = hermesSettings.read ? hermesSettings.read() : {};
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

try {
  if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR, { recursive: true });
  if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  if (!fs.existsSync(WALLPAPERS_DIR)) fs.mkdirSync(WALLPAPERS_DIR, { recursive: true });
  seedDefaultAssets();
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

// Разрешаем открытие в системном браузере только веб-ссылок и почты.
// Протокол tg: исключён: все Telegram-ссылки обрабатываются исключительно внутри клиента
// и ни при каких условиях не передаются в ОС (защита от вызова уязвимого внешнего Telegram Desktop).
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function isSafeExternalUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const trimmed = rawUrl.trim();
    // Блокируем любые UNC-пути, обратные слэши, управляющие символы и кавычки (защита от argument injection в Windows)
    if (trimmed.startsWith('\\\\') || trimmed.startsWith('//') || trimmed.includes('\\') || /[\s"'<>\r\n\t\x00-\x1f]/.test(trimmed)) {
      return false;
    }
    const parsed = new URL(trimmed);
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      return false;
    }
    if (parsed.hostname && parsed.hostname.includes('\\')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

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
    if (m) {
      const storedPermissions = hermesSettings.getPluginPermissions(d.name) || {};
      const declared = Array.isArray(m.permissions) ? m.permissions : [];
      const granted = {};
      declared.forEach((perm) => {
        granted[perm] = storedPermissions[perm] !== undefined ? storedPermissions[perm] : true;
      });
      let icon = m.icon;
      if (!icon) {
        const iconSvg = path.join(PLUGINS_DIR, d.name, 'icon.svg');
        const iconPng = path.join(PLUGINS_DIR, d.name, 'icon.png');
        if (fs.existsSync(iconSvg)) {
          try { icon = fs.readFileSync(iconSvg, 'utf8'); } catch {}
        } else if (fs.existsSync(iconPng)) {
          try { icon = `data:image/png;base64,${fs.readFileSync(iconPng).toString('base64')}`; } catch {}
        }
      }
      out.push({
        ...m,
        id: d.name,
        icon: icon || m.icon || '',
        enabled: hermesSettings.isPluginEnabled(d.name),
        permissions: declared,
        grantedPermissions: granted,
      });
    }
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
          permissions: rest.permissions || [],
          grantedPermissions: rest.grantedPermissions || {},
          hasDangerousPermissions: (rest.permissions || []).some((p) =>
            ['credentials', 'telegram.updates', 'network.intercept', 'network.raw', 'telegram.store', 'desktop.ipc'].includes(p)
          ),
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
          const rawName = decodeURIComponent(pathname.slice(prefix.length, -4));
          const safeThemeName = path.basename(rawName).replace(/\.(css|eth|json|eth-theme)$/i, '');
          const candidates = [
            path.normalize(path.join(THEMES_DIR, `${safeThemeName}.css`)),
            path.normalize(path.join(THEMES_DIR, `${safeThemeName}.eth`)),
            path.normalize(path.join(THEMES_DIR, `${safeThemeName}.json`)),
            path.normalize(path.join(THEMES_DIR, `${safeThemeName}.eth-theme`)),
          ];
          const resolvedThemes = path.resolve(THEMES_DIR);
          for (const target of candidates) {
            if (target.toLowerCase().startsWith((resolvedThemes + path.sep).toLowerCase()) && fs.existsSync(target)) {
              const fileContent = fs.readFileSync(target, 'utf8');
              if (target.endsWith('.css')) {
                return new Response(fileContent, {
                  headers: { 'content-type': 'text/css; charset=utf-8' },
                });
              }
              // .eth / .json package
              try {
                const parsed = JSON.parse(fileContent);
                let css = parsed.css || '';
                if (!css && parsed.mod && parsed.mod.colors) {
                  const lines = [':root {'];
                  for (const [k, v] of Object.entries(parsed.mod.colors)) {
                    if (v) lines.push(`  ${k}: ${v};`);
                  }
                  lines.push('}');
                  css = lines.join('\n');
                }
                return new Response(css, {
                  headers: { 'content-type': 'text/css; charset=utf-8' },
                });
              } catch {}
            }
          }
        } catch {}
        return new Response('Not Found', { status: 404 });
      }

      function resolveWallpaperFile(wp) {
        if (!wp || (!wp.file && !wp.slug && !wp.originalPath)) return null;
        if (typeof wp.file === 'string' && (wp.file.startsWith('#') || wp.file.startsWith('rgb'))) {
          return wp.file;
        }
        if (typeof wp.file === 'string' && (wp.file.startsWith('data:image/') || wp.file.startsWith('data:video/'))) {
          return wp.file;
        }
        if (wp.slug === 'color') return wp.file || null;
        if (!fs.existsSync(WALLPAPERS_DIR)) {
          try { fs.mkdirSync(WALLPAPERS_DIR, { recursive: true }); } catch {}
        }
        const files = fs.existsSync(WALLPAPERS_DIR) ? fs.readdirSync(WALLPAPERS_DIR) : [];
        let file = (wp.file && files.includes(wp.file)) ? wp.file : files.find((f) => f === wp.file || (wp.slug && wp.slug !== 'color' && f.startsWith(wp.slug)));
        if (!file && wp.originalPath && fs.existsSync(wp.originalPath)) {
          try {
            const ext = path.extname(wp.originalPath).toLowerCase() || (wp.kind === 'video' ? '.mp4' : '.png');
            const filename = wp.file || `${wp.slug || `ethernet-${Date.now()}`}${ext}`;
            const dest = path.join(WALLPAPERS_DIR, filename);
            fs.copyFileSync(wp.originalPath, dest);
            file = filename;
          } catch (e) {
            console.error('[main] auto-restore wallpaper failed:', e);
          }
        }
        return file;
      }

      if (pathname === '/ethernet/mod.json' || pathname === '/hermes/mod.json') {
        const mod = hermesSettings.getMod() || {};
        const wp = hermesSettings.getThemeWallpaper();
        if (wp && (wp.kind === 'color' || wp.slug === 'color' || (typeof wp.file === 'string' && (wp.file.startsWith('#') || wp.file.startsWith('rgb'))))) {
          const colorVal = wp.file || wp.originalPath || '#212121';
          mod.wallpaperFile = colorVal;
          mod.wallpaperKind = 'color';
          mod.wallpaperOriginalPath = colorVal;
        } else if (wp && typeof wp.file === 'string' && wp.file.startsWith('data:')) {
          mod.wallpaperFile = wp.file;
          mod.wallpaperKind = wp.kind || 'image';
          mod.wallpaperOriginalPath = wp.originalPath || 'embedded';
        } else {
          const file = resolveWallpaperFile(wp);
          if (file) {
            mod.wallpaperFile = file;
            mod.wallpaperKind = (wp && wp.kind) || (/\.(mp4|webm)$/i.test(file) ? 'video' : 'image');
            if (wp && wp.originalPath) mod.wallpaperOriginalPath = wp.originalPath;
          } else {
            delete mod.wallpaperFile;
            delete mod.wallpaperKind;
            delete mod.wallpaperOriginalPath;
          }
        }
        return new Response(JSON.stringify(mod), {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }

      if (pathname === '/ethernet/wallpaper.json' || pathname === '/hermes/wallpaper.json') {
        const rawTheme = url.searchParams.get('theme');
        const themeParam = rawTheme ? path.basename(String(rawTheme).trim()).replace(/\.(css|eth|json|eth-theme)$/i, '') : null;
        let wp = themeParam ? hermesSettings.getThemeWallpaper(themeParam) : hermesSettings.getThemeWallpaper();
        if (wp && (wp.kind === 'color' || wp.slug === 'color' || (typeof wp.file === 'string' && (wp.file.startsWith('#') || wp.file.startsWith('rgb'))))) {
          const colorVal = wp.file || wp.originalPath || '#212121';
          return new Response(JSON.stringify({ slug: 'color', file: colorVal, kind: 'color', originalPath: colorVal }), {
            headers: { 'content-type': 'application/json; charset=utf-8' },
          });
        }
        if (wp && typeof wp.file === 'string' && (wp.file.startsWith('data:image/') || wp.file.startsWith('data:video/'))) {
          const isSvg = wp.file.startsWith('data:image/svg+xml');
          const isVideo = wp.file.startsWith('data:video/') || wp.kind === 'video';
          return new Response(JSON.stringify({
            slug: (wp && wp.slug) || 'embedded',
            file: wp.file,
            kind: wp.kind || (isVideo ? 'video' : 'image'),
            ext: isSvg ? '.svg' : '.png',
            originalPath: (wp && wp.originalPath) || 'embedded',
          }), {
            headers: { 'content-type': 'application/json; charset=utf-8' },
          });
        }
        let file = resolveWallpaperFile(wp);
        if (!file) {
          return new Response(JSON.stringify({ slug: null, file: null }), {
            headers: { 'content-type': 'application/json; charset=utf-8' },
          });
        }
        const isVideo = (wp && wp.kind === 'video') || /\.(mp4|webm)$/i.test(file);
        return new Response(JSON.stringify({ slug: (wp && wp.slug) || file, file, kind: isVideo ? 'video' : 'image', ext: path.extname(file), originalPath: wp && wp.originalPath }), {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }

      if (pathname.startsWith('/ethernet/wallpapers/') || pathname.startsWith('/hermes/wallpapers/')) {
        const file = path.basename(decodeURIComponent(pathname));
        const target = path.normalize(path.join(WALLPAPERS_DIR, file));
        const resolvedWallpapers = path.resolve(WALLPAPERS_DIR);
        if (!fs.existsSync(target)) {
          const wp = hermesSettings.getThemeWallpaper();
          if (wp && wp.originalPath && fs.existsSync(wp.originalPath)) {
            try {
              if (!fs.existsSync(WALLPAPERS_DIR)) fs.mkdirSync(WALLPAPERS_DIR, { recursive: true });
              fs.copyFileSync(wp.originalPath, target);
            } catch {}
          }
        }
        if (target.toLowerCase().startsWith((resolvedWallpapers + path.sep).toLowerCase()) && fs.existsSync(target)) {
          const ext = path.extname(file).toLowerCase();
          const mimeTypes = {
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml; charset=utf-8',
          };
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          const stat = fs.statSync(target);
          const totalSize = stat.size;
          const rangeHeader = request.headers.get('range');

          if (rangeHeader) {
            const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
            if (match) {
              const start = parseInt(match[1], 10);
              const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
              if (start < totalSize && end >= start) {
                const safeEnd = Math.min(end, totalSize - 1);
                const chunkSize = safeEnd - start + 1;
                const nodeStream = fs.createReadStream(target, { start, end: safeEnd });
                const webStream = Readable.toWeb(nodeStream);
                return new Response(webStream, {
                  status: 206,
                  headers: {
                    'Content-Range': `bytes ${start}-${safeEnd}/${totalSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize.toString(),
                    'Content-Type': contentType,
                  },
                });
              }
            }
          }

          const nodeStream = fs.createReadStream(target);
          const webStream = Readable.toWeb(nodeStream);
          return new Response(webStream, {
            status: 200,
            headers: {
              'Accept-Ranges': 'bytes',
              'Content-Length': totalSize.toString(),
              'Content-Type': contentType,
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
      const filePath = path.normalize(path.join(DIST, relPath));
      const resolvedDist = path.resolve(DIST);

      // Защита от Path Traversal (выхода за пределы DIST)
      if (!filePath.toLowerCase().startsWith((resolvedDist + path.sep).toLowerCase()) && filePath.toLowerCase() !== resolvedDist.toLowerCase()) {
        return new Response('Forbidden', { status: 403 });
      }

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
        // Разрешаем unsafe-eval в CSP для безопасной песочницы плагинов
        html = html.replace(/script-src\s+'self'(\s+'wasm-unsafe-eval')?/, "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'");
        const inject = `<script src="/ethernet/loader.js"></script>`;
        if (!html.includes(inject)) html = html.replace('</head>', `${inject}\n</head>`);
        return new Response(html, {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'x-content-type-options': 'nosniff',
            'x-frame-options': 'SAMEORIGIN',
          },
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
    title: 'ethernet',
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
      backgroundThrottling: true,
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

  win.on('page-title-updated', (event, title) => {
    event.preventDefault();
    let clean = (title || '')
      .replace(/\s*·\s*Telegram(\s+Beta)?/gi, '')
      .replace(/\s*·\s*Ethernet/gi, '')
      .replace(/\s*·\s*ethernet/gi, '')
      .replace(/\s*\[Inactive\]/gi, '')
      .trim();
    if (!clean || /^(telegram(\s+beta)?|ethernet)$/i.test(clean)) {
      clean = 'ethernet';
    }
    win.setTitle(clean);
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    // Reload: Ctrl+R, Ctrl+Shift+R, F5
    if ((input.control && input.key.toLowerCase() === 'r') || input.key === 'F5') {
      if (input.shift) {
        win.webContents.reloadIgnoringCache();
      } else {
        win.webContents.reload();
      }
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
    if (url.startsWith('app://telegram/')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            backgroundThrottling: true,
          },
        },
      };
    }
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url);
    } else {
      console.warn('[Security] Blocked window.open for unsafe URL:', url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (!targetUrl.startsWith('app://telegram/')) {
      event.preventDefault();
      if (isSafeExternalUrl(targetUrl)) {
        shell.openExternal(targetUrl);
      } else {
        console.warn('[Security] Blocked will-navigate for unsafe URL:', targetUrl);
      }
    }
  });

  win.webContents.on('will-redirect', (event, targetUrl) => {
    if (!targetUrl.startsWith('app://telegram/')) {
      event.preventDefault();
      console.warn('[Security] Blocked will-redirect outside app:', targetUrl);
    }
  });

  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
    console.warn('[Security] Blocked webview attachment');
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
      preload: path.join(__dirname, 'preload-tray.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: true,
    },
  });

  trayMenuWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  trayMenuWindow.webContents.on('will-navigate', (event) => event.preventDefault());

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

function isTraySender(event) {
  if (trayMenuWindow && !trayMenuWindow.isDestroyed() && event.sender === trayMenuWindow.webContents) return true;
  const url = event.senderFrame?.url || (typeof event.sender?.getURL === 'function' ? event.sender.getURL() : '');
  return url.includes('tray-menu.html');
}

ipcMain.on('tray:action-open', (event) => {
  if (!isTraySender(event)) return;
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) trayMenuWindow.hide();
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow();
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.on('tray:action-toggle-notifs', (event) => {
  if (!isTraySender(event)) return;
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

ipcMain.on('tray:action-quit', (event) => {
  if (!isTraySender(event)) return;
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

ipcMain.on('hermes:set-unread-count', (event, count) => {
  const senderUrl = event.senderFrame?.url || (typeof event.sender?.getURL === 'function' ? event.sender.getURL() : '');
  if (!senderUrl.startsWith('app://telegram/')) {
    console.warn(`[Security] Blocked unauthorized set-unread-count from '${senderUrl}'`);
    return;
  }
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
    // Ограничение разрешений (Permissions Request & Check Handlers)
    const { session } = require('electron');
    if (session && session.defaultSession) {
      const allowedPermissions = [
        'media',
        'camera',
        'microphone',
        'audioCapture',
        'videoCapture',
        'display-capture',
        'notifications',
        'fullscreen',
      ];

      session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
        // Защита от iframe: разрешаем захват медиа (микрофон/камера) СТРОГО для главного фрейма самого клиента
        const isMainFrame = details ? Boolean(details.isMainFrame) : true;
        const requestingUrl = (details && details.requestingUrl) || webContents?.getURL() || '';

        if (!requestingUrl.startsWith('app://telegram/') || !isMainFrame) {
          console.warn(`[Security] Blocked permission "${permission}" for untrusted/iframe origin: "${requestingUrl}" (isMainFrame=${isMainFrame})`);
          return callback(false);
        }

        // Разрешаем только микрофон/камеру (для голосовых/видео сообщений-кружков и звонков), уведомления и полноэкранный режим
        if (allowedPermissions.includes(permission)) {
          return callback(true);
        }
        return callback(false);
      });

      session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        const isMainFrame = details ? Boolean(details.isMainFrame) : true;
        const originUrl = requestingOrigin || (details && details.requestingUrl) || webContents?.getURL() || '';

        if ((!originUrl.startsWith('app://telegram/') && originUrl !== '') || !isMainFrame) {
          return false;
        }
        return allowedPermissions.includes(permission);
      });
    }

    // Глобальная защита для всех создаваемых окон и фреймов в приложении
    app.on('web-contents-created', (_event, contents) => {
      contents.on('will-attach-webview', (wvEvent) => {
        wvEvent.preventDefault();
        console.warn('[Security] Blocked webview attachment');
      });

      contents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('app://telegram/')) {
          return {
            action: 'allow',
            overrideBrowserWindowOptions: {
              webPreferences: {
                preload: path.join(__dirname, 'preload.cjs'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: false,
                backgroundThrottling: true,
              },
            },
          };
        }
        if (isSafeExternalUrl(url)) {
          shell.openExternal(url);
        } else {
          console.warn('[Security] Blocked window.open for unsafe URL:', url);
        }
        return { action: 'deny' };
      });

      contents.on('will-navigate', (navEvent, targetUrl) => {
        if (!targetUrl.startsWith('app://telegram/')) {
          navEvent.preventDefault();
          if (isSafeExternalUrl(targetUrl)) {
            shell.openExternal(targetUrl);
          } else {
            console.warn('[Security] Blocked will-navigate for unsafe URL:', targetUrl);
          }
        }
      });

      contents.on('will-redirect', (redEvent, targetUrl) => {
        if (!targetUrl.startsWith('app://telegram/')) {
          redEvent.preventDefault();
          console.warn('[Security] Blocked will-redirect outside app:', targetUrl);
        }
      });
    });

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

    if (powerMonitor) {
      const notifyAllWindows = (channel) => {
        BrowserWindow.getAllWindows().forEach((w) => {
          if (!w.isDestroyed()) {
            w.webContents.send(channel);
          }
        });
      };
      powerMonitor.on('suspend', () => notifyAllWindows('hermes:power-suspend'));
      powerMonitor.on('lock-screen', () => notifyAllWindows('hermes:power-suspend'));
      powerMonitor.on('resume', () => notifyAllWindows('hermes:power-resume'));
      powerMonitor.on('unlock-screen', () => notifyAllWindows('hermes:power-resume'));
    }

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
