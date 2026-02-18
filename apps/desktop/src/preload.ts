const { contextBridge, ipcRenderer } = require('electron');

console.log('preload.js is running!');

contextBridge.exposeInMainWorld('electronAPI', {
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
});

contextBridge.exposeInMainWorld('env', {
  isElectron: true,
});

contextBridge.exposeInMainWorld('gameAPI', {
  // DLLからのメッセージ受信 (hello, full, delta, status, error, pong)
  onMessage: (callback: (msg: unknown) => void) => {
    ipcRenderer.on('game-message', (_: unknown, msg: unknown) => callback(msg));
  },
  // pipe接続状態
  onPipeStatus: (callback: (connected: boolean) => void) => {
    ipcRenderer.on('pipe-status', (_: unknown, connected: boolean) => callback(connected));
  },
  // 値書き込み
  writeValue: (target: string, value: number) => {
    ipcRenderer.send('game-write', { target, value });
  },
  // フルステート要求
  requestRefresh: () => {
    ipcRenderer.send('game-refresh');
  },
  // ping
  ping: () => {
    ipcRenderer.send('game-ping');
  },
});

console.log('preload.js finished!');
