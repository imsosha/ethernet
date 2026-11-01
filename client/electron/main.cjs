const { app, BrowserWindow, shell, Menu, Tray, nativeImage, globalShortcut, screen, ipcMain, powerMonitor } = require('electron');
const fs = require('fs');
const path = require('path');

if (app) {
  app.name = 'Ethernet';
  if (process.platform === 'win32') {
    app.setAppUserModelId(app.isPackaged ? 'org.ethernet.desktop' : process.execPath);
  }

  // Сохраняем существующий профиль и базу данных сессии, чтобы аккаунт не разлогинивался
  try {
    const legacyUserData = path.join(app.getPath('appData'), 'telegram-t');
    if (fs.existsSync(legacyUserData)) {
      app.setPath('userData', legacyUserData);
    }
  } catch {}
}

const { registerHermesFsHandlers } = require('./hermes-fs.cjs');
const hermesSettings = require('./hermes-settings.cjs');
const {
  ROOT, THEMES_DIR, PLUGINS_DIR, WALLPAPERS_DIR, ensureAssetDirs, seedDefaultAssets,
} = require('./ethernet-paths.cjs');
const {
  registerPrivilegedSchemes, registerAppProtocol, isSafeExternalUrl,
} = require('./ethernet-protocol.cjs');

// Полностью отключаем стандартное меню Electron (File, Edit, View, Window)
Menu.setApplicationMenu(null);

// Отключаем DnsOverHttps и нативную окклюзию окон (вызывающую микрофризы и задержки кликов на Windows, как в Discord)
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'DnsOverHttps,CalculateNativeWinOcclusion');

// Мгновенная доставка кликов и событий мыши в рендерер без задержек буферизации VSync + аппаратный D3D11 декодер видео
app.commandLine.appendSwitch('enable-features', 'RunUnbufferedDispatch,D3D11VideoDecoder');

// Разрешаем воспроизведение аудио/видео без предварительного клика (для кружков и предпросмотров)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Аппаратное ускорение рендеринга, декодирования видео и растрирования слоев через GPU
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

try {
  ensureAssetDirs();
  seedDefaultAssets(hermesSettings);
} catch {}

