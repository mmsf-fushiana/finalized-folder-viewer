import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PipeClient } from './pipeClient.js';
import type { PipeMessage } from './pipeClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let pipeClient: PipeClient | null = null;

function createWindow() {
  const preloadPath = join(__dirname, 'preload.js');
  const htmlPath = join(__dirname, 'renderer', 'index.html');

  console.log('__dirname:', __dirname);
  console.log('preloadPath:', preloadPath);
  console.log('isPackaged:', app.isPackaged);

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(htmlPath);
  }

  // Named Pipe クライアント開始
  let pipeConnected = false;
  pipeClient = new PipeClient();

  pipeClient.on('message', (msg: PipeMessage) => {
    mainWindow.webContents.send('game-message', msg);
  });

  pipeClient.on('connected', () => {
    console.log('[Main] Pipe connected');
    pipeConnected = true;
    mainWindow.webContents.send('pipe-status', true);
  });

  pipeClient.on('disconnected', () => {
    console.log('[Main] Pipe disconnected');
    pipeConnected = false;
    mainWindow.webContents.send('pipe-status', false);
  });

  // Rendererロード完了後に現在のpipe状態を再送（ロード前の接続イベント対策）
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('pipe-status', pipeConnected);
  });

  pipeClient.connect();

  // Renderer → Main: 現在のpipe状態を問い合わせ
  ipcMain.handle('get-pipe-status', () => pipeConnected);

  // IPC ハンドラ: Renderer → DLL コマンド転送
  ipcMain.on('game-write', (_event, data: { target: string; value: number }) => {
    if (pipeClient) {
      pipeClient.writeValue(data.target, data.value);
    }
  });

  ipcMain.on('game-refresh', () => {
    if (pipeClient) {
      pipeClient.requestRefresh();
    }
  });

  ipcMain.on('game-ping', () => {
    if (pipeClient) {
      pipeClient.ping();
    }
  });

  ipcMain.on('game-setVersion', (_event, version: string) => {
    if (pipeClient) {
      pipeClient.setVersion(version);
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (pipeClient) {
    pipeClient.disconnect();
    pipeClient = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
