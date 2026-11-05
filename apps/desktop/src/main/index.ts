import { app, BrowserWindow, ipcMain, session } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_INFO_CHANNEL = 'smartpos:app-info';
const DEV_RENDERER_URL = process.env.ELECTRON_RENDERER_URL;

function isAllowedDevUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1160,
    height: 740,
    minWidth: 900,
    minHeight: 600,
    title: 'SmartPOS Retail — Development',
    show: false,
    backgroundColor: '#f6f8fc',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.once('ready-to-show', () => window.show());

  // A demo shell never navigates to remote pages or creates popup windows.
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());

  ipcMain.removeHandler(APP_INFO_CHANNEL);
  ipcMain.handle(APP_INFO_CHANNEL, (event) => {
    const frame = event.senderFrame;
    if (
      !frame ||
      event.sender !== window.webContents ||
      frame !== window.webContents.mainFrame ||
      frame.url !== window.webContents.getURL()
    ) {
      throw new Error('Untrusted IPC sender');
    }
    return { name: 'SmartPOS Retail', version: app.getVersion(), mode: 'DEMO_ONLY' as const };
  });

  window.on('closed', () => ipcMain.removeHandler(APP_INFO_CHANNEL));

  if (DEV_RENDERER_URL) {
    if (!isAllowedDevUrl(DEV_RENDERER_URL)) {
      throw new Error('Development renderer URL must be loopback HTTP');
    }
    void window.loadURL(DEV_RENDERER_URL);
  } else {
    const localHtml = join(__dirname, '../renderer/index.html');
    void window.loadURL(pathToFileURL(localHtml).toString());
  }
}

app.whenReady().then(() => {
  // Deny unsolicited permission prompts in the POS shell.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
