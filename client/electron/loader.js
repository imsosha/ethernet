// Ethernet Client — браузерный лоадер тем и плагинов.
// Инжектится в страницу через Electron-протокол (/ethernet/loader.js).

(function () {
  if (window.__ethernetLoader) return;
  window.__ethernetLoader = true;

  // 1. Service worker веб-клиента может закешировать HTML без лоадера — сносим.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  }

  // Горячие клавиши перезагрузки страницы
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey && e.key.toLowerCase() === 'r') || e.key === 'F5') {
      e.preventDefault();
      window.location.reload();
    }
  }, true);

  // 2. API для плагинов
  const listeners = {};
  const beforeRequestHooks = [];
  const onRequestHooks = [];
  const onUpdateHooks = [];
  const afterUpdateHooks = [];

  const ethernetApi = {
    beforeRequest(cb) {
      if (typeof cb === 'function') beforeRequestHooks.push(cb);
      return () => {
        const idx = beforeRequestHooks.indexOf(cb);
        if (idx !== -1) beforeRequestHooks.splice(idx, 1);
      };
    },
    onRequest(cb) {
      if (typeof cb === 'function') onRequestHooks.push(cb);
      return () => {
        const idx = onRequestHooks.indexOf(cb);
        if (idx !== -1) onRequestHooks.splice(idx, 1);
      };
    },
    onUpdate(cb) {
      if (typeof cb === 'function') onUpdateHooks.push(cb);
      return () => {
        const idx = onUpdateHooks.indexOf(cb);
        if (idx !== -1) onUpdateHooks.splice(idx, 1);
      };
    },
    afterUpdate(cb) {
      if (typeof cb === 'function') afterUpdateHooks.push(cb);
      return () => {
        const idx = afterUpdateHooks.indexOf(cb);
        if (idx !== -1) afterUpdateHooks.splice(idx, 1);
      };
    },
    _runBeforeRequest(method, args) {
      let currentArgs = args;
      for (const hook of onRequestHooks) {
        try { hook(method, currentArgs); } catch (e) { console.error('[ethernet:api] onRequest error', e); }
      }
      for (const hook of beforeRequestHooks) {
        try {
          const res = hook(method, currentArgs);
          if (res === false) return { cancel: true };
          if (res && typeof res === 'object') {
            if (res.cancel) return res;
            if (res.args) currentArgs = res.args;
          }
        } catch (e) {
          console.error('[ethernet:api] beforeRequest error', e);
        }
      }
      return { cancel: false, args: currentArgs };
    },
    _runOnUpdate(update) {
      let currentUpdate = update;
      for (const hook of onUpdateHooks) {
        try {
          const res = hook(currentUpdate);
          if (res === false) return { cancel: true };
          if (res && typeof res === 'object') {
            if (res.cancel) return res;
            if (res.update) currentUpdate = res.update;
            else if (res['@type']) currentUpdate = res;
          }
        } catch (e) {
          console.error('[ethernet:api] onUpdate error', e);
        }
      }
      return { cancel: false, update: currentUpdate };
    },
    _runAfterUpdate(update) {
      for (const hook of afterUpdateHooks) {
        try { hook(update); } catch (e) { console.error('[ethernet:api] afterUpdate error', e); }
      }
    },
  };

  const api = {
    version: '0.2.0',
    api: ethernetApi,
    store: {
      getGlobal: () => ({}),
      setGlobal: () => {},
      getActions: () => ({}),
      subscribe: () => () => {},
    },
    on(event, cb) {
      (listeners[event] = listeners[event] || []).push(cb);
      return () => api.off(event, cb);
    },
    off(event, cb) {
      const arr = listeners[event];
      if (arr) listeners[event] = arr.filter((f) => f !== cb);
    },
    emit(event, data) {
      (listeners[event] || []).forEach((cb) => {
        try { cb(data); } catch (e) { console.error('[ethernet] plugin handler error', e); }
      });
    },
    addStyle(css, id) {
      const el = document.createElement('style');
      if (id) el.dataset.ethernetPlugin = id;
      el.textContent = css;
      document.head.appendChild(el);
      return el;
    },
    log(...args) {
      console.log('%c[ethernet:plugin]', 'color:#8774e1;font-weight:bold', ...args);
    },
    // Парсер CSS темы в структуру EthernetMod
    parseCssToMod(css) {
      const mod = {
        colors: {},
        radii: {},
        blurTargets: {},
      };
      if (!css || typeof css !== 'string') return mod;

      const varRegex = /--([\w-]+)\s*:\s*([^;!]+)/g;
      let match;

      while ((match = varRegex.exec(css)) !== null) {
        const key = `--${match[1]}`;
        const rawVal = match[2].trim();

        if (key.startsWith('--color-')) {
          const cleanVal = rawVal.replace(/\s*!important/g, '').trim();
          if (cleanVal.startsWith('#') || cleanVal.startsWith('rgb')) {
            mod.colors[key] = cleanVal;
          }
        } else if (key === '--border-radius-ui') {
          mod.radii.ui = parseInt(rawVal, 10) || 16;
        } else if (key === '--border-radius-messages') {
          mod.radii.messages = parseInt(rawVal, 10) || 15;
        } else if (key === '--border-radius-buttons') {
          mod.radii.buttons = parseInt(rawVal, 10) || 12;
        } else if (key === '--border-radius-avatars') {
          mod.radii.avatars = parseInt(rawVal, 10) || 50;
        } else if (key === '--blur-strength') {
          mod.blurStrength = parseInt(rawVal, 10) || 0;
        } else if (key === '--blur-sidebar') {
          mod.blurTargets.sidebar = rawVal === 'true';
        } else if (key === '--blur-header') {
          mod.blurTargets.header = rawVal === 'true';
        } else if (key === '--blur-bubbles') {
          mod.blurTargets.bubbles = rawVal === 'true';
        } else if (key === '--blur-menus') {
          mod.blurTargets.menus = rawVal === 'true';
        } else if (key === '--animations-disabled') {
          mod.animationsDisabled = rawVal === 'true';
        } else if (key === '--animation-duration') {
          mod.animationDuration = parseInt(rawVal, 10) || 300;
        } else if (key === '--animation-curve') {
          mod.animationCurve = rawVal;
        } else if (key === '--chat-width') {
          mod.chatWidth = rawVal;
        } else if (key === '--message-align-own') {
          mod.messageAlignOwn = rawVal;
        } else if (key === '--message-align-other') {
          mod.messageAlignOther = rawVal;
        }
      }
      return mod;
    },
    // Живое применение темы (name без .css)
    async applyTheme(name) {
      if (!name) return;
      window.__ethernetActiveTheme = name;

      // 1. Получаем полный CSS темы
      let cssText = '';
      try {
        const res = await fetch(`/ethernet/theme/${encodeURIComponent(name)}.css`);
        if (res.ok) {
          cssText = await res.text();
        }
      } catch (err) {
        console.error('[ethernet] fetch theme css failed', err);
      }

      // Добавляем !important ко всем переменным, чтобы перебивать инлайн-стили Telegram <html style="...">
      const importantCss = cssText.replace(/(--[\w-]+)\s*:\s*([^;!]+);/g, '$1: $2 !important;');

      // 2. Монтируем/обновляем тег <style id="ethernet-active-theme-style">
      let styleEl = document.getElementById('ethernet-active-theme-style');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'ethernet-active-theme-style';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = importantCss;

      // 3. Получаем обои, привязанные к этой теме (если есть переопределение)
      let themeWallpaperFile = undefined;
      let themeWallpaperKind = undefined;
      try {
        const wpRes = await fetch(`/ethernet/wallpaper.json?theme=${encodeURIComponent(name)}`);
        if (wpRes.ok) {
          const wpData = await wpRes.json();
          if (wpData && wpData.file) {
            themeWallpaperFile = wpData.file;
            themeWallpaperKind = wpData.kind || (/\.(mp4|webm)$/i.test(wpData.file) ? 'video' : 'image');
          }
        }
      } catch (err) {
        console.error('[ethernet] fetch theme wallpaper failed', err);
      }

      // 4. Парсим мод из темы и динамически обновляем все стили
      if (cssText) {
        try {
          const mod = api.parseCssToMod(cssText);
          if (themeWallpaperFile !== undefined) {
            mod.wallpaperFile = themeWallpaperFile;
            mod.wallpaperKind = themeWallpaperKind;
          }
          applyModSettings(mod);
        } catch (e) {
          console.error('[ethernet] error applying mod from theme', e);
        }
      } else if (themeWallpaperFile !== undefined) {
        applyWallpaper({ wallpaperFile: themeWallpaperFile, wallpaperKind: themeWallpaperKind });
      }

      window.dispatchEvent(new CustomEvent('ethernet:theme-changed', { detail: { name } }));
    },
    applyMod(mod) {
      applyModSettings(mod);
    },
    wallpaperSet(file, kind) {
      activeWallpaperFile = file;
      activeWallpaperKind = kind || (file && /\.(mp4|webm)$/i.test(file) ? 'video' : 'image');
      applyWallpaper({ wallpaperFile: file, wallpaperKind: activeWallpaperKind });
    },
    wallpaperClear() {
      activeWallpaperFile = null;
      activeWallpaperKind = null;
      applyWallpaper({ wallpaperFile: null });
    },
    // Выключить тему: вернуть стили к сохраненным значениям темы По умолчанию
    async clearTheme() {
      const styleEl = document.getElementById('ethernet-active-theme-style');
      if (styleEl) styleEl.remove();
      const link = document.querySelector('link[data-ethernet-theme]');
      if (link) link.remove();
      if (window.__ethernetActiveTheme) {
        document.documentElement.classList.remove(`theme-${window.__ethernetActiveTheme}`);
      }
      window.__ethernetActiveTheme = null;

      try {
        const modRes = await fetch('/ethernet/mod.json');
        if (modRes.ok) {
          const mod = await modRes.json();
          if (mod) {
            window.__ethernetMod = mod;
            applyModSettings(mod);
            if (mod.wallpaperFile) {
              applyWallpaper({ wallpaperFile: mod.wallpaperFile, wallpaperKind: mod.wallpaperKind });
            }
          }
        }
      } catch {
        applyModSettings({
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
            '--color-text-meta-colored': '#58a6ff',
            '--color-background-own': '#1e3a5f',
            '--color-chat-active': '#2b3d58',
          },
          chatWidth: 'wide',
        });
      }

      window.dispatchEvent(new CustomEvent('ethernet:theme-changed', { detail: { name: null } }));
    },
  };
  window.ethernet = api;
  window.hermes = api;

  // Хук на клавиатуру для плагинов (горячие клавиши)
  document.addEventListener('keydown', (e) => api.emit('keydown', { key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey }));

  // 3. Загрузка и немедленное применение темы и настроек мода при старте
  function loadAndApplyAll() {
    ensureActiveWallpaper();
    fetch('/ethernet/config.json')
      .then((r) => r.json())
      .then((cfg) => {
        if (cfg && cfg.theme) api.applyTheme(cfg.theme);
      })
      .catch(() => { });

    fetch('/ethernet/mod.json')
      .then((r) => r.json())
      .then((mod) => {
        if (mod) {
          window.__ethernetMod = mod;
          applyModSettings(mod);
        }
      })
      .catch(() => { });
  }

  // 4. Загрузка активных плагинов
  function handlePluginCrash(pluginId, errorMessage) {
    console.error(`[ethernet:safe-mode] Plugin "${pluginId}" crashed:`, errorMessage);
    if (window.hermesDesktop?.reportPluginCrash) {
      window.hermesDesktop.reportPluginCrash(pluginId, errorMessage || 'Unhandled runtime error');
    }
    window.__ethernetSafeMode = true;
    window.__hermesSafeMode = true;

    function notify() {
      const actions = window.ethernet?.store?.getActions?.() || window.hermes?.store?.getActions?.();
      if (actions?.showNotification) {
        actions.showNotification({
          message: `🛡️ Плагин "${pluginId}" вызвал сбой! Активирован безопасный режим.`,
        });
        return true;
      }
      return false;
    }

    if (!notify()) {
      window.addEventListener('ethernet:ready', notify, { once: true });
      window.addEventListener('hermes:ready', notify, { once: true });
    }
  }

  // Crash Guard for plugins: traps unhandled errors and activates Safe Mode
  window.addEventListener('error', (event) => {
    try {
      const filename = event.filename || '';
      const stack = event.error?.stack || '';
      if (filename.includes('/plugins/') || stack.includes('/plugins/')) {
        const match = (filename || stack).match(/\/plugins\/([^/]+)\//);
        const pluginId = match ? decodeURIComponent(match[1]) : 'unknown';
        handlePluginCrash(pluginId, event.message || 'Unhandled runtime error');
      }
    } catch {
      // ignore
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    try {
      const stack = event.reason?.stack || '';
      if (stack.includes('/plugins/')) {
        const match = stack.match(/\/plugins\/([^/]+)\//);
        const pluginId = match ? decodeURIComponent(match[1]) : 'unknown';
        handlePluginCrash(pluginId, event.reason?.message || String(event.reason));
      }
    } catch {
      // ignore
    }
  });

  if (window.hermesDesktop?.lastCrashedPluginGet) {
    window.hermesDesktop.lastCrashedPluginGet().then((crashed) => {
      if (crashed && crashed.id) {
        function notifyStartup() {
          const actions = window.ethernet?.store?.getActions?.() || window.hermes?.store?.getActions?.();
          if (actions?.showNotification) {
            actions.showNotification({
              message: `🛡️ Плагин "${crashed.id}" вызвал сбой. Активирован безопасный режим.`,
            });
            return true;
          }
          return false;
        }
        if (!notifyStartup()) {
          window.addEventListener('ethernet:ready', notifyStartup, { once: true });
          window.addEventListener('hermes:ready', notifyStartup, { once: true });
        }
      }
    }).catch(() => {});
  }

  function loadActivePlugins() {
    fetch('/ethernet/plugins/manifests.json')
      .then((r) => r.json())
      .then((plugins) => {
        if (!Array.isArray(plugins)) return;
        plugins.filter((p) => p && p.enabled).forEach((p) => {
          if (document.querySelector(`script[data-ethernet-plugin="${p.id}"]`)) return;
          const s = document.createElement('script');
          s.src = `/ethernet/plugins/${encodeURIComponent(p.id)}/index.js`;
          s.dataset.ethernetPlugin = p.id;
          s.onerror = (e) => {
            handlePluginCrash(p.id, 'Failed to load plugin script');
          };
          document.head.appendChild(s);
        });
        const activeCount = plugins.filter((p) => p && p.enabled).length;
        if (activeCount > 0) {
          console.info(`[ethernet] loaded ${activeCount} active plugin(s)`);
        }
      })
      .catch((e) => {
        console.error('[ethernet] error loading plugins manifests', e);
      });
  }

  loadAndApplyAll();
  loadActivePlugins();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      loadAndApplyAll();
      loadActivePlugins();
    });
  }
  window.addEventListener('load', () => {
    loadAndApplyAll();
    loadActivePlugins();
  });
  setTimeout(loadAndApplyAll, 300);
  setTimeout(loadAndApplyAll, 1200);

  // Следим за сменой light/dark
  let lastClientTheme = document.documentElement.className.match(/theme-(light|dark)/)?.[1];
  setInterval(() => {
    const cur = document.documentElement.className.match(/theme-(light|dark)/)?.[1];
    if (cur !== lastClientTheme) {
      lastClientTheme = cur;
      if (window.__ethernetActiveTheme) api.applyTheme(window.__ethernetActiveTheme);
    }
  }, 500);

  let modStyleEl = null;

  function ensureModStyle() {
    if (!modStyleEl) {
      modStyleEl = document.createElement('style');
      modStyleEl.id = 'ethernet-mod-style';
      document.head.appendChild(modStyleEl);
    }
    return modStyleEl;
  }

  function applyModSettings(mod) {
    window.__ethernetMod = mod || {};
    mod = mod || {};
    document.documentElement.setAttribute('data-message-align-own', mod.messageAlignOwn || 'right');
    document.documentElement.setAttribute('data-message-align-other', mod.messageAlignOther || 'left');
    const css = [];

    // --- Шрифт (нативная системная типографика без размытия) ---
    css.push(`
      :root {
        --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif !important;
        --font-family-monospace: ui-monospace, "SF Mono", "Menlo", Monaco, Consolas, monospace !important;
        --font-weight-normal: 400 !important;
        --font-weight-medium: 500 !important;
        --font-weight-semibold: 600 !important;
        --font-weight-bold: 700 !important;
        --font-weight-black: 800 !important;
      }

      body, input, textarea, select, .message-content, .text-content, .Message,
      .ListItem .subtitle, .color-label, .settings-item-description,
      .chat-item-last-message, .composer-input, p {
        font-family: var(--font-family) !important;
        font-weight: 400 !important;
      }

      /* Заголовки, титулы, имя пользователя, чаты, жирный текст */
      h1, h2, h3, h4, .title, .peer-title, .chat-title, .MiddleHeader h3,
      .settings-item-header, .theme-editor-section-header, .theme-editor-group-title,
      b, strong, .bold, .modal-title, .chat-info-wrapper .title, .user-name,
      .ListItem .title, .ChatInfo .title {
        font-family: var(--font-family) !important;
        font-weight: 500 !important;
      }

      /* Аватары без фото (буквы и инициалы) */
      .Avatar, .Avatar > .inner, .Avatar .letters, .Avatar.no-photo {
        font-family: var(--font-family) !important;
        font-weight: 600 !important;
      }
    `);

    // --- Цвета: применяем к htmlStyle ---
    const hasColors = mod.colors && Object.keys(mod.colors).length > 0;
    const htmlStyle = document.documentElement.style;

    function hexToRgb(hex) {
      if (!hex || typeof hex !== 'string') return [135, 66, 224];
      const clean = hex.replace(/^#/, '');
      if (clean.length === 3) {
        return [
          parseInt(clean[0] + clean[0], 16) || 0,
          parseInt(clean[1] + clean[1], 16) || 0,
          parseInt(clean[2] + clean[2], 16) || 0,
        ];
      }
      return [
        parseInt(clean.slice(0, 2), 16) || 0,
        parseInt(clean.slice(2, 4), 16) || 0,
        parseInt(clean.slice(4, 6), 16) || 0,
      ];
    }

    if (hasColors) {
      for (const [k, v] of Object.entries(mod.colors)) {
        const cleanVal = (v || '').replace(/\s*!important/g, '').trim();
        if (cleanVal && /^#[0-9a-fA-F]{6}$/.test(cleanVal)) htmlStyle.setProperty(k, cleanVal, 'important');
      }
      window.__ethernetPrevColors = { ...mod.colors };
    } else if (window.__ethernetPrevColors) {
      for (const k of Object.keys(window.__ethernetPrevColors)) {
        htmlStyle.removeProperty(k);
      }
      window.__ethernetPrevColors = null;
    }

    const primaryRaw = (hasColors && mod.colors['--color-primary']) || '#8742e0';
    const primaryHex = primaryRaw.replace(/\s*!important/g, '').trim();
    const linksColor = hasColors && mod.colors['--color-links'];

    // Плавность смены цветов
    css.push(`
      .bubble, #LeftColumn, #MiddleColumn, .middle-column-header,
      body, #Main, .background {
        transition: background-color 0.2s cubic-bezier(0.33, 1, 0.68, 1), color 0.2s cubic-bezier(0.33, 1, 0.68, 1), border-color 0.2s cubic-bezier(0.33, 1, 0.68, 1);
      }
    `);

    // Анимации и плавность переходов интерфейса
    if (mod.animationsDisabled) {
      css.push(`
        :root {
          --slide-transition: 0ms linear !important;
          --layer-transition: 0ms linear !important;
        }
      `);
    } else if (mod.animationDuration || mod.animationCurve) {
      const dur = mod.animationDuration ? `${mod.animationDuration}ms` : '300ms';
      const curve = mod.animationCurve ? `cubic-bezier(${mod.animationCurve})` : 'cubic-bezier(0.33, 1, 0.68, 1)';
      css.push(`
        :root {
          --slide-transition: ${dur} ${curve} !important;
          --layer-transition: ${dur} ${curve} !important;
          --animation-duration: ${dur} !important;
        }
      `);
    }

    if (hasColors && mod.colors['--color-primary']) {
      const primaryHex = mod.colors['--color-primary'];
      const [pr, pg, pb] = hexToRgb(primaryHex);
      css.push(`
        :root {
          --color-primary: ${primaryHex} !important;
          --color-primary-rgb: ${pr}, ${pg}, ${pb} !important;
          --color-primary-shade: color-mix(in srgb, ${primaryHex} 88%, black) !important;
          --color-primary-shade-darker: color-mix(in srgb, ${primaryHex} 80%, black) !important;
          --color-primary-shade-rgb: ${Math.round(pr * 0.88)}, ${Math.round(pg * 0.88)}, ${Math.round(pb * 0.88)} !important;
          --color-active: ${primaryHex} !important;
          --color-active-darker: color-mix(in srgb, ${primaryHex} 80%, black) !important;
          --color-badge: ${primaryHex} !important;
          --color-badge-active: ${primaryHex} !important;
          --color-badge-unread: ${primaryHex} !important;
          --color-primary-tint: color-mix(in srgb, ${primaryHex} 12%, transparent) !important;
          --color-primary-opacity: color-mix(in srgb, ${primaryHex} 15%, transparent) !important;
          --color-primary-opacity-hover: color-mix(in srgb, ${primaryHex} 25%, transparent) !important;
          --color-text-meta-colored: ${primaryHex} !important;
          --color-accent-own: ${primaryHex} !important;
          --color-reply-active: ${primaryHex} !important;
          --color-reply-own-active: ${primaryHex} !important;
          --color-reply-own-hover: color-mix(in srgb, ${primaryHex} 25%, transparent) !important;
          --color-reply-own-hover-apple: color-mix(in srgb, ${primaryHex} 25%, transparent) !important;
          --color-reply-own-active-apple: color-mix(in srgb, ${primaryHex} 35%, transparent) !important;
          --color-voice-transcribe-button: ${primaryHex} !important;
          --color-voice-transcribe-button-own: color-mix(in srgb, ${primaryHex} 35%, transparent) !important;
          --color-message-reaction-chosen: ${primaryHex} !important;
          --color-message-reaction-chosen-hover: color-mix(in srgb, ${primaryHex} 85%, black) !important;
          --color-message-reaction-own: color-mix(in srgb, ${primaryHex} 30%, transparent) !important;
          --color-message-reaction-hover-own: color-mix(in srgb, ${primaryHex} 45%, transparent) !important;
          --color-interactive-active: ${primaryHex} !important;
          --color-telegram-blue: ${primaryHex} !important;
          --accent-color: ${primaryHex} !important;
          --accent-background-color: color-mix(in srgb, ${primaryHex} 15%, transparent) !important;
          --accent-background-active-color: color-mix(in srgb, ${primaryHex} 25%, transparent) !important;
          --color-selection-highlight: ${primaryHex} !important;
          --color-selection-highlight-emoji: color-mix(in srgb, ${primaryHex} 70%, transparent) !important;
        }

        /* Выделение текста */
        ::selection {
          background-color: color-mix(in srgb, ${primaryHex} 35%, transparent) !important;
          color: var(--color-text, #ffffff) !important;
        }

        /* Все уведомления, индикаторы и бейджи чатов/топиков/папок */
        .badge:not(.pinned):not(.muted):not([class*="muted"]),
        .Badge:not(.pinned):not(.muted):not([class*="muted"]),
        .right-badge.unread,
        .right-badge.active,
        .ChatBadge .unread,
        .ChatBadge .mention,
        .ChatBadge .unopened,
        .ChatBadge .round,
        .ChatFolderTabList .badgeActive,
        [class*="ChatFolderTabList"] [class*="badgeActive"],
        [class*="badgeActive"],
        [class*="badge-active"],
        .ScrollDownButton .unread-count,
        .ScrollDownButton [class*="unread-count"],
        .ListItem .unread:not(.muted):not([class*="muted"]) {
          background: var(--color-primary) !important;
          background-color: var(--color-primary) !important;
          color: var(--color-white, #ffffff) !important;
        }

        /* Голосовые сообщения: убираем случайную заливку с таймера */
        .voice-duration,
        .voice-duration.unread,
        .voice-duration * {
          background: transparent !important;
          background-color: transparent !important;
        }

        .voice-duration.unread::after {
          background-color: var(--color-primary) !important;
        }

        /* Галочки прочтения */
        .MessageOutgoingStatus,
        .LastMessageMeta .MessageOutgoingStatus,
        .MessageOutgoingStatus .icon-message-read,
        .MessageOutgoingStatus .icon-message-succeeded {
          color: var(--color-text-meta-colored, ${primaryHex}) !important;
        }

        /* Чекбоксы, свитчеры, радиокнопки, слайдеры */
        .Checkbox.checkbox-input input:checked + .Checkbox-main,
        .Checkbox-main.is-checked,
        .Switcher input:checked + .Switcher-main,
        .Switcher-main.is-checked,
        .Radio-main.is-checked,
        .Radio input:checked + .Radio-main,
        .RangeSlider .RangeSlider__fill,
        .RangeSlider .RangeSlider__thumb {
          background-color: var(--color-primary) !important;
          border-color: var(--color-primary) !important;
        }

        .Button.primary, button.Button.primary, .theme-editor-actions > button:not(.translucent) {
          --button-active-background-color: color-mix(in srgb, var(--color-primary) 85%, black) !important;
          --button-no-ripple-background-color: color-mix(in srgb, var(--color-primary) 80%, black) !important;
          background-color: var(--color-primary) !important;
          color: var(--color-white, #fff) !important;
        }

        .Button.primary:hover:not(:disabled),
        .Button.primary:focus:not(:disabled),
        .Button.primary:active:not(:disabled),
        button.Button.primary:hover:not(:disabled),
        .theme-editor-actions > button:not(.translucent):hover {
          background-color: color-mix(in srgb, var(--color-primary) 85%, black) !important;
          color: var(--color-white, #fff) !important;
        }

        /* Активные вкладки, папки и индикаторы */
        .ChatFolderTabList .Tab.active,
        .TabList .Tab.active,
        .Tab.active,
        .MediaTabs .Tab.active,
        .EmojiTabs .Tab.active,
        .StickerPicker .Tab.active {
          color: var(--color-primary) !important;
        }

        .Tab.active::after,
        .TabList .active::after,
        .ChatFolderTabList .active::after {
          background-color: var(--color-primary) !important;
          background: var(--color-primary) !important;
        }

        /* Аудиоплеер и голосовые */
        .AudioPlayer .seekline .fill,
        .AudioPlayer .volume .fill,
        .AudioPlayer .toggle-play,
        .AudioPlayer-play-button,
        .VoiceNote .waveform-bar.played,
        .Audio .waveform-bar.played {
          background-color: var(--color-primary) !important;
        }

        /* Реакции */
        .ReactionButton.is-chosen,
        .ReactionButton.chosen,
        .ReactionSelector .chosen,
        [class*="ReactionButton"].chosen,
        [class*="ReactionButton"][class*="chosen"] {
          background-color: color-mix(in srgb, var(--color-primary) 22%, transparent) !important;
          border-color: var(--color-primary) !important;
        }

        /* Закрепленные сообщения и шапка */
        .PinnedMessage .pin-icon,
        .PinnedMessage::before,
        .pinned-message-bar::before {
          color: var(--color-primary) !important;
          background-color: var(--color-primary) !important;
        }

        /* Спиннеры и круги загрузки */
        .ProgressSpinner,
        .radial-progress,
        .ProgressRing circle,
        .progress-circle {
          stroke: var(--color-primary) !important;
        }
      `);
    }

    if (hasColors && mod.colors['--color-text-meta-colored']) {
      const checkHex = mod.colors['--color-text-meta-colored'];
      css.push(`
        :root {
          --color-text-meta-colored: ${checkHex} !important;
        }
        .MessageOutgoingStatus,
        .LastMessageMeta .MessageOutgoingStatus,
        .MessageOutgoingStatus .icon-message-read,
        .MessageOutgoingStatus .icon-message-succeeded {
          color: ${checkHex} !important;
        }
      `);
    }

    const ownBgHex = (hasColors && mod.colors['--color-background-own']) || '#2d2d2d';
    const secBgHex = (hasColors && mod.colors['--color-background-secondary']) || '#181818';

    css.push(`
      :root {
        --color-background-own: ${ownBgHex} !important;
        --color-background-own-apple: ${ownBgHex} !important;
        --color-background-own-selected: color-mix(in srgb, ${ownBgHex} 82%, black) !important;
        --color-background-secondary: ${secBgHex} !important;
      }

      /* Фон обычных сообщений с контентом */
      .Message.own {
        --background-color: var(--color-background-own, ${ownBgHex}) !important;
      }
      .Message:not(.own) {
        --background-color: var(--color-background-secondary, ${secBgHex}) !important;
      }
      .Message.own.selected {
        --background-color: var(--color-background-own-selected, color-mix(in srgb, ${ownBgHex} 82%, black)) !important;
      }
      .Message:not(.own).selected {
        --background-color: var(--color-background-selected, #161616) !important;
      }

      .Message.own .message-content.has-solid-background,
      .message-content.own.has-solid-background,
      .Message.own .album-item-container {
        background-color: var(--color-background-own, ${ownBgHex}) !important;
      }

      .Message:not(.own) .message-content.has-solid-background,
      .message-content:not(.own).has-solid-background {
        background-color: var(--color-background-secondary, ${secBgHex}) !important;
      }

      /* Стикеры, эмодзи и круглые видео-сообщения (кружочки) строго БЕЗ фона */
      .message-content.custom-shape,
      .message-content.emoji-only,
      .message-content.round,
      .message-content.sticker,
      .Message.custom-shape .message-content,
      .Message.round .message-content,
      .Message.emoji-only .message-content {
        background: transparent !important;
        background-color: transparent !important;
        box-shadow: none !important;
      }

      /* Хвостики (уголки) сообщений — цвет строго совпадает с фоном пузыря */
      .svg-appendix defs,
      .svg-appendix filter {
        display: none !important;
      }
      .svg-appendix {
        overflow: visible !important;
      }
      .svg-appendix .corner {
        fill: var(--background-color, var(--color-background-secondary, ${secBgHex})) !important;
      }

      /* Свои сообщения (исходящие справа по умолчанию) */
      .Message.own .svg-appendix .corner,
      .Message.own .svg-appendix .corner-right,
      .Message.own .svg-appendix path,
      .message-content.own .svg-appendix .corner,
      .message-content.own .svg-appendix .corner-right,
      .message-content.own .svg-appendix path {
        fill: var(--color-background-own, ${ownBgHex}) !important;
      }
      .Message.own .svg-appendix .corner-right {
        display: block !important;
        fill: var(--color-background-own, ${ownBgHex}) !important;
      }
      .Message.own .svg-appendix .corner-left {
        display: none !important;
      }

      /* Чужие сообщения (входящие слева по умолчанию) */
      .Message:not(.own) .svg-appendix .corner,
      .Message:not(.own) .svg-appendix .corner-left,
      .Message:not(.own) .svg-appendix path,
      .message-content:not(.own) .svg-appendix .corner,
      .message-content:not(.own) .svg-appendix .corner-left,
      .message-content:not(.own) .svg-appendix path {
        fill: var(--color-background-secondary, ${secBgHex}) !important;
      }
      .Message:not(.own) .svg-appendix .corner-left {
        display: block !important;
        fill: var(--color-background-secondary, ${secBgHex}) !important;
      }
      .Message:not(.own) .svg-appendix .corner-right {
        display: none !important;
      }

      /* Кастомные хвостики медиа (альбомы, фото, инвойсы) */
      .message-content[data-has-custom-appendix] .svg-appendix .corner,
      .message-content[data-has-custom-appendix] .svg-appendix path {
        fill: var(--appendix-bg, var(--background-color)) !important;
      }

      .Message:not(.own) .message-content.has-appendix {
        border-bottom-left-radius: 0 !important;
        --border-bottom-left-radius: 0 !important;
        border-bottom-right-radius: var(--border-radius-messages) !important;
        --border-bottom-right-radius: var(--border-radius-messages) !important;
      }
      .Message.own .message-content.has-appendix {
        border-bottom-right-radius: 0 !important;
        --border-bottom-right-radius: 0 !important;
        border-bottom-left-radius: var(--border-radius-messages) !important;
        --border-bottom-left-radius: var(--border-radius-messages) !important;
      }

      .Message .Audio,
      .Message.own .Audio {
        background: transparent !important;
        background-color: transparent !important;
      }

      /* Кнопка комментариев под сообщением (полное совпадение с фоном пузыря и без полоски-разделителя) */
      .CommentButton {
        border-top: none !important;
        border: none !important;
      }
      .Message.own .CommentButton {
        background: var(--color-background-own, ${ownBgHex}) !important;
        background-color: var(--color-background-own, ${ownBgHex}) !important;
      }
      .Message:not(.own) .CommentButton {
        background: var(--color-background-secondary, ${secBgHex}) !important;
        background-color: var(--color-background-secondary, ${secBgHex}) !important;
      }
    `);

    if (hasColors && mod.colors['--color-chat-active']) {
      const chatActiveHex = mod.colors['--color-chat-active'];
      css.push(`
        :root {
          --color-chat-active: ${chatActiveHex} !important;
          --color-chat-active-greyed: color-mix(in srgb, ${chatActiveHex} 75%, white 25%) !important;
        }

        .Chat.active,
        .ListItem.active,
        .ListItem-button.active,
        .chat-item.active,
        .ChatList .Chat.active {
          background-color: var(--color-chat-active, ${chatActiveHex}) !important;
          background: var(--color-chat-active, ${chatActiveHex}) !important;
        }
      `);
    } else if (hasColors && mod.colors['--color-primary']) {
      const primaryHex = mod.colors['--color-primary'];
      css.push(`
        :root {
          --color-chat-active: color-mix(in srgb, ${primaryHex} 30%, var(--color-background-secondary, #181818)) !important;
          --color-chat-active-greyed: color-mix(in srgb, ${primaryHex} 20%, var(--color-background-secondary, #181818)) !important;
        }
      `);
    }

    if (hasColors && mod.colors['--color-borders']) {
      const bordersHex = mod.colors['--color-borders'];
      css.push(`
        :root {
          --color-borders: ${bordersHex} !important;
          --color-borders-input: ${bordersHex} !important;
          --color-borders-alternate: ${bordersHex} !important;
        }
      `);
    }

    // Если в теме задан отдельный цвет для цветного текста (ссылок, хэштегов)
    if (linksColor && /^#[0-9a-fA-F]{6}$/.test(linksColor)) {
      css.push(`
        :root {
          --color-links: ${linksColor} !important;
          --color-own-links: ${linksColor} !important;
        }

        .text-entity-link,
        .text-entity-link:visited,
        .Message .text-entity-link,
        .Message .hashtag,
        .Message .bot-command,
        .Message .mention,
        .Message .mention-name,
        a,
        a:hover,
        a:visited,
        .Link,
        .message-content a,
        .text-entity-link a {
          color: ${linksColor} !important;
        }
      `);
    }

    const secTextColor = hasColors && mod.colors['--color-text-secondary'];
    if (secTextColor && /^#[0-9a-fA-F]{6}$/.test(secTextColor)) {
      css.push(`
        :root {
          --color-text-secondary: ${secTextColor} !important;
          --color-text-meta: ${secTextColor} !important;
        }
      `);
    }

    // --- Цитаты, ответы и моноширинный код ---
    css.push(`
      :root {
        --color-code: var(--color-links) !important;
        --color-code-bg: color-mix(in srgb, var(--color-links) 12%, transparent) !important;
        --color-code-own: var(--color-links) !important;
        --color-code-own-bg: color-mix(in srgb, var(--color-links) 15%, transparent) !important;
        --accent-background-color: color-mix(in srgb, var(--color-background-secondary, var(--color-background)) 82%, black 18%) !important;
      }

      /* Копируемый моноширинный текст (код) */
      .text-entity-code,
      .text-entity-pre,
      .text-entity-pre code,
      .code-block,
      code,
      .pre-code,
      .text-entity-code.clickable {
        color: var(--color-links) !important;
        background: color-mix(in srgb, var(--color-links) 12%, transparent) !important;
        background-color: color-mix(in srgb, var(--color-links) 12%, transparent) !important;
      }

      .Message.own .text-entity-code,
      .Message.own .text-entity-pre,
      .Message.own code,
      .message-content.own .text-entity-code,
      .message-content.own code {
        color: var(--color-links) !important;
        background: color-mix(in srgb, var(--color-links) 16%, transparent) !important;
        background-color: color-mix(in srgb, var(--color-links) 16%, transparent) !important;
      }

      /* Цитаты и ответы цитатами: фон от сообщения, цвет полосы — строго от автора цитаты (peer-color) */
      blockquote,
      .blockquote,
      .pullquote,
      [class*="Pullquote"],
      .EmbeddedMessage,
      [class*="EmbeddedMessage"],
      .WebPage {
        background-color: color-mix(in srgb, var(--color-background-secondary, var(--color-background)) 82%, black 18%) !important;
        background: color-mix(in srgb, var(--color-background-secondary, var(--color-background)) 82%, black 18%) !important;
      }

      .Message.own blockquote,
      .Message.own .blockquote,
      .Message.own .pullquote,
      .Message.own [class*="Pullquote"],
      .Message.own .EmbeddedMessage,
      .Message.own [class*="EmbeddedMessage"],
      .Message.own .WebPage,
      .message-content.own blockquote,
      .message-content.own .blockquote,
      .message-content.own .pullquote,
      .message-content.own .EmbeddedMessage,
      .message-content.own [class*="EmbeddedMessage"],
      .message-content.own .WebPage {
        background-color: color-mix(in srgb, var(--color-background-own) 80%, black 20%) !important;
        background: color-mix(in srgb, var(--color-background-own) 80%, black 20%) !important;
      }

      /* Ответ цитатой в поле ввода (Composer) */
      .ComposerEmbeddedMessage,
      .ComposerEmbeddedMessage_inner,
      .ComposerEmbeddedMessage .EmbeddedMessage {
        background-color: color-mix(in srgb, var(--color-background-secondary, var(--color-background)) 86%, black 14%) !important;
        background: color-mix(in srgb, var(--color-background-secondary, var(--color-background)) 86%, black 14%) !important;
      }
    `);

    // --- Обои: изолированный слой под окном и прозрачность фона чата ---
    css.push(`
      #ethernet-wallpaper-layer {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: -9999 !important;
        pointer-events: none !important;
        overflow: hidden !important;
        background-position: center !important;
        background-size: cover !important;
        background-repeat: no-repeat !important;
      }

      #ethernet-video-wallpaper {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        pointer-events: none !important;
      }

      html[data-ethernet-wallpaper="true"],
      html[data-ethernet-wallpaper="true"] body,
      html[data-ethernet-wallpaper="true"] #root,
      html[data-ethernet-wallpaper="true"] #Main,
      html[data-ethernet-wallpaper="true"] #MiddleColumn,
      html[data-ethernet-wallpaper="true"] #MiddleColumn .messages-layout,
      html[data-ethernet-wallpaper="true"] #MiddleColumn .messages-container,
      html[data-ethernet-wallpaper="true"] #MiddleColumn .MessageList,
      html[data-ethernet-wallpaper="true"] #MiddleColumn .Transition,
      html[data-ethernet-wallpaper="true"] #MiddleColumn .Transition_slide {
        background: transparent !important;
        background-color: transparent !important;
      }
    `);

    // --- Сайдбар профиля/информации: точная копия острова меню чатов слева (скругление, фон, отступы, компактность) ---
    css.push(`
      #Main #RightColumn-wrapper,
      #RightColumn-wrapper {
        display: none !important;
        pointer-events: none !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        bottom: 0 !important;
        right: auto !important;
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
        z-index: 10 !important;
        background: transparent !important;
        background-color: transparent !important;
      }

      #Main.right-column-open #RightColumn-wrapper,
      #Main.right-column-animating #RightColumn-wrapper {
        display: block !important;
        visibility: visible !important;
      }

      #RightColumn-wrapper .overlay-backdrop {
        display: none !important;
        pointer-events: none !important;
      }

      #Main #RightColumn-wrapper #RightColumn,
      #Main #RightColumn,
      #RightColumn {
        position: absolute !important;
        top: 0.5rem !important;
        left: 0.5rem !important;
        bottom: 0.5rem !important;
        right: auto !important;
        width: var(--left-column-custom-width, var(--left-column-width, 26.5rem)) !important;
        max-width: calc(100vw - 1rem) !important;
        height: calc(100% - 1rem) !important;
        border-radius: var(--border-radius-island, 1.5625rem) !important;
        box-shadow: var(--shadow-island) !important;
        overflow: hidden !important;
        transform: translateX(-1.5rem) !important;
        opacity: 0 !important;
        pointer-events: none !important;
        background-color: var(--color-background) !important;
        background: var(--color-background) !important;
        transition: transform var(--slide-transition, 250ms cubic-bezier(0.33, 1, 0.68, 1)), opacity var(--slide-transition, 250ms ease) !important;
      }

      #Main.right-column-open #RightColumn-wrapper #RightColumn,
      #Main.right-column-open #RightColumn {
        left: 0.5rem !important;
        right: auto !important;
        transform: translateX(0) !important;
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      #LeftColumn,
      #Main #LeftColumn {
        margin: 0.5rem 0 0.5rem 0.5rem !important;
        height: calc(100% - 1rem) !important;
      }

      .ArchivedChats,
      .ArchivedChats .left-header,
      .ArchivedChats .chat-list-wrapper,
      .ArchivedChats .chat-list {
        background-color: var(--color-background) !important;
        background: var(--color-background) !important;
      }

      #FoldersSidebar,
      #Main #FoldersSidebar {
        margin: 0.5rem 0 0.5rem 0.5rem !important;
        height: calc(100% - 1rem) !important;
      }

      #MiddleColumn .MiddleHeader,
      #MiddleColumn .MiddleHeaderPanesIsland {
        margin-top: 0.5rem !important;
      }

      #MiddleColumn .middle-column-footer {
        margin-bottom: 0.5rem !important;
        padding-bottom: 0 !important;
      }

      /* Полное скрытие скроллбара в профиле/сайдбаре, сохраняя прокрутку */
      #RightColumn,
      #RightColumn *,
      #RightColumn .custom-scroll,
      #RightColumn .Profile,
      #RightColumn .panel-content,
      #RightColumn .Management {
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
        --scrollbar-width: 0px !important;
      }

      #RightColumn::-webkit-scrollbar,
      #RightColumn *::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
        background: transparent !important;
      }

      /* Симметричные отступы карточек профиля без искажений от скроллбара */
      #RightColumn [class*="chatExtraBlock"],
      #RightColumn .chatExtraBlock,
      #RightColumn [class*="sharedMediaTabs"],
      #RightColumn .sharedMediaTabs,
      #RightColumn [class*="linkedCommunityIsland"],
      #RightColumn .linkedCommunityIsland {
        margin-inline-end: 1rem !important;
        padding-inline-end: 1rem !important;
      }

      #RightColumn .RightHeader {
        height: var(--column-header-height, 3.5rem) !important;
        padding: 0.5rem 0.8125rem !important;
        display: flex !important;
        align-items: center !important;
        background-color: var(--color-background) !important;
        background: var(--color-background) !important;
        backdrop-filter: none !important;
      }

      #RightColumn > .Transition,
      #RightColumn .panel-content,
      #RightColumn .Management,
      #RightColumn .ManagementScreens,
      #RightColumn .TabList,
      #RightColumn [class*="sharedMedia"],
      #RightColumn [class*="chatExtra"] {
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        background-color: var(--color-background) !important;
        background: var(--color-background) !important;
      }

      @media (max-width: 600px) {
        #RightColumn {
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          width: 100vw !important;
          height: 100% !important;
          border-radius: 0 !important;
        }
      }

      /* Центральная колонка чата: 100% стабильна и полноразмерна, без артефактов правого сайдбара */
      :root, #Main, #MiddleColumn {
        --right-column-width: 0px !important;
        --right-column-content-width: 0px !important;
        --messages-container-width: 100% !important;
      }

      #MiddleColumn,
      #MiddleColumn .messages-layout,
      #MiddleColumn .messages-layout > .Transition,
      #MiddleColumn .messages-layout > .Transition > .Transition_slide,
      #MiddleColumn .MessageList {
        width: 100% !important;
        max-width: 100% !important;
        align-items: stretch !important;
        transform: none !important;
      }

      #MiddleColumn .MessageList,
      #MiddleColumn .MessageList .messages-container,
      #MiddleColumn .messages-layout,
      #MiddleColumn .AudioPlayer,
      #MiddleColumn .MiddleSearch,
      #MiddleColumn .DropArea {
        transform: none !important;
      }

      #Main.right-column-open #MiddleColumn,
      #Main.right-column-open #MiddleColumn .messages-layout,
      #Main.right-column-open #MiddleColumn .MessageList,
      #Main.right-column-shown #MiddleColumn .messages-layout,
      #Main.right-column-animating #MiddleColumn .messages-layout,
      #Main.narrow-message-list #MiddleColumn .messages-layout,
      #Main.narrow-message-list #MiddleColumn .MessageList {
        width: 100% !important;
        transform: none !important;
      }

      /* Идеальное полноразмерное позиционирование шапки, футера и чата на всю доступную ширину */
      #MiddleColumn .MiddleHeader {
        position: absolute !important;
        top: 0.5rem !important;
        left: 0.5rem !important;
        right: 0.5rem !important;
        width: auto !important;
        max-width: none !important;
        margin: 0 !important;
        transform: none !important;
        z-index: 12 !important;
      }

      #MiddleColumn .MiddleHeaderPanesIsland {
        position: absolute !important;
        top: calc(0.5rem + var(--middle-header-height, 3.5rem) + 0.35rem) !important;
        left: 0.5rem !important;
        right: 0.5rem !important;
        width: auto !important;
        max-width: none !important;
        margin: 0 !important;
        transform: none !important;
        z-index: 11 !important;
      }

      #MiddleColumn .middle-column-footer {
        position: absolute !important;
        bottom: 0.5rem !important;
        left: 0.5rem !important;
        right: 0.5rem !important;
        width: auto !important;
        max-width: none !important;
        margin: 0 !important;
        transform: none !important;
        display: flex !important;
        justify-content: center !important;
        align-items: flex-end !important;
        padding: 0 !important;
      }

      #MiddleColumn .middle-column-footer .Composer,
      #MiddleColumn .middle-column-footer .Composer.is-chat-composer,
      .Composer.is-chat-composer {
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        display: flex !important;
        justify-content: center !important;
      }

      #MiddleColumn .middle-column-footer .Composer .composer-wrapper,
      .Composer.is-chat-composer .composer-wrapper {
        flex: 1 1 auto !important;
        min-width: 0 !important;
        max-width: calc(100% - var(--composer-main-button-width, 2.5rem) - var(--composer-row-gap, 0.25rem)) !important;
        box-sizing: border-box !important;
      }

      #MiddleColumn .middle-column-footer .Composer .message-input-wrapper,
      .Composer.is-chat-composer .message-input-wrapper {
        flex: 1 1 auto !important;
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
      }

      #MiddleColumn .middle-column-footer .Composer #message-input-text,
      .Composer.is-chat-composer #message-input-text,
      #MiddleColumn .middle-column-footer .Composer .form-control,
      #MiddleColumn .middle-column-footer .Composer .input-scroller,
      #MiddleColumn .middle-column-footer .Composer .input-scroller-content {
        flex: 1 1 auto !important;
        width: 100% !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
      }

      /* Базовые стили центрирования сообщений и гарантия вертикального отступа от шапки и поля ввода */
      #MiddleColumn .MessageList .messages-container,
      #MiddleColumn .messages-container {
        padding-top: calc(var(--middle-header-height, 3.5rem) + 1.25rem) !important;
        padding-left: 0.5rem !important;
        padding-right: 0.5rem !important;
        padding-bottom: max(var(--message-list-bottom-inset, 5.5rem), 5.5rem) !important;
        box-sizing: border-box !important;
      }

      /* Строка сообщения ВСЕГДА занимает 100% ширины контейнера сообщений */
      #MiddleColumn .message-date-group,
      #MiddleColumn .Message,
      .Message {
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
    `);

    // --- Ширина чата: синхронизированные размеры шапки, сообщений и поля ввода (full, wide, default) ---
    if (mod.chatWidth === 'full') {
      css.push(`
        :root, #Main, #MiddleColumn {
          --messages-container-width: calc(100% - 1rem) !important;
        }

        #MiddleColumn .MiddleHeader {
          position: absolute !important;
          top: 0.5rem !important;
          left: 0.5rem !important;
          right: 0.5rem !important;
          width: auto !important;
          max-width: none !important;
          margin: 0 !important;
          transform: none !important;
          z-index: 12 !important;
        }

        #MiddleColumn .MiddleHeaderPanesIsland {
          position: absolute !important;
          top: calc(0.5rem + var(--middle-header-height, 3.5rem) + 0.35rem) !important;
          left: 0.5rem !important;
          right: 0.5rem !important;
          width: auto !important;
          max-width: none !important;
          margin: 0 !important;
          transform: none !important;
          z-index: 11 !important;
        }

        #MiddleColumn .middle-column-footer {
          position: absolute !important;
          bottom: 0.5rem !important;
          left: 0.5rem !important;
          right: 0.5rem !important;
          width: auto !important;
          max-width: none !important;
          margin: 0 !important;
          transform: none !important;
          display: flex !important;
          justify-content: center !important;
          align-items: flex-end !important;
          padding: 0 !important;
        }

        #MiddleColumn .MessageList .messages-container,
        #MiddleColumn .messages-container {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding-left: 1rem !important;
          padding-right: 1rem !important;
        }

        #MiddleColumn .Message {
          --max-width: min(65rem, 85vw) !important;
        }

        #MiddleColumn .message-content-wrapper,
        #MiddleColumn .message-content {
          max-width: min(65rem, 85vw) !important;
        }

        #MiddleColumn .Album {
          width: 100% !important;
          max-width: 95% !important;
        }
      `);
    } else if (mod.chatWidth === 'wide') {
      css.push(`
        :root, #Main, #MiddleColumn {
          --messages-container-width: min(65rem, calc(100% - 1rem)) !important;
        }

        #MiddleColumn .MiddleHeader,
        #MiddleColumn .MiddleHeaderPanesIsland,
        #MiddleColumn .middle-column-footer {
          position: absolute !important;
          left: 50% !important;
          right: auto !important;
          transform: translateX(-50%) !important;
          width: min(65rem, calc(100% - 1rem)) !important;
          max-width: min(65rem, calc(100% - 1rem)) !important;
          box-sizing: border-box !important;
        }

        #MiddleColumn .MiddleHeader {
          top: 0.5rem !important;
          margin: 0 !important;
          z-index: 12 !important;
        }

        #MiddleColumn .MiddleHeaderPanesIsland {
          top: calc(0.5rem + var(--middle-header-height, 3.5rem) + 0.35rem) !important;
          margin: 0 !important;
          z-index: 11 !important;
        }

        #MiddleColumn .middle-column-footer {
          bottom: 0.5rem !important;
          margin: 0 !important;
          display: flex !important;
          justify-content: center !important;
          align-items: flex-end !important;
          padding: 0 !important;
        }

        #MiddleColumn .MessageList .messages-container,
        #MiddleColumn .messages-container {
          width: min(65rem, calc(100% - 1rem)) !important;
          max-width: min(65rem, calc(100% - 1rem)) !important;
          margin-left: auto !important;
          margin-right: auto !important;
        }

        #MiddleColumn .Message {
          --max-width: min(48rem, 75vw) !important;
        }

        #MiddleColumn .message-content-wrapper,
        #MiddleColumn .message-content {
          max-width: min(48rem, 75vw) !important;
        }
      `);
    } else {
      css.push(`
        :root, #Main, #MiddleColumn {
          --messages-container-width: min(47.5rem, calc(100% - 1rem)) !important;
        }

        #MiddleColumn .MiddleHeader,
        #MiddleColumn .MiddleHeaderPanesIsland,
        #MiddleColumn .middle-column-footer {
          position: absolute !important;
          left: 50% !important;
          right: auto !important;
          transform: translateX(-50%) !important;
          width: min(47.5rem, calc(100% - 1rem)) !important;
          max-width: min(47.5rem, calc(100% - 1rem)) !important;
          box-sizing: border-box !important;
        }

        #MiddleColumn .MiddleHeader {
          top: 0.5rem !important;
          margin: 0 !important;
          z-index: 12 !important;
        }

        #MiddleColumn .MiddleHeaderPanesIsland {
          top: calc(0.5rem + var(--middle-header-height, 3.5rem) + 0.35rem) !important;
          margin: 0 !important;
          z-index: 11 !important;
        }

        #MiddleColumn .middle-column-footer {
          bottom: 0.5rem !important;
          margin: 0 !important;
          display: flex !important;
          justify-content: center !important;
          align-items: flex-end !important;
          padding: 0 !important;
        }

        #MiddleColumn .MessageList .messages-container,
        #MiddleColumn .messages-container {
          width: min(47.5rem, calc(100% - 1rem)) !important;
          max-width: min(47.5rem, calc(100% - 1rem)) !important;
          margin-left: auto !important;
          margin-right: auto !important;
        }

        #MiddleColumn .Message {
          --max-width: 32rem !important;
        }

        #MiddleColumn .message-content-wrapper,
        #MiddleColumn .message-content {
          max-width: 32rem !important;
        }
      `);
    }

    /* Защита кнопок от обрезки и ложного многоточия */
    css.push(`
      .Button,
      .Button *,
      .anim-preset,
      .anim-preset *,
      .theme-editor-actions > button,
      .theme-editor-actions > button * {
        text-overflow: clip !important;
      }

      /* Гарантированное удержание сообщений внутри границ чата */
      .Message,
      .message-content-wrapper,
      .message-content,
      .with-subheader {
        min-width: 0 !important;
      }

      .message-content {
        max-width: var(--max-width, 30rem) !important;
        box-sizing: border-box !important;
      }

      /* Выравнивание своих сообщений (Слева / По центру / Справа) */
      html[data-message-align-own="left"] .Message.own {
        flex-direction: row !important;
        justify-content: flex-start !important;
      }
      html[data-message-align-own="left"] .Message.own .quick-reaction {
        left: auto !important;
        right: -0.875rem !important;
      }
      html[data-message-align-own="center"] .Message.own {
        flex-direction: row !important;
        justify-content: center !important;
      }
      html[data-message-align-own="center"] .Message.own .quick-reaction {
        left: auto !important;
        right: -0.875rem !important;
      }
      html[data-message-align-own="right"] .Message.own {
        flex-direction: row-reverse !important;
        justify-content: flex-start !important;
      }

      /* Выравнивание чужих сообщений (Слева / По центру / Справа) */
      html[data-message-align-other="right"] .Message:not(.own) {
        flex-direction: row-reverse !important;
        justify-content: flex-start !important;
        padding-left: 0 !important;
      }
      html[data-message-align-other="right"] .Message:not(.own):has(> .Avatar) {
        padding-right: 2.5rem !important;
      }
      html[data-message-align-other="right"] .Message:not(.own):not(:has(> .Avatar)) {
        padding-right: 0 !important;
      }
      html[data-message-align-other="right"] .Message:not(.own) > .Avatar {
        left: auto !important;
        right: 0 !important;
        margin-right: 0 !important;
        margin-left: 0.3125rem !important;
      }
      html[data-message-align-other="right"] .Message:not(.own) .quick-reaction {
        right: auto !important;
        left: -0.75rem !important;
      }
      html[data-message-align-other="center"] .Message:not(.own) {
        flex-direction: row !important;
        justify-content: center !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
      }
      html[data-message-align-other="center"] .Message:not(.own) > .Avatar {
        position: static !important;
        margin-right: 0.5rem !important;
      }
      html[data-message-align-other="left"] .Message:not(.own) {
        flex-direction: row !important;
        justify-content: flex-start !important;
      }
    `);

    // Заголовки меню и кнопка открытия меню
    css.push(`
      #LeftMainHeader,
      #LeftMainHeader.left-header,
      #LeftMainHeader .main-menu,
      #LeftMainHeader .DropdownMenu {
        background-color: transparent !important;
        background: transparent !important;
        box-shadow: none !important;
        border: none !important;
        outline: none !important;
      }

      #LeftMainHeader .Button,
      #LeftMainHeader .Button.round,
      #LeftMainHeader button {
        background-color: transparent !important;
        background: transparent !important;
        box-shadow: none !important;
        border: none !important;
        outline: none !important;
      }

      #LeftMainHeader .Button:hover,
      #LeftMainHeader .Button.round:hover {
        background-color: rgba(255, 255, 255, 0.08) !important;
      }

      .left-header {
        background-color: var(--color-background-sidebar, transparent) !important;
        backdrop-filter: none !important;
      }

      .left-header.secondary, #Settings .left-header {
        background-color: var(--color-background-secondary) !important;
        backdrop-filter: none !important;
      }

      .badge,
      .unread-count,
      .ChatBadge,
      [class*="ChatBadge_badge"],
      [class*="ChatFolderTabList_badge"],
      .avatar-badge,
      .monoforum-badge,
      .unreadCountButton,
      .Tab .badge,
      .Folder .badge {
        font-family: inherit !important;
        font-size: 0.75rem !important;
        font-weight: 400 !important;
      }
    `);

    // --- Скругления: раздельные типы объектов ---
    if (mod.radii || mod.borderRadius !== undefined) {
      const rUi = mod.radii?.ui !== undefined ? Number(mod.radii.ui) : (mod.borderRadius !== undefined ? Number(mod.borderRadius) : 16);
      const rMsg = mod.radii?.messages !== undefined ? Number(mod.radii.messages) : (mod.borderRadius !== undefined ? Number(mod.borderRadius) : 15);
      const rBtn = mod.radii?.buttons !== undefined ? Number(mod.radii.buttons) : (mod.borderRadius !== undefined ? Math.max(2, Number(mod.borderRadius) - 4) : 12);
      const rAv = mod.radii?.avatars !== undefined ? Number(mod.radii.avatars) : 50;

      css.push(`
        :root {
          --border-radius-island: ${(rUi + 8) / 16}rem !important;
          --border-radius-modal: ${(rUi + 16) / 16}rem !important;
          --border-radius-default: ${rUi / 16}rem !important;
          --border-radius-pane: ${(rUi + 8) / 16}rem !important;

          --border-radius-messages: ${rMsg / 16}rem !important;
          --border-radius-messages-small: ${Math.max(2, rMsg - 8) / 16}rem !important;

          --border-radius-button: ${rBtn / 16}rem !important;
          --border-radius-default-small: ${Math.max(2, rBtn - 4) / 16}rem !important;
          --border-radius-default-tiny: ${Math.max(2, rBtn - 8) / 16}rem !important;
          --composer-pill-radius: 1.5rem !important;
          --composer-control-radius: 1.25rem !important;

          --avatar-radius: ${rAv}% !important;
        }

        .Composer.is-chat-composer {
          border-radius: 1.5rem !important;
        }

        .Composer .Button.main-button {
          border-radius: 1.25rem !important;
        }

        .Avatar, .Avatar > .inner, .avatar-like, .ChatAvatar, .user-avatar, .avatar-element, img.avatar {
          border-radius: ${rAv}% !important;
        }

        .bubble, .ListItem-button, #LeftColumn, #MiddleColumn, .MiddleHeader, .Composer, .Avatar, .Button, .Island {
          transition: border-radius 0.25s cubic-bezier(0.33, 1, 0.68, 1);
        }
      `);
    }

    // --- Блюр: точечное применение по выбранным чекбоксам (Шапка, Меню) ---
    const strength = Number(mod.blurStrength || 0);
    if (strength > 0 && mod.blurTargets) {
      if (mod.blurTargets.header) {
        css.push(`
          .middle-column-header, .MiddleHeader, .MiddleHeaderPanesIsland {
            backdrop-filter: blur(${strength}px) saturate(180%) !important;
            -webkit-backdrop-filter: blur(${strength}px) saturate(180%) !important;
            background-color: color-mix(in srgb, var(--color-background) 65%, transparent) !important;
          }
          .MiddleHeader .header-tools {
            background-color: transparent !important;
            box-shadow: none !important;
          }
        `);
      }
      if (mod.blurTargets.menus) {
        css.push(`
          .Menu .bubble, .modal-dialog, .drop-down, .DropdownMenu .Menu .bubble {
            backdrop-filter: blur(${strength}px) saturate(180%) !important;
            -webkit-backdrop-filter: blur(${strength}px) saturate(180%) !important;
            background-color: color-mix(in srgb, var(--color-background-secondary, #181818) 88%, transparent) !important;
            border: none !important;
          }
        `);
      }
    }

    // Служебные и сервисные плашки сообщений (даты, уведомления)
    css.push(`
      .ActionMessage .bubble,
      .action-message-content {
        background-color: rgba(0, 0, 0, 0.55) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        color: #ffffff !important;
        border-radius: var(--border-radius-messages, 12px) !important;
      }

      /* Универсальные стили тултипов, подсказок и плашек ввода/форматирования в стиле Ethernet */
      .rich-editor-tooltips-host .root,
      [class*="RichEditorTooltip_root"],
      .RichEditorTooltip_root,
      [class*="EmojiTooltip_root"],
      .EmojiTooltip_root,
      [class*="MentionTooltip_root"],
      .MentionTooltip_root,
      [class*="InlineBotTooltip_root"],
      .InlineBotTooltip_root,
      [class*="StickerTooltip_root"],
      .StickerTooltip_root,
      [class*="CustomEmojiTooltip_root"],
      .CustomEmojiTooltip_root,
      [class*="TextFormatter_root"],
      .TextFormatter_root,
      [class*="TextFormatter_inputPopup"],
      .lovely-chart--tooltip,
      .emoji-tooltip {
        font-family: var(--font-family, "SF Pro Display", "SF Pro Text", "SF Pro", sans-serif) !important;
        background: color-mix(in srgb, var(--color-background-secondary, #181818) 90%, transparent) !important;
        background-color: color-mix(in srgb, var(--color-background-secondary, #181818) 90%, transparent) !important;
        backdrop-filter: blur(20px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
        border: 1px solid color-mix(in srgb, var(--color-borders, #2f2f2f) 45%, transparent) !important;
        border-radius: var(--border-radius-default, 12px) !important;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45) !important;
        color: var(--color-text, #ebebeb) !important;
      }

      /* Плавающий системный тултип при наведении на любые элементы с title */
      #ethernet-floating-tooltip {
        position: fixed !important;
        z-index: 999999 !important;
        pointer-events: none !important;
        padding: 5px 11px !important;
        font-family: var(--font-family, "SF Pro Display", "SF Pro Text", "SF Pro", sans-serif) !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        line-height: 1.3 !important;
        color: var(--color-text, #ffffff) !important;
        background: color-mix(in srgb, var(--color-background-secondary, #141414) 92%, transparent) !important;
        background-color: color-mix(in srgb, var(--color-background-secondary, #141414) 92%, transparent) !important;
        backdrop-filter: blur(16px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
        border: 1px solid color-mix(in srgb, var(--color-borders, #333333) 50%, transparent) !important;
        border-radius: 8px !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45) !important;
        opacity: 0;
        transform: translateY(3px) scale(0.97);
        transition: opacity 0.14s ease, transform 0.14s cubic-bezier(0.2, 0.9, 0.3, 1) !important;
        white-space: pre-wrap !important;
        max-width: 340px !important;
        word-break: break-word !important;
      }

      #ethernet-floating-tooltip.visible {
        opacity: 1 !important;
        transform: translateY(0) scale(1) !important;
      }
    `);

    // --- Анимации: управление переходами во всём клиенте ---
    if (mod.animationsDisabled) {
      css.push(`
        :root, body, #Main, #LeftColumn, #MiddleColumn, #RightColumn, .Transition, .Transition > *, .bubble, .Button, .ListItem-button {
          --layer-transition: 0.001s linear !important;
          --slide-transition: 0.001s linear !important;
          --pane-slide-transition: 0.001s linear !important;
          --top-stack-transition: 0.001s linear !important;
          --select-transition: 0.001s linear !important;
          --slide-header-transition: 0.001s linear !important;
          --dropdown-transition: 0.001s linear !important;
          --modal-transition: 0.001s linear !important;
          transition-duration: 0.001s !important;
          animation-duration: 0.001s !important;
        }
      `);
    } else if (mod.animationDuration !== undefined && mod.animationDuration !== null) {
      const d = Number(mod.animationDuration);
      const curve = mod.animationCurve || '0.33, 1, 0.68, 1';
      css.push(`
        :root, body, #Main, #LeftColumn, #MiddleColumn, #RightColumn, #MiddleColumn .messages-layout, #MiddleColumn .Composer {
          --layer-transition: ${d}ms cubic-bezier(${curve}) !important;
          --layer-transition-behind: ${d}ms cubic-bezier(${curve}) !important;
          --slide-transition: ${d}ms cubic-bezier(${curve}) !important;
          --top-stack-transition: ${d}ms cubic-bezier(${curve}) !important;
          --select-transition: ${d}ms cubic-bezier(${curve}) !important;
          --pane-slide-transition: ${d}ms cubic-bezier(${curve}) !important;
          --slide-header-transition: ${d}ms cubic-bezier(${curve}) !important;
          --dropdown-transition: ${d}ms cubic-bezier(${curve}) !important;
          --modal-transition: ${d}ms cubic-bezier(${curve}) !important;
          --composer-button-transition: border-radius 0.15s, opacity var(--select-transition), transform var(--select-transition), background-color 0.15s, color 0.15s !important;
        }

        .Transition, .Transition > *, .sliding-sub-tabs, .Transition-slide {
          transition-duration: ${d}ms !important;
          transition-timing-function: cubic-bezier(${curve}) !important;
        }
      `);
    }


    // --- Скругленное выделение сообщений (вместо прямоугольного на весь экран) ---
    css.push(`
      .Message::before,
      .ActionMessage::before {
        left: 0.5rem !important;
        right: 0.5rem !important;
        top: 0.125rem !important;
        bottom: 0.125rem !important;
        border-radius: var(--border-radius-messages, 1rem) !important;
      }
    `);

    // --- Расположение сообщений (с полной адаптацией хвостика и скруглений углов в цепочках) ---
    if (mod.messageAlignOwn === 'left') {
      css.push(`
        .Message.own {
          flex-direction: row !important;
          --border-top-right-radius: var(--border-radius-messages) !important;
          --border-bottom-right-radius: var(--border-radius-messages) !important;
          --border-top-left-radius: var(--border-radius-messages) !important;
          --border-bottom-left-radius: var(--border-radius-messages) !important;
        }

        .Message.own.first-in-group:not(.last-in-group) {
          --border-bottom-left-radius: var(--border-radius-messages-small) !important;
          --border-bottom-right-radius: var(--border-radius-messages) !important;
        }

        .Message.own:not(.first-in-group):not(.last-in-group) {
          --border-top-left-radius: var(--border-radius-messages-small) !important;
          --border-bottom-left-radius: var(--border-radius-messages-small) !important;
          --border-top-right-radius: var(--border-radius-messages) !important;
          --border-bottom-right-radius: var(--border-radius-messages) !important;
        }

        .Message.own.last-in-group:not(.first-in-group) {
          --border-top-left-radius: var(--border-radius-messages-small) !important;
          --border-top-right-radius: var(--border-radius-messages) !important;
        }

        .Message.own.last-in-group {
          --border-bottom-left-radius: var(--border-radius-messages-small) !important;
          --border-bottom-right-radius: var(--border-radius-messages) !important;
        }

        .Message.own .message-content.has-appendix,
        .Message.own.last-in-group .message-content.has-appendix,
        .Message.own .has-appendix {
          --border-bottom-left-radius: 0 !important;
          border-bottom-left-radius: 0 !important;
          --border-bottom-right-radius: var(--border-radius-messages) !important;
          border-bottom-right-radius: var(--border-radius-messages) !important;
        }

        .Message.own .svg-appendix {
          left: -0.562rem !important;
          right: auto !important;
          transform: none !important;
        }

        .Message.own .svg-appendix .corner-left {
          display: block !important;
          fill: var(--color-background-own, ${ownBgHex}) !important;
        }

        .Message.own .svg-appendix .corner-right {
          display: none !important;
        }
      `);
    } else if (mod.messageAlignOwn === 'center') {
      css.push(`
        .Message.own {
          justify-content: center !important;
          flex-direction: row !important;
          --border-top-left-radius: var(--border-radius-messages) !important;
          --border-top-right-radius: var(--border-radius-messages) !important;
          --border-bottom-left-radius: var(--border-radius-messages) !important;
          --border-bottom-right-radius: var(--border-radius-messages) !important;
        }
        .Message.own .svg-appendix {
          display: none !important;
        }
        .Message.own .message-content {
          border-radius: var(--border-radius-messages) !important;
        }
      `);
    }

    if (mod.messageAlignOther === 'right') {
      css.push(`
        .Message:not(.own):not(.document-group-member) {
          flex-direction: row-reverse !important;
          padding-left: 0 !important;
          padding-right: 2.5rem !important;
          --border-top-left-radius: var(--border-radius-messages) !important;
          --border-bottom-left-radius: var(--border-radius-messages) !important;
          --border-top-right-radius: var(--border-radius-messages) !important;
          --border-bottom-right-radius: var(--border-radius-messages) !important;
        }

        .Message:not(.own):not(.document-group-member) > .Avatar {
          left: auto !important;
          right: 0 !important;
          margin-left: 0.3125rem !important;
          margin-right: 0 !important;
        }

        .Message:not(.own):not(.document-group-member).first-in-group:not(.last-in-group) {
          --border-bottom-right-radius: var(--border-radius-messages-small) !important;
          --border-bottom-left-radius: var(--border-radius-messages) !important;
        }

        .Message:not(.own):not(.document-group-member):not(.first-in-group):not(.last-in-group) {
          --border-top-right-radius: var(--border-radius-messages-small) !important;
          --border-bottom-right-radius: var(--border-radius-messages-small) !important;
          --border-top-left-radius: var(--border-radius-messages) !important;
          --border-bottom-left-radius: var(--border-radius-messages) !important;
        }

        .Message:not(.own):not(.document-group-member).last-in-group:not(.first-in-group) {
          --border-top-right-radius: var(--border-radius-messages-small) !important;
          --border-top-left-radius: var(--border-radius-messages) !important;
        }

        .Message:not(.own):not(.document-group-member).last-in-group {
          --border-bottom-right-radius: var(--border-radius-messages-small) !important;
          --border-bottom-left-radius: var(--border-radius-messages) !important;
        }

        .Message:not(.own):not(.document-group-member).last-in-group .message-content.has-appendix {
          --border-bottom-right-radius: 0 !important;
          border-bottom-right-radius: 0 !important;
          --border-bottom-left-radius: var(--border-radius-messages) !important;
          border-bottom-left-radius: var(--border-radius-messages) !important;
        }

        .Message:not(.own):not(.document-group-member) .svg-appendix {
          right: -0.551rem !important;
          left: auto !important;
          transform: scaleX(-1) !important;
        }
      `);
    } else if (mod.messageAlignOther === 'center') {
      css.push(`
        .Message:not(.own):not(.document-group-member) {
          justify-content: center !important;
          padding-left: 0 !important;
          --border-top-left-radius: var(--border-radius-messages) !important;
          --border-top-right-radius: var(--border-radius-messages) !important;
          --border-bottom-left-radius: var(--border-radius-messages) !important;
          --border-bottom-right-radius: var(--border-radius-messages) !important;
        }
        .Message:not(.own):not(.document-group-member) > .Avatar {
          display: none !important;
        }
        .Message:not(.own):not(.document-group-member) .svg-appendix {
          display: none !important;
        }
        .Message:not(.own):not(.document-group-member) .message-content {
          border-radius: var(--border-radius-messages) !important;
        }
      `);
    }

    // --- Обои: стили строго для корневого фонового слоя приложения (#Main) ---
    css.push(`
      #ethernet-wallpaper-layer {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        z-index: 0;
        pointer-events: none;
        overflow: hidden;
        background-color: #000;
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        display: none;
      }

      [data-ethernet-wallpaper="true"] #ethernet-wallpaper-layer {
        display: block !important;
      }

      #ethernet-wallpaper-layer video {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        background-color: #000;
        z-index: 0;
      }

      /* Прозрачность ТОЛЬКО для корневых подложек чата при включенных обоях (сообщения остаются непрозрачными) */
      [data-ethernet-wallpaper="true"] body,
      [data-ethernet-wallpaper="true"] html,
      [data-ethernet-wallpaper="true"] #Main,
      [data-ethernet-wallpaper="true"] #Main > div:first-child,
      [data-ethernet-wallpaper="true"] #Main > .background,
      [data-ethernet-wallpaper="true"] #Main > [class*="_background_"],
      [data-ethernet-wallpaper="true"] #MiddleColumn,
      [data-ethernet-wallpaper="true"] #MiddleColumn > .messages-layout,
      [data-ethernet-wallpaper="true"] .MessageList.with-default-bg,
      [data-ethernet-wallpaper="true"] .MessageList.with-custom-bg {
        background-color: transparent !important;
        background: transparent !important;
      }

      /* Скрываем дудл-канвасы и градиенты только в корневом фоне #Main */
      [data-ethernet-wallpaper="true"] #Main > div:first-child canvas,
      [data-ethernet-wallpaper="true"] #Main > .background canvas,
      [data-ethernet-wallpaper="true"] #Main > [class*="_background_"] canvas,
      [data-ethernet-wallpaper="true"] #Main > div:first-child [class*="gradientCanvas"],
      [data-ethernet-wallpaper="true"] #Main > [class*="_background_"] [class*="gradientCanvas"],
      [data-ethernet-wallpaper="true"] .gradientCanvas,
      [data-ethernet-wallpaper="true"] svg.pattern,
      [data-ethernet-wallpaper="true"] [class*="Pattern"] {
        display: none !important;
        opacity: 0 !important;
      }

      [data-ethernet-wallpaper="true"] #Main > div:first-child::after,
      [data-ethernet-wallpaper="true"] #Main > .background::after,
      [data-ethernet-wallpaper="true"] #Main > [class*="_background_"]::after,
      [data-ethernet-wallpaper="true"] #Main > .background::before,
      [data-ethernet-wallpaper="true"] #Main > [class*="_background_"]::before,
      [data-ethernet-wallpaper="true"] #MiddleColumn::before,
      [data-ethernet-wallpaper="true"] #MiddleColumn::after {
        display: none !important;
        background-image: none !important;
      }

      /* 100% НЕПРОЗРАЧНЫЕ ПЛАШКИ СООБЩЕНИЙ */
      .Message .message-content,
      .Message.own .message-content,
      .Message:not(.own) .message-content {
        opacity: 1 !important;
      }

      .Message:not(.own) .message-content.has-solid-background,
      .Message:not(.own) .message-content.has-background,
      .Message:not(.own) .message-content.text {
        background-color: var(--color-background-secondary, #212328) !important;
        background: var(--color-background-secondary, #212328) !important;
        color: var(--color-text, #f3f4f6) !important;
      }

      .Message.own .message-content.has-solid-background,
      .Message.own .message-content.has-background,
      .Message.own .message-content.text {
        background-color: var(--color-background-own, #1e3a5f) !important;
        background: var(--color-background-own, #1e3a5f) !important;
        color: var(--color-text, #f3f4f6) !important;
      }

      /* Четкая типографика и жирность заголовков */
      .fullName,
      .title,
      .Chat .title,
      .Chat .fullName,
      .MiddleHeader .title,
      .MiddleHeader .fullName,
      .ChatInfo .fullName,
      .ChatInfo .title,
      .ListItem .title,
      .ListItem .fullName,
      h1, h2, h3, h4, h5, h6 {
        font-weight: 600 !important;
      }

      body, p, span, .message-content, .ListItem .subtitle, .last-message {
        font-weight: 400;
      }

      strong, b, .bold {
        font-weight: 700 !important;
      }

      /* Названия чатов, каналов и пользователей всегда используют основной цвет текста, а не цвет цветных ссылок */
      .Chat .title,
      .Chat .fullName,
      .Chat .info .fullName,
      .ListItem .title,
      .ListItem .fullName,
      .title .fullName {
        color: var(--color-text, #f3f4f6) !important;
      }

      .Chat.selected .title,
      .Chat.selected .fullName,
      .Chat.selected .info .fullName,
      .ListItem.selected .title,
      .ListItem.selected .fullName {
        color: var(--color-white, #ffffff) !important;
      }

      /* Устранение белого фона при наведении на кнопки, поиск и чаты */
      :root {
        --color-chat-hover: rgba(255, 255, 255, 0.08) !important;
        --color-interactive-hover: rgba(255, 255, 255, 0.08) !important;
        --action-message-bg: rgba(22, 23, 26, 0.78) !important;
      }

      .Button.round:not(:active):hover,
      .Button.translucent:not(:active):hover,
      .Button.faded:not(:active):hover,
      .Button.smaller:not(:active):hover,
      .Button.icon:not(:active):hover,
      .HeaderActions .Button:not(:active):hover,
      .LeftSearch-header .Button:not(:active):hover,
      .SearchInput:hover,
      .SearchInput.is-focused,
      .Chat:not(.selected):hover .ListItem-button,
      .ListItem:not(.selected):hover .ListItem-button {
        --background-color: rgba(255, 255, 255, 0.08) !important;
        background-color: rgba(255, 255, 255, 0.08) !important;
      }

      .Chat.selected .ListItem-button,
      .ListItem.selected .ListItem-button {
        --background-color: var(--color-chat-active, #2b3d58) !important;
        background-color: var(--color-chat-active, #2b3d58) !important;
      }

      /* Плашки дат и сервисных сообщений (убираем зеленый оттенок Telegram) */
      .sticky-date > span,
      .local-action-message > span,
      .ActionMessage > span,
      .message-date-group > span,
      .unread-messages-count {
        background-color: rgba(22, 23, 26, 0.78) !important;
        background: rgba(22, 23, 26, 0.78) !important;
        color: var(--color-text, #f3f4f6) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        border: 1px solid rgba(255, 255, 255, 0.06) !important;
        font-weight: 500 !important;
      }

      /* Стили кастомного тултипа Telegram */
      #ethernet-tooltip {
        position: fixed;
        z-index: 999999;
        pointer-events: none;
        background: rgba(22, 22, 26, 0.88) !important;
        backdrop-filter: blur(20px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
        color: #ffffff !important;
        font-family: var(--font-family) !important;
        font-size: 0.8125rem !important;
        font-weight: 400 !important;
        line-height: 1.25 !important;
        padding: 0.35rem 0.65rem !important;
        border-radius: var(--border-radius-default-tiny, 0.4rem) !important;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.08) !important;
        white-space: pre-wrap !important;
        max-width: 22rem !important;
        text-align: center !important;
        opacity: 0;
        transform: translateY(3px) scale(0.96);
        transition: opacity 0.15s cubic-bezier(0.33, 1, 0.68, 1), transform 0.15s cubic-bezier(0.33, 1, 0.68, 1);
      }
      #ethernet-tooltip.visible {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    `);

    const style = ensureModStyle();
    style.textContent = css.join('\n');

    // --- ДИАГНОСТИКА: логируем реальные computed-стили footer и Composer ---
    setTimeout(() => {
      const diag = () => {
        const footer = document.querySelector('.middle-column-footer');
        const composer = footer && footer.querySelector('.Composer');
        const wrapper = composer && composer.querySelector('.composer-wrapper');
        const header = document.querySelector('.MiddleHeader');
        const transition = document.querySelector('#MiddleColumn .Transition');
        const slide = transition && transition.querySelector('.Transition_slide');

        if (footer) {
          const fs = getComputedStyle(footer);
          const cs = composer ? getComputedStyle(composer) : null;
          const ws = wrapper ? getComputedStyle(wrapper) : null;
          const hs = header ? getComputedStyle(header) : null;
          const ts = transition ? getComputedStyle(transition) : null;
          const ss = slide ? getComputedStyle(slide) : null;

          console.log('[ethernet DIAG] MiddleHeader:', {
            width: hs?.width, left: hs?.left, right: hs?.right, position: hs?.position,
            maxWidth: hs?.maxWidth, margin: hs?.margin,
          });
          console.log('[ethernet DIAG] .Transition:', {
            width: ts?.width, position: ts?.position, overflow: ts?.overflow,
          });
          console.log('[ethernet DIAG] .Transition_slide:', {
            width: ss?.width, position: ss?.position, display: ss?.display,
            alignItems: ss?.alignItems, flexDirection: ss?.flexDirection,
          });
          console.log('[ethernet DIAG] .middle-column-footer:', {
            width: fs.width, left: fs.left, right: fs.right, position: fs.position,
            maxWidth: fs.maxWidth, display: fs.display, padding: fs.padding,
            margin: fs.margin, boxSizing: fs.boxSizing,
            offsetWidth: footer.offsetWidth,
            parentOffsetWidth: footer.offsetParent?.offsetWidth,
            containingBlockClass: footer.offsetParent?.className,
          });
          console.log('[ethernet DIAG] .Composer:', {
            width: cs?.width, maxWidth: cs?.maxWidth, flex: cs?.flex,
            display: cs?.display, boxSizing: cs?.boxSizing,
            offsetWidth: composer?.offsetWidth,
          });
          console.log('[ethernet DIAG] .composer-wrapper:', {
            width: ws?.width, maxWidth: ws?.maxWidth, flex: ws?.flex,
            offsetWidth: wrapper?.offsetWidth,
          });
        } else {
          console.log('[ethernet DIAG] No .middle-column-footer found');
        }
      };
      // Запустить через 3 секунды после DOM ready, чтобы всё точно было на месте
      setTimeout(diag, 3000);
      // И повторить через 8 секунд
      setTimeout(diag, 8000);
    }, 1000);

    applyWallpaper(mod);

    // Динамическая синхронизация геометрии левой панели через CSS-переменную
    setInterval(() => {
      const leftCol = document.getElementById('LeftColumn');
      if (leftCol && leftCol.offsetWidth > 0) {
        const w = `${leftCol.offsetWidth}px`;
        if (document.documentElement.style.getPropertyValue('--left-column-custom-width') !== w) {
          document.documentElement.style.setProperty('--left-column-custom-width', w);
        }
      }
    }, 50);
  }

  // --- Обои: гарантированный изолированный слой под приложением ---
  let activeWallpaperFile = null;
  let activeWallpaperKind = null;

  async function ensureActiveWallpaper() {
    try {
      const res = await fetch('/ethernet/wallpaper.json');
      if (res.ok) {
        const data = await res.json();
        if (data && data.file) {
          activeWallpaperFile = data.file;
          activeWallpaperKind = /\.(mp4|webm)$/i.test(data.file) ? 'video' : 'image';
          applyWallpaper();
        }
      }
    } catch {}
  }

  function getOrCreateWallpaperLayer() {
    let layer = document.getElementById('ethernet-wallpaper-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'ethernet-wallpaper-layer';
      if (document.body) {
        document.body.prepend(layer);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          if (!document.getElementById('ethernet-wallpaper-layer')) {
            document.body.prepend(layer);
          }
        });
      }
    }
    return layer;
  }

  function applyWallpaper(mod) {
    if (mod) {
      if (mod.wallpaperFile !== undefined) {
        activeWallpaperFile = mod.wallpaperFile;
        activeWallpaperKind = mod.wallpaperKind || (mod.wallpaperFile && /\.(mp4|webm)$/i.test(mod.wallpaperFile) ? 'video' : 'image');
      }
    }

    const file = activeWallpaperFile || (window.__ethernetMod && window.__ethernetMod.wallpaperFile);
    const isVideo = activeWallpaperKind === 'video' || (file && /\.(mp4|webm)$/i.test(file));
    const layer = getOrCreateWallpaperLayer();

    if (!file) {
      document.documentElement.removeAttribute('data-ethernet-wallpaper');
      document.documentElement.style.removeProperty('--custom-background');
      layer.innerHTML = '';
      layer.style.backgroundImage = '';
      return;
    }

    const url = `/ethernet/wallpapers/${file}`;
    document.documentElement.setAttribute('data-ethernet-wallpaper', 'true');
    document.documentElement.style.setProperty('--custom-background', `url("${url}")`, 'important');

    if (isVideo) {
      layer.style.backgroundImage = '';
      const existingVideos = layer.querySelectorAll('video');
      const needsInit = existingVideos.length < 2 || existingVideos[0].getAttribute('src') !== url;

      if (needsInit) {
        layer.innerHTML = '';

        // Бесшовная двухбуферная система: плеер А и плеер B плавно сменяют друг друга до достижения конца файла
        const vA = document.createElement('video');
        const vB = document.createElement('video');

        [vA, vB].forEach((v, idx) => {
          v.className = 'ethernet-video-track';
          v.src = url;
          v.muted = true;
          v.playsInline = true;
          v.setAttribute('muted', 'true');
          v.setAttribute('playsinline', 'true');
          v.style.position = 'absolute';
          v.style.inset = '0';
          v.style.width = '100%';
          v.style.height = '100%';
          v.style.objectFit = 'cover';
          v.style.pointerEvents = 'none';
          v.style.transition = 'opacity 0.2s ease-in-out';
          v.style.opacity = idx === 0 ? '1' : '0';
          layer.appendChild(v);
        });

        let active = vA;
        let standby = vB;
        let isSwitching = false;

        const startTrack = (v) => {
          try {
            v.currentTime = 0;
            v.playbackRate = 1.0;
            const p = v.play();
            if (p !== undefined) p.catch(() => { });
          } catch { }
        };

        startTrack(active);

        // Высокоточный кадровый монитор (60 FPS requestAnimationFrame)
        let rafId = null;
        const checkSeamlessLoop = () => {
          if (!active || !active.isConnected) return;

          const dur = active.duration;
          if (dur && dur > 0.4) {
            const timeLeft = dur - active.currentTime;

            // За 0.2 сек до конца или при неожиданной остановке — плавно переключаем на второй буфер
            if ((timeLeft <= 0.2 || active.ended || (active.paused && !document.hidden)) && !isSwitching) {
              isSwitching = true;

              startTrack(standby);
              standby.style.opacity = '1';
              active.style.opacity = '0';

              setTimeout(() => {
                try {
                  active.pause();
                  active.currentTime = 0;
                } catch { }
                const tmp = active;
                active = standby;
                standby = tmp;
                isSwitching = false;
              }, 200);
            }
          } else if (active.ended || (active.paused && !document.hidden)) {
            startTrack(active);
          }

          rafId = requestAnimationFrame(checkSeamlessLoop);
        };

        rafId = requestAnimationFrame(checkSeamlessLoop);

        // Быстрое пробуждение при фокусе и возврате в окно
        const handleWakeup = () => {
          if (!active) return;
          if (active.paused || active.ended) {
            active.play().catch(() => { });
          }
        };

        window.addEventListener('focus', handleWakeup);
        window.addEventListener('pageshow', handleWakeup);
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) handleWakeup();
        });
      }
    } else {
      layer.innerHTML = '';
      layer.style.backgroundImage = `url("${url}")`;
    }
  }

  // --- Кастомный топбар Ethernet ---
  let titlebarStyleEl = null;
  function ensureTitlebarStyle() {
    if (!titlebarStyleEl) {
      titlebarStyleEl = document.createElement('style');
      titlebarStyleEl.id = 'ethernet-titlebar-style';
      titlebarStyleEl.textContent = `
        #ethernet-titlebar {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          height: 26px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          background-color: var(--color-background-secondary, var(--color-background, #212121)) !important;
          background: var(--color-background-secondary, var(--color-background, #212121)) !important;
          color: var(--color-text, #ffffff) !important;
          z-index: 99999 !important;
          user-select: none !important;
          -webkit-app-region: drag !important;
          border-bottom: 1px solid color-mix(in srgb, var(--color-borders, #333) 20%, transparent) !important;
          padding: 0 0 0 10px !important;
          box-sizing: border-box !important;
          font-size: 12px !important;
          font-family: var(--font-family, system-ui) !important;
          font-weight: 500 !important;
          backdrop-filter: none !important;
        }

        html, body {
          padding: 0 !important;
          margin: 0 !important;
          padding-top: 26px !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
        }

        #root {
          height: calc(100vh - 26px) !important;
          max-height: calc(100vh - 26px) !important;
          box-sizing: border-box !important;
          position: relative !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        #Main {
          height: 100% !important;
          max-height: 100% !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        /* Симметричные отступы интерфейса: ровно 0.5rem (8px) со всех 4 сторон */
        #LeftColumn,
        #Main #LeftColumn {
          margin-top: 0.5rem !important;
          margin-bottom: 0.5rem !important;
          margin-left: 0.5rem !important;
          height: calc(100% - 1rem) !important;
        }

        #FoldersSidebar,
        #Main #FoldersSidebar {
          margin-top: 0.5rem !important;
          margin-bottom: 0.5rem !important;
          margin-left: 0.5rem !important;
          height: calc(100% - 1rem) !important;
        }

        #Main #RightColumn-wrapper #RightColumn,
        #Main #RightColumn,
        #RightColumn {
          top: 0.5rem !important;
          bottom: 0.5rem !important;
          left: 0.5rem !important;
          height: calc(100% - 1rem) !important;
        }

        #MiddleColumn .MiddleHeader,
        #MiddleColumn .MiddleHeaderPanesIsland {
          margin-top: 0.5rem !important;
        }

        #MiddleColumn .middle-column-footer {
          margin-bottom: 0.5rem !important;
          padding-bottom: 0 !important;
        }

        #MiddleColumn .messages-layout {
          height: 100% !important;
        }

        #ethernet-titlebar .ethernet-titlebar-left {
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          -webkit-app-region: drag !important;
        }

        #ethernet-titlebar .ethernet-titlebar-logo {
          display: flex !important;
          align-items: center !important;
          color: var(--color-primary, #8742e0) !important;
        }

        #ethernet-titlebar .ethernet-titlebar-center {
          position: absolute !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          font-weight: 400 !important;
          font-size: 11.5px !important;
          color: var(--color-text-secondary, var(--color-text, #aaa)) !important;
          opacity: 0.8 !important;
          max-width: 50% !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
          pointer-events: none !important;
        }

        #ethernet-titlebar .ethernet-titlebar-controls {
          display: flex !important;
          align-items: center !important;
          height: 100% !important;
          -webkit-app-region: no-drag !important;
        }

        #ethernet-titlebar .ethernet-titlebar-btn {
          background: transparent !important;
          border: none !important;
          outline: none !important;
          color: var(--color-text, #fff) !important;
          opacity: 0.8 !important;
          width: 42px !important;
          height: 28px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: default !important;
          transition: background-color 0.15s, color 0.15s, opacity 0.15s !important;
          padding: 0 !important;
          margin: 0 !important;
          border-radius: 0 !important;
        }

        #ethernet-titlebar .ethernet-titlebar-btn:hover {
          background-color: color-mix(in srgb, var(--color-text, #fff) 12%, transparent) !important;
          opacity: 1 !important;
        }

        #ethernet-titlebar .ethernet-titlebar-btn.ethernet-titlebar-btn-close:hover {
          background-color: #e81123 !important;
          color: #ffffff !important;
          opacity: 1 !important;
        }

        /* Полноэкранный режим */
        :fullscreen #ethernet-titlebar,
        html.is-fullscreen #ethernet-titlebar,
        body.is-fullscreen #ethernet-titlebar {
          display: none !important;
        }
        :fullscreen,
        html.is-fullscreen,
        html.is-fullscreen body,
        body.is-fullscreen {
          padding-top: 0 !important;
        }
        :fullscreen #root,
        html.is-fullscreen #root,
        body.is-fullscreen #root {
          height: 100vh !important;
        }
      `;
      (document.head || document.documentElement).appendChild(titlebarStyleEl);
    }
  }

  function initEthernetTitlebar() {
    ensureTitlebarStyle();
    if (document.getElementById('ethernet-titlebar')) return;

    const titlebar = document.createElement('div');
    titlebar.id = 'ethernet-titlebar';
    titlebar.innerHTML = `
      <div class="ethernet-titlebar-left">
        <div class="ethernet-titlebar-logo" title="Ethernet">
          <svg viewBox="0 0 133 133" width="18" height="18" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;display:block;">
            <g transform="matrix(0.04392,0,0,0.04392,66.666667,66.666667)">
              <g transform="matrix(1,0,0,1,-1333.333333,-1333.333333)">
                <g transform="matrix(4.166667,0,0,4.166667,0,0)">
                  <path d="M236,161.5C234.45,160.73 232.26,159.39 230.5,159.38C220.9,159.3 205.51,171.97 197.97,177.47C188.39,184.46 179.6,192.55 170.03,199.53C166.8,201.89 164.27,205.17 161.03,207.53C157.44,210.15 154.97,214.24 151.5,217C143.8,223.12 135.19,230.71 129,238.5C123.8,245.05 117.93,251.57 112,257.5C103.94,265.56 98.08,275.59 90.5,284C86.81,288.1 82.34,291.64 76.69,288.81C68.76,284.85 70.45,278.15 71.81,271.31C73.98,260.48 76.29,249.87 79.81,239.31C95.75,191.5 121.8,148.62 163.03,118.53C195.12,95.12 234.21,76.19 273.53,70.03C287.62,67.82 302.05,68 316.5,68C333.25,68 350.13,67.47 366.47,70.03C374.34,71.26 381.95,73.9 389.69,75.81C445.23,89.52 495.96,126.11 529.47,172.03C544.4,192.49 556.13,217.77 562.19,242.31C562.88,245.13 564.24,247.84 564.81,250.69C566.53,259.3 568.61,267.89 569.97,276.53C570.95,282.82 570.99,289.26 571.97,295.53C572.86,301.22 572,307.73 572,313.5C572,326.16 574.63,340.96 562.97,349.47C555.46,354.95 547.44,354 538.5,354L288.5,354C281.27,354 272.77,352.77 265.69,354.19C257.49,355.83 250.07,364.26 249.03,372.53C248.74,374.84 249.65,378.16 250.03,380.47C254.14,405.6 269.9,432.36 294.69,441.81C303.42,445.14 312.41,446.54 321.53,447.97C329.81,449.27 344.23,446.15 352.31,443.81C365.17,440.1 378.69,428.63 386.47,417.97C392.31,409.96 395.54,400.59 404.03,394.53C414.61,386.97 428.21,389 440.5,389L517.5,389C525.95,389 546.56,386.96 552.97,391.53C557.79,394.97 561.67,401.59 561.63,407.5C561.6,411.05 558.43,415.42 557.19,418.69C553.91,427.28 549.49,436.29 544.53,444.03C543.33,445.9 542.67,448.1 541.47,449.97C534.6,460.68 526.93,470.74 519.47,480.97C517.81,483.24 515.19,484.76 513.53,487.03C497.72,508.69 469.7,526.82 447.34,540.84C443.41,543.31 438.81,545.08 434.66,547.16C410.79,559.09 385.47,566.9 359.47,570.97C356.87,571.38 354.13,570.62 351.53,571.03C343.03,572.36 334.24,572 325.5,572C308.1,572 290.51,572.63 273.53,569.97C239.76,564.68 206.81,550.02 177.97,531.53C160.78,520.51 138.65,503.72 126.47,487.03C123.56,483.05 119.44,479.96 116.53,475.97C106.2,461.81 96.76,447.49 88.84,431.66C82.61,419.18 77.47,406.82 80.19,392.69C81.76,384.51 86.49,377.69 89.5,370C93.83,358.94 99.53,347.41 105.84,337.34C109.38,331.71 111.63,325.28 115.16,319.66C125.14,303.74 134.45,287.22 145.53,272.03C153.4,261.25 161.68,250.8 169.53,240.03C172.59,235.83 176.47,232.23 179.53,228.03C183.69,222.33 189.61,218.03 194,212.5C201.69,202.83 211.2,194.3 220,185.5C226.58,178.92 235.35,171.29 236,161.5ZM313.69,193.19C286.44,198.43 265.15,211.19 254.81,238.31C250.61,249.34 246.28,260.09 257.5,269C265.92,275.69 279.41,273 289.5,273L364.5,273C376.96,273 388.28,275.44 396.47,263.97C403.5,254.13 396.93,240.88 392.16,231.34C379.24,205.52 356.02,193 327.5,193C323.07,193 318.04,192.35 313.69,193.19Z" style="fill:currentColor;stroke:currentColor;stroke-width:0.25px;"/>
                </g>
              </g>
            </g>
          </svg>
        </div>
      </div>
      <div class="ethernet-titlebar-center" id="ethernet-titlebar-text"></div>
      <div class="ethernet-titlebar-controls">
        <button class="ethernet-titlebar-btn" id="ethernet-btn-min" title="Свернуть">
          <svg viewBox="0 0 10 10" width="10" height="10">
            <rect y="4.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button class="ethernet-titlebar-btn" id="ethernet-btn-max" title="Развернуть">
          <svg class="ethernet-icon-max" viewBox="0 0 10 10" width="10" height="10">
            <rect x="0.75" y="0.75" width="8.5" height="8.5" fill="none" stroke="currentColor" stroke-width="1.1" />
          </svg>
          <svg class="ethernet-icon-restore" viewBox="0 0 10 10" width="10" height="10" style="display:none;">
            <path d="M2.5 0.75h6.75v6.75h-1.5v-5.25h-5.25v-1.5z M0.75 2.5h6.75v6.75h-6.75v-6.75z" fill="none" stroke="currentColor" stroke-width="1.0" />
          </svg>
        </button>
        <button class="ethernet-titlebar-btn ethernet-titlebar-btn-close" id="ethernet-btn-close" title="Закрыть">
          <svg viewBox="0 0 10 10" width="10" height="10">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    `;

    if (document.body && document.body.firstChild) {
      document.body.insertBefore(titlebar, document.body.firstChild);
    } else if (document.body) {
      document.body.appendChild(titlebar);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.insertBefore(titlebar, document.body.firstChild);
      });
    }

    const btnMin = document.getElementById('ethernet-btn-min');
    const btnMax = document.getElementById('ethernet-btn-max');
    const btnClose = document.getElementById('ethernet-btn-close');
    const titleText = document.getElementById('ethernet-titlebar-text');

    const getDesktop = () => window.ethernetDesktop || window.hermesDesktop;

    btnMin?.addEventListener('click', () => getDesktop()?.windowMinimize());
    btnMax?.addEventListener('click', () => getDesktop()?.windowMaximizeToggle());
    btnClose?.addEventListener('click', () => getDesktop()?.windowClose());

    titlebar.addEventListener('dblclick', (e) => {
      if (e.target.closest('.ethernet-titlebar-controls, button')) return;
      getDesktop()?.windowMaximizeToggle();
    });

    const updateMaxState = (isMax) => {
      const iconMax = titlebar.querySelector('.ethernet-icon-max');
      const iconRestore = titlebar.querySelector('.ethernet-icon-restore');
      if (iconMax && iconRestore) {
        iconMax.style.display = isMax ? 'none' : 'block';
        iconRestore.style.display = isMax ? 'block' : 'none';
      }
      if (btnMax) {
        btnMax.title = isMax ? 'Восстановить' : 'Развернуть';
      }
    };

    getDesktop()?.windowIsMaximized?.().then((isMax) => updateMaxState(isMax));
    getDesktop()?.onWindowMaximizedChange?.((isMax) => updateMaxState(isMax));

    const updateTitle = () => {
      if (titleText) {
        let t = document.title || '';
        t = t.replace(/\s*·\s*Telegram/gi, '').trim();
        if (t === 'Ethernet' || t === 'Telegram') t = '';
        titleText.textContent = t;
      }
    };

    const titleObserver = new MutationObserver(updateTitle);
    const titleEl = document.querySelector('title');
    if (titleEl) {
      titleObserver.observe(titleEl, { subtree: true, characterData: true, childList: true });
    }
    updateTitle();
  }

  // --- Кастомный системный менеджер тултипов Ethernet ---
  function initEthernetTooltips() {
    let tooltipEl = document.getElementById('ethernet-floating-tooltip');
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'ethernet-floating-tooltip';
      if (document.body) {
        document.body.appendChild(tooltipEl);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          document.body.appendChild(tooltipEl);
        });
      }
    }

    let showTimeout = null;
    let currentTarget = null;

    const hideTooltip = () => {
      if (showTimeout) {
        clearTimeout(showTimeout);
        showTimeout = null;
      }
      if (tooltipEl) {
        tooltipEl.classList.remove('visible');
      }
      currentTarget = null;
    };

    const positionTooltip = (target) => {
      if (!tooltipEl || !target || !target.isConnected) return;
      const rect = target.getBoundingClientRect();
      const tipRect = tooltipEl.getBoundingClientRect();
      const margin = 8;

      let top = rect.top - tipRect.height - margin;
      let left = rect.left + (rect.width - tipRect.width) / 2;

      // Если сверху не помещается — показываем снизу
      if (top < 30) {
        top = rect.bottom + margin;
      }

      // Ограничиваем в пределах окна браузера
      if (left < 8) left = 8;
      if (left + tipRect.width > window.innerWidth - 8) {
        left = window.innerWidth - tipRect.width - 8;
      }

      tooltipEl.style.top = `${Math.round(top)}px`;
      tooltipEl.style.left = `${Math.round(left)}px`;
    };

    const handlePointerOver = (e) => {
      const target = e.target.closest('[title], [data-tooltip], [data-ethernet-title]');
      if (!target) return;

      const title = target.getAttribute('title') || target.dataset.tooltip || target.dataset.ethernetTitle;
      if (!title || !title.trim()) return;

      // Убираем нативный браузерный title, сохраняя текст в dataset
      if (target.hasAttribute('title')) {
        target.dataset.ethernetTitle = title;
        target.removeAttribute('title');
      }

      currentTarget = target;
      if (showTimeout) clearTimeout(showTimeout);

      showTimeout = setTimeout(() => {
        if (!currentTarget || !currentTarget.isConnected) return;
        const text = currentTarget.dataset.ethernetTitle || currentTarget.dataset.tooltip;
        if (!text || !text.trim()) return;

        tooltipEl.textContent = text.trim();
        tooltipEl.classList.add('visible');
        positionTooltip(currentTarget);
      }, 180);
    };

    const handlePointerOut = (e) => {
      const target = e.target.closest('[data-ethernet-title], [data-tooltip]');
      if (target && target === currentTarget) {
        hideTooltip();
      }
    };

    const handleScrollOrDown = () => {
      hideTooltip();
    };

    document.addEventListener('pointerover', handlePointerOver, true);
    document.addEventListener('pointerout', handlePointerOut, true);
    document.addEventListener('pointerdown', handleScrollOrDown, true);
    window.addEventListener('scroll', handleScrollOrDown, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initEthernetTitlebar();
      initEthernetTooltips();
    });
  } else {
    initEthernetTitlebar();
    initEthernetTooltips();
  }

  // Живое применение из редактора (без перезагрузки)
  window.ethernet.applyMod = (mod) => {
    window.__ethernetMod = mod;
    applyModSettings(mod);
  };
})();
