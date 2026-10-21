// Custom Notification Manager for Ethernet Telegram Client
const { BrowserWindow, screen, ipcMain, pathToFileURL, Notification: NativeNotification, nativeImage } = require('electron');
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
      backgroundThrottling: true,
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

function isNotifSender(event) {
  if (notifWindow && !notifWindow.isDestroyed() && event.sender === notifWindow.webContents) return true;
  const url = event.senderFrame?.url || (typeof event.sender?.getURL === 'function' ? event.sender.getURL() : '');
  return url.includes('notifications.html');
}

function setupNotificationIpc(mainWindowProvider) {
  const handleShowNotif = (event, payload) => {
    const senderUrl = event.senderFrame?.url || (typeof event.sender?.getURL === 'function' ? event.sender.getURL() : '');
    if (!senderUrl.startsWith('app://telegram/')) {
      console.warn(`[Security] Blocked unauthorized notification from '${senderUrl}'`);
      return false;
    }
    showNotification(payload, mainWindowProvider);
    return true;
  };

  ipcMain.handle('hermes:show-notification', handleShowNotif);
  ipcMain.handle('ethernet:show-notification', handleShowNotif);
  ipcMain.handle('hermes:native-notifications-get', () => hermesSettings.getUseNativeNotifications());
  ipcMain.handle('hermes:native-notifications-set', (_event, enabled) => hermesSettings.setUseNativeNotifications(enabled));
  ipcMain.handle('ethernet:native-notifications-get', () => hermesSettings.getUseNativeNotifications());
  ipcMain.handle('ethernet:native-notifications-set', (_event, enabled) => hermesSettings.setUseNativeNotifications(enabled));

  ipcMain.on('notif:clicked', (event, data) => {
    if (!isNotifSender(event)) return;
    const mainWindow = getActiveMainWindow(mainWindowProvider);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('hermes:notification-clicked', data);
    }
  });

  ipcMain.on('notif:ignore-mouse', (event, ignore) => {
    if (!isNotifSender(event)) return;
    if (notifWindow && !notifWindow.isDestroyed()) {
      notifWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
    }
  });

  ipcMain.on('notif:set-height', (event, height) => {
    if (!isNotifSender(event)) return;
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

  const isNative = Boolean(data?.isNative !== undefined ? data.isNative : hermesSettings.getUseNativeNotifications());

  if (isNative) {
    if (NativeNotification && NativeNotification.isSupported()) {
      try {
        let iconImage = undefined;
        if (data && data.icon && typeof data.icon === 'string') {
          if (data.icon.startsWith('data:image/')) {
            try {
              iconImage = nativeImage.createFromDataURL(data.icon);
            } catch {}
          } else if (fs.existsSync(data.icon)) {
            try {
              iconImage = nativeImage.createFromPath(data.icon);
            } catch {}
          }
        }
        if (!iconImage || iconImage.isEmpty()) {
          const iconCandidates = [
            path.join(__dirname, '..', 'public', 'icon-square-512x512.png'),
            path.join(__dirname, '..', 'public', 'icon-dev-512x512.png'),
            path.join(__dirname, '..', 'public', 'icon-square-192x192.png'),
            path.join(__dirname, '..', 'release', '.icon-ico', 'icon.ico'),
            path.join(__dirname, '..', 'ethernet.ico'),
          ];
          for (const cand of iconCandidates) {
            if (fs.existsSync(cand)) {
              try {
                const img = nativeImage.createFromPath(cand);
                if (img && !img.isEmpty()) {
                  iconImage = img;
                  break;
                }
              } catch {}
            }
          }
        }

        const notifOptions = {
          title: String(data?.title || 'Ethernet'),
          body: String(data?.body || ''),
          silent: Boolean(data?.isSilent),
        };
        if (iconImage && !iconImage.isEmpty()) {
          notifOptions.icon = iconImage;
        }

        const notif = new NativeNotification(notifOptions);

        notif.on('click', () => {
          const mainWindow = getActiveMainWindow(mainWindowProvider);
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('hermes:notification-clicked', {
              chatId: data?.chatId,
              messageId: data?.messageId,
            });
          }
        });

        notif.show();
        return;
      } catch (err) {
        console.error('[NotificationManager] Native notification failed, falling back to custom window:', err);
      }
    }
  }

  // Тумблер выключен (по стандарту) — отображаем всплывающее окно Electron
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
