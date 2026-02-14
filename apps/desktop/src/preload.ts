const { contextBridge, ipcRenderer } = require('electron');

console.log('preload.js is running!');

contextBridge.exposeInMainWorld('electronAPI', {
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
});

contextBridge.exposeInMainWorld('env', {
  isElectron: true,
});

console.log('preload.js finished!');
