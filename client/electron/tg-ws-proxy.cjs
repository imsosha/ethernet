// Hermes Telegram Client — Embedded TG WS Proxy Bridge
// Чистый и быстрый SOCKS5-мост для перенаправления дата-центров Telegram на незаблокированные узлы

const net = require('net');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', '..', 'hermes-proxy.log');

function log(...args) {
  const msg = `[${new Date().toISOString()}] [TgWsProxy] ${args.map(String).join(' ')}\n`;
  console.log('[TgWsProxy]', ...args);
  try { fs.appendFileSync(LOG_FILE, msg); } catch {}
}

// Известные IP-диапазоны и домены дата-центров Telegram
const DC_MAP = {
  // DC1 (Miami)
  '149.154.175.50': 'kws1.web.telegram.org',
  '149.154.175.51': 'kws1.web.telegram.org',
  'zws1.web.telegram.org': 'kws1.web.telegram.org',
  'zws1-1.web.telegram.org': 'kws1.web.telegram.org',
  'pluto.web.telegram.org': 'kws1.web.telegram.org',

  // DC2 (Amsterdam) — основной для Европы/СНГ
  '149.154.167.50': 'kws2.web.telegram.org',
  '149.154.167.51': 'kws2.web.telegram.org',
  '149.154.167.220': 'kws2.web.telegram.org',
  'zws2.web.telegram.org': 'kws2.web.telegram.org',
  'zws2-1.web.telegram.org': 'kws2.web.telegram.org',
  'venus.web.telegram.org': 'kws2.web.telegram.org',

  // DC3 (Miami)
  '149.154.175.100': 'kws3.web.telegram.org',
  'zws3.web.telegram.org': 'kws3.web.telegram.org',
  'zws3-1.web.telegram.org': 'kws3.web.telegram.org',
  'aurora.web.telegram.org': 'kws3.web.telegram.org',

  // DC4 (Amsterdam)
  '149.154.167.91': 'kws4.web.telegram.org',
  '149.154.167.92': 'kws4.web.telegram.org',
  'zws4.web.telegram.org': 'kws4.web.telegram.org',
  'zws4-1.web.telegram.org': 'kws4.web.telegram.org',
  'vesta.web.telegram.org': 'kws4.web.telegram.org',

  // DC5 (Singapore)
  '91.108.56.165': 'kws5.web.telegram.org',
  'zws5.web.telegram.org': 'kws5.web.telegram.org',
  'zws5-1.web.telegram.org': 'kws5.web.telegram.org',
  'flora.web.telegram.org': 'kws5.web.telegram.org',
};

class TgWsProxyServer {
  constructor(port = 10800) {
    this.port = port;
    this.server = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return Promise.resolve(this.port);

    return new Promise((resolve, reject) => {
      this.server = net.createServer((clientSocket) => {
        this.handleClient(clientSocket);
      });

      this.server.on('error', (err) => {
        log('Server error:', err.message);
        if (!this.isRunning) reject(err);
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        this.isRunning = true;
        log(`Server listening on 127.0.0.1:${this.port}`);
        resolve(this.port);
      });
    });
  }

  stop() {
    if (!this.isRunning || !this.server) return Promise.resolve();

    return new Promise((resolve) => {
      this.server.close(() => {
        this.isRunning = false;
        this.server = null;
        log('Server stopped');
        resolve();
      });
    });
  }

  resolveTargetHost(dstAddr) {
    if (DC_MAP[dstAddr]) return DC_MAP[dstAddr];

    // Определение DC по префиксу подсети IP
    if (dstAddr.startsWith('149.154.167.')) return 'kws2.web.telegram.org';
    if (dstAddr.startsWith('149.154.175.')) return 'kws1.web.telegram.org';
    if (dstAddr.startsWith('91.108.56.')) return 'kws5.web.telegram.org';

    if (dstAddr.includes('web.telegram.org')) {
      const match = dstAddr.match(/zws(\d)/);
      if (match) return `kws${match[1]}.web.telegram.org`;
      return dstAddr;
    }

    return dstAddr;
  }

  handleClient(clientSocket) {
    let targetHost = '';
    let targetPort = 443;

    clientSocket.once('data', (data) => {
      // 1. SOCKS5 Handshake
      if (data[0] !== 0x05) {
        clientSocket.end();
        return;
      }

      // Отвечаем: Версия 5, Без аутентификации (0x00)
      clientSocket.write(Buffer.from([0x05, 0x00]));

      clientSocket.once('data', (reqData) => {
        if (reqData[0] !== 0x05 || reqData[1] !== 0x01) { // 0x01 = CONNECT
          clientSocket.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0])); // Command not supported
          clientSocket.end();
          return;
        }

        const atyp = reqData[3];
        let offset = 4;

        if (atyp === 0x01) { // IPv4
          targetHost = `${reqData[offset]}.${reqData[offset + 1]}.${reqData[offset + 2]}.${reqData[offset + 3]}`;
          offset += 4;
        } else if (atyp === 0x03) { // Domain Name
          const len = reqData[offset];
          offset += 1;
          targetHost = reqData.toString('utf8', offset, offset + len);
          offset += len;
        } else if (atyp === 0x04) { // IPv6
          const parts = [];
          for (let i = 0; i < 16; i += 2) {
            parts.push(reqData.readUInt16BE(offset + i).toString(16));
          }
          targetHost = parts.join(':');
          offset += 16;
        } else {
          clientSocket.end();
          return;
        }

        targetPort = reqData.readUInt16BE(offset);
        const resolvedHost = this.resolveTargetHost(targetHost);

        log(`Routing CONNECT ${targetHost}:${targetPort} -> ${resolvedHost}:${targetPort}`);

        const upstream = net.connect(targetPort, resolvedHost, () => {
          clientSocket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          clientSocket.pipe(upstream);
          upstream.pipe(clientSocket);
        });

        upstream.on('error', (err) => {
          log(`Upstream TCP error (${resolvedHost}:${targetPort}):`, err.message);
          if (!clientSocket.destroyed) {
            clientSocket.write(Buffer.from([0x05, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
            clientSocket.end();
          }
        });

        clientSocket.on('close', () => upstream.destroy());
        upstream.on('close', () => clientSocket.destroy());
      });
    });

    clientSocket.on('error', () => {
      clientSocket.destroy();
    });
  }

  async testPing() {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const socket = new net.Socket();
      socket.setTimeout(4000);

      socket.connect(443, 'kws2.web.telegram.org', () => {
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
}

module.exports = {
  TgWsProxyServer,
};
