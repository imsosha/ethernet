/**
 * Ethernet Desktop: System Media Service (Windows SMTC bridge)
 * Controls and queries system-wide audio/video (YouTube in browsers, Spotify, etc.)
 * Specifically ignores internal Telegram/Ethernet sessions.
 */

const { app } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

let psProcess = null;
let rl = null;
let isReady = false;
let isExecuting = false;
let consecutiveFailures = 0;
let lastSpawnTime = 0;
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

function resolveScriptPath() {
  const directPath = path.join(__dirname, 'system-media.ps1');

  // 1. If running in dev mode outside of asar
  if (!directPath.includes('app.asar') && fs.existsSync(directPath)) {
    return directPath;
  }

  // 2. If unpacked by electron-builder via asarUnpack
  const unpackedPath = directPath.replace('app.asar', 'app.asar.unpacked');
  if (fs.existsSync(unpackedPath)) {
    return unpackedPath;
  }

  // 3. Robust fallback: extract script from asar to userData/temp so powershell.exe can read it
  try {
    const targetDir = (app && typeof app.getPath === 'function')
      ? app.getPath('userData')
      : (process.env.APPDATA ? path.join(process.env.APPDATA, 'Ethernet') : os.tmpdir());

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetPath = path.join(targetDir, 'ethernet-system-media.ps1');
    const content = fs.readFileSync(directPath, 'utf8');
    // Ensure UTF-8 BOM so Windows PowerShell 5.1 interprets UTF-8 properly
    const outContent = content.startsWith('\uFEFF') ? content : ('\uFEFF' + content);
    fs.writeFileSync(targetPath, outContent, 'utf8');
    return targetPath;
  } catch (err) {
    console.error('[system-media] Failed to resolve script path:', err);
    return directPath;
  }
}

function init() {
  if (process.platform !== 'win32') return;
  if (psProcess) return;

  const now = Date.now();
  if (consecutiveFailures >= 5 && now - lastSpawnTime < 10000) {
    return;
  }
  lastSpawnTime = now;

  const scriptPath = resolveScriptPath();

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
        consecutiveFailures = 0;
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

    psProcess.on('exit', (code, signal) => {
      if (!isReady) {
        consecutiveFailures++;
      }
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
