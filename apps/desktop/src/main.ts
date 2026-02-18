import { app, BrowserWindow } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PipeClient } from './pipeClient.js';

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
  pipeClient = new PipeClient();

  pipeClient.on('frame', (text: string) => {
    mainWindow.webContents.send('pipe-data', text);
  });

  pipeClient.on('connected', () => {
    console.log('[Main] Pipe connected');
    mainWindow.webContents.send('pipe-status', true);
  });

  pipeClient.on('disconnected', () => {
    console.log('[Main] Pipe disconnected');
    mainWindow.webContents.send('pipe-status', false);
  });

  pipeClient.connect();
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
