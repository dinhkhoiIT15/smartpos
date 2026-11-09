/**
 * POS-007 static regression checks only.
 * Runtime Electron permission, window/navigation and IPC behavior still need a GUI smoke test.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const main = read('src/main/index.ts');
const shell = read('src/main/shell-policy.ts');
const storage = read('src/main/local-db/storage-policy.ts');
const db = read('src/main/local-db/index.ts');
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
  ['strict loopback-only dev URL', /createShellPolicy\(DEV_RENDERER_URL/, main],
  ['nonpersistent Chromium partition', /partition:\s*DEMO_SESSION_PARTITION/,main],
  ['no Chromium disk cache', /cache:false/,main],
  ['in-memory partition invariant', /demoSession\.isPersistent\(\)/,main],
  ['download deny', /on\('will-download',event=>event\.preventDefault\(\)\)/,main],
  ['cross-origin subresource deny', /webRequest\.onBeforeRequest/,main],
  ['no HTTP API from demo renderer', /isAllowedRendererResource\(details\.url,shellPolicy\)/,main],
  ['redirect denied', /will-redirect/,main],
  ['exact expected IPC document', /isAllowedDocumentUrl\(frame\.url,shellPolicy\)/,main],
  ['no renderer credential storage', /smartpos-demo-memory-only/,shell],
  ['deny file URL outside packaged assets', /relative\(policy\.resourceBase,path\)/,shell],
  ['deny linked SQLite files', /info\.nlink!==1/,storage],
  ['protect WAL and SHM', /'-wal','-shm'/,storage],
  ['guard backup target', /refuseExistingBackupTarget/,db],
  ['CSP script rule', /__SMARTPOS_SCRIPT_POLICY__/, html],
  ['CSP production rule', /development\s*\?\s*"'self' 'unsafe-inline'"\s*:\s*"'self'"/, config],
  ['sandbox-compatible CJS preload', /format:\s*'cjs'/, config],
  ['demo warning', /DEMO — CHƯA THỂ BÁN HÀNG/, renderer],
  ['SQLite file in Electron userData', /app\.getPath\('userData'\)/, main],
  ['SQLite only initialized in MAIN', /openLocalDatabase\(/, main],
  ['read-only SQLite status IPC', /localSchemaVersion: getLocalSchemaVersion\(localDatabase\)/, main],
];
for (const [label, pattern, source] of required) {
  assert.match(source, pattern, 'Missing POS-007 control: ' + label);
}
assert.equal(pkg.type, 'commonjs');
assert.equal(pkg.main, './out/main/index.js');
assert.equal(typeof pkg.scripts.dev, 'string');
assert.equal(typeof pkg.scripts.build, 'string');
assert.doesNotMatch(preload, /sendSync|exposeInMainWorld\(['"]ipcRenderer|node:sqlite|local-db|DATABASE_URL/);
assert.doesNotMatch(renderer, /\b(?:node:fs|node:sqlite|DATABASE_URL|ipcRenderer)\b/);
console.log('POS-007 security/source checks passed (' + required.length + ' controls). Not an Electron GUI test.');

assert.doesNotMatch(main,/session\.defaultSession\.setPermissionRequestHandler/,
  'DEMO_ONLY must use isolated private session instead of default persistent browser session');
assert.doesNotMatch(preload,/\b(?:localStorage|sessionStorage|DATABASE_URL|password|bearer|secret|privateKey)\b/i,
  'Preload must never handle persistent credentials or auth tokens');
assert.doesNotMatch(renderer,/\b(?:localStorage|sessionStorage|DATABASE_URL|password|bearer|privateKey)\b/i,
  'DEMO renderer must not handle persistent credentials or auth tokens');
assert.match(shell,/!u\.port\|\|u\.username\|\|u\.password\|\|u\.search\|\|u\.hash/);
assert.match(storage,/process\.platform!=='win32'/,
  'Windows chmod cannot be relied upon to enforce NTFS ACL');
console.log('POS-027 security shell/SQLite source policy guards passed.');
