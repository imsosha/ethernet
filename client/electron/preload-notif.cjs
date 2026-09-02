const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notifBridge', {
  onAddNotification: (callback) => {
    ipcRenderer.on('notif:add', (_event, data) => callback(data));
  },
  clickNotification: (data) => {
    ipcRenderer.send('notif:clicked', data);
  },
  dismissNotification: (id) => {
    ipcRenderer.send('notif:dismissed', id);
  },
  setIgnoreMouse: (ignore) => {
    ipcRenderer.send('notif:ignore-mouse', ignore);
  },
  setHeight: (height) => {
    ipcRenderer.send('notif:set-height', height);
  },
});
