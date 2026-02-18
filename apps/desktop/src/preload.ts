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
  // 戻り値はクリーンアップ関数（useEffect の return で呼ぶ）
  onMessage: (callback: (msg: unknown) => void) => {
    const wrapper = (_: unknown, msg: unknown) => callback(msg);
    ipcRenderer.on('game-message', wrapper);
    return () => ipcRenderer.removeListener('game-message', wrapper);
  },
  // pipe接続状態（リアルタイム通知）
  // 戻り値はクリーンアップ関数
  onPipeStatus: (callback: (connected: boolean) => void) => {
    const wrapper = (_: unknown, connected: boolean) => callback(connected);
    ipcRenderer.on('pipe-status', wrapper);
    return () => ipcRenderer.removeListener('pipe-status', wrapper);
  },
  // pipe接続状態（現在値の問い合わせ）
  getPipeStatus: (): Promise<boolean> => {
    return ipcRenderer.invoke('get-pipe-status');
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
