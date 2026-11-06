import { contextBridge, ipcRenderer } from 'electron';

// Expose only a single, read-only method. Never pass ipcRenderer or filesystem access.
contextBridge.exposeInMainWorld('smartpos', {
  getAppInfo: (): Promise<{ name: string; version: string; mode: 'DEMO_ONLY'; localSchemaVersion: number }> =>
    ipcRenderer.invoke('smartpos:app-info'),
});