registerPrivilegedSchemes();

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'ethernet.ico');
  const appIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;

  // Восстанавливаем сохранённые размеры окна
  const savedBounds = hermesSettings.getWindowBounds();
  const winOpts = {
    title: 'ethernet',
    width: savedBounds ? savedBounds.width : 1280,
    height: savedBounds ? savedBounds.height : 832,
    minWidth: 480,
    minHeight: 400,
    frame: false,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    icon: appIcon || (fs.existsSync(iconPath) ? iconPath : undefined),
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
    },
  };

  // Восстанавливаем позицию только если координаты были сохранены
  if (savedBounds && typeof savedBounds.x === 'number' && typeof savedBounds.y === 'number') {
    winOpts.x = savedBounds.x;
    winOpts.y = savedBounds.y;
  }

  const win = new BrowserWindow(winOpts);

  if (appIcon && typeof win.setIcon === 'function') {
    try { win.setIcon(appIcon); } catch {}
  }

  win.setMenu(null);
  if (typeof win.removeMenu === 'function') {
    win.removeMenu();
  }

  win.on('maximize', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('hermes:window-maximized-changed', true);
      hermesSettings.setWindowBounds({ ...win.getNormalBounds(), isMaximized: true });
    }
  });

  win.on('unmaximize', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('hermes:window-maximized-changed', false);
      const b = win.getBounds();
      hermesSettings.setWindowBounds({ ...b, isMaximized: false });
    }
  });

  // Сохраняем размеры окна при изменении (debounce 500ms)
  let _boundsTimer = null;
  const saveBounds = () => {
    if (_boundsTimer) clearTimeout(_boundsTimer);
    _boundsTimer = setTimeout(() => {
      if (!win.isDestroyed() && !win.isMaximized() && !win.isMinimized()) {
        const b = win.getBounds();
        hermesSettings.setWindowBounds({ ...b, isMaximized: false });
      }
    }, 500);
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  win.on('page-title-updated', (event, title) => {
    event.preventDefault();
    let clean = (title || '')
      .replace(/\s*·\s*Telegram(\s+Beta)?/gi, '')
      .replace(/\s*·\s*Ethernet/gi, '')
      .replace(/\s*·\s*ethernet/gi, '')
      .replace(/\s*\[Inactive\]/gi, '')
      .trim();
    if (!clean || /^(telegram(\s+beta)?|ethernet)$/i.test(clean)) {
      clean = 'ethernet';
    }
    win.setTitle(clean);
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    // Reload: Ctrl+R, Ctrl+Shift+R, F5
    if ((input.control && input.key.toLowerCase() === 'r') || input.key === 'F5') {
      if (input.shift) {
        win.webContents.reloadIgnoringCache();
      } else {
        win.webContents.reload();
      }
      event.preventDefault();
      return;
    }

    // DevTools: Ctrl+Shift+I, F12
    if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
      return;
    }
  });

  win.loadURL('app://telegram/');

  // Показываем окно только когда контент готов (предотвращает чёрный экран при запуске)
  let _readyShown = false;
  const showWin = () => {
    if (_readyShown || win.isDestroyed()) return;
    _readyShown = true;
    if (savedBounds && savedBounds.isMaximized) {
      win.maximize();
    } else {
      win.show();
    }
  };
  win.once('ready-to-show', showWin);
  // Watchdog: если ready-to-show не сработал за 8 секунд — принудительно показываем
  setTimeout(() => {
    if (!win.isDestroyed()) showWin();
  }, 8000);

  win.on('close', (event) => {
    const disableCloseToTray = hermesSettings.getCloseToTrayDisabled();
    if (!app.isQuitting && !disableCloseToTray) {
      event.preventDefault();
      win.hide();
      return false;
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('app://telegram/')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            backgroundThrottling: true,
          },
        },
      };
    }
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url);
    } else {
      console.warn('[Security] Blocked window.open for unsafe URL:', url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (!targetUrl.startsWith('app://telegram/')) {
      event.preventDefault();
      if (isSafeExternalUrl(targetUrl)) {
        shell.openExternal(targetUrl);
      } else {
        console.warn('[Security] Blocked will-navigate for unsafe URL:', targetUrl);
      }
    }
  });

  win.webContents.on('will-redirect', (event, targetUrl) => {
    if (!targetUrl.startsWith('app://telegram/')) {
      event.preventDefault();
      console.warn('[Security] Blocked will-redirect outside app:', targetUrl);
    }
  });

  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
    console.warn('[Security] Blocked webview attachment');
  });

  return win;
}

let tray = null;
let trayMenuWindow = null;
let mainWindow = null;

function createTrayMenuWindow() {
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) return trayMenuWindow;

  trayMenuWindow = new BrowserWindow({
    width: 190,
    height: 120,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    show: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-tray.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: true,
    },
  });

  trayMenuWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  trayMenuWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  trayMenuWindow.setMenu(null);
  trayMenuWindow.loadFile(path.join(__dirname, 'tray-menu.html'));

  trayMenuWindow.on('blur', () => {
    if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
      trayMenuWindow.hide();
    }
  });

  trayMenuWindow.on('closed', () => {
    trayMenuWindow = null;
  });

  return trayMenuWindow;
}

function showTrayMenu(trayBounds) {
  const win = createTrayMenuWindow();
  if (!win) return;

  if (win.isVisible()) {
    win.hide();
    return;
  }

  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y }) || screen.getPrimaryDisplay();
  const workArea = display.workArea;

  const menuWidth = 190;
  const menuHeight = 120;

  let x = Math.round(trayBounds.x + (trayBounds.width / 2) - (menuWidth / 2));
  let y = Math.round(trayBounds.y - menuHeight - 6);

  if (y < workArea.y) {
    y = Math.round(trayBounds.y + trayBounds.height + 6);
  }
  if (x + menuWidth > workArea.x + workArea.width) {
    x = Math.round(workArea.x + workArea.width - menuWidth - 8);
  }
  if (x < workArea.x) {
    x = Math.round(workArea.x + 8);
  }

  win.setBounds({ x, y, width: menuWidth, height: menuHeight });
  win.showInactive();
  win.webContents.send('tray:set-state', {
    notificationsDisabled: hermesSettings.getNotificationsDisabled(),
  });
  win.focus();
}

