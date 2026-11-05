/**
 * POS-007 static regression checks only.
 * Runtime Electron permission, window/navigation and IPC behavior still need a GUI smoke test.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const main = read('src/main/index.ts');
const preload = read('src/preload/index.ts');
const renderer = read('src/renderer/src/app.tsx');
const config = read('electron.vite.config.ts');
const html = read('src/renderer/index.html');
const pkg = JSON.parse(read('package.json'));

const required = [
  ['nodeIntegration off', /nodeIntegration:\s*false/, main],
  ['context isolation on', /contextIsolation:\s*true/, main],
  ['sandbox on', /sandbox:\s*true/, main],
  ['web security on', /webSecurity:\s*true/, main],
  ['IPC sender validation', /event\.sender\s*!==\s*window\.webContents/, main],
  ['IPC main frame validation', /frame\s*!==\s*window\.webContents\.mainFrame/, main],
  ['IPC URL validation', /frame\.url\s*!==\s*window\.webContents\.getURL\(\)/, main],
  ['preload-only IPC channel', /smartpos:app-info/, preload],
  ['permission requests denied', /setPermissionRequestHandler/, main],
  ['permission checks denied', /setPermissionCheckHandler/, main],
  ['navigation blocked', /will-navigate/, main],
  ['popup blocked', /setWindowOpenHandler/, main],
  ['webview blocked', /will-attach-webview/, main],
  ['loopback-only dev URL', /isAllowedDevUrl/, main],
  ['CSP script rule', /__SMARTPOS_SCRIPT_POLICY__/, html],
  ['CSP production rule', /development\s*\?\s*"'self' 'unsafe-inline'"\s*:\s*"'self'"/, config],
  ['sandbox-compatible CJS preload', /format:\s*'cjs'/, config],
  ['demo warning', /DEMO — CHƯA THỂ BÁN HÀNG/, renderer],
];
for (const [label, pattern, source] of required) {
  assert.match(source, pattern, 'Missing POS-007 control: ' + label);
}
assert.equal(pkg.type, 'commonjs');
assert.equal(pkg.main, './out/main/index.js');
assert.equal(typeof pkg.scripts.dev, 'string');
assert.equal(typeof pkg.scripts.build, 'string');
assert.doesNotMatch(preload, /sendSync|exposeInMainWorld\(['"]ipcRenderer/);
assert.doesNotMatch(renderer, /\b(?:node:fs|DATABASE_URL|ipcRenderer)\b/);
console.log('POS-007 security/source checks passed (' + required.length + ' controls). Not an Electron GUI test.');
