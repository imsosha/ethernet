// Hermes Telegram Client — Integrated Proxy & Bypass Engine
// Управление сетевыми режимами: Встроенный Обход (TG WS Proxy), Пользовательский SOCKS5/HTTP или Прямое подключение

const electron = require('electron');
const fs = require('fs');
const path = require('path');
const net = require('net');
const hermesSettings = require('./hermes-settings.cjs');

const app = electron.app || null;
const isPackaged = app ? app.isPackaged : false;
const ROOT = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..', '..');
const LOG_FILE = path.join(ROOT, 'hermes-proxy.log');

function plog(...args) {
  const msg = `[${new Date().toISOString()}] ${args.map(String).join(' ')}\n`;
  console.log(...args);
  try { fs.appendFileSync(LOG_FILE, msg); } catch {}
}

let currentActiveProxy = null;
let proxyAuthCredentials = null;

/**
 * Обработка авторизации прокси в Electron
 */
if (app && app.on) {
  app.on('login', (event, _webContents, _request, authInfo, callback) => {
    if (authInfo.isProxy && proxyAuthCredentials) {
      event.preventDefault();
      callback(proxyAuthCredentials.username || '', proxyAuthCredentials.password || '');
    }
  });
}

/**
 * Применение конфигурации прокси к Electron-сессии
 * @param {object|null} proxy
 */
async function applyProxyToSession(proxy) {
  const { session: electronSession, BrowserWindow } = electron;
  if (!electronSession) {
    plog('[ProxyEngine] Warning: electron.session not available yet');
    return;
  }

  const defaultSess = electronSession.defaultSession;
  if (!defaultSess) {
    plog('[ProxyEngine] Warning: defaultSession not available yet');
    return;
  }

  const sessions = [defaultSess];
  if (BrowserWindow && typeof BrowserWindow.getAllWindows === 'function') {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (w.webContents && w.webContents.session && !sessions.includes(w.webContents.session)) {
        sessions.push(w.webContents.session);
      }
    });
  }

  if (!proxy || !proxy.server || !proxy.port) {
    currentActiveProxy = null;
    proxyAuthCredentials = null;
    for (const sess of sessions) {
      try {
        await sess.setProxy({ mode: 'direct' });
        if (typeof sess.closeAllConnections === 'function') {
          await sess.closeAllConnections();
        }
        if (typeof sess.clearAuthCache === 'function') {
          await sess.clearAuthCache();
        }
        if (typeof sess.clearHostResolverCache === 'function') {
          await sess.clearHostResolverCache();
        }
      } catch (e) { plog('clearProxy err', e.message); }
    }
    plog('[ProxyEngine] Proxy disabled, direct connection active across all sessions');
    return;
  }

  const { protocol = 'socks5', server, port, auth } = proxy;
  currentActiveProxy = proxy;
  proxyAuthCredentials = (auth && (auth.username || auth.password)) ? auth : null;

  let proxyRules = '';
  if (protocol === 'http') {
    proxyRules = `http=http://${server}:${port};https=http://${server}:${port}`;
  } else {
    // socks5 — Electron/Chromium uses this for all traffic including WebSocket upgrades
    proxyRules = `socks5://${server}:${port}`;
  }

  plog(`[ProxyEngine] Applying proxy (${protocol}): ${proxyRules}`);

  for (const sess of sessions) {
    try {
      await sess.setProxy({ proxyRules });
      if (typeof sess.closeAllConnections === 'function') {
        await sess.closeAllConnections();
      }
      if (typeof sess.clearAuthCache === 'function') {
        await sess.clearAuthCache();
      }
      if (typeof sess.clearHostResolverCache === 'function') {
        await sess.clearHostResolverCache();
      }
      plog('[ProxyEngine] Proxy successfully applied to session');
    } catch (err) {
      plog('[ProxyEngine] Failed to apply proxy to session:', err.message);
    }
  }
}

