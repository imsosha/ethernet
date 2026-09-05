const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trayBridge', {
  onSetState: (callback) => {
    ipcRenderer.on('tray:set-state', (_event, data) => callback(data));
  },
  actionOpen: () => {
    ipcRenderer.send('tray:action-open');
  },
  actionToggleNotifs: () => {
    ipcRenderer.send('tray:action-toggle-notifs');
  },
  actionQuit: () => {
    ipcRenderer.send('tray:action-quit');
  },
});
