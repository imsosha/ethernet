// Hermes Telegram Client — Clean Proxy URL & Config Parser
// Нативная поддержка SOCKS5 и HTTP(S) прокси

const crypto = require('crypto');

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

function isValidHost(host) {
  if (!host || typeof host !== 'string') return false;
  return /^[a-zA-Z0-9.\-_\[\]]+$/.test(host) && !host.includes(';') && !host.includes(' ') && !host.includes('\n');
}

function isValidPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * Парсинг URI ссылок прокси (SOCKS5, HTTP)
 * @param {string} rawUri
 * @returns {object|null} ProxyConfig
 */
function parseProxyUri(rawUri) {
  if (!rawUri || typeof rawUri !== 'string') return null;
  const uriStr = rawUri.trim();

  // 1. tg://socks?server=...&port=...&user=...&pass=...
  //    https://t.me/socks?
  if (uriStr.startsWith('tg://socks?') || uriStr.startsWith('https://t.me/socks?')) {
    try {
      const qIndex = uriStr.indexOf('?');
      const params = new URLSearchParams(uriStr.slice(qIndex + 1));
      const server = params.get('server');
      const port = parseInt(params.get('port'), 10);
      if (!isValidHost(server) || !isValidPort(port)) return null;

      const user = params.get('user') || params.get('username') || '';
      const pass = params.get('pass') || params.get('password') || '';
      return {
        id: generateId(),
        name: `SOCKS5 ${server}:${port}`,
        protocol: 'socks5',
        server,
        port,
        auth: (user || pass) ? { username: user, password: pass } : undefined,
        rawLink: uriStr,
      };
    } catch {
      return null;
    }
  }

  // 1.1 tg://http?server=...&port=...&user=...&pass=...
  //     https://t.me/http?
  if (uriStr.startsWith('tg://http?') || uriStr.startsWith('https://t.me/http?')) {
    try {
      const qIndex = uriStr.indexOf('?');
      const params = new URLSearchParams(uriStr.slice(qIndex + 1));
      const server = params.get('server');
      const port = parseInt(params.get('port'), 10);
      if (!isValidHost(server) || !isValidPort(port)) return null;

      const user = params.get('user') || params.get('username') || '';
      const pass = params.get('pass') || params.get('password') || '';
      return {
        id: generateId(),
        name: `HTTP ${server}:${port}`,
        protocol: 'http',
        server,
        port,
        auth: (user || pass) ? { username: user, password: pass } : undefined,
        rawLink: uriStr,
      };
    } catch {
      return null;
    }
  }

  // 2. socks5:// [user:pass@]host:port [#name]
  //    socks://
  if (uriStr.startsWith('socks5://') || uriStr.startsWith('socks://')) {
    try {
      const parsed = new URL(uriStr.replace(/^socks:\/\//, 'socks5://'));
      const server = parsed.hostname;
      const port = parseInt(parsed.port, 10) || 1080;
      if (!isValidHost(server) || !isValidPort(port)) return null;

      const username = decodeURIComponent(parsed.username || '');
      const password = decodeURIComponent(parsed.password || '');
      const name = decodeURIComponent(parsed.hash.replace(/^#/, '')) || `SOCKS5 ${server}:${port}`;

      return {
        id: generateId(),
        name,
        protocol: 'socks5',
        server,
        port,
        auth: (username || password) ? { username, password } : undefined,
        rawLink: uriStr,
      };
    } catch {
      return null;
    }
  }

  // 3. http:// или https://
  if (uriStr.startsWith('http://') || uriStr.startsWith('https://')) {
    try {
      const parsed = new URL(uriStr);
      const server = parsed.hostname;
      const port = parseInt(parsed.port, 10) || (uriStr.startsWith('https://') ? 443 : 8080);
      if (!isValidHost(server) || !isValidPort(port)) return null;

      const username = decodeURIComponent(parsed.username || '');
      const password = decodeURIComponent(parsed.password || '');
      const name = decodeURIComponent(parsed.hash.replace(/^#/, '')) || `HTTP ${server}:${port}`;

      return {
        id: generateId(),
        name,
        protocol: 'http',
        server,
        port,
        auth: (username || password) ? { username, password } : undefined,
        rawLink: uriStr,
      };
    } catch {
      return null;
    }
  }

  // 4. Простой формат host:port или user:pass@host:port
  if (/^([\w.-]+:[\w.-]+@)?([a-zA-Z0-9.-]+):(\d+)$/.test(uriStr)) {
    try {
      const parsed = new URL(`socks5://${uriStr}`);
      const server = parsed.hostname;
      const port = parseInt(parsed.port, 10);
      if (!isValidHost(server) || !isValidPort(port)) return null;

      const username = decodeURIComponent(parsed.username || '');
      const password = decodeURIComponent(parsed.password || '');

      return {
        id: generateId(),
        name: `SOCKS5 ${server}:${port}`,
        protocol: 'socks5',
        server,
        port,
        auth: (username || password) ? { username, password } : undefined,
      };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Сериализация ProxyConfig обратно в ссылку
 * @param {object} proxy
 * @returns {string}
 */
function serializeProxyUri(proxy) {
  if (!proxy) return '';
  if (proxy.rawLink) return proxy.rawLink;

  const { protocol = 'socks5', server, port, auth = {}, name = '' } = proxy;
  const hash = name ? `#${encodeURIComponent(name)}` : '';
  const scheme = protocol === 'http' ? 'http' : 'socks5';
  const authPart = auth && auth.username ? `${encodeURIComponent(auth.username)}:${encodeURIComponent(auth.password || '')}@` : '';

  return `${scheme}://${authPart}${server}:${port}${hash}`;
}

module.exports = {
  parseProxyUri,
  serializeProxyUri,
};
