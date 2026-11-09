import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { getLocalSchemaVersion, openLocalDatabase } from './local-db/index.ts';
import {createShellPolicy,isAllowedDocumentUrl,isAllowedRendererResource,
  isTrustedReadOnlyIpcSender,
  DEMO_SESSION_PARTITION,type ShellPolicy} from './shell-policy.ts';

const APP_INFO_CHANNEL = 'smartpos:app-info';
const DEV_RENDERER_URL = process.env.ELECTRON_RENDERER_URL;
let localDatabase: DatabaseSync | undefined;
let shellPolicy: ShellPolicy;

// Pure shell policy also validates exact localhost origin and packaged asset root.
// No renderer resource needs remote network access in DEMO_ONLY mode.

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
      // No persistent cookies/localStorage/HTTP disk cache; fixes corrupt
      // Chromium blockfile cache without deleting userData or SQLite evidence.
      partition: DEMO_SESSION_PARTITION,
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      webviewTag: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.once('ready-to-show', () => window.show());

  // A demo shell never navigates to remote pages or creates popup windows.
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-redirect', (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());

  ipcMain.removeHandler(APP_INFO_CHANNEL);
  ipcMain.handle(APP_INFO_CHANNEL, (event) => {
    const frame = event.senderFrame;
    if (
      !frame ||
      event.sender !== window.webContents ||
      frame !== window.webContents.mainFrame ||
      frame.url !== window.webContents.getURL() ||
      !isAllowedDocumentUrl(frame.url,shellPolicy) ||
      !isTrustedReadOnlyIpcSender(event.sender,frame,window.webContents,shellPolicy)
    ) {
      throw new Error('Untrusted IPC sender');
    }
    if (!localDatabase) throw new Error('Local database unavailable');
    return {
      name: 'SmartPOS Retail', version: app.getVersion(), mode: 'DEMO_ONLY' as const,
      localSchemaVersion: getLocalSchemaVersion(localDatabase),
    };
  });

  window.on('closed', () => ipcMain.removeHandler(APP_INFO_CHANNEL));

  // One exact renderer entrypoint. Neither location changes nor redirects
  // can turn the app-info IPC into a capability granted to other origins.
  void window.loadURL(shellPolicy.documentUrl);
}

app.whenReady().then(() => {
  // No persistent Chromium session, even in development. cache:false avoids
  // disk blockfile corruption. This DOES NOT encrypt SQLite or protect OS RAM.
  const demoSession=session.fromPartition(DEMO_SESSION_PARTITION,{cache:false});
  if(demoSession.isPersistent())throw new Error('Persistent demo renderer session denied');
  shellPolicy=createShellPolicy(DEV_RENDERER_URL,
    join(__dirname,'../renderer/index.html'));
  // All permissions/downloads and off-origin requests are denied for this
  // session, including when renderer JS is compromised.
  demoSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  demoSession.setPermissionCheckHandler(()=>false);
  demoSession.on('will-download',event=>event.preventDefault());
  demoSession.webRequest.onBeforeRequest((details,callback)=>{
    callback({cancel:!isAllowedRendererResource(details.url,shellPolicy)});
  });
  try {
    // Only Electron MAIN opens SQLite. Never expose file path, database handle or SQL to renderer.
    localDatabase = openLocalDatabase(join(app.getPath('userData'), 'smartpos-local.sqlite'));
  } catch {
    dialog.showErrorBox('SmartPOS local database error',
      'Cannot safely open the local database. Existing files were not deleted. Do not use this demo to record real sales.');
    app.quit();
    return;
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  localDatabase?.close();
  localDatabase = undefined;
});
