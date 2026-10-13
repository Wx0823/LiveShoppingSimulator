const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  readSave: () => ipcRenderer.invoke('save:read'),
  writeSave: (content) => ipcRenderer.invoke('save:write', content),
  backupSave: () => ipcRenderer.invoke('save:backup'),
  fullscreen: () => ipcRenderer.invoke('window:fullscreen')
});
