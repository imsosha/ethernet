// Custom Notification Manager for Ethernet Telegram Client
const { BrowserWindow, screen, ipcMain, pathToFileURL } = require('electron');
const path = require('path');
const fs = require('fs');

let notifWindow = null;
let currentHeight = 0;
let pendingNotifications = [];

const NOTIF_WIDTH = 380;
const MAX_NOTIF_HEIGHT = 360;

function getWorkArea() {
  const primary = screen.getPrimaryDisplay();
  return primary.workArea;
}

function createNotificationWindow(mainWindow) {
  if (notifWindow && !notifWindow.isDestroyed()) {
    return notifWindow;
  }

  const workArea = getWorkArea();
  notifWindow = new BrowserWindow({
    width: NOTIF_WIDTH,
    height: MAX_NOTIF_HEIGHT,
    x: Math.round(workArea.x + workArea.width - NOTIF_WIDTH - 16),
    y: Math.round(workArea.y + workArea.height - MAX_NOTIF_HEIGHT - 16),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    show: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-notif.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  notifWindow.setMenu(null);
  notifWindow.setIgnoreMouseEvents(true, { forward: true });

  notifWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  notifWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  const notifHtmlPath = path.join(__dirname, 'notifications.html');
  if (fs.existsSync(notifHtmlPath)) {
    notifWindow.loadFile(notifHtmlPath);
  }

  notifWindow.webContents.on('did-finish-load', () => {
    while (pendingNotifications.length > 0) {
      const data = pendingNotifications.shift();
      notifWindow.webContents.send('notif:add', data);
    }
  });

  notifWindow.on('closed', () => {
    notifWindow = null;
  });

  return notifWindow;
}

function getActiveMainWindow(provider) {
  if (typeof provider === 'function') {
    const win = provider();
    if (win && !win.isDestroyed()) return win;
  } else if (provider && !provider.isDestroyed()) {
    return provider;
  }
  const all = BrowserWindow.getAllWindows();
  return all.find((w) => w !== notifWindow && !w.isDestroyed()) || null;
}

function setupNotificationIpc(mainWindowProvider) {
  ipcMain.handle('hermes:show-notification', (_event, payload) => {
    showNotification(payload, mainWindowProvider);
    return true;
  });

  ipcMain.on('notif:clicked', (_event, data) => {
    const mainWindow = getActiveMainWindow(mainWindowProvider);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('hermes:notification-clicked', data);
    }
  });

  ipcMain.on('notif:ignore-mouse', (_event, ignore) => {
    if (notifWindow && !notifWindow.isDestroyed()) {
      notifWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
    }
  });

  ipcMain.on('notif:set-height', (_event, height) => {
    currentHeight = height;
    if (notifWindow && !notifWindow.isDestroyed()) {
      if (height <= 0) {
        notifWindow.hide();
      } else {
        const workArea = getWorkArea();
        const winHeight = Math.min(height + 20, MAX_NOTIF_HEIGHT);
        notifWindow.setBounds({
          x: Math.round(workArea.x + workArea.width - NOTIF_WIDTH - 16),
          y: Math.round(workArea.y + workArea.height - winHeight - 16),
          width: NOTIF_WIDTH,
          height: winHeight,
        });
        if (!notifWindow.isVisible()) {
          notifWindow.showInactive();
        }
      }
    }
  });
}

const hermesSettings = require('./hermes-settings.cjs');

function showNotification(data, mainWindowProvider) {
  if (hermesSettings.getNotificationsDisabled()) return;
  const mainWindow = getActiveMainWindow(mainWindowProvider);
  const win = createNotificationWindow(mainWindow);
  if (!win) return;

  if (win.webContents.isLoading()) {
    pendingNotifications.push(data);
  } else {
    win.webContents.send('notif:add', data);
    if (!win.isVisible()) {
      win.showInactive();
    }
  }
}

module.exports = {
  createNotificationWindow,
  setupNotificationIpc,
  showNotification,
};