/**
 * Синхронизация общего состояния сети: Пользовательский прокси > Direct
 */
async function applyNetworkState() {
  const customProxySettings = hermesSettings.getProxySettings();
  let result = { mode: 'direct' };

  // 1. Если включен пользовательский прокси и выбран активный
  if (customProxySettings.enabled && customProxySettings.activeProxyId) {
    const active = (customProxySettings.proxies || []).find((p) => p.id === customProxySettings.activeProxyId);
    if (active) {
      plog('[ProxyEngine] Activating Custom Proxy Mode:', active.name);
      await applyProxyToSession(active);
      result = { mode: 'custom', proxy: active };
    } else {
      await applyProxyToSession(null);
      plog('[ProxyEngine] Active proxy not found, falling back to direct connection');
    }
  } else {
    // 2. Прямое подключение
    await applyProxyToSession(null);
    plog('[ProxyEngine] Direct connection active');
  }

  // Оповещаем все окна о смене сети
  const { BrowserWindow } = electron;
  if (BrowserWindow && typeof BrowserWindow.getAllWindows === 'function') {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (w.webContents && !w.webContents.isDestroyed()) {
        w.webContents.send('hermes:network-changed');
      }
    });
  }

  return result;
}

/**
 * Проверка задержки до сервера прокси по TCP
 */
async function testPing(proxy) {
  if (!proxy || !proxy.server || !proxy.port) return -1;

  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.connect(Number(proxy.port), proxy.server, () => {
      const ping = Date.now() - startTime;
      socket.destroy();
      resolve(ping);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(-1);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(-1);
    });
  });
}

/**
 * Тест ping для kws* (bypass-эндпоинты Telegram)
 */
async function testBypassPing() {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(4000);
    socket.connect(443, 'kws2.web.telegram.org', () => {
      socket.destroy();
      resolve(Date.now() - startTime);
    });
    socket.on('error', () => { socket.destroy(); resolve(-1); });
    socket.on('timeout', () => { socket.destroy(); resolve(-1); });
  });
}

/**
 * Определение текущего внешнего IP и гео-локации через текущую сессию Electron
 */
async function getNetworkGeoInfo() {
  try {
    const endpoints = [
      'https://ipwho.is/',
      'http://ip-api.com/json/?fields=status,message,country,countryCode,city,query,org,isp',
    ];

    let resultData = null;

    // Запрос через net.fetch в контексте Electron сессии (учитывает прокси)
    for (const url of endpoints) {
      try {
        const res = await electron.net.fetch(url);
        if (res.ok) {
          const json = await res.json();
          resultData = json;
          break;
        }
      } catch {}
    }

    const bypassSettings = hermesSettings.getBypassSettings();
    const proxySettings = hermesSettings.getProxySettings();

    let mode = 'direct';
    if (proxySettings.enabled && proxySettings.activeProxyId) {
      mode = 'custom';
    } else if (bypassSettings.enabled) {
      mode = 'bypass';
    }

    if (resultData) {
      return {
        ip: resultData.ip || resultData.query || '127.0.0.1',
        country: resultData.country || resultData.country_name || 'Локальная сеть',
        countryCode: resultData.country_code || resultData.countryCode || 'UN',
        city: resultData.city || '',
        org: resultData.connection?.org || resultData.org || resultData.isp || '',
        mode,
      };
    }

    return {
      ip: 'Не определен',
      country: 'Неизвестно',
      countryCode: 'UN',
      city: '',
      org: '',
      mode,
    };
  } catch (err) {
    plog('[ProxyEngine] Failed to get Geo IP:', err.message);
    return {
      ip: 'Не определен',
      country: 'Неизвестно',
      countryCode: 'UN',
      city: '',
      org: '',
      mode: 'direct',
    };
  }
}

module.exports = {
  applyProxyToSession,
  applyNetworkState,
  testPing,
  testBypassPing,
  getNetworkGeoInfo,
};
