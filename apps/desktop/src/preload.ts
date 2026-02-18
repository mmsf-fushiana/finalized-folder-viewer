const { contextBridge, ipcRenderer } = require('electron');

console.log('preload.js is running!');

contextBridge.exposeInMainWorld('electronAPI', {
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
});

contextBridge.exposeInMainWorld('env', {
  isElectron: true,
});

contextBridge.exposeInMainWorld('pipeAPI', {
  onData: (callback: (text: string) => void) => {
    ipcRenderer.on('pipe-data', (_: unknown, text: string) => callback(text));
  },
  onStatus: (callback: (connected: boolean) => void) => {
    ipcRenderer.on('pipe-status', (_: unknown, connected: boolean) => callback(connected));
  },
});

console.log('preload.js finished!');
