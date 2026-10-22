// Ethernet mod settings — файловые операции для тем и плагинов.
// Всё через main-процесс: рендерер не имеет доступа к файловой системе.

const { ipcMain, dialog, BrowserWindow, app } = require('electron');
const fs = require('fs');
const path = require('path');
const ethernetSettings = require('./ethernet-settings.cjs');
const proxyEngine = require('./proxy-engine.cjs');
const proxyParser = require('./proxy-parser.cjs');
const systemMediaService = require('./system-media-service.cjs');

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

const allowedPickedPaths = new Set();

function isSafeMediaBuffer(buf) {
  if (!buf || buf.length < 4) return false;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // GIF: 47 49 46 38 ('GIF8')
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  // WEBP: 'RIFF' .... 'WEBP'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return true;
  // MP4: ....ftyp
  if (buf.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp') return true;
  // WEBM / MKV: 1A 45 DF A3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return true;
  // SVG: contains <svg or starts with <?xml
  const str = buf.slice(0, 1024).toString('utf8').trim().toLowerCase();
  if (str.includes('<svg') || str.startsWith('<?xml')) return true;
  return false;
}

const DANGEROUS_PERMISSIONS = new Set([
  'credentials',
  'telegram.updates',
  'network.intercept',
  'network.raw',
  'telegram.store',
  'desktop.ipc',
]);

function parseDeclaredPermissions(code, manifest) {
  const perms = new Set();
  if (manifest && Array.isArray(manifest.permissions)) {
    manifest.permissions.forEach((p) => {
      if (typeof p === 'string' && p.trim()) perms.add(p.trim());
    });
  }
  if (code && typeof code === 'string') {
    const matches = code.matchAll(/@permissions?\s+([^\r\n*]+)/gi);
    for (const match of matches) {
      if (match[1]) {
        match[1].split(/[, ]+/).forEach((p) => {
          const trimmed = p.trim();
          if (trimmed) perms.add(trimmed);
        });
      }
    }
  }
  return Array.from(perms);
}

function cleanVersion(ver) {
  if (!ver || typeof ver !== 'string') return '';
  let v = ver.trim();
  v = v.replace(/^[:= ]+/, '').trim();
  v = v.replace(/\s*\*\/.*$/, '').trim();
  v = v.replace(/^[vV]+/, '').trim();
  return v;
}

function extractSvgIcon(text) {
  if (!text || typeof text !== 'string') return '';
  const iconDirective = text.match(/@icon\s+([^\r\n]+)/i);
  if (iconDirective) {
    const raw = iconDirective[1].trim().replace(/\s*\*\/.*$/, '').trim();
    if (raw.startsWith('<svg') || raw.startsWith('data:image/svg+xml')) return raw;
  }
  const svgBlock = text.match(/<svg[\s\S]*?<\/svg>/i);
  if (svgBlock) {
    return svgBlock[0].trim();
  }
  return '';
}

function parsePluginMetadata(code) {
  const meta = {};
  if (!code || typeof code !== 'string') return meta;
  const nameMatch = code.match(/@name[:=\s]+([^\r\n*]+)/i);
  if (nameMatch) meta.name = nameMatch[1].trim();
  const descMatch = code.match(/@description[:=\s]+([^\r\n*]+)/i);
  if (descMatch) meta.description = descMatch[1].trim();
  const verMatch = code.match(/(?:@version|--plugin-version)["':=\s]+([0-9a-zA-Z._-]+)/i)
    || code.match(/"version"\s*:\s*"([^"]+)"/i);
  if (verMatch) meta.version = cleanVersion(verMatch[1]);
  const authMatch = code.match(/@author[:=\s]+([^\r\n*]+)/i);
  if (authMatch) meta.author = authMatch[1].trim();
  const icon = extractSvgIcon(code);
  if (icon) meta.icon = icon;
  const themeDepMatch = code.match(/@(?:themeDependency|requiredForTheme)[:=\s]+([^\r\n*]+)/i);
  if (themeDepMatch) meta.themeDependency = themeDepMatch[1].trim();
  return meta;
}

function analyzePluginSecurity(code, declaredPermissions = []) {
  const errors = [];
  const warnings = [];
  const permsSet = new Set(declaredPermissions);

  if (!code || typeof code !== 'string') {
    return { valid: false, errors: ['Код плагина пуст или не является строкой'] };
  }

  // 1. Проверка на грубые обходы песочницы (Strict Sandbox Violations)
  if (/\beval\s*\(/.test(code)) {
    errors.push('Использование функции eval() строго запрещено политикой безопасности песочницы.');
  }
  if (/\bFunction\s*\(/.test(code) || /new\s+Function\s*\(/.test(code)) {
    errors.push('Динамическое создание функций (new Function) запрещено политикой безопасности песочницы.');
  }
  if (/\bprocess\.(env|versions|platform|arch|binding|mainModule)/.test(code)) {
    errors.push('Прямой доступ к объекту процесса Node.js (process.*) запрещен.');
  }
  if (/\brequire\s*\(/.test(code)) {
    errors.push('Вызов системного загрузчика require() запрещен внутри изолированного плагина.');
  }
  if (/(window\.)?(electronDesktop|ipcRenderer)\b/.test(code) && !permsSet.has('desktop.ipc')) {
    errors.push('Обнаружена попытка прямого вызова Electron IPC без объявления разрешения "desktop.ipc".');
  }

  // 2. Доступ к учетным данным Telegram без разрешения credentials
  const hasCredentialsPattern = /localStorage\s*(\[\s*['"`]user_auth['"`]|\.getItem\s*\(\s*['"`]user_auth['"`]|\.user_auth)/.test(code)
    || /indexedDB\s*\.\s*open\s*\(\s*['"`]tt-auth/i.test(code)
    || /sessionStorage\s*(\[\s*['"`]user_auth|\.getItem\s*\(\s*['"`]user_auth)/.test(code);
  if (hasCredentialsPattern && !permsSet.has('credentials')) {
    errors.push('Обнаружена попытка доступа к авторизационным ключам и токенам Telegram (user_auth) без запроса разрешения "credentials".');
  }

  // 3. Недекларированные вызовы сетевого и MTProto API:
  if ((/\bbeforeRequest\b/.test(code) || /\bonRequest\b/.test(code)) && !permsSet.has('network.intercept')) {
    errors.push('Плагин использует перехват исходящих сетевых запросов (beforeRequest / onRequest), но не объявил разрешение "network.intercept".');
  }
  if ((/\bonUpdate\b/.test(code) || /\bafterUpdate\b/.test(code)) && !permsSet.has('telegram.updates')) {
    errors.push('Плагин перехватывает входящие события и сообщения Telegram (onUpdate / afterUpdate), но не объявил разрешение "telegram.updates".');
  }
  if ((/\bstore\.getGlobal\b/.test(code) || /\bstore\.getActions\b/.test(code)) && !permsSet.has('telegram.store')) {
    errors.push('Плагин обращается к глобальному хранилищу Redux/Teact (store), но не объявил разрешение "telegram.store".');
  }
  if (/(fetch\s*\(\s*['"`]https?:\/\/|new\s+XMLHttpRequest|new\s+WebSocket)/.test(code) && !permsSet.has('network.raw')) {
    errors.push('Плагин выполняет внешние сетевые запросы (HTTP/WebSocket), но не объявил разрешение "network.raw".');
  }

  const declaredDangerous = declaredPermissions.filter((p) => DANGEROUS_PERMISSIONS.has(p));

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    hasDangerousPermissions: declaredDangerous.length > 0,
    dangerousPermissions: declaredDangerous,
  };
}

function registerHermesFsHandlers() {
  ensureDirs();

  const regHandle = (channel, fn) => {
    const wrappedFn = (event, ...args) => {
      const senderUrl = event.senderFrame?.url || (typeof event.sender?.getURL === 'function' ? event.sender.getURL() : '');
      if (!senderUrl.startsWith('app://telegram/')) {
        console.warn(`[Security] Blocked unauthorized IPC call to '${channel}' from '${senderUrl}'`);
        throw new Error('Unauthorized');
      }
      return fn(event, ...args);
    };

    ipcMain.handle(channel, wrappedFn);
    if (channel.startsWith('hermes:')) {
      ipcMain.handle(channel.replace('hermes:', 'ethernet:'), wrappedFn);
    }
  };

  // --- Темы ---
  regHandle('hermes:themes-list', () => {
    ensureDirs();
    const activeTheme = ethernetSettings.getTheme();
    const files = fs.readdirSync(THEMES_DIR)
      .filter((f) => f.endsWith('.css') || f.endsWith('.json') || f.endsWith('.eth') || f.endsWith('.eth-theme'));
    return files.map((f) => {
      const filePath = path.join(THEMES_DIR, f);
      let content = '';
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch {}
      const isJson = f.endsWith('.json') || f.endsWith('.eth') || f.endsWith('.eth-theme') || content.trim().startsWith('{');
      let meta = {};
      if (isJson) {
        try {
          const parsed = JSON.parse(content);
          meta = {
            name: parsed.name || f.replace(/\.(css|json|eth|eth-theme)$/, ''),
            version: cleanVersion(parsed.version || ''),
            author: parsed.author || '',
            description: parsed.description || '',
            icon: parsed.icon || '',
            pluginsCount: Array.isArray(parsed.plugins) ? parsed.plugins.length : 0,
            hasPlugins: Array.isArray(parsed.plugins) && parsed.plugins.length > 0,
          };
        } catch {}
      } else {
        const verMatch = content.match(/(?:@version|--theme-version)["':=\s]+([0-9a-zA-Z._-]+)/i);
        const nameMatch = content.match(/@name[:=\s]+([^\r\n*]+)/i) || content.match(/\/\*\s*Ethernet Telegram Theme:\s*([^\r\n*]+)/i);
        const authMatch = content.match(/@author[:=\s]+([^\r\n*]+)/i);
        const descMatch = content.match(/@description[:=\s]+([^\r\n*]+)/i);
        const iconMatch = extractSvgIcon(content);
        const pluginsMatch = content.match(/@plugins\s+(\[[\s\S]*?\])/i);
        let pluginsCount = 0;
        if (pluginsMatch) {
          try {
            const parsed = JSON.parse(pluginsMatch[1]);
            if (Array.isArray(parsed)) pluginsCount = parsed.length;
          } catch {}
        }
        meta = {
          name: nameMatch ? nameMatch[1].trim() : f.replace(/\.css$/, ''),
          version: verMatch ? cleanVersion(verMatch[1]) : '',
          author: authMatch ? authMatch[1].trim() : '',
          description: descMatch ? descMatch[1].trim() : '',
          icon: iconMatch || '',
          pluginsCount,
          hasPlugins: pluginsCount > 0,
        };
      }

      const cleanRawName = f.replace(/\.(css|json|eth|eth-theme)$/, '');
      return {
        name: f,
        rawName: cleanRawName,
        displayName: meta.name || cleanRawName,
        version: meta.version || '',
        author: meta.author || '',
        description: meta.description || '',
        icon: meta.icon || '',
        pluginsCount: meta.pluginsCount || 0,
        hasPlugins: Boolean(meta.hasPlugins),
        active: activeTheme === cleanRawName,
      };
    });
  });

  regHandle('hermes:theme-read', (_e, name) => {
    const raw = String(name || '');
    const cleanBase = path.basename(raw).replace(/[^\w\u0400-\u04FF .-]+/g, '');
    if (!cleanBase) throw new Error('bad name');
    const bareName = cleanBase.replace(/\.(css|json|eth|eth-theme)$/, '');
    const candidates = [
      path.normalize(path.join(THEMES_DIR, cleanBase)),
      path.normalize(path.join(THEMES_DIR, `${bareName}.eth`)),
      path.normalize(path.join(THEMES_DIR, `${bareName}.css`)),
      path.normalize(path.join(THEMES_DIR, `${bareName}.json`)),
      path.normalize(path.join(THEMES_DIR, `${bareName}.eth-theme`)),
    ];
    const resolvedThemes = path.resolve(THEMES_DIR);
    let target = null;
    for (const cand of candidates) {
      if (cand.toLowerCase().startsWith((resolvedThemes + path.sep).toLowerCase()) && fs.existsSync(cand)) {
        target = cand;
        break;
      }
    }
    if (!target) throw new Error('theme not found');
    return fs.readFileSync(target, 'utf8');
  });

  regHandle('hermes:theme-save', (_e, name, cssOrJson, wallpaperInfo) => {
    const raw = String(cssOrJson || '');
    const isJson = raw.trim().startsWith('{') || name.endsWith('.eth') || name.endsWith('.json') || name.endsWith('.eth-theme');
    const ext = isJson ? (name.endsWith('.eth') ? '.eth' : (name.endsWith('.json') ? '.json' : '.eth')) : '.css';
    const safe = safeName(name, ext);
    const target = path.normalize(path.join(THEMES_DIR, safe));
    const resolvedThemes = path.resolve(THEMES_DIR);
    if (!target.toLowerCase().startsWith((resolvedThemes + path.sep).toLowerCase())) throw new Error('bad path');
    fs.writeFileSync(target, raw, 'utf8');
    const cleanThemeName = safe.replace(/\.(css|json|eth|eth-theme)$/, '');
    let finalWp = wallpaperInfo;
    if (!finalWp && typeof raw === 'string') {
      const match = raw.match(/\/\*\s*@wallpaper\s*(\{[\s\S]*?\})\s*\*\//i);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed && parsed.file) finalWp = parsed;
        } catch {}
      }
      if (!finalWp) {
        const bgMatch = raw.match(/--custom-background\s*:\s*url\s*\(\s*['"]?(data:[^'"]+)['"]?\s*\)/i);
        if (bgMatch) {
          finalWp = { file: bgMatch[1], kind: 'image', slug: 'embedded' };
        }
      }
    }
    if (finalWp) {
      ethernetSettings.setThemeWallpaper(cleanThemeName, finalWp);
    } else {
      ethernetSettings.setThemeWallpaper(cleanThemeName, null);
    }
    return safe;
  });

  regHandle('hermes:theme-delete', (_e, name) => {
    const raw = String(name || '');
    const cleanBase = path.basename(raw).replace(/[^\w\u0400-\u04FF .-]+/g, '');
    if (!cleanBase) throw new Error('bad name');
    const cleanName = cleanBase.replace(/\.(css|json|eth|eth-theme)$/, '');
    const extensions = ['', '.eth', '.css', '.json', '.eth-theme'];
    for (const ext of extensions) {
      const target = path.normalize(path.join(THEMES_DIR, `${cleanName}${ext}`));
      const resolvedThemes = path.resolve(THEMES_DIR);
      if (target.toLowerCase().startsWith((resolvedThemes + path.sep).toLowerCase()) && fs.existsSync(target)) {
        try { fs.unlinkSync(target); } catch {}
      }
    }
    try {
      if (typeof ethernetSettings.removeThemeWallpaper === 'function') {
        ethernetSettings.removeThemeWallpaper(cleanName);
      } else if (typeof ethernetSettings.setThemeWallpaper === 'function') {
        ethernetSettings.setThemeWallpaper(cleanName, null);
      }
    } catch {}

    if (ethernetSettings.getTheme() === cleanName) {
      ethernetSettings.setTheme(null);
    }
    return true;
  });

  regHandle('hermes:theme-activate', (_e, name) => {
    // name = "amoled" (без .css) или null чтобы сбросить
    const newThemeName = name !== null
      ? path.basename(String(name || '')).replace(/\.(css|json|eth|eth-theme)$/i, '')
      : null;

    if (newThemeName && newThemeName.includes('..')) throw new Error('bad name');

    // Узнаём предыдущую тему
    const prevThemeName = ethernetSettings.getTheme();

    if (newThemeName !== null) {
      ethernetSettings.setTheme(newThemeName);
      const wp = ethernetSettings.getThemeWallpaper(newThemeName);

      // Автоматически управляем theme-bound плагинами
      _syncThemePlugins(prevThemeName, newThemeName);

      return { theme: newThemeName, wallpaper: wp };
    } else {
      ethernetSettings.setTheme(null);
      // Деактивируем плагины прошлой темы
      _syncThemePlugins(prevThemeName, null);
      return { theme: null, wallpaper: null };
    }
  });

  // --- Синхронизация плагинов при смене темы ---
  function _syncThemePlugins(prevTheme, nextTheme) {
    try {
      ensureDirs();
      const dirs = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
      for (const d of dirs) {
        const manifest = readJsonSafe(d.name);
        const dep = manifest.themeDependency || manifest.requiredForTheme;
        if (!dep) continue;

        const wasBoundToPrev = prevTheme && dep === prevTheme;
        const isBoundToNext = nextTheme && dep === nextTheme;

        if (wasBoundToPrev && !isBoundToNext) {
          // Деактивируем плагин старой темы
          ethernetSettings.setPluginEnabled(d.name, false);
        } else if (isBoundToNext && !wasBoundToPrev) {
          // Активируем плагин новой темы
          ethernetSettings.setPluginEnabled(d.name, true);
        }
      }
    } catch (err) {
      console.warn('[ethernet-fs] syncThemePlugins error:', err.message);
    }
  }

  // --- Плагины ---
  regHandle('hermes:plugins-list', () => {
    ensureDirs();
    return fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const manifest = readJsonSafe(d.name);
        let code = '';
        try {
          code = fs.readFileSync(path.join(PLUGINS_DIR, d.name, 'index.js'), 'utf8');
        } catch {}
        const meta = parsePluginMetadata(code);
        const declared = parseDeclaredPermissions(code, manifest);
        const storedPermissions = ethernetSettings.getPluginPermissions(d.name);
        const granted = {};
        declared.forEach((perm) => {
          granted[perm] = storedPermissions[perm] !== undefined ? storedPermissions[perm] : true;
        });
        const hasDangerousPermissions = declared.some((perm) => DANGEROUS_PERMISSIONS.has(perm));
        const hasActiveDangerousPermissions = declared.some((perm) => DANGEROUS_PERMISSIONS.has(perm) && granted[perm]);

        const rawVer = meta.version || manifest.version || '1.0.0';
        const cleanVer = cleanVersion(rawVer) || '1.0.0';

        // Синхронизируем манифест с кодом, если версия или метаданные обновились в коде
        if (cleanVer && cleanVer !== manifest.version) {
          try {
            manifest.version = cleanVer;
            if (meta.name) manifest.name = meta.name;
            if (meta.description) manifest.description = meta.description;
            if (meta.author) manifest.author = meta.author;
            if (meta.icon) manifest.icon = meta.icon;
            if (meta.themeDependency) manifest.themeDependency = meta.themeDependency;
            fs.writeFileSync(path.join(PLUGINS_DIR, d.name, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
          } catch {}
        }

        let icon = meta.icon || manifest.icon || '';
        if (!icon) {
          const iconSvg = path.join(PLUGINS_DIR, d.name, 'icon.svg');
          const iconPng = path.join(PLUGINS_DIR, d.name, 'icon.png');
          if (fs.existsSync(iconSvg)) {
            try { icon = fs.readFileSync(iconSvg, 'utf8'); } catch {}
          } else if (fs.existsSync(iconPng)) {
            try { icon = `data:image/png;base64,${fs.readFileSync(iconPng).toString('base64')}`; } catch {}
          }
        }

        return {
          id: d.name,
          name: meta.name || manifest.name || d.name,
          description: meta.description || manifest.description || '',
          version: cleanVer,
          author: meta.author || manifest.author || 'User',
          icon: icon || '',
          themeDependency: meta.themeDependency || manifest.themeDependency || manifest.requiredForTheme || undefined,
          enabled: ethernetSettings.isPluginEnabled(d.name),
          permissions: declared,
          grantedPermissions: granted,
          hasDangerousPermissions,
          hasActiveDangerousPermissions,
        };
      });
  });

  regHandle('hermes:plugin-read', (_e, id) => {
    if (!/^[\w-]+$/.test(id)) throw new Error('bad id');
    const safeId = path.basename(id);
    const dir = path.normalize(path.join(PLUGINS_DIR, safeId));
    const resolvedPlugins = path.resolve(PLUGINS_DIR);
    if (!dir.toLowerCase().startsWith((resolvedPlugins + path.sep).toLowerCase())) throw new Error('bad path');
    const read = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
    return { manifest: read('manifest.json') || '{}', code: read('index.js') };
  });

  // Статическая инспекция кода плагина перед импортом
  regHandle('hermes:plugin-inspect', (_e, payload) => {
    const code = typeof payload === 'string' ? payload : (payload && payload.code ? String(payload.code) : '');
    const manifest = (typeof payload === 'object' && payload.manifest) ? payload.manifest : {};
    const meta = parsePluginMetadata(code);
    const declared = parseDeclaredPermissions(code, manifest);
    const analysis = analyzePluginSecurity(code, declared);

    return {
      valid: analysis.valid,
      errors: analysis.errors,
      warnings: analysis.warnings,
      declaredPermissions: declared,
      hasDangerousPermissions: analysis.hasDangerousPermissions,
      dangerousPermissions: analysis.dangerousPermissions,
      metadata: { ...meta, ...manifest },
    };
  });

  // Переключение конкретного разрешения плагина
  regHandle('hermes:plugin-set-permission', (_e, id, permission, granted) => {
    if (!/^[\w-]+$/.test(id)) throw new Error('bad id');
    return ethernetSettings.setPluginPermission(id, permission, granted);
  });

  // Сохранение плагина: { id, name, description, code, permissions, grantedPermissions } -> plugins/<id>/{manifest.json,index.js}
  regHandle('hermes:plugin-save', (_e, plugin) => {
    if (!plugin || typeof plugin !== 'object') throw new Error('bad plugin');

    let candidate = '';
    if (plugin.id && typeof plugin.id === 'string') {
      candidate = String(plugin.id).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    }
    if (!candidate && plugin.name && typeof plugin.name === 'string') {
      const ruMap = {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y',
        'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
        'х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
      };
      const translit = String(plugin.name).split('').map((c) => ruMap[c.toLowerCase()] || c).join('');
      candidate = translit.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    }
    const id = (candidate || `plugin-${Date.now()}`).slice(0, 48);

    const code = String(plugin.code || '');
    let declaredPermissions = Array.isArray(plugin.permissions) ? plugin.permissions : [];
    const extractedPerms = parseDeclaredPermissions(code, { permissions: declaredPermissions });
    declaredPermissions = Array.from(new Set([...declaredPermissions, ...extractedPerms]));

    // Строгая проверка безопасности песочницы: попытки обхода блокируют сохранение
    const security = analyzePluginSecurity(code, declaredPermissions);
    if (!security.valid) {
      throw new Error(`[Security Sandbox Violation] ${security.errors.join('; ')}`);
    }

    const dir = path.normalize(path.join(PLUGINS_DIR, id));
    const resolvedPlugins = path.resolve(PLUGINS_DIR);
    if (!dir.toLowerCase().startsWith((resolvedPlugins + path.sep).toLowerCase())) throw new Error('bad path');
    fs.mkdirSync(dir, { recursive: true });

    const metaFromCode = parsePluginMetadata(code);
    const rawVer = metaFromCode.version || plugin.version || '1.0.0';
    const cleanVer = cleanVersion(rawVer) || '1.0.0';

    const manifest = {
      name: String(metaFromCode.name || plugin.name || id).slice(0, 64),
      description: String(metaFromCode.description || plugin.description || '').slice(0, 256),
      version: cleanVer.slice(0, 16),
      author: String(metaFromCode.author || plugin.author || 'User').slice(0, 32),
      permissions: declaredPermissions,
      icon: metaFromCode.icon || plugin.icon || undefined,
      themeDependency: metaFromCode.themeDependency || plugin.themeDependency || plugin.requiredForTheme || undefined,
      requiredForTheme: metaFromCode.themeDependency || plugin.requiredForTheme || plugin.themeDependency || undefined,
    };
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    fs.writeFileSync(path.join(dir, 'index.js'), code, 'utf8');

    if (plugin.grantedPermissions && typeof plugin.grantedPermissions === 'object') {
      ethernetSettings.setPluginPermissionsMap(id, plugin.grantedPermissions);
    } else {
      const initialMap = {};
      declaredPermissions.forEach((p) => { initialMap[p] = true; });
      ethernetSettings.setPluginPermissionsMap(id, initialMap);
    }

    if (plugin.enabled !== false) {
      ethernetSettings.setPluginEnabled(id, true);
    }

    return id;
  });

  regHandle('hermes:plugin-delete', (_e, id) => {
    if (!id || typeof id !== 'string') throw new Error('bad id');
    const safeId = path.basename(id.trim());
    if (!safeId) throw new Error('bad id');
    const dir = path.normalize(path.join(PLUGINS_DIR, safeId));
    const resolvedPlugins = path.resolve(PLUGINS_DIR);
    if (!dir.toLowerCase().startsWith((resolvedPlugins + path.sep).toLowerCase())) throw new Error('bad path');
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    ethernetSettings.removePlugin(safeId);
    return true;
  });

  regHandle('hermes:plugin-toggle', (_e, id) => {
    if (!id || typeof id !== 'string') throw new Error('bad id');
    const safeId = path.basename(id.trim());
    return ethernetSettings.togglePlugin(safeId);
  });

  // Системный медиа-контроль (SMTC: YouTube, Spotify и др. системные плееры)
  regHandle('hermes:media-get-system-state', async () => {
    return systemMediaService.getState();
  });

  regHandle('hermes:media-control-system', async (_e, action, value) => {
    return systemMediaService.control(action, value);
  });

  // Диалог выбора файла (для загрузки .css/.js/.eth с диска)
  regHandle('hermes:pick-file', async (_e, kind) => {
    let filters = [{ name: 'All Files', extensions: ['*'] }];
    let isBinary = false;

    if (kind === 'css' || kind === 'theme' || kind === 'eth' || kind === 'universal') {
      filters = [{ name: 'Ethernet Package (*.eth, *.css, *.json)', extensions: ['eth', 'css', 'json', 'eth-theme'] }];
    } else if (kind === 'wallpaper' || kind === 'media' || kind === 'image' || kind === 'video') {
      filters = [{ name: 'Images and Videos', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'mp4', 'webm'] }];
      isBinary = true;
    } else if (kind === 'json' || kind === 'theme-json') {
      filters = [{ name: 'Ethernet Package (*.eth, *.json)', extensions: ['eth', 'json', 'eth-theme'] }];
    } else if (kind === 'js' || kind === 'plugin') {
      filters = [{ name: 'Ethernet Plugin (*.eth, *.js, *.json)', extensions: ['eth', 'js', 'json'] }];
    }

    const res = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters,
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const file = res.filePaths[0];
    allowedPickedPaths.add(path.resolve(file));
    if (allowedPickedPaths.size > 50) {
      const oldest = allowedPickedPaths.values().next().value;
      allowedPickedPaths.delete(oldest);
    }
    if (isBinary) {
      let content = '';
      try {
        const stats = fs.statSync(file);
        if (stats.size <= 20 * 1024 * 1024) {
          content = fs.readFileSync(file).toString('base64');
        }
      } catch {}
      return { name: path.basename(file), path: file, content };
    }
    return { name: path.basename(file), path: file, content: fs.readFileSync(file, 'utf8') };
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
    // payload = { name, content/base64, originalPath, path, themeName, file, kind, color }
    if (!payload || typeof payload !== 'object') throw new Error('bad payload');
    const currentTheme = payload.themeName || ethernetSettings.getTheme() || 'default';

    // Обработка сплошного цвета без создания тяжелых файлов на диске
    if (payload.kind === 'color' || (typeof payload.file === 'string' && (payload.file.startsWith('#') || payload.file.startsWith('rgb')))) {
      const colorVal = payload.file || payload.color || payload.originalPath || '#212121';
      const wallpaperInfo = {
        slug: 'color',
        file: colorVal,
        kind: 'color',
        originalPath: colorVal,
      };
      ethernetSettings.setThemeWallpaper(currentTheme, wallpaperInfo);
      return wallpaperInfo;
    }

    // Обработка встроенных data: URI без создания файлов на диске
    if (typeof payload.file === 'string' && (payload.file.startsWith('data:image/') || payload.file.startsWith('data:video/'))) {
      const isVideo = payload.file.startsWith('data:video/') || payload.kind === 'video';
      const wallpaperInfo = {
        slug: payload.slug || 'embedded',
        file: payload.file,
        kind: isVideo ? 'video' : 'image',
        originalPath: payload.originalPath || 'embedded',
      };
      ethernetSettings.setThemeWallpaper(currentTheme, wallpaperInfo);
      return wallpaperInfo;
    }

    const sourceFilePath = payload.path || payload.originalPath;
    let hasSourceFile = Boolean(sourceFilePath && typeof sourceFilePath === 'string' && fs.existsSync(sourceFilePath));
    let rawData = payload.base64 || payload.content;
    if (rawData && typeof rawData === 'string') {
      rawData = rawData.replace(/^data:[^;]+;base64,/, '');
    }

    // Проверяем, что файл действительно был выбран пользователем в системном диалоге
    if (hasSourceFile) {
      const resolvedSource = path.resolve(sourceFilePath);
      const isAllowed = allowedPickedPaths.has(resolvedSource)
        || allowedPickedPaths.has(resolvedSource.toLowerCase())
        || allowedPickedPaths.has(path.normalize(resolvedSource))
        || allowedPickedPaths.has(path.normalize(resolvedSource).toLowerCase());
      if (!isAllowed) {
        const checkExt = path.extname(resolvedSource).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm'].includes(checkExt)) {
          allowedPickedPaths.add(resolvedSource);
          allowedPickedPaths.add(resolvedSource.toLowerCase());
        } else {
          console.warn('[Security] Ignored unverified local file path for wallpaper:', sourceFilePath);
          hasSourceFile = false;
        }
      }
    }

    if (!hasSourceFile && (!rawData || typeof rawData !== 'string')) {
      throw new Error('bad media content');
    }
    // Лимит 500MB для любых тяжелых 4K/видео-обоев
    if (rawData && rawData.length > 500 * 1024 * 1024) throw new Error('media too large');

    const ext = (path.extname(payload.name || (hasSourceFile ? sourceFilePath : '')) || '.png').toLowerCase().replace(/[^\w.]/g, '');
    if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm'].includes(ext)) {
      throw new Error('bad media type');
    }

    if (hasSourceFile) {
      const sourceExt = path.extname(sourceFilePath).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm'].includes(sourceExt)) {
        throw new Error('bad source media extension');
      }
      const fd = fs.openSync(sourceFilePath, 'r');
      const header = Buffer.alloc(16);
      fs.readSync(fd, header, 0, 16, 0);
      fs.closeSync(fd);
      if (!isSafeMediaBuffer(header)) {
        throw new Error('invalid media file header');
      }
    }

    let mediaBuffer = null;
    if (!hasSourceFile) {
      mediaBuffer = Buffer.from(rawData, 'base64');
      if (!isSafeMediaBuffer(mediaBuffer)) {
        throw new Error('invalid media data');
      }
    }

    const slug = `ethernet-${Date.now()}`;
    const filename = slug + ext;
    const resolvedWallpapers = path.resolve(WALLPAPERS_DIR);

    // Храним ТОЛЬКО последние выбранные обои: удаляем старые файлы из wallpapers/
    try {
      if (fs.existsSync(WALLPAPERS_DIR)) {
        const existing = fs.readdirSync(WALLPAPERS_DIR);
        for (const oldFile of existing) {
          if (oldFile === filename || oldFile === '.gitkeep') continue;
          try {
            const oldTarget = path.normalize(path.join(WALLPAPERS_DIR, oldFile));
            if (oldTarget.toLowerCase().startsWith((resolvedWallpapers + path.sep).toLowerCase())) {
              fs.unlinkSync(oldTarget);
            }
          } catch {}
        }
      }
    } catch {}

    const targetFile = path.normalize(path.join(WALLPAPERS_DIR, filename));
    if (!targetFile.toLowerCase().startsWith((resolvedWallpapers + path.sep).toLowerCase())) throw new Error('bad path');

    if (hasSourceFile) {
      fs.copyFileSync(sourceFilePath, targetFile);
    } else {
      fs.writeFileSync(targetFile, mediaBuffer);
    }

    const isVideo = ['.mp4', '.webm'].includes(ext);
    const wallpaperInfo = {
      slug,
      file: filename,
      kind: isVideo ? 'video' : 'image',
      originalPath: String(hasSourceFile ? sourceFilePath : (payload.name || '')).slice(0, 256),
    };
    ethernetSettings.setThemeWallpaper(currentTheme, wallpaperInfo);
    return wallpaperInfo;
  });

  regHandle('hermes:wallpaper-clear', (_e, themeName) => {
    const currentTheme = themeName || ethernetSettings.getTheme() || 'default';
    ethernetSettings.setThemeWallpaper(currentTheme, null);
    const resolvedWallpapers = path.resolve(WALLPAPERS_DIR);
    try {
      if (fs.existsSync(WALLPAPERS_DIR)) {
        const existing = fs.readdirSync(WALLPAPERS_DIR);
        for (const oldFile of existing) {
          try {
            const oldTarget = path.normalize(path.join(WALLPAPERS_DIR, oldFile));
            if (oldTarget.toLowerCase().startsWith((resolvedWallpapers + path.sep).toLowerCase())) {
              fs.unlinkSync(oldTarget);
            }
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
    if (!proxyConfig || typeof proxyConfig !== 'object') throw new Error('bad proxy config');
    const server = String(proxyConfig.server || '').trim();
    const port = Number(proxyConfig.port);
    if (!server || server.includes(';') || server.includes(' ') || server.includes('\n')) {
      throw new Error('invalid proxy host');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('invalid proxy port');
    }
    const proto = String(proxyConfig.protocol || '').toLowerCase();
    const protocol = proto === 'http' ? 'http' : (proto === 'https' ? 'https' : 'socks5');
    const cleanConfig = {
      ...proxyConfig,
      server,
      port,
      protocol,
    };
    const state = ethernetSettings.saveProxy(cleanConfig);
    const netRes = await proxyEngine.applyNetworkState();
    if (netRes && netRes.success === false) {
      return { ...state, applyError: netRes.error };
    }
    return state;
  });

  regHandle('hermes:proxy-delete', async (_e, id) => {
    const state = ethernetSettings.deleteProxy(id);
    await proxyEngine.applyNetworkState();
    return state;
  });

  regHandle('hermes:proxy-set-active', async (_e, id) => {
    const state = ethernetSettings.setActiveProxy(id);
    const netRes = await proxyEngine.applyNetworkState();
    if (netRes && netRes.success === false) {
      return { ...state, applyError: netRes.error };
    }
    return state;
  });

  regHandle('hermes:proxy-toggle', async (_e, enabled) => {
    const state = ethernetSettings.toggleProxy(enabled);
    const netRes = await proxyEngine.applyNetworkState();
    if (netRes && netRes.success === false) {
      return { ...state, applyError: netRes.error };
    }
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
