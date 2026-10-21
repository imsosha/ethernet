/**
 * Ethernet Desktop: System Media Service (Windows SMTC bridge)
 * Controls and queries system-wide audio/video (YouTube in browsers, Spotify, etc.)
 * Specifically ignores internal Telegram/Ethernet sessions.
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

let psProcess = null;
let rl = null;
let isReady = false;
let isExecuting = false;
const pendingQueue = [];
let lastCachedState = {
  active: false,
  title: '',
  artist: '',
  album: '',
  app: '',
  status: 'Closed',
  position: 0,
  duration: 0,
  thumbnail: '',
};

function init() {
  if (process.platform !== 'win32') return;
  if (psProcess) return;

  const scriptPath = path.join(__dirname, 'system-media.ps1');

  try {
    psProcess = spawn('powershell.exe', [
      '-NoProfile',
      '-NoLogo',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
    ], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    rl = readline.createInterface({ input: psProcess.stdout });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed === 'READY') {
        isReady = true;
        pump();
        return;
      }

      let parsed = lastCachedState;
      try {
        const obj = JSON.parse(trimmed);
        if (obj && typeof obj.active === 'boolean') {
          lastCachedState = obj;
          parsed = obj;
        }
      } catch {}

      isExecuting = false;
      if (pendingQueue.length > 0) {
        const req = pendingQueue.shift();
        clearTimeout(req.timer);
        req.resolve(parsed);
      }
      pump();
    });

    psProcess.stderr.on('data', (err) => {
      console.warn('[system-media] stderr:', err.toString());
    });

    psProcess.on('exit', () => {
      psProcess = null;
      rl = null;
      isReady = false;
      isExecuting = false;
      while (pendingQueue.length > 0) {
        const req = pendingQueue.shift();
        clearTimeout(req.timer);
        req.resolve(lastCachedState);
      }
    });
  } catch (err) {
    console.error('[system-media] failed to start service', err);
  }
}

function pump() {
  if (!isReady || !psProcess || isExecuting || pendingQueue.length === 0) return;
  const current = pendingQueue[0];
  isExecuting = true;
  try {
    psProcess.stdin.write(JSON.stringify(current.payload) + '\n');
  } catch (err) {
    isExecuting = false;
    const req = pendingQueue.shift();
    clearTimeout(req.timer);
    req.reject(err);
    pump();
  }
}

function sendCommand(cmd, extra = {}) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      return resolve({ active: false });
    }

    if (!psProcess) {
      init();
    }

    const payload = { cmd, ...extra };
    const timer = setTimeout(() => {
      const idx = pendingQueue.findIndex((r) => r.payload === payload);
      if (idx !== -1) {
        pendingQueue.splice(idx, 1);
        if (idx === 0) isExecuting = false;
        resolve(lastCachedState);
        pump();
      }
    }, 4500);

    pendingQueue.push({ payload, resolve, reject, timer });
    pump();
  });
}

// Warm up immediately upon module load
if (process.platform === 'win32') {
  init();
}

module.exports = {
  init,
  getState: () => sendCommand('poll'),
  control: (action, value) => {
    if (action === 'seek') {
      return sendCommand('seek', { pos: value });
    }
    return sendCommand(action);
  },
};