function isTraySender(event) {
  if (trayMenuWindow && !trayMenuWindow.isDestroyed() && event.sender === trayMenuWindow.webContents) return true;
  const url = event.senderFrame?.url || (typeof event.sender?.getURL === 'function' ? event.sender.getURL() : '');
  return url.includes('tray-menu.html');
}

ipcMain.on('tray:action-open', (event) => {
  if (!isTraySender(event)) return;
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) trayMenuWindow.hide();
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow();
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.on('tray:action-toggle-notifs', (event) => {
  if (!isTraySender(event)) return;
  const nextVal = !hermesSettings.getNotificationsDisabled();
  hermesSettings.setNotificationsDisabled(nextVal);
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.webContents.send('tray:set-state', { notificationsDisabled: nextVal });
    trayMenuWindow.hide();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hermes:notifications-disabled-changed', nextVal);
  }
  updateTrayMenu();
});

ipcMain.on('tray:action-quit', (event) => {
  if (!isTraySender(event)) return;
  app.isQuitting = true;
  app.quit();
});

let currentUnreadCount = 0;

function updateTaskbarBadge(count) {
  const num = typeof count === 'number' ? count : 0;
  currentUnreadCount = num;

  try {
    app.setBadgeCount(num);
  } catch {}

  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (process.platform === 'win32') {
    if (num <= 0) {
      try {
        mainWindow.setOverlayIcon(null, '');
      } catch {}
    } else {
      try {
        const badgeText = num > 99 ? '99+' : String(num);
        const fontSize = num > 99 ? 11 : (num > 9 ? 13 : 15);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="14" fill="#3390ec"/>
          <text x="16" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff" text-anchor="middle">${badgeText}</text>
        </svg>`;
        const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        const badgeImage = nativeImage.createFromDataURL(dataUrl);
        mainWindow.setOverlayIcon(badgeImage, `${badgeText} непрочитанных`);
      } catch (err) {
        console.error('[Taskbar Badge Error]', err);
      }
    }
  }

  if (tray) {
    tray.setToolTip(num > 0 ? `Ethernet (${num})` : 'Ethernet');
  }
}

ipcMain.on('hermes:set-unread-count', (event, count) => {
  const senderUrl = event.senderFrame?.url || (typeof event.sender?.getURL === 'function' ? event.sender.getURL() : '');
  if (!senderUrl.startsWith('app://telegram/')) {
    console.warn(`[Security] Blocked unauthorized set-unread-count from '${senderUrl}'`);
    return;
  }
  updateTaskbarBadge(count);
});

function updateTrayMenu() {
  const notificationsDisabled = hermesSettings.getNotificationsDisabled();

  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.webContents.send('tray:set-state', {
      notificationsDisabled,
    });
  }
}

global.updateEthernetTrayMenu = updateTrayMenu;

function createTray() {
  if (tray) return tray;
  const iconPath = path.join(__dirname, '..', 'ethernet.ico');
  if (!fs.existsSync(iconPath)) return null;

  try {
    tray = new Tray(iconPath);
    tray.setToolTip('Ethernet');

    // Предзагружаем окно трея заранее, чтобы при первом открытии не было задержек и двойных анимаций
    createTrayMenuWindow();
    updateTrayMenu();

    tray.on('click', () => {
      if (trayMenuWindow && !trayMenuWindow.isDestroyed() && trayMenuWindow.isVisible()) {
        trayMenuWindow.hide();
        return;
      }
      if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = createWindow();
        return;
      }
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
    });

    tray.on('right-click', (_event, bounds) => {
      showTrayMenu(bounds);
    });

    tray.on('double-click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = createWindow();
        return;
      }
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    });
  } catch (err) {
    console.error('[Tray Create Error]', err);
  }

  return tray;
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    } catch {}
  });

  const proxyEngine = require('./proxy-engine.cjs');
  const notificationManager = require('./notification-manager.cjs');

  app.whenReady().then(async () => {
    // Ограничение разрешений (Permissions Request & Check Handlers)
    const { session } = require('electron');
    if (session && session.defaultSession) {
      const allowedPermissions = [
        'media',
        'camera',
        'microphone',
        'audioCapture',
        'videoCapture',
        'display-capture',
        'notifications',
        'fullscreen',
      ];

      session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
        // Защита от iframe: разрешаем захват медиа (микрофон/камера) СТРОГО для главного фрейма самого клиента
        const isMainFrame = details ? Boolean(details.isMainFrame) : true;
        const requestingUrl = (details && details.requestingUrl) || webContents?.getURL() || '';

        if (!requestingUrl.startsWith('app://telegram/') || !isMainFrame) {
          console.warn(`[Security] Blocked permission "${permission}" for untrusted/iframe origin: "${requestingUrl}" (isMainFrame=${isMainFrame})`);
          return callback(false);
        }

        // Разрешаем только микрофон/камеру (для голосовых/видео сообщений-кружков и звонков), уведомления и полноэкранный режим
        if (allowedPermissions.includes(permission)) {
          return callback(true);
        }
        return callback(false);
      });

      session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        const isMainFrame = details ? Boolean(details.isMainFrame) : true;
        const originUrl = requestingOrigin || (details && details.requestingUrl) || webContents?.getURL() || '';

        if ((!originUrl.startsWith('app://telegram/') && originUrl !== '') || !isMainFrame) {
          return false;
        }
        return allowedPermissions.includes(permission);
      });
    }

    // Глобальная защита для всех создаваемых окон и фреймов в приложении
    app.on('web-contents-created', (_event, contents) => {
      contents.on('will-attach-webview', (wvEvent) => {
        wvEvent.preventDefault();
        console.warn('[Security] Blocked webview attachment');
      });

      contents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('app://telegram/')) {
          return {
            action: 'allow',
            overrideBrowserWindowOptions: {
              webPreferences: {
                preload: path.join(__dirname, 'preload.cjs'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                backgroundThrottling: true,
              },
            },
          };
        }
        if (isSafeExternalUrl(url)) {
          shell.openExternal(url);
        } else {
          console.warn('[Security] Blocked window.open for unsafe URL:', url);
        }
        return { action: 'deny' };
      });

      contents.on('will-navigate', (navEvent, targetUrl) => {
        if (!targetUrl.startsWith('app://telegram/')) {
          navEvent.preventDefault();
          if (isSafeExternalUrl(targetUrl)) {
            shell.openExternal(targetUrl);
          } else {
            console.warn('[Security] Blocked will-navigate for unsafe URL:', targetUrl);
          }
        }
      });

      contents.on('will-redirect', (redEvent, targetUrl) => {
        if (!targetUrl.startsWith('app://telegram/')) {
          redEvent.preventDefault();
          console.warn('[Security] Blocked will-redirect outside app:', targetUrl);
        }
      });
    });

    registerHermesFsHandlers();
    registerAppProtocol();

    try {
      await proxyEngine.applyNetworkState();
    } catch (err) {
      console.error('[Network Startup Error]', err);
    }

    createTray();

    mainWindow = createWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    if (powerMonitor) {
      const notifyAllWindows = (channel) => {
        BrowserWindow.getAllWindows().forEach((w) => {
          if (!w.isDestroyed()) {
            w.webContents.send(channel);
          }
        });
      };
      powerMonitor.on('suspend', () => notifyAllWindows('hermes:power-suspend'));
      powerMonitor.on('lock-screen', () => notifyAllWindows('hermes:power-suspend'));
      powerMonitor.on('resume', () => notifyAllWindows('hermes:power-resume'));
      powerMonitor.on('unlock-screen', () => notifyAllWindows('hermes:power-resume'));
    }

    notificationManager.setupNotificationIpc(() => mainWindow);

    // Повторно применяем прокси после создания окна — сессия теперь точно готова
    try {
      await proxyEngine.applyNetworkState();
    } catch (err) {
      console.error('[Network Post-Window Error]', err);
    }

    globalShortcut.register('CommandOrControl+Shift+I', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.toggleDevTools();
      }
    });

    globalShortcut.register('F12', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.toggleDevTools();
      }
    });

    globalShortcut.register('CommandOrControl+R', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.reloadIgnoringCache();
      }
    });

    globalShortcut.register('F5', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.reloadIgnoringCache();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      } else if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
      }
    });
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
  });

  app.on('window-all-closed', () => {
    if (app.isQuitting) {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });
}
