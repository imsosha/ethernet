// Мост между рендерером (веб-клиентом) и main.
// Ethernet Client API.

const { contextBridge, ipcRenderer } = require('electron');

const desktopBridge = {
  // Темы
  themesList: () => ipcRenderer.invoke('hermes:themes-list'),
  themeRead: (name) => ipcRenderer.invoke('hermes:theme-read', name),
  themeSave: (name, css, wallpaperInfo) => ipcRenderer.invoke('hermes:theme-save', name, css, wallpaperInfo),
  themeDelete: (name) => ipcRenderer.invoke('hermes:theme-delete', name),
  themeActivate: (name) => ipcRenderer.invoke('hermes:theme-activate', name),
  // Плагины
  pluginsList: () => ipcRenderer.invoke('hermes:plugins-list'),
  pluginRead: (id) => ipcRenderer.invoke('hermes:plugin-read', id),
  pluginSave: (plugin) => ipcRenderer.invoke('hermes:plugin-save', plugin),
  pluginDelete: (id) => ipcRenderer.invoke('hermes:plugin-delete', id),
  pluginToggle: (id) => ipcRenderer.invoke('hermes:plugin-toggle', id),
  // Служебное
  pickFile: (kind) => ipcRenderer.invoke('hermes:pick-file', kind),
  saveFile: (payload) => ipcRenderer.invoke('hermes:save-file', payload),
  reload: () => ipcRenderer.invoke('hermes:reload'),
  // Настройки мода (скругления/блюр/анимации)
  modGet: () => ipcRenderer.invoke('hermes:mod-get'),
  modSet: (mod) => ipcRenderer.invoke('hermes:mod-set', mod),
  // Ethernet-обои
  wallpaperSetFile: (payload) => ipcRenderer.invoke('hermes:wallpaper-set-file', payload),
  wallpaperClear: (themeName) => ipcRenderer.invoke('hermes:wallpaper-clear', themeName),
  // Управление окном (топбар)
  windowMinimize: () => ipcRenderer.invoke('hermes:window-minimize'),
  windowMaximizeToggle: () => ipcRenderer.invoke('hermes:window-maximize-toggle'),
  windowClose: () => ipcRenderer.invoke('hermes:window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('hermes:window-is-maximized'),
  onWindowMaximizedChange: (cb) => {
    const handler = (_e, isMax) => cb(isMax);
    ipcRenderer.on('hermes:window-maximized-changed', handler);
    return () => ipcRenderer.removeListener('hermes:window-maximized-changed', handler);
  },
  // Гео-IP
  networkGeoInfo: () => ipcRenderer.invoke('hermes:network-geo-info'),
  onNetworkChange: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('hermes:network-changed', handler);
    return () => ipcRenderer.removeListener('hermes:network-changed', handler);
  },
  // Пользовательский прокси (SOCKS5, HTTP)
  proxyGetState: () => ipcRenderer.invoke('hermes:proxy-get-state'),
  proxySave: (proxy) => ipcRenderer.invoke('hermes:proxy-save', proxy),
  proxyDelete: (id) => ipcRenderer.invoke('hermes:proxy-delete', id),
  proxySetActive: (id) => ipcRenderer.invoke('hermes:proxy-set-active', id),
  proxyToggle: (enabled) => ipcRenderer.invoke('hermes:proxy-toggle', enabled),
  proxyParseLink: (link) => ipcRenderer.invoke('hermes:proxy-parse-link', link),
  proxyTestPing: (proxy) => ipcRenderer.invoke('hermes:proxy-test-ping', proxy),
  // Кастомные Windows-уведомления
  showNotification: (payload) => ipcRenderer.invoke('hermes:show-notification', payload),
  onNotificationClick: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('hermes:notification-clicked', handler);
    return () => ipcRenderer.removeListener('hermes:notification-clicked', handler);
  },
  // Глобальное отключение уведомлений
  notificationsDisabledGet: () => ipcRenderer.invoke('hermes:notifications-disabled-get'),
  notificationsDisabledSet: (disabled) => ipcRenderer.invoke('hermes:notifications-disabled-set', disabled),
  onNotificationsDisabledChange: (cb) => {
    const handler = (_e, disabled) => cb(disabled);
    ipcRenderer.on('hermes:notifications-disabled-changed', handler);
    return () => ipcRenderer.removeListener('hermes:notifications-disabled-changed', handler);
  },
  // Не сворачивать в трей (закрывать по крестику)
  closeToTrayDisabledGet: () => ipcRenderer.invoke('hermes:close-to-tray-disabled-get'),
  closeToTrayDisabledSet: (disabled) => ipcRenderer.invoke('hermes:close-to-tray-disabled-set', disabled),
  // Безопасный режим (Safe Mode) для плагинов
  safeModeGet: () => ipcRenderer.invoke('hermes:safemode-get'),
  safeModeSet: (enabled) => ipcRenderer.invoke('hermes:safemode-set', enabled),
  lastCrashedPluginGet: () => ipcRenderer.invoke('hermes:last-crashed-plugin-get'),
  clearLastCrashedPlugin: () => ipcRenderer.invoke('hermes:clear-last-crashed-plugin'),
  reportPluginCrash: (pluginId, error) => ipcRenderer.invoke('hermes:report-plugin-crash', pluginId, error),
  // Счетчик непрочитанных для таскбара / трея
  setUnreadCount: (count) => ipcRenderer.send('hermes:set-unread-count', count),
};

contextBridge.exposeInMainWorld('ethernetDesktop', desktopBridge);
contextBridge.exposeInMainWorld('hermesDesktop', desktopBridge);
