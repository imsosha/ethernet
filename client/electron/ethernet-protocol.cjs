// Кастомный протокол app:// — обслуживание бандла клиента, тем, плагинов и обоев.

const { protocol, net } = require('electron');
const { pathToFileURL } = require('url');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

const hermesSettings = require('./hermes-settings.cjs');
const { DIST, THEMES_DIR, PLUGINS_DIR, WALLPAPERS_DIR } = require('./ethernet-paths.cjs');

const LOADER_PATH = path.join(__dirname, 'loader.js');

// Регистрируем кастомный протокол как стандартный, безопасный и поддерживающий fetch/WASM/Workers
function registerPrivilegedSchemes() {
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
}

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

// Защита от symlink-эскейпа: путь считается валидным, только если
// его РЕАЛЬНОЕ расположение (после разрешения символических ссылок
// и junction-точек) лежит внутри реального каталога-родителя.
// Требует существования файла (как и все места вызова).
function isRealPathInside(targetPath, parentDir) {
  try {
    const realTarget = fs.realpathSync(path.resolve(targetPath));
    const realParent = fs.realpathSync(path.resolve(parentDir));
    return realTarget.toLowerCase().startsWith((realParent + path.sep).toLowerCase());
  } catch {
    return false;
  }
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
            if (fs.existsSync(target) && isRealPathInside(target, THEMES_DIR) && target.toLowerCase().startsWith((resolvedThemes + path.sep).toLowerCase())) {
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
        if (fs.existsSync(target) && isRealPathInside(target, WALLPAPERS_DIR) && target.toLowerCase().startsWith((resolvedWallpapers + path.sep).toLowerCase())) {
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
      if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory() && isRealPathInside(filePath, DIST)) {
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
        // WIDE CSP: 'unsafe-eval' необходим рантайму плагинов — код плагина
        // исполняется через new Function в главном рендерере (см. loader.js).
        // Это осознанный компромисс текущей архитектуры: полная изоляция
        // (iframe/Worker с postMessage-RPC) — отдельная задача; до неё
        // sandbox плагинов опирается на Proxy-ограничения и permission-модель.
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

module.exports = {
  registerPrivilegedSchemes,
  registerAppProtocol,
  listPlugins,
  isSafeExternalUrl,
};
