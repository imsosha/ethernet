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

      const wpCommentMatch = css.match(/\/\*\s*@wallpaper\s*(\{[\s\S]*?\})\s*\*\//i);
      if (wpCommentMatch) {
        try {
          const parsedWp = JSON.parse(wpCommentMatch[1]);
          if (parsedWp && parsedWp.file) {
            mod.wallpaperFile = parsedWp.file;
            mod.wallpaperKind = parsedWp.kind || 'image';
          }
        } catch {}
      }
      if (!mod.wallpaperFile) {
        const bgVarMatch = css.match(/--custom-background\s*:\s*url\s*\(\s*['"]?(data:[^'"]+)['"]?\s*\)/i);
        if (bgVarMatch) {
          mod.wallpaperFile = bgVarMatch[1];
          mod.wallpaperKind = 'image';
        }
      }

      const varRegex = /--([\w-]+)\s*:\s*([^;!]+)/g;
      let match;

      while ((match = varRegex.exec(css)) !== null) {
        const key = `--${match[1]}`;
        const rawVal = match[2].trim();

        if (key.startsWith('--color-')) {
          const cleanVal = rawVal.replace(/\s*!important/g, '').trim();
          if (cleanVal.startsWith('#') || cleanVal.startsWith('rgb') || cleanVal.startsWith('hsl')) {
            mod.colors[key] = cleanVal;
          }
        } else if (key === '--border-radius-ui') {
          mod.radii.ui = parseInt(rawVal, 10) || 16;
        } else if (key === '--border-radius-topbar') {
          mod.radii.topbar = parseInt(rawVal, 10) || 24;
        } else if (key === '--border-radius-folders-sidebar') {
          const parsed = parseFloat(rawVal);
          mod.radii.foldersSidebar = rawVal.endsWith('rem') ? Math.round(parsed * 16) : Math.round(parsed);
        } else if (key === '--border-radius-messages') {
          mod.radii.messages = parseInt(rawVal, 10) || 15;
        } else if (key === '--border-radius-buttons') {
          mod.radii.buttons = parseInt(rawVal, 10) || 12;
        } else if (key === '--border-radius-input') {
          mod.radii.input = parseInt(rawVal, 10) || 24;
        } else if (key === '--border-radius-avatars') {
          mod.radii.avatars = parseInt(rawVal, 10) || 50;
        } else if (key === '--blur-strength') {
          mod.blurStrength = parseInt(rawVal, 10) || 0;
        } else if (key === '--blur-glare') {
          mod.blurGlare = parseInt(rawVal, 10) || 0;
        } else if (key === '--blur-refraction') {
          mod.blurRefraction = parseInt(rawVal, 10) || 0;
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
        } else if (key === '--hermes-disable-snap-effect' || key === '--ethernet-disable-snap-effect') {
          mod.disableSnapEffect = rawVal === 'true';
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
        } else if (key === '--profile-open-mode') {
          mod.profileOpenMode = rawVal;
        } else if (key === '--media-message-width') {
          mod.mediaMessageWidth = rawVal;
        } else if (key === '--hide-titlebar') {
          mod.hideTitlebar = rawVal === 'true';
        }
      }

      // Сохраняем пользовательские CSS-правила вне блока :root
      const rootMatch = css.match(/:root\s*\{([^}]*)\}/);
      if (rootMatch) {
        const customPart = css.replace(rootMatch[0], '').trim();
        if (customPart) {
          mod.customCss = customPart;
        }
      } else if (css.trim()) {
        mod.customCss = css.trim();
      }

      return mod;
    },
    async applyTheme(name) {
      if (!name) return;
      window.__ethernetActiveTheme = name;
      try {
        localStorage.setItem('ethernet_active_theme', name);
      } catch {}

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
      } else {
        // Убедимся, что ethernet-active-theme-style всегда находится в конце head для приоритета пользовательского CSS
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = importantCss;

      // 3. Получаем обои, привязанные к этой теме (если есть переопределение)
      let themeWallpaperFile = null;
      let themeWallpaperKind = null;
      try {
        const wpRes = await fetch(`/ethernet/wallpaper.json?theme=${encodeURIComponent(name)}`);
        if (wpRes.ok) {
          const wpData = await wpRes.json();
          if (wpData && wpData.file) {
            themeWallpaperFile = wpData.file;
            themeWallpaperKind = wpData.kind || (
              typeof wpData.file === 'string' && (wpData.file.startsWith('#') || wpData.file.startsWith('rgb'))
                ? 'color'
                : (/\.(mp4|webm)$/i.test(wpData.file) ? 'video' : 'image')
            );
          }
        }
      } catch (err) {
        console.error('[ethernet] fetch theme wallpaper failed', err);
      }

      // Если эндпоинт не вернул обои, проверяем наличие вшитых обоев прямо в CSS теме
      if (!themeWallpaperFile && cssText) {
        const wpMatch = cssText.match(/\/\*\s*@wallpaper\s*(\{[\s\S]*?\})\s*\*\//i);
        if (wpMatch) {
          try {
            const parsedWp = JSON.parse(wpMatch[1]);
            if (parsedWp && parsedWp.file) {
              themeWallpaperFile = parsedWp.file;
              themeWallpaperKind = parsedWp.kind || 'image';
            }
          } catch {}
        }
        if (!themeWallpaperFile) {
          const bgMatch = cssText.match(/--custom-background\s*:\s*url\s*\(\s*['"]?(data:[^'"]+)['"]?\s*\)/i);
          if (bgMatch) {
            themeWallpaperFile = bgMatch[1];
            themeWallpaperKind = 'image';
          }
        }
      }

      activeWallpaperFile = themeWallpaperFile;
      activeWallpaperKind = themeWallpaperKind;

      if (window.__ethernetMod) {
        if (themeWallpaperFile) {
          window.__ethernetMod.wallpaperFile = themeWallpaperFile;
          window.__ethernetMod.wallpaperKind = themeWallpaperKind;
        } else {
          delete window.__ethernetMod.wallpaperFile;
          delete window.__ethernetMod.wallpaperKind;
          delete window.__ethernetMod.wallpaperOriginalPath;
        }
      }

      // 4. Парсим мод из темы и динамически обновляем все стили
      if (cssText) {
        try {
          const mod = api.parseCssToMod(cssText);
          mod.wallpaperFile = themeWallpaperFile;
          mod.wallpaperKind = themeWallpaperKind;
          applyModSettings(mod);
        } catch (e) {
          console.error('[ethernet] error applying mod from theme', e);
        }
      } else {
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
      try {
        localStorage.removeItem(WALLPAPER_STORAGE_KEY);
      } catch {}
      activeWallpaperFile = null;
      activeWallpaperKind = null;
      if (window.__ethernetMod) {
        delete window.__ethernetMod.wallpaperFile;
        delete window.__ethernetMod.wallpaperKind;
        delete window.__ethernetMod.wallpaperOriginalPath;
      }
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
        localStorage.removeItem('ethernet_active_theme');
      } catch {}

      activeWallpaperFile = null;
      activeWallpaperKind = null;
      try { localStorage.removeItem(WALLPAPER_STORAGE_KEY); } catch {}
      if (window.__ethernetMod) {
        delete window.__ethernetMod.wallpaperFile;
        delete window.__ethernetMod.wallpaperKind;
        delete window.__ethernetMod.wallpaperOriginalPath;
      }

      try {
        const modRes = await fetch('/ethernet/mod.json');
        if (modRes.ok) {
          const mod = await modRes.json();
          if (mod) {
            window.__ethernetMod = mod;
            applyModSettings(mod);
            if (mod.wallpaperFile) {
              applyWallpaper({ wallpaperFile: mod.wallpaperFile, wallpaperKind: mod.wallpaperKind });
            } else {
              applyWallpaper({ wallpaperFile: null });
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
  async function loadAndApplyAll() {
    ensureActiveWallpaper();
    let themeToApply = null;

    try {
      const cfgRes = await fetch('/ethernet/config.json');
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        if (cfg && cfg.theme) {
          themeToApply = cfg.theme;
        }
      }
    } catch {}

    if (!themeToApply) {
      try {
        const cachedTheme = localStorage.getItem('ethernet_active_theme');
        if (cachedTheme) {
          themeToApply = cachedTheme;
          const desktop = window.ethernetDesktop || window.hermesDesktop;
          if (desktop?.themeActivate) {
            desktop.themeActivate(cachedTheme).catch(() => {});
          }
        }
      } catch {}
    }

    if (themeToApply) {
      await api.applyTheme(themeToApply);
    } else {
      try {
        const modRes = await fetch('/ethernet/mod.json');
        if (modRes.ok) {
          const mod = await modRes.json();
          if (mod) {
            window.__ethernetMod = mod;
            applyModSettings(mod);
          }
        }
      } catch {}
    }
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
          message: `Плагин "${pluginId}" вызвал сбой. Активирован безопасный режим.`,
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
      const msg = String(event.message || '');
      if (msg.includes('Content Security Policy') || msg.includes('unsafe-eval')) {
        return; // Ignore CSP evaluation errors from triggering crash guard
      }
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
      const msg = String(event.reason?.message || event.reason || '');
      if (msg.includes('Permission denied') || msg.includes('Failed to fetch') || msg.includes('AbortError')) {
        return; // Security sandbox denial or normal network interruption is not a crash
      }
      const stack = event.reason?.stack || '';
      if (stack.includes('/plugins/')) {
        const match = stack.match(/\/plugins\/([^/]+)\//);
        const pluginId = match ? decodeURIComponent(match[1]) : 'unknown';
        handlePluginCrash(pluginId, msg || 'Unhandled runtime error');
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
              message: `Плагин "${crashed.id}" вызвал сбой. Активирован безопасный режим.`,
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

  // --- Реновация системы плагинов: песочница, разграничение прав и жизненный цикл ---
  const activePluginInstances = new Map();
  const pluginSettingsViews = new Map();

  window.__ethernetRenderPluginSettings = (pluginId, container) => {
    const fn = pluginSettingsViews.get(pluginId);
    if (typeof fn === 'function') {
      try {
        container.innerHTML = '';
        fn(container);
        return true;
      } catch (e) {
        console.error(`[ethernet:settings] Error rendering settings for "${pluginId}":`, e);
      }
    }
    return false;
  };

  window.__ethernetHasPluginSettings = (pluginId) => {
    return pluginSettingsViews.has(pluginId);
  };

  window.__ethernetRefreshPluginSettings = (pluginId) => {
    const el = document.getElementById(`ethernet-plugin-custom-settings-${pluginId}`);
    if (el) {
      window.__ethernetRenderPluginSettings(pluginId, el);
    }
  };

  function sanitizeCredentialsFromState(state) {
    if (!state || typeof state !== 'object') return state;
    return new Proxy(state, {
      get(target, prop) {
        if (typeof prop === 'string') {
          const lProp = prop.toLowerCase();
          if (lProp === 'authkey' || lProp === 'authdata' || lProp === 'sessiondata' || lProp === 'userauth' || lProp === 'passcode') {
            console.warn(`[ethernet:security] Blocked access to credential property "${prop}" (missing "credentials" permission).`);
            return undefined;
          }
        }
        return target[prop];
      },
    });
  }

  function teardownPlugin(pluginId) {
    const instance = activePluginInstances.get(pluginId);
    if (!instance) return;
    try {
      instance.teardown();
    } catch (e) {
      console.error(`[ethernet:sandbox] Error tearing down plugin "${pluginId}":`, e);
    }
    pluginSettingsViews.delete(pluginId);
    activePluginInstances.delete(pluginId);
  }

  function runPluginSandboxed(pluginMeta, code) {
    const pluginId = pluginMeta.id;
    if (activePluginInstances.has(pluginId)) {
      teardownPlugin(pluginId);
    }

    const granted = pluginMeta.grantedPermissions || {};
    const hasPermission = (p) => Boolean(granted[p]);

    const trackedTimers = new Set();
    const trackedIntervals = new Set();
    const trackedRAF = new Set();
    const trackedWindowListeners = [];
    const trackedDocListeners = [];
    const trackedEthernetListeners = [];
    const trackedStyles = new Set();
    const trackedDOMElements = new Set();
    const trackedHooks = [];
    const onDestroyCallbacks = [];

    // 1. Изолированное хранилище плагина (Scoped Storage)
    const pluginStorage = {
      get(key, fallback = null) {
        try {
          const val = localStorage.getItem(`_eth_plug_${pluginId}_${key}`);
          return val !== null ? JSON.parse(val) : fallback;
        } catch {
          return fallback;
        }
      },
      set(key, val) {
        try {
          localStorage.setItem(`_eth_plug_${pluginId}_${key}`, JSON.stringify(val));
        } catch (e) {
          console.error(`[ethernet:storage] Error saving key "${key}" for plugin "${pluginId}":`, e);
        }
      },
      remove(key) {
        try {
          localStorage.removeItem(`_eth_plug_${pluginId}_${key}`);
        } catch {}
      },
      clear() {
        try {
          const prefix = `_eth_plug_${pluginId}_`;
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(prefix)) keysToRemove.push(k);
          }
          keysToRemove.forEach((k) => localStorage.removeItem(k));
        } catch {}
      },
    };

    // 2. Sandboxed Ethernet API
    const sandboxedEthernet = {
      id: pluginId,
      version: api.version,
      hasPermission,
      storage: pluginStorage,
      addStyle(css, styleId) {
        if (!hasPermission('dom.style')) {
          console.warn(`[ethernet:security] Plugin "${pluginId}" called addStyle without "dom.style" permission.`);
          return null;
        }
        const el = document.createElement('style');
        el.dataset.ethernetPlugin = pluginId;
        if (styleId) el.id = styleId;
        el.textContent = css;
        (document.head || document.documentElement).appendChild(el);
        trackedStyles.add(el);
        return el;
      },
      log(...args) {
        console.log(`%c[${pluginId}]`, 'color:#8774e1;font-weight:bold', ...args);
      },
      on(event, cb) {
        if (event === 'keydown' && !hasPermission('events.keyboard')) {
          console.warn(`[ethernet:security] Plugin "${pluginId}" attempted to listen to "keydown" without "events.keyboard" permission.`);
          return () => {};
        }
        const off = api.on(event, cb);
        trackedEthernetListeners.push(off);
        return off;
      },
      off(event, cb) {
        api.off(event, cb);
      },
      emit(event, data) {
        api.emit(event, data);
      },
      onDestroy(cb) {
        if (typeof cb === 'function') {
          onDestroyCallbacks.push(cb);
        }
      },
      registerSettingsView(renderFn) {
        if (typeof renderFn === 'function') {
          pluginSettingsViews.set(pluginId, renderFn);
          if (typeof window.__ethernetRefreshPluginSettings === 'function') {
            window.__ethernetRefreshPluginSettings(pluginId);
          }
        }
      },
      refreshSettingsView() {
        if (typeof window.__ethernetRefreshPluginSettings === 'function') {
          window.__ethernetRefreshPluginSettings(pluginId);
        }
      },
      media: {
        getSystemState() {
          const api = window.ethernetDesktop || window.hermesDesktop;
          return api?.mediaGetSystemState ? api.mediaGetSystemState() : Promise.resolve(null);
        },
        controlSystem(action, value) {
          const api = window.ethernetDesktop || window.hermesDesktop;
          return api?.mediaControlSystem ? api.mediaControlSystem(action, value) : Promise.resolve(null);
        },
      },
      api: {
        beforeRequest(cb) {
          if (!hasPermission('network.intercept')) {
            console.warn(`[ethernet:security] Plugin "${pluginId}" attempted beforeRequest without "network.intercept" permission.`);
            return () => {};
          }
          const wrapped = (method, args) => {
            try { return cb(method, args); } catch (e) { console.error(`[${pluginId}:beforeRequest]`, e); }
          };
          const off = api.api.beforeRequest(wrapped);
          trackedHooks.push(off);
          return off;
        },
        onRequest(cb) {
          if (!hasPermission('network.intercept')) {
            console.warn(`[ethernet:security] Plugin "${pluginId}" attempted onRequest without "network.intercept" permission.`);
            return () => {};
          }
          const wrapped = (method, args) => {
            try { return cb(method, args); } catch (e) { console.error(`[${pluginId}:onRequest]`, e); }
          };
          const off = api.api.onRequest(wrapped);
          trackedHooks.push(off);
          return off;
        },
        onUpdate(cb) {
          if (!hasPermission('telegram.updates')) {
            console.warn(`[ethernet:security] Plugin "${pluginId}" attempted onUpdate without "telegram.updates" permission.`);
            return () => {};
          }
          const wrapped = (update) => {
            try { return cb(update); } catch (e) { console.error(`[${pluginId}:onUpdate]`, e); }
          };
          const off = api.api.onUpdate(wrapped);
          trackedHooks.push(off);
          return off;
        },
        afterUpdate(cb) {
          if (!hasPermission('telegram.updates')) {
            console.warn(`[ethernet:security] Plugin "${pluginId}" attempted afterUpdate without "telegram.updates" permission.`);
            return () => {};
          }
          const wrapped = (update) => {
            try { return cb(update); } catch (e) { console.error(`[${pluginId}:afterUpdate]`, e); }
          };
          const off = api.api.afterUpdate(wrapped);
          trackedHooks.push(off);
          return off;
        },
      },
      store: {
        getGlobal() {
          if (!hasPermission('telegram.store')) {
            console.warn(`[ethernet:security] Plugin "${pluginId}" attempted store.getGlobal without "telegram.store" permission.`);
            return {};
          }
          const raw = api.store.getGlobal();
          return hasPermission('credentials') ? raw : sanitizeCredentialsFromState(raw);
        },
        setGlobal(...args) {
          if (!hasPermission('telegram.store')) {
            console.warn(`[ethernet:security] Plugin "${pluginId}" attempted store.setGlobal without "telegram.store" permission.`);
            return;
          }
          return api.store.setGlobal(...args);
        },
        getActions() {
          if (!hasPermission('telegram.store')) {
            console.warn(`[ethernet:security] Plugin "${pluginId}" attempted store.getActions without "telegram.store" permission.`);
            return {};
          }
          return api.store.getActions();
        },
        subscribe(cb) {
          if (!hasPermission('telegram.store')) return () => {};
          return api.store.subscribe(cb);
        },
      },
    };

    // 3. Sandboxed Window & Document
    const sandboxedSetTimeout = (fn, delay, ...args) => {
      const id = window.setTimeout((...innerArgs) => {
        trackedTimers.delete(id);
        try { fn(...innerArgs); } catch (err) { handlePluginCrash(pluginId, err.message || String(err)); }
      }, delay, ...args);
      trackedTimers.add(id);
      return id;
    };

    const sandboxedClearTimeout = (id) => {
      trackedTimers.delete(id);
      window.clearTimeout(id);
    };

    const sandboxedSetInterval = (fn, delay, ...args) => {
      const id = window.setInterval((...innerArgs) => {
        try { fn(...innerArgs); } catch (err) { handlePluginCrash(pluginId, err.message || String(err)); }
      }, delay, ...args);
      trackedIntervals.add(id);
      return id;
    };

    const sandboxedClearInterval = (id) => {
      trackedIntervals.delete(id);
      window.clearInterval(id);
    };

    const sandboxedRAF = (fn) => {
      const id = window.requestAnimationFrame((ts) => {
        trackedRAF.delete(id);
        try { fn(ts); } catch (err) { handlePluginCrash(pluginId, err.message || String(err)); }
      });
      trackedRAF.add(id);
      return id;
    };

    const sandboxedCAF = (id) => {
      trackedRAF.delete(id);
      window.cancelAnimationFrame(id);
    };

    const sandboxedLocalStorage = new Proxy(localStorage, {
      get(target, prop) {
        if (prop === 'getItem') {
          return (key) => {
            if (!hasPermission('credentials')) {
              const lk = String(key || '').toLowerCase();
              if (lk === 'user_auth' || lk.includes('auth') || lk.includes('token') || lk.includes('session')) {
                console.warn(`[ethernet:security] Blocked plugin "${pluginId}" from reading credentials in localStorage (key: "${key}").`);
                return null;
              }
            }
            return target.getItem(key);
          };
        }
        if (prop === 'setItem') {
          return (key, val) => {
            if (!hasPermission('credentials')) {
              const lk = String(key || '').toLowerCase();
              if (lk === 'user_auth' || lk.includes('auth') || lk.includes('token') || lk.includes('session')) {
                console.warn(`[ethernet:security] Blocked plugin "${pluginId}" from writing credentials in localStorage.`);
                return;
              }
            }
            return target.setItem(key, val);
          };
        }
        if (typeof prop === 'string' && !hasPermission('credentials')) {
          const lk = prop.toLowerCase();
          if (lk === 'user_auth' || lk.includes('auth') || lk.includes('token') || lk.includes('session')) {
            console.warn(`[ethernet:security] Blocked direct property access to "${prop}" in localStorage.`);
            return undefined;
          }
        }
        const val = target[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      },
    });

    const sandboxedIndexedDB = window.indexedDB ? new Proxy(window.indexedDB, {
      get(target, prop) {
        if (prop === 'open') {
          return (name, version) => {
            const dbName = String(name || '').toLowerCase();
            if (!hasPermission('credentials') && !hasPermission('telegram.store')) {
              if (
                dbName.startsWith('tt-') ||
                dbName === 'keyval-store' ||
                dbName.includes('telegram') ||
                dbName.includes('passcode') ||
                dbName.includes('auth') ||
                dbName.includes('session')
              ) {
                console.warn(`[ethernet:security] Blocked plugin "${pluginId}" from opening sensitive IndexedDB "${name}".`);
                const req = target.open('__ethernet_blocked_db__', 1);
                setTimeout(() => {
                  try {
                    const evt = new Event('error');
                    Object.defineProperty(req, 'error', {
                      value: new DOMException(`Access to database "${name}" denied without credentials permission`, 'SecurityError'),
                    });
                    if (typeof req.onerror === 'function') req.onerror(evt);
                    req.dispatchEvent(evt);
                  } catch {}
                }, 0);
                return req;
              }
            }
            return target.open(name, version);
          };
        }
        if (prop === 'deleteDatabase') {
          return (name) => {
            const dbName = String(name || '').toLowerCase();
            if (!hasPermission('credentials') && !hasPermission('telegram.store')) {
              if (
                dbName.startsWith('tt-') ||
                dbName === 'keyval-store' ||
                dbName.includes('telegram') ||
                dbName.includes('passcode') ||
                dbName.includes('auth')
              ) {
                console.warn(`[ethernet:security] Blocked plugin "${pluginId}" from deleting sensitive IndexedDB "${name}".`);
                throw new DOMException(`Access to database "${name}" denied without credentials permission`, 'SecurityError');
              }
            }
            return target.deleteDatabase(name);
          };
        }
        const val = target[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      },
    }) : undefined;

    const windowTarget = Object.create(window);
    const sandboxedWindow = new Proxy(windowTarget, {
      get(_target, prop) {
        if (prop === 'window' || prop === 'self' || prop === 'globalThis') return sandboxedWindow;
        if (prop === 'document') return sandboxedDocument;
        if (prop === 'ethernet' || prop === 'hermes') return sandboxedEthernet;
        if (prop === 'localStorage') return sandboxedLocalStorage;
        if (prop === 'indexedDB') return sandboxedIndexedDB;
        if (prop === 'setTimeout') return sandboxedSetTimeout;
        if (prop === 'clearTimeout') return sandboxedClearTimeout;
        if (prop === 'setInterval') return sandboxedSetInterval;
        if (prop === 'clearInterval') return sandboxedClearInterval;
        if (prop === 'requestAnimationFrame') return sandboxedRAF;
        if (prop === 'cancelAnimationFrame') return sandboxedCAF;
        if (prop === 'addEventListener') {
          return (type, listener, options) => {
            const wrapped = (...e) => {
              try { listener(...e); } catch (err) { handlePluginCrash(pluginId, err.message || String(err)); }
            };
            trackedWindowListeners.push({ type, wrapped, options });
            return window.addEventListener(type, wrapped, options);
          };
        }
        if (prop === 'removeEventListener') {
          return (type, listener, options) => window.removeEventListener(type, listener, options);
        }
        if (prop === 'ethernetDesktop' || prop === 'hermesDesktop' || prop === 'electronDesktop') {
          if (!hasPermission('desktop.ipc')) {
            console.warn(`[ethernet:security] Plugin "${pluginId}" attempted to access Desktop IPC without "desktop.ipc" permission.`);
            return undefined;
          }
          return window[prop];
        }
        if (prop === 'fetch') {
          if (!hasPermission('network.raw')) {
            return (input, init) => {
              const urlStr = typeof input === 'string' ? input : (input?.url || '');
              if (/^https?:\/\//i.test(urlStr) && !urlStr.startsWith(window.location.origin)) {
                console.warn(`[ethernet:security] Blocked external fetch to "${urlStr}" without "network.raw" permission.`);
                return Promise.reject(new Error(`Permission denied: network.raw required to fetch "${urlStr}"`));
              }
              return window.fetch(input, init);
            };
          }
          return window.fetch.bind(window);
        }
        const val = window[prop];
        return typeof val === 'function' ? val.bind(window) : val;
      },
      set(_target, prop, val) {
        window[prop] = val;
        return true;
      },
      has(_target, prop) {
        return prop in window;
      },
    });

    const documentTarget = Object.create(document);
    const sandboxedDocument = new Proxy(documentTarget, {
      get(_target, prop) {
        if (prop === 'defaultView') return sandboxedWindow;
        if (prop === 'cookie') {
          if (!hasPermission('credentials')) {
            console.warn(`[ethernet:security] Blocked plugin "${pluginId}" from reading cookies without credentials permission.`);
            return '';
          }
        }
        if (prop === 'addEventListener') {
          return (type, listener, options) => {
            const wrapped = (...e) => {
              try { listener(...e); } catch (err) { handlePluginCrash(pluginId, err.message || String(err)); }
            };
            trackedDocListeners.push({ type, wrapped, options });
            return document.addEventListener(type, wrapped, options);
          };
        }
        if (prop === 'removeEventListener') {
          return (type, listener, options) => document.removeEventListener(type, listener, options);
        }
        if (prop === 'createElement') {
          return (tag, options) => {
            const el = document.createElement(tag, options);
            try { el.dataset.ethernetPlugin = pluginId; } catch {}
            trackedDOMElements.add(el);
            return el;
          };
        }
        const val = document[prop];
        return typeof val === 'function' ? val.bind(document) : val;
      },
      set(_target, prop, val) {
        document[prop] = val;
        return true;
      },
      has(_target, prop) {
        return prop in document;
      },
    });

    // 4. Teardown lifecycle (полное удаление всех следов работы плагина)
    const teardown = () => {
      for (const cb of onDestroyCallbacks) {
        try { cb(); } catch (e) { console.error(`[${pluginId}:onDestroy]`, e); }
      }
      onDestroyCallbacks.length = 0;

      trackedTimers.forEach((id) => window.clearTimeout(id));
      trackedTimers.clear();
      trackedIntervals.forEach((id) => window.clearInterval(id));
      trackedIntervals.clear();
      trackedRAF.forEach((id) => window.cancelAnimationFrame(id));
      trackedRAF.clear();

      trackedWindowListeners.forEach(({ type, wrapped, options }) => {
        window.removeEventListener(type, wrapped, options);
      });
      trackedWindowListeners.length = 0;

      trackedDocListeners.forEach(({ type, wrapped, options }) => {
        document.removeEventListener(type, wrapped, options);
      });
      trackedDocListeners.length = 0;

      trackedEthernetListeners.forEach((off) => {
        try { off(); } catch {}
      });
      trackedEthernetListeners.length = 0;

      trackedHooks.forEach((off) => {
        try { off(); } catch {}
      });
      trackedHooks.length = 0;

      trackedStyles.forEach((el) => el.remove());
      trackedStyles.clear();
      document.querySelectorAll(`style[data-ethernet-plugin="${pluginId}"]`).forEach((el) => el.remove());

      trackedDOMElements.forEach((el) => el.remove());
      trackedDOMElements.clear();
      document.querySelectorAll(`[data-ethernet-plugin="${pluginId}"], [data-plugin-id="${pluginId}"]`).forEach((el) => el.remove());

      console.info(`[ethernet:sandbox] Plugin "${pluginId}" successfully unloaded.`);
    };

    activePluginInstances.set(pluginId, { teardown, manifest: pluginMeta });

    // 5. Запуск плагина в изолированной области видимости
    try {
      const runner = new Function(
        'ethernet',
        'hermes',
        'window',
        'document',
        'localStorage',
        'indexedDB',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        `"use strict";\n` + code + `\n//# sourceURL=/ethernet/plugins/${encodeURIComponent(pluginId)}/index.js`
      );

      runner.call(
        sandboxedWindow,
        sandboxedEthernet,
        sandboxedEthernet,
        sandboxedWindow,
        sandboxedDocument,
        sandboxedLocalStorage,
        sandboxedIndexedDB,
        sandboxedSetTimeout,
        sandboxedClearTimeout,
        sandboxedSetInterval,
        sandboxedClearInterval,
        sandboxedRAF,
        sandboxedCAF
      );
      console.info(`[ethernet:sandbox] Plugin "${pluginId}" running with permissions:`, Object.keys(granted).filter((p) => granted[p]));
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes('Content Security Policy') || errStr.includes('unsafe-eval') || err.name === 'EvalError') {
        console.warn(`[ethernet:sandbox] CSP blocked new Function for "${pluginId}". Falling back to dynamic script tag.`);
        try {
          window.__ethernetCurrentPlugin = sandboxedEthernet;
          const s = document.createElement('script');
          s.dataset.ethernetPlugin = pluginId;
          s.src = `/ethernet/plugins/${encodeURIComponent(pluginId)}/index.js`;
          (document.head || document.documentElement).appendChild(s);
          trackedDOMElements.add(s);
          return;
        } catch (scriptErr) {
          console.error(`[ethernet:sandbox] Script tag fallback failed for "${pluginId}":`, scriptErr);
        }
      }
      handlePluginCrash(pluginId, err.message || String(err));
    }
  }

  function loadActivePlugins() {
    fetch('/ethernet/plugins/manifests.json')
      .then((r) => r.json())
      .then(async (plugins) => {
        if (!Array.isArray(plugins)) return;

        const enabledIds = new Set(plugins.filter((p) => p && p.enabled).map((p) => p.id));

        // 1. Выгружаем плагины, которые были отключены или удалены
        for (const [activeId] of activePluginInstances) {
          if (!enabledIds.has(activeId)) {
            teardownPlugin(activeId);
          }
        }

        // 2. Загружаем и запускаем включенные плагины
        for (const p of plugins) {
          if (!p || !p.enabled) continue;

          const existing = activePluginInstances.get(p.id);
          const currentGrantedJson = JSON.stringify(p.grantedPermissions || {});
          if (existing && existing._grantedJson === currentGrantedJson) {
            continue;
          }

          try {
            const res = await fetch(`/ethernet/plugins/${encodeURIComponent(p.id)}/index.js`);
            if (res.ok) {
              const code = await res.text();
              runPluginSandboxed(p, code);
              const inst = activePluginInstances.get(p.id);
              if (inst) inst._grantedJson = currentGrantedJson;
            }
          } catch (e) {
            console.error(`[ethernet] Failed to load plugin script for "${p.id}":`, e);
            handlePluginCrash(p.id, 'Failed to load script');
          }
        }
      })
      .catch((e) => {
        console.error('[ethernet] error loading plugins manifests', e);
      });
  }

  window.addEventListener('ethernet:plugins-updated', loadActivePlugins);


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

  // Следим за сменой light/dark без периодических таймеров
  let lastClientTheme = document.documentElement.className.match(/theme-(light|dark)/)?.[1];
  const themeObserver = new MutationObserver(() => {
    const cur = document.documentElement.className.match(/theme-(light|dark)/)?.[1];
    if (cur !== lastClientTheme) {
      lastClientTheme = cur;
      if (window.__ethernetActiveTheme) api.applyTheme(window.__ethernetActiveTheme);
    }
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });

  let modStyleEl = null;
  let permanentTransitionStyleEl = null;

  function ensurePermanentStyles() {
    if (typeof window !== 'undefined' && window.CSS && typeof window.CSS.registerProperty === 'function') {
      const colorProps = [
        '--color-background', '--color-background-secondary', '--color-background-secondary-accent',
        '--color-background-sidebar', '--color-background-selected', '--color-borders', '--color-dividers',
        '--color-text', '--color-links', '--color-text-secondary', '--color-primary', '--color-send-button',
        '--color-icon-buttons', '--color-text-meta-colored', '--color-background-own', '--color-chat-active',
        '--color-active', '--color-interactive-active', '--accent-color'
      ];
      for (const prop of colorProps) {
        try {
          window.CSS.registerProperty({
            name: prop,
            syntax: '<color>',
            inherits: true,
            initialValue: '#000000',
          });
        } catch {}
      }
    }

    if (!permanentTransitionStyleEl) {
      permanentTransitionStyleEl = document.createElement('style');
      permanentTransitionStyleEl.id = 'ethernet-permanent-transitions';
      permanentTransitionStyleEl.textContent = `
        @property --color-background { syntax: '<color>'; inherits: true; initial-value: #16171a; }
        @property --color-background-secondary { syntax: '<color>'; inherits: true; initial-value: #212328; }
        @property --color-background-secondary-accent { syntax: '<color>'; inherits: true; initial-value: #292c33; }
        @property --color-background-sidebar { syntax: '<color>'; inherits: true; initial-value: #1a1b1f; }
        @property --color-background-selected { syntax: '<color>'; inherits: true; initial-value: #2a2e37; }
        @property --color-borders { syntax: '<color>'; inherits: true; initial-value: #2a2d34; }
        @property --color-dividers { syntax: '<color>'; inherits: true; initial-value: #24272e; }
        @property --color-text { syntax: '<color>'; inherits: true; initial-value: #f3f4f6; }
        @property --color-links { syntax: '<color>'; inherits: true; initial-value: #58a6ff; }
        @property --color-text-secondary { syntax: '<color>'; inherits: true; initial-value: #9da7b7; }
        @property --color-primary { syntax: '<color>'; inherits: true; initial-value: #3b82f6; }
        @property --color-send-button { syntax: '<color>'; inherits: true; initial-value: #3b82f6; }
        @property --color-icon-buttons { syntax: '<color>'; inherits: true; initial-value: #9da7b7; }
        @property --color-text-meta-colored { syntax: '<color>'; inherits: true; initial-value: #58a6ff; }
        @property --color-background-own { syntax: '<color>'; inherits: true; initial-value: #1e3a5f; }
        @property --color-chat-active { syntax: '<color>'; inherits: true; initial-value: #2b3d58; }
        @property --color-active { syntax: '<color>'; inherits: true; initial-value: #3b82f6; }
        @property --color-interactive-active { syntax: '<color>'; inherits: true; initial-value: #3b82f6; }
        @property --accent-color { syntax: '<color>'; inherits: true; initial-value: #3b82f6; }

        :root {
          transition:
            --color-background 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --color-background-secondary 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --color-background-secondary-accent 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --color-background-sidebar 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --color-background-selected 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --color-borders 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --color-dividers 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --color-text 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --color-links 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --color-text-secondary 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --color-primary 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --color-send-button 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --color-icon-buttons 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --color-text-meta-colored 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --color-background-own 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --color-chat-active 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --color-active 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --color-interactive-active 0.35s cubic-bezier(0.33, 1, 0.68, 1),
            --accent-color 0.35s cubic-bezier(0.33, 1, 0.68, 1) !important;
        }

        body,
        #root,
        #Main,
        #LeftColumn,
        #MiddleColumn,
        #RightColumn,
        .ListItem,
        .ListItem-button,
        .chat-item,
        .Message,
        .message-content,
        .bubble,
        .sidebar-header,
        .chat-header,
        .MiddleHeader,
        .Button,
        .color-field-preview,
        .theme-preview-card,
        .folder-pill,
        .tabs-tab,
        .chat-background,
        .Composer,
        .messages-layout {
          transition: background-color 0.35s cubic-bezier(0.33, 1, 0.68, 1),
                      color 0.35s cubic-bezier(0.33, 1, 0.68, 1),
                      border-color 0.35s cubic-bezier(0.33, 1, 0.68, 1),
                      fill 0.35s cubic-bezier(0.33, 1, 0.68, 1) !important;
        }

        body.is-resizing-left-column #MiddleColumn,
        body.is-resizing-left-column #RightColumn,
        body.is-resizing-left-column iframe {
          pointer-events: none !important;
          user-select: none !important;
        }
      `;
      document.head.appendChild(permanentTransitionStyleEl);
    }
  }

  function ensureModStyle() {
    ensurePermanentStyles();
    if (!modStyleEl) {
      modStyleEl = document.createElement('style');
      modStyleEl.id = 'ethernet-mod-style';
      const activeThemeStyle = document.getElementById('ethernet-active-theme-style');
      if (activeThemeStyle && activeThemeStyle.parentNode) {
        activeThemeStyle.parentNode.insertBefore(modStyleEl, activeThemeStyle);
      } else {
        document.head.appendChild(modStyleEl);
      }
    }
    return modStyleEl;
  }

  function applyModSettings(mod) {
    window.__ethernetMod = mod || {};
    mod = mod || {};
    document.documentElement.setAttribute('data-message-align-own', mod.messageAlignOwn || 'right');
    document.documentElement.setAttribute('data-message-align-other', mod.messageAlignOther || 'left');
    document.documentElement.setAttribute('data-chat-width', mod.chatWidth || 'wide');
    document.documentElement.setAttribute('data-profile-mode', mod.profileOpenMode || 'shift');
    document.documentElement.setAttribute('data-media-width', mod.mediaMessageWidth || 'full');
    document.documentElement.setAttribute('data-hide-titlebar', mod.hideTitlebar ? 'true' : 'false');
    const css = [];

    // --- Шрифт (нативная системная типографика без размытия) ---
    css.push(`
      :root {
        --font-family: "SF Pro Text", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif !important;
        --font-family-monospace: ui-monospace, "SF Mono", "Menlo", Monaco, Consolas, monospace !important;
        --font-weight-normal: 400 !important;
        --font-weight-medium: 500 !important;
        --font-weight-semibold: 600 !important;
        --font-weight-bold: 700 !important;
        --font-weight-black: 800 !important;
      }

      html, body, #root, #Main {
        -webkit-font-smoothing: antialiased !important;
        -moz-osx-font-smoothing: grayscale !important;
        text-rendering: optimizeLegibility !important;
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
        font-weight: 600 !important;
        -webkit-font-smoothing: antialiased !important;
        -moz-osx-font-smoothing: grayscale !important;
      }

      /* Имя в профиле (само название) — строго жирный шрифт 700 */
      #RightColumn .ProfileInfo .fullName,
      #RightColumn .ProfileInfo .fullName *,
      #RightColumn .ProfileInfo .title,
      #RightColumn .ProfileInfo .title *,
      #RightColumn .ProfileInfo h3,
      #RightColumn .ProfileInfo h3 *,
      .ProfileInfo .fullName,
      .ProfileInfo .fullName *,
      .ProfileInfo .title,
      .ProfileInfo .title *,
      .ProfileInfo h3,
      .ProfileInfo h3 * {
        font-family: var(--font-family) !important;
        font-weight: 700 !important;
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

    const DEFAULT_ETH_COLORS = {
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
    };

    const colorsToApply = (hasColors && Object.keys(mod.colors).length > 0)
      ? { ...DEFAULT_ETH_COLORS, ...mod.colors }
      : DEFAULT_ETH_COLORS;

    if (window.__ethernetPrevColors) {
      for (const k of Object.keys(window.__ethernetPrevColors)) {
        if (!(k in colorsToApply)) {
          htmlStyle.removeProperty(k);
        }
      }
    }
    for (const [k, v] of Object.entries(colorsToApply)) {
      const cleanVal = (v || '').replace(/\s*!important/g, '').trim();
      if (cleanVal && (/^#[0-9a-fA-F]{3,8}$/.test(cleanVal) || cleanVal.startsWith('rgb') || cleanVal.startsWith('hsl'))) {
        htmlStyle.setProperty(k, cleanVal, 'important');
      }
    }
    window.__ethernetPrevColors = { ...colorsToApply };

    const primaryRaw = colorsToApply['--color-primary'] || '#3b82f6';
    const primaryHex = primaryRaw.replace(/\s*!important/g, '').trim();
    const linksColor = colorsToApply['--color-links'];
    const bgRaw = colorsToApply['--color-background'] || '#16171a';
    const bgHex = bgRaw.replace(/\s*!important/g, '').trim();

    // Синхронизируем --theme-background-color с --color-background темы
    htmlStyle.setProperty('--theme-background-color', bgHex, 'important');
    if (document.body) {
      document.body.style.setProperty('--theme-background-color', bgHex, 'important');
    }

    // Применение цвета фона темы ко всему окну и чату
    css.push(`
      :root, html, body, #root, #Main, #Main > div:first-child, .background, [class*="_background_"], #MiddleColumn {
        --color-background: ${bgHex} !important;
        --theme-background-color: ${bgHex} !important;
      }

      /* Если нет кастомных картиночных/видео обоев, применяем цвет фона темы ко всему холсту приложения */
      html:not([data-ethernet-wallpaper="true"]) body,
      html:not([data-ethernet-wallpaper="true"]) body.bg,
      html:not([data-ethernet-wallpaper="true"]) #root,
      html:not([data-ethernet-wallpaper="true"]) #Main,
      html:not([data-ethernet-wallpaper="true"]) #Main > div:first-child,
      html:not([data-ethernet-wallpaper="true"]) .background,
      html:not([data-ethernet-wallpaper="true"]) [class*="_background_"] {
        background: ${bgHex} !important;
        background-color: ${bgHex} !important;
      }

      /* Скрываем нативные дудлы и канвас градиента Telegram, перекрывающие цвет фона темы */
      html:not([data-ethernet-wallpaper="true"]) #Main > div:first-child canvas,
      html:not([data-ethernet-wallpaper="true"]) #Main > .background canvas,
      html:not([data-ethernet-wallpaper="true"]) #Main > [class*="_background_"] canvas,
      html:not([data-ethernet-wallpaper="true"]) .gradientCanvas,
      html:not([data-ethernet-wallpaper="true"]) canvas.gradientCanvas,
      html:not([data-ethernet-wallpaper="true"]) #Main > div:first-child::after,
      html:not([data-ethernet-wallpaper="true"]) #Main > .background::after,
      html:not([data-ethernet-wallpaper="true"]) #Main > [class*="_background_"]::after,
      html:not([data-ethernet-wallpaper="true"]) #Main > div:first-child::before,
      html:not([data-ethernet-wallpaper="true"]) #Main > .background::before,
      html:not([data-ethernet-wallpaper="true"]) #Main > [class*="_background_"]::before {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
      }
    `);

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
          --color-message-reaction-own: rgba(0, 0, 0, 0.08) !important;
          --color-message-reaction-hover-own: rgba(0, 0, 0, 0.14) !important;
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

        /* Защита кнопок всплывающего меню форматирования текста от закрашивания при выделении */
        [class*="TextFormatter_root"],
        [class*="TextFormatter_root"] *,
        [class*="RichEditorTooltipPanel"],
        [class*="RichEditorTooltipPanel"] * {
          user-select: none !important;
          -webkit-user-select: none !important;
        }
        [class*="TextFormatter_root"]::selection,
        [class*="TextFormatter_root"] *::selection,
        [class*="RichEditorTooltipPanel"]::selection,
        [class*="RichEditorTooltipPanel"] *::selection {
          background: transparent !important;
          background-color: transparent !important;
          color: inherit !important;
        }

        /* Кнопка «Прокомментировать» в каналах: всегда акцентный цвет темы, а не цвет канала */
        #MiddleColumn .Message .CommentButton {
          color: var(--color-primary, #3b82f6) !important;
        }
        #MiddleColumn .Message .CommentButton .icon-comments,
        #MiddleColumn .Message .CommentButton .CommentButton_icon-open,
        #MiddleColumn .Message .CommentButton .label {
          color: var(--color-primary, #3b82f6) !important;
        }
        #MiddleColumn .Message .CommentButton.has-unread .label::after {
          background-color: var(--color-primary, #3b82f6) !important;
        }

        /* Отдельный цвет кнопки отправки */
        .Composer > .Button.main-button,
        .Composer .Button.main-button,
        #MiddleColumn .Composer .Button.main-button,
        .AttachmentModal .send,
        .AttachmentModal .send-wrapper .Button {
          background-color: var(--color-send-button, var(--color-primary, #3b82f6)) !important;
        }
        .Composer > .Button.main-button:hover,
        .Composer .Button.main-button:hover,
        #MiddleColumn .Composer .Button.main-button:hover,
        .AttachmentModal .send:hover {
          background-color: color-mix(in srgb, var(--color-send-button, var(--color-primary, #3b82f6)) 85%, black) !important;
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

        /* Радиокнопки и чекбоксы: текст всегда прозрачный без паразитных фонов */
        .Radio-main,
        .Radio-main *,
        .Radio input:checked + .Radio-main,
        .Radio input:checked ~ .Radio-main {
          background-color: transparent !important;
          background: transparent !important;
        }

        /* Слайдеры */
        .RangeSlider .RangeSlider__fill,
        .RangeSlider .RangeSlider__thumb {
          background-color: var(--color-primary) !important;
          border-color: var(--color-primary) !important;
        }

        .Button.primary:not([class*="ReactionButton"]):not(.message-reaction),
        button.Button.primary:not([class*="ReactionButton"]):not(.message-reaction),
        .theme-editor-actions > button:not(.translucent) {
          --button-active-background-color: color-mix(in srgb, var(--color-primary) 60%, black) !important;
          --button-no-ripple-background-color: color-mix(in srgb, var(--color-primary) 55%, black) !important;
          background-color: color-mix(in srgb, var(--color-primary) 70%, black) !important;
          color: var(--color-white, #fff) !important;
        }

        .Button.primary:not([class*="ReactionButton"]):not(.message-reaction):hover:not(:disabled),
        .Button.primary:not([class*="ReactionButton"]):not(.message-reaction):focus:not(:disabled),
        .Button.primary:not([class*="ReactionButton"]):not(.message-reaction):active:not(:disabled),
        button.Button.primary:not([class*="ReactionButton"]):not(.message-reaction):hover:not(:disabled),
        .theme-editor-actions > button:not(.translucent):hover {
          background-color: color-mix(in srgb, var(--color-primary) 60%, black) !important;
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

        /* Реакции: явное разделение непроставленных и проставленных (без глоу) */
        .Message .Reactions .Button:not(.chosen):not([class*="chosen"]),
        .Message .Reactions .message-reaction:not(.chosen):not([class*="chosen"]),
        button[class*="ReactionButton-module__root"]:not(.chosen):not([class*="chosen"]) {
          background: rgba(255, 255, 255, 0.08) !important;
          background-color: rgba(255, 255, 255, 0.08) !important;
          border: 2px solid transparent !important;
          color: var(--color-text-secondary, #a2a8b4) !important;
          box-shadow: none !important;
        }

        .Message .Reactions .Button.chosen,
        .Message .Reactions .Button[class*="chosen"],
        .Message .Reactions .message-reaction.chosen,
        .Message .Reactions .message-reaction[class*="chosen"],
        .ReactionButton.chosen,
        .ReactionButton.is-chosen,
        .ReactionSelector .chosen,
        button[class*="ReactionButton-module__root"].chosen,
        button[class*="ReactionButton-module__root"][class*="chosen"] {
          background: var(--color-primary) !important;
          background-color: var(--color-primary) !important;
          border: 2px solid transparent !important;
          color: #ffffff !important;
          box-shadow: none !important;
        }

        /* Все вложенные элементы реакции (эмодзи, текст, счетчик) */
        .Message .Reactions .Button [class*="animatedEmoji"],
        .Message .Reactions .Button [class*="counter"],
        .Message .Reactions .Button [class*="tagText"],
        .Message .Reactions .message-reaction [class*="animatedEmoji"],
        .Message .Reactions .message-reaction [class*="counter"],
        .Message .Reactions .message-reaction [class*="tagText"],
        [class*="ReactionButton-module__animatedEmoji"],
        [class*="ReactionButton-module__counter"],
        [class*="ReactionButton-module__tagText"] {
          background: transparent !important;
          background-color: transparent !important;
          box-shadow: none !important;
          display: inline-flex !important;
          align-items: center !important;
          line-height: 1 !important;
        }

        .Message .Reactions .Button.chosen *,
        .Message .Reactions .Button[class*="chosen"] *,
        .Message .Reactions .message-reaction.chosen *,
        .Message .Reactions .message-reaction[class*="chosen"] *,
        button[class*="ReactionButton-module__root"].chosen *,
        button[class*="ReactionButton-module__root"][class*="chosen"] * {
          color: #ffffff !important;
          fill: #ffffff !important;
        }

        /* Закрепленные сообщения и шапка */
        .HeaderPinnedMessageWrapper [class*="title"],
        [class*="HeaderPinnedMessage-module__title"] {
          color: var(--color-text-secondary) !important;
        }
        [class*="PinnedMessageNavigation-module__pinned-message-border-wrapper-1"],
        [class*="PinnedMessageNavigation-module__pinned-message-border-mark"] {
          background: var(--color-text-secondary) !important;
        }
        [class*="PinnedMessageNavigation-module__pinned-message-border-wrapper"] {
          background-color: rgba(var(--color-text-secondary-rgb), 0.25) !important;
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

    if (hasColors && mod.colors['--color-icon-buttons']) {
      const btnIconHex = mod.colors['--color-icon-buttons'];
      css.push(`
        :root {
          --color-icon-buttons: ${btnIconHex} !important;
        }
      `);
    }

    const hasOwnBg = Boolean(hasColors && mod.colors['--color-background-own']);
    const ownBgHex = hasOwnBg ? mod.colors['--color-background-own'] : '';
    const hasSecBg = Boolean(hasColors && mod.colors['--color-background-secondary']);
    const secBgHex = hasSecBg ? mod.colors['--color-background-secondary'] : '';

    if (hasOwnBg) {
      css.push(`
        :root {
          --color-background-own: ${ownBgHex} !important;
          --color-background-own-apple: ${ownBgHex} !important;
          --color-background-own-selected: color-mix(in srgb, ${ownBgHex} 82%, black) !important;
        }
        .Message.own {
          --background-color: var(--color-background-own) !important;
        }
        .Message.own.selected {
          --background-color: var(--color-background-own-selected, color-mix(in srgb, ${ownBgHex} 82%, black)) !important;
        }
        .Message.own .message-content.has-solid-background,
        .message-content.own.has-solid-background,
        .Message.own .album-item-container {
          background-color: var(--color-background-own) !important;
        }
      `);
    }

    if (hasSecBg) {
      css.push(`
        :root {
          --color-background-secondary: ${secBgHex} !important;
        }
        .Message:not(.own) {
          --background-color: var(--color-background-secondary) !important;
        }
        .Message:not(.own) .message-content.has-solid-background,
        .message-content:not(.own).has-solid-background {
          background-color: var(--color-background-secondary) !important;
        }
      `);
    }

    css.push(`

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
      /* Хвостики сообщений (всегда идеально совпадают по цвету с пузырем) */
      .svg-appendix .corner,
      .svg-appendix path {
        fill: var(--background-color, currentColor);
      }
      .Message.own .svg-appendix .corner,
      .Message.own .svg-appendix .corner-right,
      .Message.own .svg-appendix path,
      .message-content.own .svg-appendix .corner,
      .message-content.own .svg-appendix .corner-right,
      .message-content.own .svg-appendix path {
        fill: var(--color-background-own, ${ownBgHex || 'currentColor'}) !important;
      }
      .Message:not(.own) .svg-appendix .corner,
      .Message:not(.own) .svg-appendix .corner-left,
      .Message:not(.own) .svg-appendix path,
      .message-content:not(.own) .svg-appendix .corner,
      .message-content:not(.own) .svg-appendix .corner-left,
      .message-content:not(.own) .svg-appendix path {
        fill: var(--color-background-secondary, ${secBgHex || 'currentColor'}) !important;
      }
      .message-content[data-has-custom-appendix] .svg-appendix .corner,
      .message-content[data-has-custom-appendix] .svg-appendix .corner-left,
      .message-content[data-has-custom-appendix] .svg-appendix .corner-right,
      .message-content[data-has-custom-appendix] .svg-appendix path {
        fill: var(--appendix-bg) !important;
      }

      .Message.own .svg-appendix .corner-right {
        display: block !important;
      }
      .Message.own .svg-appendix .corner-left {
        display: none !important;
      }

      .Message:not(.own) .svg-appendix .corner-left {
        display: block !important;
      }
      .Message:not(.own) .svg-appendix .corner-right {
        display: none !important;
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
      .CommentButton:not(.CommentButton-custom-shape) {
        border-top: none !important;
        border: none !important;
      }
      .Message.own .CommentButton:not(.CommentButton-custom-shape) {
        background: var(--color-background-own, ${ownBgHex}) !important;
        background-color: var(--color-background-own, ${ownBgHex}) !important;
      }
      .Message:not(.own) .CommentButton:not(.CommentButton-custom-shape) {
        background: var(--color-background-secondary, ${secBgHex}) !important;
        background-color: var(--color-background-secondary, ${secBgHex}) !important;
      }
      .CommentButton.CommentButton-custom-shape {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
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
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 0 !important;
        pointer-events: none !important;
        overflow: hidden !important;
        background-position: center !important;
        background-size: cover !important;
        background-repeat: no-repeat !important;
      }

      #ethernet-video-wallpaper,
      #ethernet-wallpaper-layer video {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        pointer-events: none !important;
        transform: translateZ(0) !important;
        will-change: transform !important;
      }

      #root {
        position: relative !important;
        z-index: 1 !important;
      }

      html[data-ethernet-wallpaper="true"],
      html[data-ethernet-wallpaper="true"] body,
      html[data-ethernet-wallpaper="true"] #root,
      html[data-ethernet-wallpaper="true"] #Main,
      html[data-ethernet-wallpaper="true"] #MiddleColumn,
      html[data-ethernet-wallpaper="true"] #MiddleColumn > div:not(.AudioPlayer):not(.MiddleHeaderPanesIsland),
      html[data-ethernet-wallpaper="true"] #MiddleColumn .messages-layout,
      html[data-ethernet-wallpaper="true"] #MiddleColumn .messages-container,
      html[data-ethernet-wallpaper="true"] #MiddleColumn .MessageList,
      html[data-ethernet-wallpaper="true"] #MiddleColumn .MessageList.with-default-bg,
      html[data-ethernet-wallpaper="true"] #MiddleColumn .MessageList.with-custom-bg,
      html[data-ethernet-wallpaper="true"] #MiddleColumn .chat-background,
      html[data-ethernet-wallpaper="true"] #MiddleColumn .Transition,
      html[data-ethernet-wallpaper="true"] #MiddleColumn .Transition_slide,
      html[data-ethernet-wallpaper="true"] #MiddleColumn .Transition__slide,
      html[data-ethernet-wallpaper="true"] .hrXj504d {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
      }

      html[data-ethernet-wallpaper="true"] #ethernet-wallpaper-layer {
        display: block !important;
        opacity: 1 !important;
      }

      /* Сплошной цвет обоев, заданный непосредственно в карточке "Обои" */
      html[data-ethernet-wallpaper="true"][data-ethernet-wallpaper-kind="color"] body,
      html[data-ethernet-wallpaper="true"][data-ethernet-wallpaper-kind="color"] #ethernet-wallpaper-layer,
      html[data-ethernet-wallpaper="true"][data-ethernet-wallpaper-kind="color"] #Main > div:first-child,
      html[data-ethernet-wallpaper="true"][data-ethernet-wallpaper-kind="color"] #Main > .background,
      html[data-ethernet-wallpaper="true"][data-ethernet-wallpaper-kind="color"] #Main > [class*="_background_"] {
        background-image: none !important;
        background-color: var(--ethernet-wallpaper-color) !important;
        background: var(--ethernet-wallpaper-color) !important;
      }

      /* Фото-обои */
      html[data-ethernet-wallpaper="true"][data-ethernet-wallpaper-kind="image"] #Main > div:first-child,
      html[data-ethernet-wallpaper="true"][data-ethernet-wallpaper-kind="image"] #Main > .background,
      html[data-ethernet-wallpaper="true"][data-ethernet-wallpaper-kind="image"] #Main > [class*="_background_"] {
        background-image: var(--custom-background) !important;
        background-size: cover !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
      }

      /* Видео-обои */
      html[data-ethernet-wallpaper="true"][data-ethernet-wallpaper-kind="video"] #Main > div:first-child,
      html[data-ethernet-wallpaper="true"][data-ethernet-wallpaper-kind="video"] #Main > .background,
      html[data-ethernet-wallpaper="true"][data-ethernet-wallpaper-kind="video"] #Main > [class*="_background_"] {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
      }

      html[data-ethernet-wallpaper] #MiddleColumn .AudioPlayer,
      html[data-ethernet-wallpaper] #MiddleColumn .AudioPlayer.full-width-player {
        background: var(--color-background) !important;
        background-color: var(--color-background) !important;
        box-shadow: var(--shadow-pane) !important;
      }

      /* Скрываем нативные градиенты и дудлы Telegram, перекрывающие кастомные обои */
      html[data-ethernet-wallpaper] #Main > div:first-child::before,
      html[data-ethernet-wallpaper] #Main > div:first-child canvas,
      html[data-ethernet-wallpaper] #Main > .background canvas,
      html[data-ethernet-wallpaper] #Main > [class*="_background_"] canvas,
      html[data-ethernet-wallpaper] .gradientCanvas,
      html[data-ethernet-wallpaper] canvas.gradientCanvas,
      html[data-ethernet-wallpaper] svg.pattern,
      html[data-ethernet-wallpaper] [class*="Pattern"],
      html[data-ethernet-wallpaper] #Main > div:first-child::after,
      html[data-ethernet-wallpaper] #Main > .background::after,
      html[data-ethernet-wallpaper] #Main > [class*="_background_"]::after,
      html[data-ethernet-wallpaper] #Main > .background::before,
      html[data-ethernet-wallpaper] #Main > [class*="_background_"]::before,
      html[data-ethernet-wallpaper] #MiddleColumn::before,
      html[data-ethernet-wallpaper] #MiddleColumn::after {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `);

    // --- Сайдбар профиля/информации: точная копия острова меню чатов слева (скругление, фон, отступы, компактность) ---
    css.push(`
      :root, #Main, #MiddleColumn {
        --custom-right-column-width: 25.5rem !important;
      }

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
      #Main.right-column-shown #RightColumn-wrapper {
        display: block !important;
        visibility: visible !important;
      }

      #Main:not(.right-column-open):not(.right-column-shown) #RightColumn-wrapper,
      #Main:not(.right-column-open):not(.right-column-shown) #RightColumn {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
        opacity: 0 !important;
      }

      #RightColumn-wrapper .overlay-backdrop {
        display: none !important;
        pointer-events: none !important;
      }

      /* Профиль открывается справа на всю высоту, стандартной ширины (не растягиваясь) */
      #RightColumn {
        position: absolute !important;
        top: 0.5rem !important;
        bottom: 0.5rem !important;
        right: 0.5rem !important;
        left: auto !important;
        width: var(--custom-right-column-width, 25.5rem) !important;
        max-width: var(--custom-right-column-width, 25.5rem) !important;
        --right-column-content-width: var(--custom-right-column-width, 25.5rem) !important;
        min-width: 22rem !important;
        height: calc(100% - 1rem) !important;
        max-height: calc(100% - 1rem) !important;
        border-radius: var(--border-radius-island, 1.5625rem) !important;
        box-shadow: var(--shadow-island) !important;
        overflow: hidden !important;
        z-index: 25 !important;
        background-color: var(--color-background) !important;
        background: var(--color-background) !important;
        transition: transform var(--layer-transition, 300ms cubic-bezier(0.33, 1, 0.68, 1)) !important;
      }

      #Main.right-column-open:not(.right-column-closing) #RightColumn {
        transform: translate3d(0, 0, 0) !important;
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      #Main:not(.right-column-open) #RightColumn,
      #Main.right-column-closing #RightColumn {
        transform: translate3d(calc(100% + 1.5rem), 0, 0) !important;
        opacity: 1 !important;
        pointer-events: none !important;
      }

      #Main.right-column-shown #RightColumn-wrapper,
      #Main.right-column-closing #RightColumn-wrapper {
        display: block !important;
        visibility: visible !important;
      }

      #Main:not(.right-column-shown):not(.right-column-closing) #RightColumn-wrapper,
      #Main:not(.right-column-shown):not(.right-column-closing) #RightColumn {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* Если профиль открывается слева (на мобильных устройствах или специальной конфигурации) — плавный выезд и заезд влево */
      html[data-profile-position="left"] #RightColumn {
        right: auto !important;
        left: 0.5rem !important;
      }

      html[data-profile-position="left"] #Main:not(.right-column-open) #RightColumn,
      html[data-profile-position="left"] #Main.right-column-closing #RightColumn {
        transform: translate3d(calc(-100% - 1.5rem), 0, 0) !important;
        opacity: 1 !important;
        pointer-events: none !important;
      }

      /* Гарантированный полноценный Desktop Grid для #Main в Electron */
      #Main {
        display: grid !important;
        grid-template-columns: auto 1fr !important;
        grid-template-rows: 100% !important;
        height: 100% !important;
        width: 100% !important;
        position: relative !important;
      }

      #Main.folders-sidebar-visible {
        grid-template-columns: auto auto 1fr !important;
      }



      #FoldersSidebar,
      #Main #FoldersSidebar {
        position: relative !important;
        transform: none !important;
        margin: 0.5rem 0 0.5rem 0.5rem !important;
        height: calc(100% - 1rem) !important;
        align-self: stretch !important;
        visibility: visible !important;
        opacity: 1 !important;
        z-index: 2 !important;
      }

      /* Интеллектуальная адаптивная ширина левой колонки: просторная в обычном режиме (до 30rem), компактная (23rem) при открытом профиле */
      #LeftColumn,
      #Main #LeftColumn {
        position: relative !important;
        transform: none !important;
        top: auto !important;
        bottom: auto !important;
        left: auto !important;
        right: auto !important;
        margin: 0.5rem 0 0.5rem 0.5rem !important;
        height: calc(100% - 1rem) !important;
        width: var(--left-column-width, 27rem) !important;
        min-width: var(--left-column-min-width, 16rem) !important;
        max-width: var(--left-column-max-width, 30rem) !important;
        box-sizing: border-box !important;
        will-change: width, max-width !important;
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
        z-index: 2 !important;
        transition: width var(--layer-transition, 300ms cubic-bezier(0.33, 1, 0.68, 1)), max-width var(--layer-transition, 300ms cubic-bezier(0.33, 1, 0.68, 1)), transform var(--layer-transition) !important;
      }

      #MiddleColumn,
      #Main #MiddleColumn {
        position: relative !important;
        transform: none !important;
        top: auto !important;
        bottom: auto !important;
        left: auto !important;
        right: auto !important;
        height: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
        flex: 1 1 0 !important;
        z-index: 1 !important;
      }

      /* В обычном состоянии (профиль закрыт): левый сайдбар шире и просторнее (по умолчанию 27rem, возможность растянуть до 30rem) */
      html:not([data-left-column-collapsed="true"]):not(.left-column-is-collapsed):not(.is-resizing-left-column):not(.is-animating-left-column) #Main:not(.right-column-open) #LeftColumn:not(.is-collapsed),
      html:not([data-left-column-collapsed="true"]):not(.left-column-is-collapsed):not(.is-resizing-left-column):not(.is-animating-left-column) #Main:not(.right-column-open) #Main #LeftColumn:not(.is-collapsed),
      html:not([data-left-column-collapsed="true"]):not(.left-column-is-collapsed):not(.is-resizing-left-column):not(.is-animating-left-column) #Main.right-column-closing #LeftColumn:not(.is-collapsed),
      html:not([data-left-column-collapsed="true"]):not(.left-column-is-collapsed):not(.is-resizing-left-column):not(.is-animating-left-column) #Main.right-column-closing #Main #LeftColumn:not(.is-collapsed),
      html[data-left-column-collapsed="true"] #Main:not(.right-column-open) #LeftColumn.has-opened-content,
      html[data-left-column-collapsed="true"] #Main:not(.right-column-open) #Main #LeftColumn.has-opened-content,
      html[data-left-column-collapsed="true"] #Main.right-column-closing #LeftColumn.has-opened-content,
      html[data-left-column-collapsed="true"] #Main.right-column-closing #Main #LeftColumn.has-opened-content {
        width: var(--saved-left-column-width, var(--left-column-width, 27rem)) !important;
        min-width: 16rem !important;
        max-width: 30rem !important;
      }

      /* При открытом профиле: левый сайдбар плавно сужается до компактных 23rem, освобождая место для чата */
      @media (min-width: 601px) {
        html:not([data-left-column-collapsed="true"]):not(.left-column-is-collapsed):not(.is-resizing-left-column):not(.is-animating-left-column) #Main.right-column-open:not(.right-column-closing) #LeftColumn:not(.is-collapsed),
        html:not([data-left-column-collapsed="true"]):not(.left-column-is-collapsed):not(.is-resizing-left-column):not(.is-animating-left-column) #Main.right-column-open:not(.right-column-closing) #Main #LeftColumn:not(.is-collapsed),
        html[data-left-column-collapsed="true"] #Main.right-column-open:not(.right-column-closing) #LeftColumn.has-opened-content,
        html[data-left-column-collapsed="true"] #Main.right-column-open:not(.right-column-closing) #Main #LeftColumn.has-opened-content {
          width: min(var(--left-column-width, 23rem), 23rem) !important;
          max-width: 23rem !important;
        }
      }

      body.no-page-transitions #LeftColumn,
      body.no-right-column-animations #LeftColumn {
        transition: none !important;
      }

      .ArchivedChats,
      .ArchivedChats .left-header,
      .ArchivedChats .chat-list-wrapper,
      .ArchivedChats .chat-list {
        background-color: var(--color-background) !important;
        background: var(--color-background) !important;
      }

      #MiddleColumn .MiddleHeader,
      #MiddleColumn .MiddleHeaderPanesIsland {
        margin-top: 0 !important;
      }

      #MiddleColumn .middle-column-footer {
        margin-bottom: 0.5rem !important;
        padding-bottom: 0 !important;
      }

      /* Полное скрытие скроллбара везде, сохраняя прокрутку */
      #RightColumn,
      #RightColumn *,
      #RightColumn .custom-scroll,
      #RightColumn .Profile,
      #RightColumn .panel-content,
      #RightColumn .Management,
      #LeftColumn,
      #LeftColumn *,
      #LeftColumn .custom-scroll,
      .custom-scroll,
      .settings-main-scroll {
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
        --scrollbar-width: 0px !important;
      }

      #RightColumn::-webkit-scrollbar,
      #RightColumn *::-webkit-scrollbar,
      #LeftColumn::-webkit-scrollbar,
      #LeftColumn *::-webkit-scrollbar,
      .custom-scroll::-webkit-scrollbar,
      .settings-main-scroll::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
        background: transparent !important;
      }

      /* Карточки профиля: естественные симметричные отступы */

      #RightColumn .RightHeader {
        height: var(--column-header-height, 3.5rem) !important;
        padding: 0.5rem 0.8125rem !important;
        display: flex !important;
        align-items: center !important;
        background-color: var(--color-background) !important;
        background: var(--color-background) !important;
        backdrop-filter: none !important;
      }

      /* Убираем только backdrop-filter, НЕ трогаем фон — иначе пропадают разделения между блоками */
      #RightColumn > .Transition,
      #RightColumn .panel-content,
      #RightColumn .Management,
      #RightColumn .ManagementScreens {
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      /* Фон контейнера Profile (scroll root) — вторичный, чтобы Island-карточки выделялись */
      #RightColumn .Profile {
        background-color: var(--color-background-secondary) !important;
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
      #MiddleColumn .messages-layout,
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

      #MiddleColumn {
        --middle-header-shift-x: 0px;
        --middle-header-player-shift-y: 0px;
      }

      :root[data-audio-player-open="true"] #MiddleColumn,
      #MiddleColumn.has-audio-player {
        --middle-header-player-shift-y: 62px;
      }

      #Main.right-column-open:not(.right-column-closing) #MiddleColumn {
        --middle-header-shift-x: calc(-1 * (var(--custom-right-column-width, 25.5rem) + 0.5rem) / 2);
      }

      html[data-profile-position="left"] #Main.right-column-open:not(.right-column-closing) #MiddleColumn {
        --middle-header-shift-x: calc((var(--custom-right-column-width, 25.5rem) + 0.5rem) / 2);
      }

      #MiddleColumn .MiddleHeader,
      #MiddleColumn #MiddleSearch .middle-search-header,
      #MiddleColumn #MiddleSearch > div:first-child,
      #MiddleColumn #MiddleSearch [class*="header"],
      #MiddleColumn #MiddleSearch .header {
        position: absolute !important;
        top: 0.5rem !important;
        left: 0 !important;
        right: 0 !important;
        margin-left: auto !important;
        margin-right: auto !important;
        margin-top: 0 !important;
        margin-bottom: 0 !important;
        width: var(--messages-container-width) !important;
        max-width: calc(100% - 1rem) !important;
        height: var(--middle-header-height, 3.5rem) !important;
        padding-top: 0.25rem !important;
        padding-bottom: 0.25rem !important;
        padding-left: max(0.25rem, env(safe-area-inset-left)) !important;
        padding-right: max(0.25rem, env(safe-area-inset-right)) !important;
        border-radius: var(--border-radius-topbar, var(--border-radius-ui, 1.5rem)) !important;
        box-sizing: border-box !important;
        z-index: 12 !important;
        background: var(--color-background) !important;
        box-shadow: var(--shadow-pane) !important;
        -webkit-font-smoothing: subpixel-antialiased !important;
        transform: none !important;
        transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 150ms ease !important;
      }

      :root[data-audio-player-open="true"] #MiddleColumn .MiddleHeader,
      #MiddleColumn.has-audio-player .MiddleHeader,
      :root[data-audio-player-open="true"] #MiddleColumn #MiddleSearch .middle-search-header,
      #MiddleColumn.has-audio-player #MiddleSearch .middle-search-header,
      :root[data-audio-player-open="true"] #MiddleColumn #MiddleSearch > div:first-child,
      #MiddleColumn.has-audio-player #MiddleSearch > div:first-child {
        transform: translateY(var(--middle-header-player-shift-y, 62px)) !important;
      }

      #Main.right-column-open:not(.right-column-closing) #MiddleColumn .MiddleHeader,
      #Main.right-column-open:not(.right-column-closing) #MiddleColumn #MiddleSearch .middle-search-header,
      #Main.right-column-open:not(.right-column-closing) #MiddleColumn #MiddleSearch > div:first-child {
        transform: translate3d(var(--middle-header-shift-x, 0px), var(--middle-header-player-shift-y, 0px), 0) !important;
      }

      #MiddleColumn .MiddleHeaderPanesIsland {
        position: absolute !important;
        top: calc(0.5rem + var(--middle-header-player-height, 0px) + var(--middle-header-height, 3.5rem) + 6px) !important;
        left: 0 !important;
        right: 0 !important;
        margin-left: auto !important;
        margin-right: auto !important;
        margin-top: 0 !important;
        margin-bottom: 0 !important;
        width: var(--messages-container-width) !important;
        max-width: calc(100% - 1rem) !important;
        border-radius: var(--border-radius-topbar, var(--border-radius-ui, 1.5rem)) !important;
        box-sizing: border-box !important;
        z-index: 11 !important;
        -webkit-font-smoothing: subpixel-antialiased !important;
        transform: none !important;
        transition: top 300ms cubic-bezier(0.16, 1, 0.3, 1), transform 300ms cubic-bezier(0.16, 1, 0.3, 1) !important;
      }

      #Main.right-column-open:not(.right-column-closing) #MiddleColumn .MiddleHeaderPanesIsland {
        transform: translate3d(var(--middle-header-shift-x, 0px), 0, 0) !important;
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
    const isFull = mod.chatWidth === 'full';
    const isWide = mod.chatWidth === 'wide';
    const containerWidth = isFull
      ? 'calc(100% - 1rem)'
      : (isWide ? 'min(65rem, calc(100% - 1rem))' : 'min(47.5rem, calc(100% - 1rem))');

    css.push(`
      :root, #Main, #MiddleColumn {
        --messages-container-width: ${containerWidth} !important;
      }

      /* Центрирование без постоянного will-change/transform, что предотвращает размытие шрифтов на Windows */
      #MiddleColumn .middle-column-footer,
      #MiddleColumn .MessageList .messages-container,
      #MiddleColumn .messages-container {
        position: absolute !important;
        left: 0 !important;
        right: 0 !important;
        margin-left: auto !important;
        margin-right: auto !important;
        width: var(--messages-container-width) !important;
        max-width: calc(100% - 1rem) !important;
        box-sizing: border-box !important;
        transform: none !important;
        -webkit-font-smoothing: subpixel-antialiased !important;
      }

      @keyframes islandPlayerSlideDown {
        from {
          transform: translate3d(var(--middle-header-shift-x, 0px), -100%, 0);
          opacity: 0;
        }
        to {
          transform: translate3d(var(--middle-header-shift-x, 0px), 0, 0);
          opacity: 1;
        }
      }

      @keyframes islandPlayerSlideUp {
        from {
          transform: translate3d(var(--middle-header-shift-x, 0px), 0, 0);
          opacity: 1;
        }
        to {
          transform: translate3d(var(--middle-header-shift-x, 0px), -100%, 0);
          opacity: 0;
        }
      }

      #MiddleColumn .AudioPlayer {
        --island-player-shift-x: var(--middle-header-shift-x, 0px);
        position: absolute !important;
        top: 0.5rem !important;
        left: 0 !important;
        right: 0 !important;
        margin-left: auto !important;
        margin-right: auto !important;
        margin-top: 0 !important;
        margin-bottom: 0 !important;
        width: var(--messages-container-width) !important;
        max-width: calc(100% - 1rem) !important;
        height: var(--middle-header-height, 3.5rem) !important;
        min-height: var(--middle-header-height, 3.5rem) !important;
        box-sizing: border-box !important;
        z-index: 15 !important;
        background: var(--color-background) !important;
        background-color: var(--color-background) !important;
        border: none !important;
        box-shadow: var(--shadow-pane) !important;
        border-radius: var(--border-radius-topbar, var(--border-radius-ui, 1.5rem)) !important;
        -webkit-font-smoothing: subpixel-antialiased !important;
        animation: islandPlayerSlideDown 300ms cubic-bezier(0.16, 1, 0.3, 1) both !important;
      }

      #MiddleColumn .AudioPlayer.island-player-closing {
        animation: islandPlayerSlideUp 240ms cubic-bezier(0.4, 0, 1, 1) both !important;
        pointer-events: none !important;
      }

      #MiddleColumn .AudioPlayer.full-width-player {
        padding-top: 0.25rem !important;
        padding-bottom: 0.25rem !important;
        padding-left: max(0.25rem, env(safe-area-inset-left)) !important;
        padding-right: max(0.25rem, env(safe-area-inset-right)) !important;
      }

      #MiddleColumn .AudioPlayer .audio-player-icon-badge {
        width: 2.5rem !important;
        height: 2.5rem !important;
        min-width: 2.5rem !important;
        margin: 0 0.625rem 0 0 !important;
        padding: 0 !important;
        border-radius: 50% !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
        flex-shrink: 0 !important;
        cursor: pointer !important;
        background-size: cover !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
      }

      #MiddleColumn .AudioPlayer .audio-player-icon-badge.has-cover-image {
        background-size: cover !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3) !important;
      }

      #MiddleColumn .AudioPlayer .audio-player-icon-badge.has-cover-image .icon {
        display: none !important;
      }

      #MiddleColumn .AudioPlayer .audio-player-icon-badge.has-accent-color {
        background: var(--color-primary) !important;
        color: #ffffff !important;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25) !important;
      }

      #MiddleColumn .AudioPlayer .audio-player-icon-badge.has-accent-color .icon {
        font-size: 1.35rem !important;
        color: #ffffff !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }

      #MiddleColumn .AudioPlayer .audio-player-icon-badge.has-accent-color img,
      #MiddleColumn .AudioPlayer .audio-player-icon-badge.has-accent-color .audio-player-preview-img {
        display: none !important;
      }

      #MiddleColumn .AudioPlayer .audio-player-icon-badge img,
      #MiddleColumn .AudioPlayer .audio-player-icon-badge .audio-player-preview-img {
        width: 100% !important;
        height: 100% !important;
        min-width: 100% !important;
        min-height: 100% !important;
        object-fit: cover !important;
        border-radius: 50% !important;
        display: block !important;
        pointer-events: none !important;
      }

      #MiddleColumn .AudioPlayer .AudioPlayer-content {
        padding: 0 !important;
        margin: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: center !important;
        min-width: 0 !important;
      }

      #MiddleColumn .AudioPlayer .AudioPlayer-content .title {
        font-size: 1.125rem !important;
        font-weight: var(--font-weight-medium, 500) !important;
        color: var(--color-text, #ffffff) !important;
        line-height: 1.5rem !important;
        margin: 0 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }

      #MiddleColumn .AudioPlayer .AudioPlayer-content .subtitle {
        font-size: 0.875rem !important;
        font-weight: normal !important;
        color: var(--color-text-secondary, rgba(255, 255, 255, 0.6)) !important;
        line-height: 1.125rem !important;
        margin: 0 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }

      #MiddleColumn .AudioPlayer > .Button,
      #MiddleColumn .AudioPlayer > .playback-rate-menu,
      #MiddleColumn .AudioPlayer .playback-wrapper,
      #MiddleColumn .AudioPlayer .volume-button-wrapper,
      #MiddleColumn .AudioPlayer .profile-music-button-wrapper {
        margin: 0 0 0 0.25rem !important;
      }

      #MiddleColumn .AudioPlayer .player-button,
      #MiddleColumn .AudioPlayer .player-close,
      #MiddleColumn .AudioPlayer .playback-button,
      #MiddleColumn .AudioPlayer .profile-music-button-wrapper > .Button,
      #MiddleColumn .AudioPlayer .volume-button-wrapper > .Button {
        width: 2.5rem !important;
        height: 2.5rem !important;
        min-width: 2.5rem !important;
        margin: 0 !important;
      }

      #MiddleColumn .AudioPlayer .player-close {
        margin: 0 0 0 0.25rem !important;
      }

      #Main.right-column-open:not(.right-column-closing) #MiddleColumn .AudioPlayer {
        --island-player-shift-x: calc(-1 * (var(--custom-right-column-width, 25.5rem) + 0.5rem) / 2);
      }

      html[data-profile-position="left"] #Main.right-column-open:not(.right-column-closing) #MiddleColumn .AudioPlayer {
        --island-player-shift-x: calc((var(--custom-right-column-width, 25.5rem) + 0.5rem) / 2);
      }

      #MiddleColumn .AudioPlayer:not(.island-player-closing) {
        animation: islandPlayerSlideDown 300ms cubic-bezier(0.33, 1, 0.68, 1) both !important;
        will-change: transform, opacity !important;
        pointer-events: auto !important;
      }

      #MiddleColumn .AudioPlayer.island-player-closing {
        animation: islandPlayerSlideUp 300ms cubic-bezier(0.33, 1, 0.68, 1) both !important;
        will-change: transform, opacity !important;
        pointer-events: none !important;
      }

      #MiddleColumn .MiddleHeader.is-hidden-by-search,
      #MiddleColumn:has(#MiddleSearch.active) .MiddleHeader,
      #MiddleColumn:has(#MiddleSearch[class*="active"]) .MiddleHeader,
      #MiddleColumn:has(#MiddleSearch.active) .MiddleHeaderPanesIsland,
      #MiddleColumn:has(#MiddleSearch[class*="active"]) .MiddleHeaderPanesIsland {
        opacity: 0 !important;
        pointer-events: none !important;
        visibility: hidden !important;
      }

      #MiddleColumn #MiddleSearch:not(.active) .middle-search-header,
      #MiddleColumn #MiddleSearch:not(.active) > div:first-child,
      #MiddleColumn #MiddleSearch:not([class*="active"]) .middle-search-header,
      #MiddleColumn #MiddleSearch:not([class*="active"]) > div:first-child {
        opacity: 0 !important;
        pointer-events: none !important;
        visibility: hidden !important;
      }

      #MiddleColumn #MiddleSearch.active .middle-search-header,
      #MiddleColumn #MiddleSearch.active > div:first-child,
      #MiddleColumn #MiddleSearch[class*="active"] .middle-search-header,
      #MiddleColumn #MiddleSearch[class*="active"] > div:first-child {
        opacity: 1 !important;
        pointer-events: auto !important;
        visibility: visible !important;
      }

      #MiddleColumn .middle-column-footer {
        bottom: 0.5rem !important;
        margin-top: 0 !important;
        margin-bottom: 0 !important;
        display: flex !important;
        justify-content: center !important;
        align-items: flex-end !important;
        padding: 0 !important;
      }

      #MiddleColumn .MessageList .messages-container,
      #MiddleColumn .messages-container {
        position: relative !important;
        max-width: calc(100% - 1rem) !important;
      }

      #LeftColumn {
        transition: width var(--layer-transition, 300ms cubic-bezier(0.33, 1, 0.68, 1)),
                    max-width var(--layer-transition, 300ms cubic-bezier(0.33, 1, 0.68, 1)) !important;
      }
      html.is-resizing-left-column #LeftColumn:not(.is-snapping-collapse) {
        transition: none !important;
      }

      /* Сворачивание списка чатов до аватарок (Telegram Desktop style) */
      /* Применяется ИСКЛЮЧИТЕЛЬНО к списку чатов (data-is-chat-list="true" / .is-chat-list) */
      /* Сворачивание списка чатов до аватарок (Telegram Desktop style) */
      /* Применяется ИСКЛЮЧИТЕЛЬНО к списку чатов (data-is-chat-list="true" / .is-chat-list) */
      :root[data-left-column-collapsed="true"]:not(.is-resizing-left-column) #LeftColumn:not(.has-opened-content),
      :root[data-left-column-collapsed="true"]:not(.is-resizing-left-column) #LeftColumn.is-chat-list,
      :root[data-left-column-collapsed="true"]:not(.is-resizing-left-column) #Main #LeftColumn:not(.has-opened-content),
      :root[data-left-column-collapsed="true"]:not(.is-resizing-left-column) #Main #LeftColumn.is-chat-list,
      :root[data-left-column-collapsed="true"]:not(.is-resizing-left-column) #Main:not(.right-column-open) #LeftColumn:not(.has-opened-content),
      :root[data-left-column-collapsed="true"]:not(.is-resizing-left-column) #Main:not(.right-column-open) #Main #LeftColumn:not(.has-opened-content),
      :root[data-left-column-collapsed="true"]:not(.is-resizing-left-column) #Main:not(.right-column-open) #Main #LeftColumn.is-chat-list,
      html[data-left-column-collapsed="true"]:not(.is-resizing-left-column) #LeftColumn[data-is-chat-list="true"],
      html[data-left-column-collapsed="true"]:not(.is-resizing-left-column) #LeftColumn.is-chat-list,
      html[data-left-column-collapsed="true"]:not(.is-resizing-left-column) #Main #LeftColumn[data-is-chat-list="true"],
      html[data-left-column-collapsed="true"]:not(.is-resizing-left-column) #Main #LeftColumn.is-chat-list,
      html[data-left-column-collapsed="true"]:not(.is-resizing-left-column) #Main:not(.right-column-open) #Main #LeftColumn[data-is-chat-list="true"],
      html[data-left-column-collapsed="true"]:not(.is-resizing-left-column) #Main:not(.right-column-open) #Main #LeftColumn.is-chat-list,
      html:not(.is-resizing-left-column).left-column-is-collapsed #LeftColumn:not(.has-opened-content),
      html:not(.is-resizing-left-column).left-column-is-collapsed #LeftColumn.is-chat-list,
      html:not(.is-resizing-left-column) #LeftColumn.is-collapsed:not(.has-opened-content),
      html:not(.is-resizing-left-column) #LeftColumn.is-collapsed.is-chat-list {
        --left-column-min-width: 4.25rem !important;
        --left-column-max-width: 4.25rem !important;
        --left-column-width: 4.25rem !important;
        width: 4.25rem !important;
        min-width: 4.25rem !important;
        max-width: 4.25rem !important;
        flex-basis: 4.25rem !important;
        box-sizing: border-box !important;
        padding: 0 !important;
      }

      /* Для всех остальных экранов в сайдбаре (настройки, контакты, архив, создание групп и т.д.) - восстанавливается полная ширина */
      :root[data-left-column-collapsed="true"] #LeftColumn.has-opened-content,
      :root[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="false"],
      :root[data-left-column-collapsed="true"] #Main #LeftColumn.has-opened-content,
      :root[data-left-column-collapsed="true"] #Main #LeftColumn[data-is-chat-list="false"],
      :root[data-left-column-collapsed="true"] #Main:not(.right-column-open) #Main #LeftColumn.has-opened-content,
      :root[data-left-column-collapsed="true"] #Main:not(.right-column-open) #Main #LeftColumn[data-is-chat-list="false"],
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="false"],
      html[data-left-column-collapsed="true"] #LeftColumn.has-opened-content,
      html[data-left-column-collapsed="true"] #Main #LeftColumn.has-opened-content,
      html[data-left-column-collapsed="true"] #Main #LeftColumn[data-is-chat-list="false"],
      html[data-left-column-collapsed="true"] #Main:not(.right-column-open) #Main #LeftColumn.has-opened-content,
      html[data-left-column-collapsed="true"] #Main:not(.right-column-open) #Main #LeftColumn[data-is-chat-list="false"] {
        --left-column-min-width: 25rem !important;
        --left-column-max-width: 35rem !important;
        --left-column-width: var(--saved-left-column-width, 27rem) !important;
        width: var(--saved-left-column-width, 27rem) !important;
        min-width: 25rem !important;
        max-width: 35rem !important;
        flex-basis: var(--saved-left-column-width, 27rem) !important;
      }

      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .left-header,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .left-header,
      html.left-column-is-collapsed #LeftColumn .left-header,
      #LeftColumn.is-collapsed .left-header {
        padding: 0.5rem 0 !important;
        justify-content: center !important;
      }

      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .left-header h3,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .left-header .SearchInput,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .left-header .DropdownMenu,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .left-header h3,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .left-header .SearchInput,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .left-header .DropdownMenu,
      html.left-column-is-collapsed #LeftColumn .left-header h3,
      html.left-column-is-collapsed #LeftColumn .left-header .SearchInput,
      html.left-column-is-collapsed #LeftColumn .left-header .DropdownMenu,
      #LeftColumn.is-collapsed .left-header h3,
      #LeftColumn.is-collapsed .left-header .SearchInput,
      #LeftColumn.is-collapsed .left-header .DropdownMenu {
        display: none !important;
      }

      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .left-header button,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .left-header button,
      html.left-column-is-collapsed #LeftColumn .left-header button,
      #LeftColumn.is-collapsed .left-header button {
        margin: 0 auto !important;
      }

      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .ChatFolders .tabs-placeholder,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .ChatFolderTabList,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .ChatFolders .tabs-placeholder,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .ChatFolderTabList,
      html.left-column-is-collapsed #LeftColumn .ChatFolders .tabs-placeholder,
      html.left-column-is-collapsed #LeftColumn .ChatFolderTabList,
      #LeftColumn.is-collapsed .ChatFolders .tabs-placeholder,
      #LeftColumn.is-collapsed .ChatFolderTabList {
        display: none !important;
      }

      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .chat-list,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .chat-list,
      html.left-column-is-collapsed #LeftColumn .chat-list,
      #LeftColumn.is-collapsed .chat-list {
        padding-left: 0 !important;
        padding-right: 0 !important;
      }

      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .Chat,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .chat-item-clickable,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .chat-item-archive,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .Chat,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .chat-item-clickable,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .chat-item-archive,
      html.left-column-is-collapsed #LeftColumn .Chat,
      html.left-column-is-collapsed #LeftColumn .chat-item-clickable,
      html.left-column-is-collapsed #LeftColumn .chat-item-archive,
      #LeftColumn.is-collapsed .Chat,
      #LeftColumn.is-collapsed .chat-item-clickable,
      #LeftColumn.is-collapsed .chat-item-archive {
        width: 100% !important;
        max-width: 100% !important;
        left: 0 !important;
        right: 0 !important;
        margin: 0 !important;
        padding: 0 0.3125rem !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        box-sizing: border-box !important;
      }

      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .ListItem-button,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .ListItem-button,
      html.left-column-is-collapsed #LeftColumn .ListItem-button,
      #LeftColumn.is-collapsed .ListItem-button {
        width: 3.625rem !important;
        height: 3.625rem !important;
        min-height: 3.625rem !important;
        margin: 0 auto !important;
        padding: 0 !important;
        border-radius: var(--border-radius-default) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: width 250ms cubic-bezier(0.33, 1, 0.68, 1),
                    height 250ms cubic-bezier(0.33, 1, 0.68, 1),
                    margin 250ms cubic-bezier(0.33, 1, 0.68, 1),
                    padding 250ms cubic-bezier(0.33, 1, 0.68, 1) !important;
      }

      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .Chat .status,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .Chat .avatar-wrapper,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .chat-item-archive .status,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] [class*="avatarWrapper"],
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .Chat .status,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .Chat .avatar-wrapper,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .chat-item-archive .status,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list [class*="avatarWrapper"],
      html.left-column-is-collapsed #LeftColumn .Chat .status,
      html.left-column-is-collapsed #LeftColumn .Chat .avatar-wrapper,
      html.left-column-is-collapsed #LeftColumn .chat-item-archive .status,
      html.left-column-is-collapsed #LeftColumn [class*="avatarWrapper"],
      #LeftColumn.is-collapsed .Chat .status,
      #LeftColumn.is-collapsed .Chat .avatar-wrapper,
      #LeftColumn.is-collapsed .chat-item-archive .status,
      #LeftColumn.is-collapsed [class*="avatarWrapper"] {
        margin: 0 auto !important;
        justify-content: center !important;
        align-self: center !important;
        flex-shrink: 0 !important;
        transition: margin 250ms cubic-bezier(0.33, 1, 0.68, 1), transform 250ms cubic-bezier(0.33, 1, 0.68, 1) !important;
      }

      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .Avatar,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .Avatar,
      html.left-column-is-collapsed #LeftColumn .Avatar,
      #LeftColumn.is-collapsed .Avatar {
        margin: 0 auto !important;
      }

      /* Скрываем весь текст, метаданные, счетчики и превью архива */
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .Chat .info,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .Chat .subtitle,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .Chat .last-message,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .Chat .separator,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .Chat .LastMessageMeta,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .Chat .title,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .ChatCallStatus,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .chat-item-archive .info,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .chat-item-archive [class*="info"],
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .chat-item-archive .subtitle,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .chat-item-archive [class*="chatsPreview"],
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .chat-item-archive [class*="unreadCount"],
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .chat-item-archive [class*="title"],
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .chat-item-archive h3,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .Chat .info,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .Chat .subtitle,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .Chat .last-message,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .Chat .separator,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .Chat .LastMessageMeta,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .Chat .title,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .ChatCallStatus,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .chat-item-archive .info,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .chat-item-archive [class*="info"],
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .chat-item-archive .subtitle,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .chat-item-archive [class*="chatsPreview"],
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .chat-item-archive [class*="unreadCount"],
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .chat-item-archive [class*="title"],
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .chat-item-archive h3,
      html.left-column-is-collapsed #LeftColumn .Chat .info,
      html.left-column-is-collapsed #LeftColumn .Chat .subtitle,
      html.left-column-is-collapsed #LeftColumn .Chat .last-message,
      html.left-column-is-collapsed #LeftColumn .Chat .separator,
      html.left-column-is-collapsed #LeftColumn .Chat .LastMessageMeta,
      html.left-column-is-collapsed #LeftColumn .Chat .title,
      html.left-column-is-collapsed #LeftColumn .ChatCallStatus,
      html.left-column-is-collapsed #LeftColumn .chat-item-archive .info,
      html.left-column-is-collapsed #LeftColumn .chat-item-archive [class*="info"],
      html.left-column-is-collapsed #LeftColumn .chat-item-archive .subtitle,
      html.left-column-is-collapsed #LeftColumn .chat-item-archive [class*="chatsPreview"],
      html.left-column-is-collapsed #LeftColumn .chat-item-archive [class*="unreadCount"],
      html.left-column-is-collapsed #LeftColumn .chat-item-archive [class*="title"],
      html.left-column-is-collapsed #LeftColumn .chat-item-archive h3,
      #LeftColumn.is-collapsed .Chat .info,
      #LeftColumn.is-collapsed .Chat .subtitle,
      #LeftColumn.is-collapsed .Chat .last-message,
      #LeftColumn.is-collapsed .Chat .separator,
      #LeftColumn.is-collapsed .Chat .LastMessageMeta,
      #LeftColumn.is-collapsed .Chat .title,
      #LeftColumn.is-collapsed .ChatCallStatus,
      #LeftColumn.is-collapsed .chat-item-archive .info,
      #LeftColumn.is-collapsed .chat-item-archive [class*="info"],
      #LeftColumn.is-collapsed .chat-item-archive .subtitle,
      #LeftColumn.is-collapsed .chat-item-archive [class*="chatsPreview"],
      #LeftColumn.is-collapsed .chat-item-archive [class*="unreadCount"],
      #LeftColumn.is-collapsed .chat-item-archive [class*="title"],
      #LeftColumn.is-collapsed .chat-item-archive h3 {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
        max-width: 0 !important;
        min-width: 0 !important;
        overflow: hidden !important;
        white-space: nowrap !important;
        margin: 0 !important;
        padding: 0 !important;
        transform: translateX(10px) !important;
        transition: opacity 250ms cubic-bezier(0.33, 1, 0.68, 1), transform 250ms cubic-bezier(0.33, 1, 0.68, 1), visibility 250ms !important;
      }

      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .NewChatButton,
      html[data-left-column-collapsed="true"] #LeftColumn[data-is-chat-list="true"] .FloatingActionButton,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .NewChatButton,
      html[data-left-column-collapsed="true"] #LeftColumn.is-chat-list .FloatingActionButton,
      html.left-column-is-collapsed #LeftColumn .NewChatButton,
      html.left-column-is-collapsed #LeftColumn .FloatingActionButton,
      #LeftColumn.is-collapsed .NewChatButton,
      #LeftColumn.is-collapsed .FloatingActionButton {
        left: 50% !important;
        transform: translateX(-50%) !important;
        right: auto !important;
        transition: left 250ms cubic-bezier(0.33, 1, 0.68, 1), transform 250ms cubic-bezier(0.33, 1, 0.68, 1) !important;
      }

      #LeftColumn:not(.is-collapsed) .ListItem-button {
        transition: width 250ms cubic-bezier(0.33, 1, 0.68, 1),
                    height 250ms cubic-bezier(0.33, 1, 0.68, 1),
                    margin 250ms cubic-bezier(0.33, 1, 0.68, 1),
                    padding 250ms cubic-bezier(0.33, 1, 0.68, 1) !important;
      }
      #LeftColumn:not(.is-collapsed) .Chat .status,
      #LeftColumn:not(.is-collapsed) .Chat .avatar-wrapper,
      #LeftColumn:not(.is-collapsed) .chat-item-archive .status,
      #LeftColumn:not(.is-collapsed) [class*="avatarWrapper"] {
        transition: margin 250ms cubic-bezier(0.33, 1, 0.68, 1), transform 250ms cubic-bezier(0.33, 1, 0.68, 1) !important;
      }
      #LeftColumn:not(.is-collapsed) .Chat .info,
      #LeftColumn:not(.is-collapsed) .chat-item-archive .info,
      #LeftColumn:not(.is-collapsed) .chat-item-archive [class*="info"] {
        transition: opacity 250ms cubic-bezier(0.33, 1, 0.68, 1), transform 250ms cubic-bezier(0.33, 1, 0.68, 1), visibility 250ms !important;
      }
      #LeftColumn:not(.is-collapsed) .NewChatButton,
      #LeftColumn:not(.is-collapsed) .FloatingActionButton {
        transition: left 250ms cubic-bezier(0.33, 1, 0.68, 1), right 250ms cubic-bezier(0.33, 1, 0.68, 1), transform 250ms cubic-bezier(0.33, 1, 0.68, 1) !important;
      }

      /* Плавные переходы цветов для всех поверхностей UI, тем, панелей, сообщений и кнопок */
      :root, html, body, #root, #Main,
      #LeftColumn, #MiddleColumn, #RightColumn, #FoldersSidebar,
      .left-header, .MiddleHeader, .RightHeader, .Composer,
      .Message, .Message .message-content, .Message .text-content, .Message .message-content-wrapper,
      .Chat, .Chat .ListItem-button, .ListItem, .ListItem-button,
      .theme-editor-content, .theme-editor-island, .theme-editor-section,
      .Button, .btn-icon, .icon-button,
      .header-tools button, .left-header button, .MiddleHeader button, .RightHeader button, .DropdownMenu button,
      .MenuItem, .ChatBadge, .badge, .Badge, .ChatExtra, .TabList-item,
      .Checkbox .Checkbox-main, .Radio .Radio-main,
      .input-group, .SearchInput, .form-control {
        transition: background-color 0.25s cubic-bezier(0.33, 1, 0.68, 1),
                    color 0.25s cubic-bezier(0.33, 1, 0.68, 1),
                    border-color 0.25s cubic-bezier(0.33, 1, 0.68, 1),
                    box-shadow 0.25s cubic-bezier(0.33, 1, 0.68, 1),
                    fill 0.25s cubic-bezier(0.33, 1, 0.68, 1) !important;
      }


      :root[data-audio-player-open="true"] {
        --middle-header-player-height: calc(var(--middle-header-height, 3.5rem) + 0.35rem);
      }

      /* При открытии профиля: чат аппаратно сдвигается ровно посередине в свободное пространство без изменения размеров (никакого ресайза и перерисовок) */
      #Main.right-column-open:not(.right-column-closing) #MiddleColumn .middle-column-footer,
      #Main.right-column-open:not(.right-column-closing) #MiddleColumn .MessageList .messages-container,
      #Main.right-column-open:not(.right-column-closing) #MiddleColumn .messages-container {
        transform: translate3d(calc(-1 * (var(--custom-right-column-width, 25.5rem) + 0.5rem) / 2), 0, 0) !important;
      }

      html[data-profile-position="left"] #Main.right-column-open:not(.right-column-closing) #MiddleColumn .middle-column-footer,
      html[data-profile-position="left"] #Main.right-column-open:not(.right-column-closing) #MiddleColumn .MessageList .messages-container,
      html[data-profile-position="left"] #Main.right-column-open:not(.right-column-closing) #MiddleColumn .messages-container {
        transform: translate3d(calc((var(--custom-right-column-width, 25.5rem) + 0.5rem) / 2), 0, 0) !important;
      }

      #Main:not(.right-column-open) #MiddleColumn .middle-column-footer,
      #Main:not(.right-column-open) #MiddleColumn .MessageList .messages-container,
      #Main:not(.right-column-open) #MiddleColumn .messages-container,
      #Main.right-column-closing #MiddleColumn .middle-column-footer,
      #Main.right-column-closing #MiddleColumn .MessageList .messages-container,
      #Main.right-column-closing #MiddleColumn .messages-container {
        transform: translate3d(0, 0, 0) !important;
      }

      /* Режим перекрытия профиля: чат не смещается и не анимируется, сайдбар не ресайзится */
      html[data-profile-mode="overlay"] #Main.right-column-open #LeftColumn,
      html[data-profile-mode="overlay"] #Main.right-column-open:not(.right-column-closing) #LeftColumn,
      html[data-profile-mode="overlay"] #Main.right-column-open:not(.right-column-closing) #LeftColumn {
        width: var(--left-column-width, 27rem) !important;
        max-width: 30rem !important;
        transition: none !important;
      }

      html[data-profile-mode="overlay"] #Main.right-column-open #MiddleColumn .middle-column-footer,
      html[data-profile-mode="overlay"] #Main.right-column-open:not(.right-column-closing) #MiddleColumn .middle-column-footer,
      html[data-profile-mode="overlay"] #Main.right-column-open #MiddleColumn .MessageList .messages-container,
      html[data-profile-mode="overlay"] #Main.right-column-open:not(.right-column-closing) #MiddleColumn .MessageList .messages-container,
      html[data-profile-mode="overlay"] #Main.right-column-open #MiddleColumn .messages-container,
      html[data-profile-mode="overlay"] #Main.right-column-open:not(.right-column-closing) #MiddleColumn .messages-container {
        transform: translate3d(0, 0, 0) !important;
        transition: none !important;
      }

      /* Защита от сброса ширины контейнера при добавлении класса narrow-message-list */
      #Main.narrow-message-list #MiddleColumn .messages-container,
      #Main.narrow-message-list #MiddleColumn .MessageList .messages-container {
        width: var(--messages-container-width) !important;
        max-width: calc(100% - 1rem) !important;
      }

      /* =========================================================================
         ГАРАНТИРОВАННАЯ ПОЛНАЯ ШИРИНА СООБЩЕНИЙ С АЛЬБОМАМИ (МЕДИА-ГРУППАМИ)
         ========================================================================= */
      #MiddleColumn .Message.is-album > .message-content-wrapper,
      #MiddleColumn .Message:has(.Album) > .message-content-wrapper {
        width: min(var(--max-width, 29rem), 100%) !important;
        min-width: min(var(--max-width, 29rem), 100%) !important;
      }

      #MiddleColumn .Message.is-album .message-content,
      #MiddleColumn .Message .message-content:has(.Album) {
        width: 100% !important;
        min-width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      /* =========================================================================
         1. ПРИЛЕГАНИЕ МЕДИА И АЛЬБОМОВ К КРАЯМ СООБЩЕНИЙ С ФОНОМ (0px зазор по бокам)
         ========================================================================= */
      #MiddleColumn .Message .message-content.has-solid-background:not(.custom-shape) > .content-inner > .media-inner:not(.RoundVideo),
      #MiddleColumn .Message .message-content.has-solid-background:not(.custom-shape) > .content-inner > .Album,
      #MiddleColumn .Message .message-content.has-solid-background:not(.custom-shape):has(.media-inner:not(.RoundVideo)) > .content-inner > .media-inner:not(.RoundVideo),
      #MiddleColumn .Message .message-content.has-solid-background:not(.custom-shape):has(.Album) > .content-inner > .Album,
      #MiddleColumn .Message .message-content.text.media:not(.custom-shape) > .content-inner > .media-inner:not(.RoundVideo),
      #MiddleColumn .Message .message-content.text.has-adaptive-width:not(.custom-shape) > .content-inner > .media-inner:not(.RoundVideo),
      #MiddleColumn .Message .message-content.text.is-album > .content-inner > .Album,
      #MiddleColumn .Message .message-content.text.media > .content-inner > .Album,
      #MiddleColumn .Message.is-album .message-content.text > .content-inner > .Album,
      #MiddleColumn .Message .message-content.text:has(.Album) > .content-inner > .Album,
      #MiddleColumn .Message .message-content.has-subheader.media:not(.custom-shape) > .content-inner > .media-inner:not(.RoundVideo),
      #MiddleColumn .Message .message-content.has-subheader.media > .content-inner > .Album,
      #MiddleColumn .Message .message-content.is-forwarded.media:not(.custom-shape) > .content-inner > .media-inner:not(.RoundVideo),
      #MiddleColumn .Message .message-content.is-forwarded.media > .content-inner > .Album {
        width: calc(100% + var(--message-media-breakout-left, 0.5rem) + var(--message-media-breakout-right, 0.5rem)) !important;
        max-width: calc(100% + var(--message-media-breakout-left, 0.5rem) + var(--message-media-breakout-right, 0.5rem)) !important;
        margin-left: calc(-1 * var(--message-media-breakout-left, 0.5rem)) !important;
        margin-right: calc(-1 * var(--message-media-breakout-right, 0.5rem)) !important;
      }

      /* =========================================================================
         2. ЧИСТЫЕ МЕДИА И АЛЬБОМЫ БЕЗ ФОНА/ТЕКСТА: 100% ширина без вылетов
         ========================================================================= */
      #MiddleColumn .Message .message-content:not(.custom-shape):not(.has-solid-background):not(.text) > .content-inner > .media-inner:not(.RoundVideo),
      #MiddleColumn .Message .message-content:not(.custom-shape):not(.has-solid-background):not(.text) .media-inner:not(.RoundVideo) {
        width: 100% !important;
        max-width: 100% !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
      }

      #MiddleColumn .Message .message-content:not(.has-solid-background):not(.text) .Album,
      #MiddleColumn .Message.is-album .message-content:not(.has-solid-background):not(.text) .Album {
        width: 100% !important;
        max-width: 100% !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
      }

      #MiddleColumn .Message .message-content.media:not(.custom-shape):not(.text):not(:has(.Album)) {
        width: fit-content !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      /* Фиксация даты и просмотров внутри правого нижнего угла медиа */
      #MiddleColumn .Message .message-content.media:not(.custom-shape):not(.text):not(:has(> .CommentButton)):not(.has-bottom-comment-button):not(.has-replies) > .MessageMeta,
      #MiddleColumn .Message.is-album .message-content:not(.text):not(:has(> .CommentButton)):not(.has-bottom-comment-button):not(.has-replies) > .MessageMeta {
        position: absolute !important;
        right: 0.375rem !important;
        bottom: 0.375rem !important;
        left: auto !important;
        z-index: 5 !important;
        max-width: calc(100% - 0.75rem) !important;
      }

      /* Если есть кнопка комментариев под медиа — дата и просмотры строго над ней в углу медиа */
      #MiddleColumn .Message .message-content.media:not(.custom-shape):not(.text):is(:has(> .CommentButton), .has-bottom-comment-button, .has-replies) > .MessageMeta,
      #MiddleColumn .Message.is-album .message-content:not(.text):is(:has(> .CommentButton), .has-bottom-comment-button, .has-replies) > .MessageMeta {
        position: absolute !important;
        right: 0.375rem !important;
        bottom: 3.375rem !important;
        left: auto !important;
        z-index: 5 !important;
        max-width: calc(100% - 0.75rem) !important;
      }

      /* =========================================================================
         2.1. КРУГЛЫЕ ВИДЕО (ВИДЕОКРУЖКИ): строго фиксированный круг 15rem x 15rem
         ========================================================================= */
      #MiddleColumn .Message .message-content.custom-shape.round,
      #MiddleColumn .Message .message-content.custom-shape:has(.RoundVideo) {
        width: auto !important;
        min-width: 15rem !important;
        min-height: 15rem !important;
        display: flex !important;
        align-items: flex-end !important;
        background: transparent !important;
        background-color: transparent !important;
        box-shadow: none !important;
      }

      #MiddleColumn .Message .message-content.custom-shape > .content-inner:has(.RoundVideo),
      #MiddleColumn .Message .message-content.custom-shape .content-inner:has(.RoundVideo) {
        width: 15rem !important;
        min-width: 15rem !important;
        max-width: 15rem !important;
        height: 15rem !important;
        min-height: 15rem !important;
        max-height: 15rem !important;
        flex: 0 0 15rem !important;
        display: block !important;
        position: relative !important;
        background: transparent !important;
        background-color: transparent !important;
        box-shadow: none !important;
      }

      #MiddleColumn .Message .RoundVideo,
      #MiddleColumn .Message .media-inner.RoundVideo {
        width: 15rem !important;
        min-width: 15rem !important;
        max-width: 15rem !important;
        height: 15rem !important;
        min-height: 15rem !important;
        max-height: 15rem !important;
        flex: 0 0 15rem !important;
        border-radius: 50% !important;
        overflow: hidden !important;
        position: relative !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background-color: rgba(0, 0, 0, 0.45) !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25) !important;
        cursor: pointer !important;
        user-select: none !important;
      }

      #MiddleColumn .Message .RoundVideo .video-wrapper,
      #MiddleColumn .Message .RoundVideo .thumbnail {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        border-radius: 50% !important;
        object-fit: cover !important;
        display: block !important;
      }

      #MiddleColumn .Message .RoundVideo video {
        width: 100% !important;
        height: 100% !important;
        border-radius: 50% !important;
        object-fit: cover !important;
        display: block !important;
      }

      #MiddleColumn .Message .message-content.custom-shape:has(.RoundVideo) > .MessageMeta,
      #MiddleColumn .Message .message-content.custom-shape.round > .MessageMeta {
        position: absolute !important;
        right: 0.25rem !important;
        bottom: 0.25rem !important;
        left: auto !important;
        z-index: 5 !important;
        height: 1.125rem !important;
        padding: 0 0.3125rem 0 0.375rem !important;
        border-radius: 0.625rem !important;
        background: rgba(0, 0, 0, 0.55) !important;
        color: #ffffff !important;
      }

      /* Реакции и дата/просмотры внизу сообщения: выравнивание и прозрачный фон даты */
      #MiddleColumn .Message .Reactions {
        display: flex !important;
        align-items: center !important;
        flex-wrap: wrap !important;
        gap: 0.375rem !important;
        width: 100% !important;
        box-sizing: border-box !important;
        padding: 0.125rem 0.25rem !important;
      }

      #MiddleColumn .Message .Reactions .MessageMeta,
      #MiddleColumn .Message .MessageMeta.reactions-offset {
        position: relative !important;
        top: 0 !important;
        bottom: auto !important;
        right: auto !important;
        left: auto !important;
        align-self: center !important;
        margin-left: auto !important;
        margin-top: 0 !important;
        margin-bottom: 0 !important;
        margin-right: 0 !important;
        padding: 0 !important;
        height: auto !important;
        line-height: inherit !important;
        background: transparent !important;
        background-color: transparent !important;
        box-shadow: none !important;
        color: var(--color-text-secondary, #9da7b7) !important;
        white-space: nowrap !important;
      }

      #MiddleColumn .Message .Reactions .MessageMeta *,
      #MiddleColumn .Message .MessageMeta.reactions-offset * {
        color: var(--color-text-secondary, #9da7b7) !important;
      }

      /* Общие стили содержимого медиа и элементов альбома */
      #MiddleColumn .Message .media-inner:not(.RoundVideo) > video,
      #MiddleColumn .Message .media-inner:not(.RoundVideo) > img,
      #MiddleColumn .Message .media-inner:not(.RoundVideo) > canvas,
      #MiddleColumn .Message .media-inner:not(.RoundVideo) > .full-media,
      #MiddleColumn .Message .media-inner:not(.RoundVideo) > .thumbnail {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
      }

      #MiddleColumn .Message .Album .album-item-select-wrapper {
        width: 100% !important;
        height: 100% !important;
      }

      #MiddleColumn .Message .Album .album-item-select-wrapper .media-inner {
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
      }

      #MiddleColumn .Message .Album .album-item-select-wrapper .media-inner img,
      #MiddleColumn .Message .Album .album-item-select-wrapper .media-inner video {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
      }

      /* =========================================================================
         3. ГРУППЫ ДОКУМЕНТОВ/ФАЙЛОВ: оба файла строго одинаковой полной ширины
         ========================================================================= */
      #MiddleColumn .Message.is-in-document-group > .message-content-wrapper {
        width: min(32rem, 100%) !important;
        min-width: min(32rem, 100%) !important;
        max-width: 70% !important;
      }

      #MiddleColumn .Message.is-in-document-group .message-content.document {
        width: 100% !important;
        min-width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      #MiddleColumn .Message.is-in-document-group .File {
        width: 100% !important;
        min-width: 100% !important;
      }

      /* Веб-превью страниц (ссылки на YouTube и т.д.): пропорциональный красивый размер, не узкий */
      #MiddleColumn .Message .WebPage {
        width: min(38rem, 100%) !important;
        max-width: 100% !important;
        min-width: min(20rem, 100%) !important;
      }

      #MiddleColumn .Message .WebPage .media-inner:not(.square-image) {
        width: 100% !important;
        max-width: 100% !important;
      }
    `);

    if (isFull || isWide) {
      css.push(`
        /* Сообщения слева и справа сжаты ровно до 70% ширины контейнера */
        #MiddleColumn .Message {
          --max-width: min(44rem, 70vw);
          --media-max-height: 32rem;
        }

        #MiddleColumn .Message:not(.is-in-document-group) > .message-content-wrapper {
          max-width: min(44rem, 70%) !important;
        }

        #MiddleColumn .Message .message-content {
          max-width: min(var(--max-width, 44rem), 100%) !important;
          box-sizing: border-box !important;
        }

        /* Сообщения с медиа и текстом: комфортная ширина до 70% */
        #MiddleColumn .Message .message-content.media.text,
        #MiddleColumn .Message .message-content.has-adaptive-width.text {
          min-width: min(22rem, 100%) !important;
          max-width: 100% !important;
        }
      `);
    } else {
      css.push(`
        /* В стандартном режиме (по умолчанию): аккуратная ширина сообщений */
        #MiddleColumn .Message {
          --max-width: 32rem !important;
        }

        #MiddleColumn .Message:not(.is-in-document-group) > .message-content-wrapper {
          max-width: 32rem !important;
        }

        #MiddleColumn .Message .message-content {
          max-width: 32rem !important;
          box-sizing: border-box !important;
        }

        #MiddleColumn .Message .message-content.media.text,
        #MiddleColumn .Message .message-content.has-adaptive-width.text {
          min-width: min(18rem, 100%) !important;
          max-width: 32rem !important;
        }
      `);
    }

    /* Управление шириной сообщений с медиа: Стандартный (26rem), Широкий (34rem), На всю ширину */
    css.push(`
      html[data-media-width="standard"] #MiddleColumn .Message:is(.is-album, :has(.Album), :has(.media-inner:not(.RoundVideo)), .media):not(.custom-shape) > .message-content-wrapper {
        max-width: 26rem !important;
      }
      html[data-media-width="standard"] #MiddleColumn .Message:not(.custom-shape) .message-content:is(.media, .is-album, :has(.Album), :has(.media-inner:not(.RoundVideo))) {
        max-width: 26rem !important;
      }

      html[data-media-width="wide"] #MiddleColumn .Message:is(.is-album, :has(.Album), :has(.media-inner:not(.RoundVideo)), .media):not(.custom-shape) > .message-content-wrapper {
        max-width: 34rem !important;
      }
      html[data-media-width="wide"] #MiddleColumn .Message:not(.custom-shape) .message-content:is(.media, .is-album, :has(.Album), :has(.media-inner:not(.RoundVideo))) {
        max-width: 34rem !important;
      }

      html[data-media-width="full"] #MiddleColumn .Message:is(.is-album, :has(.Album), :has(.media-inner:not(.RoundVideo)), .media):not(.custom-shape) > .message-content-wrapper {
        max-width: min(44rem, 70vw) !important;
      }
      html[data-media-width="full"] #MiddleColumn .Message:not(.custom-shape) .message-content:is(.media, .is-album, :has(.Album), :has(.media-inner:not(.RoundVideo))) {
        max-width: min(44rem, 70vw) !important;
      }
    `);

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

      /* Гарантированное удержание сообщений внутри границ чата без схлопывания контента */
      .Message,
      .message-content-wrapper,
      .with-subheader {
        min-width: 0 !important;
      }

      .message-content {
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
      html[data-message-align-own="left"] .Message.own .Reactions,
      html[data-message-align-own="left"] .Message.own .Reactions.is-outside {
        flex-direction: row !important;
        justify-content: flex-start !important;
      }
      html[data-message-align-own="center"] .Message.own {
        flex-direction: row !important;
        justify-content: center !important;
      }
      html[data-message-align-own="center"] .Message.own .quick-reaction {
        left: auto !important;
        right: -0.875rem !important;
      }
      html[data-message-align-own="center"] .Message.own .Reactions,
      html[data-message-align-own="center"] .Message.own .Reactions.is-outside {
        flex-direction: row !important;
        justify-content: center !important;
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
      html[data-message-align-other="right"] .Message:not(.own) .Reactions,
      html[data-message-align-other="right"] .Message:not(.own) .Reactions.is-outside {
        flex-direction: row-reverse !important;
        justify-content: flex-start !important;
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
      const rTop = mod.radii?.topbar !== undefined ? Number(mod.radii.topbar) : (rUi + 8);
      const rFs = mod.radii?.foldersSidebar !== undefined ? Number(mod.radii.foldersSidebar) : (rUi + 8);
      const rMsg = mod.radii?.messages !== undefined ? Number(mod.radii.messages) : (mod.borderRadius !== undefined ? Number(mod.borderRadius) : 15);
      const rBtn = mod.radii?.buttons !== undefined ? Number(mod.radii.buttons) : (mod.borderRadius !== undefined ? Math.max(2, Number(mod.borderRadius) - 4) : 12);
      const rInp = mod.radii?.input !== undefined ? Number(mod.radii.input) : 24;
      const rAv = mod.radii?.avatars !== undefined ? Number(mod.radii.avatars) : 50;

      // Устанавливаем свойства напрямую на htmlStyle с !important для немедленного переопределения
      htmlStyle.setProperty('--border-radius-island', `${(rUi + 8) / 16}rem`, 'important');
      htmlStyle.setProperty('--border-radius-modal', `${(rUi + 16) / 16}rem`, 'important');
      htmlStyle.setProperty('--border-radius-default', `${rUi / 16}rem`, 'important');
      htmlStyle.setProperty('--border-radius-pane', `${(rUi + 8) / 16}rem`, 'important');
      htmlStyle.setProperty('--border-radius-ui', `${rUi}px`, 'important');
      htmlStyle.setProperty('--border-radius-topbar', `${rTop}px`, 'important');
      htmlStyle.setProperty('--border-radius-folders-sidebar', `${rFs / 16}rem`, 'important');

      htmlStyle.setProperty('--border-radius-messages', `${rMsg / 16}rem`, 'important');
      htmlStyle.setProperty('--border-radius-messages-small', `${Math.max(2, rMsg - 8) / 16}rem`, 'important');

      htmlStyle.setProperty('--border-radius-button', `${rBtn / 16}rem`, 'important');
      htmlStyle.setProperty('--border-radius-buttons', `${rBtn}px`, 'important');
      htmlStyle.setProperty('--border-radius-default-small', `${Math.max(2, rBtn - 4) / 16}rem`, 'important');
      htmlStyle.setProperty('--border-radius-default-tiny', `${Math.max(2, rBtn - 8) / 16}rem`, 'important');

      htmlStyle.setProperty('--border-radius-input', `${rInp}px`, 'important');
      htmlStyle.setProperty('--composer-pill-radius', `${rInp}px`, 'important');
      htmlStyle.setProperty('--composer-control-radius', `${rBtn}px`, 'important');

      htmlStyle.setProperty('--avatar-radius', `${rAv}%`, 'important');
      htmlStyle.setProperty('--border-radius-avatars', `${rAv}%`, 'important');

      const activeThemeStyleEl = document.getElementById('ethernet-active-theme-style');
      if (activeThemeStyleEl && activeThemeStyleEl.textContent) {
        let t = activeThemeStyleEl.textContent;
        t = t.replace(/--border-radius-messages\s*:\s*[^;]+;/g, `--border-radius-messages: ${rMsg / 16}rem !important;`);
        t = t.replace(/--border-radius-messages-small\s*:\s*[^;]+;/g, `--border-radius-messages-small: ${Math.max(2, rMsg - 8) / 16}rem !important;`);
        t = t.replace(/--border-radius-ui\s*:\s*[^;]+;/g, `--border-radius-ui: ${rUi}px !important;`);
        if (!t.includes('--border-radius-topbar')) {
          t = t.replace(/:root\s*\{/, `:root {\n  --border-radius-topbar: ${rTop}px !important;`);
        } else {
          t = t.replace(/--border-radius-topbar\s*:\s*[^;]+;/g, `--border-radius-topbar: ${rTop}px !important;`);
        }
        if (!t.includes('--border-radius-folders-sidebar')) {
          t = t.replace(/:root\s*\{/, `:root {\n  --border-radius-folders-sidebar: ${rFs / 16}rem !important;`);
        } else {
          t = t.replace(/--border-radius-folders-sidebar\s*:\s*[^;]+;/g, `--border-radius-folders-sidebar: ${rFs / 16}rem !important;`);
        }
        t = t.replace(/--border-radius-default\s*:\s*[^;]+;/g, `--border-radius-default: ${rUi / 16}rem !important;`);
        t = t.replace(/--border-radius-button\s*:\s*[^;]+;/g, `--border-radius-button: ${rBtn / 16}rem !important;`);
        t = t.replace(/--border-radius-buttons\s*:\s*[^;]+;/g, `--border-radius-buttons: ${rBtn}px !important;`);
        t = t.replace(/--border-radius-input\s*:\s*[^;]+;/g, `--border-radius-input: ${rInp}px !important;`);
        t = t.replace(/--composer-pill-radius\s*:\s*[^;]+;/g, `--composer-pill-radius: ${rInp}px !important;`);
        t = t.replace(/--avatar-radius\s*:\s*[^;]+;/g, `--avatar-radius: ${rAv}% !important;`);
        t = t.replace(/--border-radius-avatars\s*:\s*[^;]+;/g, `--border-radius-avatars: ${rAv}% !important;`);
        activeThemeStyleEl.textContent = t;
      }

      css.push(`
        :root {
          --border-radius-ui: ${rUi}px !important;
          --border-radius-topbar: ${rTop}px !important;
          --border-radius-island: ${(rUi + 8) / 16}rem !important;
          --border-radius-modal: ${(rUi + 16) / 16}rem !important;
          --border-radius-default: ${rUi / 16}rem !important;
          --border-radius-pane: ${(rUi + 8) / 16}rem !important;
          --border-radius-folders-sidebar: ${rFs / 16}rem !important;

          --border-radius-messages: ${rMsg / 16}rem !important;
          --border-radius-messages-small: ${Math.max(2, rMsg - 8) / 16}rem !important;

          --border-radius-button: ${rBtn / 16}rem !important;
          --border-radius-buttons: ${rBtn}px !important;
          --border-radius-default-small: ${Math.max(2, rBtn - 4) / 16}rem !important;
          --border-radius-default-tiny: ${Math.max(2, rBtn - 8) / 16}rem !important;
          --border-radius-input: ${rInp}px !important;
          --composer-pill-radius: ${rInp}px !important;
          --composer-control-radius: ${rBtn}px !important;

          --avatar-radius: ${rAv}% !important;
        }

        .MiddleHeader,
        #MiddleColumn .MiddleHeader,
        #MiddleColumn #MiddleSearch .middle-search-header,
        #MiddleColumn #MiddleSearch > div:first-child,
        #MiddleColumn #MiddleSearch .header,
        .MiddleHeaderPanesIsland,
        #MiddleColumn .MiddleHeaderPanesIsland,
        .AudioPlayer,
        #MiddleColumn .AudioPlayer {
          border-radius: ${rTop}px !important;
        }

        .Composer.is-chat-composer,
        .composer-pill,
        .message-select-control,
        .FooterActionBar {
          border-radius: ${rInp}px !important;
        }

        .Composer .Button.main-button {
          border-radius: ${rBtn}px !important;
        }

        .Avatar, .Avatar > .inner, .avatar-like, .ChatAvatar, .user-avatar, .avatar-element, img.avatar {
          border-radius: ${rAv}% !important;
        }

        .bubble, .message-content, .media-inner, .Album, .ListItem-button, #LeftColumn, #MiddleColumn, .MiddleHeader, #MiddleSearch .middle-search-header, #MiddleSearch > div:first-child, #MiddleSearch .header, .Composer, .Avatar, .Button, .Island, .AudioPlayer {
          transition: border-radius 0.25s cubic-bezier(0.33, 1, 0.68, 1);
        }
      `);
    }

    // --- Блюр: точечное применение по выбранным чекбоксам (Шапка, Меню) ---
    const strength = Number(mod.blurStrength || 0);
    if (strength > 0 && mod.blurTargets) {
      if (mod.blurTargets.header) {
        css.push(`
          .middle-column-header, .MiddleHeader, #MiddleColumn #MiddleSearch .middle-search-header, #MiddleColumn #MiddleSearch > div:first-child, .MiddleHeaderPanesIsland, .AudioPlayer, #MiddleColumn .AudioPlayer {
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
      .ActionMessage [class*="textContent"],
      .ActionMessage [class*="contentBox"],
      .action-message-content {
        background-color: var(--color-background-secondary, var(--color-background, #16171a)) !important;
        background: var(--color-background-secondary, var(--color-background, #16171a)) !important;
        color: var(--color-text, #ffffff) !important;
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
        border: none !important;
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
        border: none !important;
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
          fill: var(--appendix-bg, var(--color-background-own)) !important;
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
          right: -0.562rem !important;
          left: auto !important;
          transform: none !important;
        }

        .Message:not(.own):not(.document-group-member) .svg-appendix .corner-right {
          display: block !important;
          fill: var(--appendix-bg, var(--color-background-secondary)) !important;
        }

        .Message:not(.own):not(.document-group-member) .svg-appendix .corner-left {
          display: none !important;
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
      [data-ethernet-wallpaper="true"] #ethernet-wallpaper-layer {
        display: block !important;
        opacity: 1 !important;
      }

      [data-ethernet-wallpaper="true"][data-ethernet-wallpaper-kind="color"] #ethernet-wallpaper-layer {
        background-image: none !important;
        background-color: var(--ethernet-wallpaper-color) !important;
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
      [data-ethernet-wallpaper="true"] #Main > div:first-child::before,
      [data-ethernet-wallpaper="true"] #Main > .background::after,
      [data-ethernet-wallpaper="true"] #Main > [class*="_background_"]::after,
      [data-ethernet-wallpaper="true"] #Main > .background::before,
      [data-ethernet-wallpaper="true"] #Main > [class*="_background_"]::before,
      [data-ethernet-wallpaper="true"] #MiddleColumn::before,
      [data-ethernet-wallpaper="true"] #MiddleColumn::after,
      [data-ethernet-wallpaper="true"] #MiddleColumn .messages-layout {
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

      /* Титул профиля (имя пользователя / чата / канала) — выразительный жирный 700 */
      #RightColumn .ProfileInfo .fullName,
      #RightColumn .ProfileInfo .fullName *,
      #RightColumn .ProfileInfo .title,
      #RightColumn .ProfileInfo .title *,
      #RightColumn .ProfileInfo h3,
      #RightColumn .ProfileInfo h3 *,
      .ProfileInfo .fullName,
      .ProfileInfo .fullName *,
      .ProfileInfo .title,
      .ProfileInfo .title *,
      .ProfileInfo h3,
      .ProfileInfo h3 * {
        font-weight: 700 !important;
      }

      body, p, span, .message-content, .ListItem .subtitle, .last-message {
        font-weight: 400;
      }

      strong, b, .bold {
        font-weight: 600 !important;
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
        --action-message-bg: var(--color-background-secondary, var(--color-background, #16171a)) !important;
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

      /* Плашки дат и сервисных сообщений: сам ActionMessage прозрачен, красится только короткая плашка внутри */
      .ActionMessage {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }

      .sticky-date > span,
      .local-action-message > span,
      .ActionMessage > span,
      .ActionMessage [class*="textContent"],
      .ActionMessage [class*="contentBox"],
      .message-date-group > span,
      .unread-messages-count {
        background-color: var(--color-background-secondary, var(--color-background, #16171a)) !important;
        background: var(--color-background-secondary, var(--color-background, #16171a)) !important;
        color: var(--color-text, #f3f4f6) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-radius: var(--border-radius-messages, 1rem) !important;
        padding: 0.25rem 0.625rem !important;
        font-weight: 500 !important;
      }

      /* Архив: убираем лишний фон аватарки при наведении */
      .chat-item-archive [class*="avatarWrapper"],
      .chat-item-archive .status {
        background: transparent !important;
        background-color: transparent !important;
      }

      /* Иконки в кнопках: настраиваются пользователем через отдельный ргб-пикер (--color-icon-buttons) */
      .Button:not(.primary):not(.danger) .icon,
      .Button:not(.primary):not(.danger) i.icon,
      button:not(.primary):not(.danger) .icon,
      button:not(.primary):not(.danger) i.icon,
      .btnIcon,
      [class*="btnIcon"],
      [class*="actionBtn"] .icon,
      [class*="actionBtn"] i.icon,
      [class*="actionBtn"] svg {
        color: var(--color-icon-buttons, var(--color-icon-secondary, #9da7b7)) !important;
      }
      .Button.primary .icon,
      .Button.primary i.icon,
      button.primary .icon,
      button.primary i.icon {
        color: var(--color-white, #ffffff) !important;
      }
      .Button.danger .icon,
      .Button.danger i.icon {
        color: var(--color-error, #ff595a) !important;
      }
      .Button.activated .icon,
      .Button.active .icon {
        color: var(--button-active-text-color, var(--color-primary)) !important;
      }

      /* TabList: фон активного индикатора непрозрачный, чтобы текст базового слоя не просвечивал */
      .TabList [class*="activeIndicator"],
      [class*="TabList"] [class*="activeIndicator"] {
        background-color: color-mix(in srgb, var(--color-primary) 24%, var(--color-background, #16171a)) !important;
        background: color-mix(in srgb, var(--color-primary) 24%, var(--color-background, #16171a)) !important;
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

    applyWallpaper(mod);
  }

  // --- Обои: гарантированный изолированный слой под приложением ---
  const WALLPAPER_STORAGE_KEY = 'ethernet_global_wallpaper';
  let activeWallpaperFile = null;
  let activeWallpaperKind = null;

  async function ensureActiveWallpaper() {
    // 1. Проверяем обои с сервера / диска (источник правды для активной темы)
    try {
      const res = await fetch('/ethernet/wallpaper.json');
      if (res.ok) {
        const data = await res.json();
        if (data && data.file) {
          activeWallpaperFile = data.file;
          activeWallpaperKind = data.kind || (
            typeof data.file === 'string' && (data.file.startsWith('#') || data.file.startsWith('rgb'))
              ? 'color'
              : (/\.(mp4|webm)$/i.test(data.file) ? 'video' : 'image')
          );
          applyWallpaper();
          return;
        } else {
          // Нет обоев для активной темы — сбрасываем и не воскрешаем старые
          activeWallpaperFile = null;
          activeWallpaperKind = null;
          try { localStorage.removeItem(WALLPAPER_STORAGE_KEY); } catch {}
          applyWallpaper({ wallpaperFile: null });
          return;
        }
      }
    } catch {}

    // 2. Если в mod.json есть обои
    if (!activeWallpaperFile) {
      try {
        const modRes = await fetch('/ethernet/mod.json');
        if (modRes.ok) {
          const mod = await modRes.json();
          if (mod && mod.wallpaperFile) {
            activeWallpaperFile = mod.wallpaperFile;
            activeWallpaperKind = mod.wallpaperKind || (/\.(mp4|webm)$/i.test(mod.wallpaperFile) ? 'video' : 'image');
            applyWallpaper();
            return;
          }
        }
      } catch {}
    }

    // 3. Запасной fallback только при офлайне/ошибке сети
    try {
      const raw = localStorage.getItem(WALLPAPER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.file || parsed.url)) {
          activeWallpaperFile = parsed.file;
          activeWallpaperKind = parsed.kind || (
            typeof parsed.file === 'string' && (parsed.file.startsWith('#') || parsed.file.startsWith('rgb'))
              ? 'color'
              : (/\.(mp4|webm)$/i.test(parsed.file) ? 'video' : 'image')
          );
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

  function cleanupWallpaperVideo(layer) {
    if (!layer) layer = document.getElementById('ethernet-wallpaper-layer');
    if (!layer) return;
    const existingVideos = layer.querySelectorAll('video');
    existingVideos.forEach((v) => {
      try {
        v.pause();
        v.removeAttribute('src');
        v.load();
      } catch {}
      v.remove();
    });
    const existingCanvases = layer.querySelectorAll('canvas');
    existingCanvases.forEach((c) => c.remove());
  }

  function setupWallpaperVisibilityControl() {
    if (window.__ethernetWallpaperVisibilityBound) return;
    window.__ethernetWallpaperVisibilityBound = true;

    const updatePlaybackState = () => {
      const layer = document.getElementById('ethernet-wallpaper-layer');
      if (!layer) return;
      const video = layer.querySelector('video');
      if (!video) return;

      const isHidden = document.hidden || document.visibilityState === 'hidden' || !document.hasFocus();

      // Автоматически приостанавливаем видео при сворачивании, потере фокуса или скрытии окна Telegram
      // Это сбрасывает потребление GPU и памяти до 0% в фоне
      if (isHidden) {
        if (!video.paused) {
          video.pause();
        }
      } else {
        // Окно развернуто и видимо
        if (video.paused) {
          video.play().catch(() => {});
        }
      }
    };

    window.addEventListener('focus', updatePlaybackState);
    window.addEventListener('blur', updatePlaybackState);
    window.addEventListener('pageshow', updatePlaybackState);
    document.addEventListener('visibilitychange', updatePlaybackState);
    window.addEventListener('hermes:power-suspend', () => {
      const v = document.querySelector('#ethernet-wallpaper-layer video');
      if (v && !v.paused) v.pause();
    });
    window.addEventListener('hermes:power-resume', () => {
      const v = document.querySelector('#ethernet-wallpaper-layer video');
      if (v && v.paused && !document.hidden) v.play().catch(() => {});
    });
  }

  function applyWallpaper(mod) {
    if (mod) {
      if (mod.wallpaperFile !== undefined) {
        activeWallpaperFile = mod.wallpaperFile;
        activeWallpaperKind = mod.wallpaperKind || (
          typeof mod.wallpaperFile === 'string' && (mod.wallpaperFile.startsWith('#') || mod.wallpaperFile.startsWith('rgb'))
            ? 'color'
            : (mod.wallpaperFile && /\.(mp4|webm)$/i.test(mod.wallpaperFile) ? 'video' : 'image')
        );
        if (!mod.wallpaperFile) {
          try { localStorage.removeItem(WALLPAPER_STORAGE_KEY); } catch {}
        }
      }
    }

    const file = activeWallpaperFile;
    const isVideo = activeWallpaperKind === 'video' || (file && /\.(mp4|webm)$/i.test(file));
    const layer = getOrCreateWallpaperLayer();

    if (!file) {
      activeWallpaperFile = null;
      activeWallpaperKind = null;
      try { localStorage.removeItem(WALLPAPER_STORAGE_KEY); } catch {}
      document.documentElement.removeAttribute('data-ethernet-wallpaper');
      document.documentElement.removeAttribute('data-ethernet-wallpaper-kind');
      document.documentElement.style.removeProperty('--custom-background');
      document.documentElement.style.removeProperty('--ethernet-wallpaper-color');
      cleanupWallpaperVideo(layer);
      layer.innerHTML = '';
      layer.style.setProperty('background-image', 'none', 'important');
      layer.style.setProperty('background-color', 'transparent', 'important');
      layer.style.setProperty('display', 'none', 'important');
      return;
    }

    const isColor = typeof file === 'string' && (
      /^#[0-9a-fA-F]{3,8}$/.test(file.trim()) ||
      /^rgba?\s*\([\d\s.,%/-]+\)$/i.test(file.trim()) ||
      /^hsla?\s*\([\d\s.,%/-]+\)$/i.test(file.trim())
    );

    if (isColor) {
      const cleanColor = file.trim();
      try {
        localStorage.setItem(WALLPAPER_STORAGE_KEY, JSON.stringify({ file: cleanColor, kind: 'color' }));
      } catch {}
      document.documentElement.setAttribute('data-ethernet-wallpaper', 'true');
      document.documentElement.setAttribute('data-ethernet-wallpaper-kind', 'color');
      document.documentElement.style.setProperty('--ethernet-wallpaper-color', cleanColor, 'important');
      document.documentElement.style.setProperty('--custom-background', `linear-gradient(${cleanColor}, ${cleanColor})`, 'important');
      cleanupWallpaperVideo(layer);
      layer.innerHTML = '';
      layer.style.setProperty('background-image', 'none', 'important');
      layer.style.setProperty('background-color', cleanColor, 'important');
      layer.style.setProperty('display', 'block', 'important');
      layer.style.setProperty('opacity', '1', 'important');
      return;
    }

    const isDataUri = typeof file === 'string' && (file.startsWith('data:image/') || file.startsWith('data:video/'));
    const safeFile = isDataUri ? file : encodeURIComponent(String(file).replace(/^.*[/\\]/, ''));
    const url = isDataUri ? file : `/ethernet/wallpapers/${safeFile}`;
    const safeCssUrl = url.replace(/["'\r\n\\]/g, (c) => encodeURIComponent(c));

    try {
      localStorage.setItem(WALLPAPER_STORAGE_KEY, JSON.stringify({ file, kind: isVideo ? 'video' : 'image' }));
    } catch {}

    document.documentElement.setAttribute('data-ethernet-wallpaper', 'true');
    document.documentElement.setAttribute('data-ethernet-wallpaper-kind', isVideo ? 'video' : 'image');
    document.documentElement.style.removeProperty('--ethernet-wallpaper-color');
    document.documentElement.style.setProperty('--custom-background', `url("${safeCssUrl}")`, 'important');

    setupWallpaperVisibilityControl();

    if (isVideo) {
      layer.style.setProperty('display', 'block', 'important');
      layer.style.setProperty('opacity', '1', 'important');
      layer.style.setProperty('background-image', 'none', 'important');
      const existingVideo = layer.querySelector('video');
      if (existingVideo && existingVideo.getAttribute('src') === url) {
        // Видео уже воспроизводится и готово, не пересоздаем элемент
        if (!document.hidden && existingVideo.paused) {
          existingVideo.play().catch(() => {});
        }
        return;
      }

      cleanupWallpaperVideo(layer);
      layer.innerHTML = '';

      const video = document.createElement('video');
      video.className = 'ethernet-video-track';
      video.src = url;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('autoplay', 'true');
      video.setAttribute('loop', 'true');
      video.setAttribute('muted', 'true');
      video.setAttribute('playsinline', 'true');
      video.style.position = 'absolute';
      video.style.inset = '0';
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      video.style.pointerEvents = 'none';
      video.style.transform = 'translateZ(0)';
      video.style.willChange = 'transform';

      layer.appendChild(video);
      if (!document.hidden) {
        video.play().catch(() => {});
      }
    } else {
      cleanupWallpaperVideo(layer);
      layer.innerHTML = '';
      layer.style.setProperty('display', 'block', 'important');
      layer.style.setProperty('opacity', '1', 'important');
      layer.style.setProperty('background-color', 'transparent', 'important');
      layer.style.setProperty('background-image', `url("${safeCssUrl}")`, 'important');
      layer.style.setProperty('background-size', 'cover', 'important');
      layer.style.setProperty('background-position', 'center', 'important');
      layer.style.setProperty('background-repeat', 'no-repeat', 'important');
    }
  }

  // Защита обоев от сброса при смене аккаунта и Teact-навигации (без уведомлений, тостов и спама)
  window.addEventListener('hashchange', () => {
    if (activeWallpaperFile) {
      applyWallpaper();
    }
  });
  window.addEventListener('popstate', () => {
    if (activeWallpaperFile) {
      applyWallpaper();
    }
  });
  window.addEventListener('ethernet:theme-changed', () => {
    if (activeWallpaperFile) {
      applyWallpaper();
    }
  });

  // Легковесный наблюдатель за DOM-атрибутом: если Telegram сбросил data-ethernet-wallpaper, тихо восстанавливаем
  if (typeof MutationObserver !== 'undefined') {
    const wpObserver = new MutationObserver(() => {
      if (!activeWallpaperFile) return;
      const isColor = activeWallpaperKind === 'color' || (typeof activeWallpaperFile === 'string' && (activeWallpaperFile.startsWith('#') || activeWallpaperFile.startsWith('rgb')));
      const expectedKind = isColor ? 'color' : (activeWallpaperKind === 'video' ? 'video' : 'image');
      if (document.documentElement.getAttribute('data-ethernet-wallpaper') !== 'true') {
        document.documentElement.setAttribute('data-ethernet-wallpaper', 'true');
      }
      if (document.documentElement.getAttribute('data-ethernet-wallpaper-kind') !== expectedKind) {
        document.documentElement.setAttribute('data-ethernet-wallpaper-kind', expectedKind);
      }
      if (isColor) {
        document.documentElement.style.setProperty('--ethernet-wallpaper-color', activeWallpaperFile, 'important');
        document.documentElement.style.setProperty('--custom-background', `linear-gradient(${activeWallpaperFile}, ${activeWallpaperFile})`, 'important');
      } else {
        const url = `/ethernet/wallpapers/${activeWallpaperFile}`;
        document.documentElement.style.setProperty('--custom-background', `url("${url}")`, 'important');
      }
      const layer = document.getElementById('ethernet-wallpaper-layer');
      if (!layer && document.body) {
        applyWallpaper();
      }
    });
    wpObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-ethernet-wallpaper'],
      childList: true,
    });
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
          margin-top: 0 !important;
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

        /* Скрытие тайтлбара через настройки */
        html[data-hide-titlebar="true"] #ethernet-titlebar {
          display: none !important;
        }
        html[data-hide-titlebar="true"],
        html[data-hide-titlebar="true"] body {
          padding-top: 0 !important;
        }
        html[data-hide-titlebar="true"] #root {
          height: 100vh !important;
          max-height: 100vh !important;
        }
        html[data-hide-titlebar="true"] .left-header,
        html[data-hide-titlebar="true"] .MiddleHeader {
          -webkit-app-region: drag !important;
        }
        html[data-hide-titlebar="true"] .left-header button,
        html[data-hide-titlebar="true"] .left-header input,
        html[data-hide-titlebar="true"] .MiddleHeader button,
        html[data-hide-titlebar="true"] .MiddleHeader input,
        html[data-hide-titlebar="true"] .MiddleHeader [role="button"] {
          -webkit-app-region: no-drag !important;
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
      <div class="ethernet-titlebar-center" id="ethernet-titlebar-text">ethernet</div>
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
        t = t.replace(/\s*·\s*Telegram(\s+Beta)?/gi, '')
             .replace(/\s*·\s*Ethernet/gi, '')
             .replace(/\s*·\s*ethernet/gi, '')
             .replace(/\s*\[Inactive\]/gi, '')
             .trim();
        if (!t || /^(telegram(\s+beta)?|ethernet)$/i.test(t)) {
          t = 'ethernet';
        }
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

  // --- Встроенный системный оптимизатор сети TUN (Network TUN Optimizer) ---
  function initNetworkTunOptimizer() {
    const CANDIDATE_PORTS = [
      { protocol: 'socks5', port: 2080, name: 'HAPP (SOCKS5 2080)' },
      { protocol: 'socks5', port: 10808, name: 'Xray / v2rayN (SOCKS5 10808)' },
      { protocol: 'socks5', port: 7890, name: 'Clash (SOCKS5 7890)' },
      { protocol: 'http', port: 2081, name: 'HAPP (HTTP 2081)' },
      { protocol: 'http', port: 10809, name: 'Xray (HTTP 10809)' },
    ];

    const STYLE_ID = 'ethernet-tun-fix-styles';
    const BANNER_ID = 'ethernet-tun-fix-banner';
    const OVERLAY_BTN_ID = 'ethernet-tun-overlay-btn';

    let isChecking = false;
    let stuckTimer = null;
    let activeBanner = null;
    let activeCandidate = null;
    let lastReportedStatus = null;

    function getDesktopApi() {
      return window.ethernetDesktop || window.hermesDesktop || null;
    }

    function isRussian() {
      const docLang = (document.documentElement.lang || navigator.language || '').toLowerCase();
      return docLang.startsWith('ru');
    }

    function ensureStyles() {
      if (document.getElementById(STYLE_ID)) return;
      const css = `
        #${BANNER_ID} {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 99999;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: var(--color-background-secondary, #212328);
          color: var(--color-text, #ffffff);
          border: 1px solid var(--color-borders, #2a2d34);
          border-radius: var(--border-radius-ui, 12px);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(16px);
          font-size: 13px;
          animation: ethernet-tun-fade-in 0.25s ease-out;
        }
        @keyframes ethernet-tun-fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        #${BANNER_ID} .tun-icon {
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: var(--color-primary, #3b82f6);
          color: #fff;
          font-weight: bold;
          font-size: 13px;
          flex-shrink: 0;
        }
        #${BANNER_ID} .tun-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        #${BANNER_ID} .tun-title {
          font-weight: 600;
          font-size: 13px;
          color: var(--color-text, #ffffff);
        }
        #${BANNER_ID} .tun-desc {
          font-size: 11px;
          color: var(--color-text-secondary, #9da7b7);
        }
        #${BANNER_ID} .tun-btn {
          background: var(--color-primary, #3b82f6);
          color: #ffffff;
          border: none;
          padding: 6px 14px;
          border-radius: var(--border-radius-buttons, 8px);
          font-weight: 500;
          font-size: 12px;
          cursor: pointer;
          transition: opacity 0.15s ease;
          white-space: nowrap;
        }
        #${BANNER_ID} .tun-btn:hover {
          opacity: 0.88;
        }
        #${BANNER_ID} .tun-close {
          background: transparent;
          border: none;
          color: var(--color-text-secondary, #9da7b7);
          cursor: pointer;
          font-size: 16px;
          padding: 4px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        #${BANNER_ID} .tun-close:hover {
          color: var(--color-text, #ffffff);
        }
        #${OVERLAY_BTN_ID} {
          background: rgba(0, 0, 0, 0.2);
          color: inherit;
          border: 1px solid rgba(0, 0, 0, 0.25);
          border-radius: 6px;
          padding: 3px 8px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          margin-inline-end: 8px;
          transition: background 0.15s ease;
        }
        #${OVERLAY_BTN_ID}:hover {
          background: rgba(0, 0, 0, 0.35);
        }
      `;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    }

    function removeBanner() {
      const el = document.getElementById(BANNER_ID);
      if (el) el.remove();
      activeBanner = null;
    }

    function removeOverlayBtn() {
      const btn = document.getElementById(OVERLAY_BTN_ID);
      if (btn) btn.remove();
    }

    function cleanup() {
      removeBanner();
      removeOverlayBtn();
      const style = document.getElementById(STYLE_ID);
      if (style) style.remove();
      if (stuckTimer) {
        clearTimeout(stuckTimer);
        stuckTimer = null;
      }
      activeCandidate = null;
      lastReportedStatus = null;
    }

    function detectTargetConnectionState() {
      const store = window.ethernet?.store || window.hermes?.store;
      if (store && typeof store.getGlobal === 'function') {
        const global = store.getGlobal();
        if (global) {
          if (!navigator.onLine || global.connectionState === 'connectionStateConnecting' || global.connectionState === 'connectionStateBroken') {
            return 'waitingForNetwork';
          }
          if (global.isSyncing || global.isFetchingDifference) {
            return 'updating';
          }
        }
      }

      const overlay = document.getElementById('ConnectionStatusOverlay');
      if (overlay && overlay.offsetParent !== null) {
        const text = (overlay.textContent || '').toLowerCase();
        if (text.includes('ожидание') || text.includes('waiting') || text.includes('сеть') || text.includes('network')) {
          return 'waitingForNetwork';
        }
        if (text.includes('обновление') || text.includes('updating') || text.includes('sync')) {
          return 'updating';
        }
        return 'waitingForNetwork';
      }

      const headerStatus = document.querySelector('.chat-info-wrapper .status, .MiddleHeader .status');
      if (headerStatus) {
        const text = (headerStatus.textContent || '').toLowerCase();
        if (text.includes('ожидание') || text.includes('waiting')) return 'waitingForNetwork';
        if (text.includes('обновление') || text.includes('updating')) return 'updating';
      }

      return null;
    }

    async function probeLocalProxies() {
      const api = getDesktopApi();
      if (!api || !api.proxyTestPing) return null;

      for (const cand of CANDIDATE_PORTS) {
        try {
          const testObj = {
            server: '127.0.0.1',
            port: cand.port,
            protocol: cand.protocol,
          };
          const res = await api.proxyTestPing(testObj);
          if (res && res.success) {
            return { ...cand, ping: res.ping };
          }
        } catch {}
      }
      return null;
    }

    async function applyProxyFix(cand) {
      const api = getDesktopApi();
      if (!api) return;

      removeBanner();
      removeOverlayBtn();

      try {
        const state = (await api.proxyGetState()) || { proxies: [] };
        let existing = (state.proxies || []).find(
          (p) => p.server === '127.0.0.1' && Number(p.port) === Number(cand.port)
        );

        let proxyId = existing ? existing.id : null;
        if (!proxyId) {
          const created = await api.proxySave({
            name: cand.name,
            protocol: cand.protocol,
            server: '127.0.0.1',
            port: cand.port,
          });
          proxyId = created ? created.id : null;
        }

        if (proxyId) {
          await api.proxySetActive(proxyId);
          await api.proxyToggle(true);
          console.info(`[TUN-Optimizer] Switched route to ${cand.name}`);
        }
      } catch (err) {
        console.error('[TUN-Optimizer] Route error:', err);
      }
    }

    function injectOverlayButton(cand) {
      const overlay = document.getElementById('ConnectionStatusOverlay');
      if (!overlay || document.getElementById(OVERLAY_BTN_ID)) return;

      ensureStyles();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = OVERLAY_BTN_ID;
      btn.textContent = `Fix: ${cand.name.split(' ')[0]} (${cand.port})`;
      btn.title = isRussian()
        ? `Перенаправить трафик в ${cand.name} для обхода зависания TUN`
        : `Reroute traffic to ${cand.name} to bypass TUN stall`;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyProxyFix(cand);
      });

      const closeBtn = overlay.querySelector('.Button');
      if (closeBtn) {
        overlay.insertBefore(btn, closeBtn);
      } else {
        overlay.appendChild(btn);
      }
    }

    function showBanner(cand, reasonText) {
      if (document.getElementById(BANNER_ID)) return;
      ensureStyles();

      const ru = isRussian();
      const banner = document.createElement('div');
      banner.id = BANNER_ID;

      const titleText = ru ? `Зависание «${reasonText}» (TUN)` : `Stuck on "${reasonText}" (TUN)`;
      const descText = ru
        ? `Доступен локальный ${cand.name} (${cand.ping ? cand.ping + 'ms' : 'готов'}). Применить?`
        : `Local ${cand.name} available (${cand.ping ? cand.ping + 'ms' : 'ready'}). Apply?`;
      const btnText = ru ? `Обойти в ${cand.name.split(' ')[0]}` : `Route via ${cand.name.split(' ')[0]}`;

      banner.innerHTML = `
        <div class="tun-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
        <div class="tun-text">
          <div class="tun-title">${titleText}</div>
          <div class="tun-desc">${descText}</div>
        </div>
        <button type="button" class="tun-btn" id="tun-apply-btn">${btnText}</button>
        <button type="button" class="tun-close" id="tun-close-btn" title="✕">✕</button>
      `;

      (document.body || document.documentElement).appendChild(banner);
      activeBanner = banner;

      const applyBtn = banner.querySelector('#tun-apply-btn');
      if (applyBtn) {
        applyBtn.addEventListener('click', () => applyProxyFix(cand), { once: true });
      }

      const closeBtn = banner.querySelector('#tun-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', removeBanner, { once: true });
      }
    }

    async function triggerStartLogic(state) {
      if (isChecking) return;
      isChecking = true;

      try {
        const api = getDesktopApi();
        if (!api) return;

        const proxyState = await api.proxyGetState();
        if (proxyState && proxyState.enabled && proxyState.activeProxyId) {
          return;
        }

        const ru = isRussian();
        const statusLabel = state === 'waitingForNetwork'
          ? (ru ? 'Ожидание сети...' : 'Waiting for network...')
          : (ru ? 'Обновление...' : 'Updating...');

        console.info(`[TUN-Optimizer] Detected connection stall: "${statusLabel}". Scanning ports...`);

        const found = await probeLocalProxies();
        if (found) {
          activeCandidate = found;
          injectOverlayButton(found);
          showBanner(found, statusLabel);
        }
      } catch (e) {
        console.warn('[TUN-Optimizer] Port probe error:', e);
      } finally {
        isChecking = false;
      }
    }

    function monitorNetworkStates() {
      const evaluate = () => {
        const targetState = detectTargetConnectionState();

        if (targetState) {
          if (targetState !== lastReportedStatus) {
            lastReportedStatus = targetState;
          }

          if (activeCandidate) {
            injectOverlayButton(activeCandidate);
          }

          if (!stuckTimer) {
            stuckTimer = setTimeout(() => {
              stuckTimer = null;
              triggerStartLogic(targetState);
            }, 2000);
          }
        } else {
          if (stuckTimer) {
            clearTimeout(stuckTimer);
            stuckTimer = null;
          }
          lastReportedStatus = null;
          removeOverlayBtn();
          removeBanner();
        }
      };

      // Проверяем состояние сети только при реальных сетевых событиях или смене статуса
      window.addEventListener('online', evaluate);
      window.addEventListener('offline', evaluate);

      // Легковесная подписка на store без постоянного обхода дерева DOM и таймеров
      const store = window.ethernet?.store || window.hermes?.store;
      if (store && typeof store.subscribe === 'function') {
        store.subscribe(() => {
          const global = store.getGlobal?.();
          if (global?.connectionState && global.connectionState !== 'connectionStateReady') {
            evaluate();
          }
        });
      }
    }

    monitorNetworkStates();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initEthernetTitlebar();
      initEthernetTooltips();
      initNetworkTunOptimizer();
    });
  } else {
    initEthernetTitlebar();
    initEthernetTooltips();
    initNetworkTunOptimizer();
  }

  // Живое применение из редактора (без перезагрузки)
  window.ethernet.applyMod = (mod) => {
    window.__ethernetMod = mod;
    applyModSettings(mod);
  };
})();
