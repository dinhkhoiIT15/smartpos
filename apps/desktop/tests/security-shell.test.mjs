import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createShellPolicy,isAllowedDocumentUrl,isAllowedRendererResource,
  DEMO_SESSION_PARTITION,isTrustedReadOnlyIpcSender} =
  require('../src/main/shell-policy.ts');

const dev='http://127.0.0.1:5173/';
test('POS-027 dev renderer allows ONLY exact loopback entry with no credentials/path/query/fragment',()=>{
 const p=createShellPolicy(dev,join(tmpdir(),'out','renderer','index.html'));
 assert.equal(p.mode,'DEVELOPMENT');
 assert.equal(p.documentUrl,dev);
 assert.equal(DEMO_SESSION_PARTITION.startsWith('persist:'),false);
 assert.equal(DEMO_SESSION_PARTITION.length>3,true);
 for(const url of [
  'https://127.0.0.1:5173/','http://example.com:5173/',
  'http://127.0.0.2:5173/','http://0.0.0.0:5173/',
  'http://192.168.1.1:5173/','http://evil.localhost:5173/',
  'http://127.0.0.1:5173/login','http://127.0.0.1:5173/?token=a',
  'http://127.0.0.1:5173/#trick','http://user:secret@127.0.0.1:5173/',
  'http://127.0.0.1/','http://127.0.0.1:5173.evil/',
  'file:///tmp/index.html','data:text/html,a','http://[::2]:5173/',
 ]){
  assert.throws(()=>createShellPolicy(url,join(tmpdir(),'out','renderer','index.html')),
   /DEMO_SHELL_UNTRUSTED_DEV_URL/,url);
 }
 for(const accepted of ['http://localhost:5174/','http://[::1]:5175/']){
  assert.equal(createShellPolicy(accepted,join(tmpdir(),'out','renderer','index.html')).documentUrl,
   accepted);
 }
});
test('POS-027 external scripts, websocket and adjacent Vite ports are refused',()=>{
 const p=createShellPolicy(dev,join(tmpdir(),'out','renderer','index.html'));
 for(const url of [
  dev,dev+'src/main.tsx',dev+'@vite/client',
  'ws://127.0.0.1:5173/','ws://127.0.0.1:5173/?token=abc',
 ])assert.equal(isAllowedRendererResource(url,p),true,url);
 for(const url of [
  'http://127.0.0.1:5174/src/main.tsx','ws://127.0.0.1:5174/',
  'http://localhost:5173/src/main.tsx','https://127.0.0.1:5173/',
  'wss://127.0.0.1:5173/','https://evil.example/script.js',
  'http://127.0.0.1:3001/v1/health','http://x:pass@127.0.0.1:5173/',
  'file:///tmp/secret','data:application/json,test','javascript:alert(1)',
  'blob:http://127.0.0.1:5173/some', 'invalid',
 ])assert.equal(isAllowedRendererResource(url,p),false,url);
 assert.equal(isAllowedDocumentUrl(dev,p),true);
 for(const url of [
  dev+'other',dev+'?x=1','http://localhost:5173/',
  'http://127.0.0.1:5174/','file:///tmp/evil', 'about:blank',
 ])assert.equal(isAllowedDocumentUrl(url,p),false,url);
});
test('POS-027 packaged renderer permits ONLY its own local asset tree',()=>{
 const entry=join(tmpdir(),'smartpos-app','out','renderer','index.html');
 const root=join(tmpdir(),'smartpos-app','out','renderer');
 const p=createShellPolicy(undefined,entry);
 assert.equal(p.mode,'PACKAGED');
 assert.equal(p.documentUrl,pathToFileURL(entry).href);
 const assets=[
  pathToFileURL(join(root,'assets','index.js')).href,
  pathToFileURL(join(root,'assets','index.css')).href,
  pathToFileURL(join(root,'nested','a.png')).href,
  pathToFileURL(entry).href,
 ];
 for(const url of assets)assert.equal(isAllowedRendererResource(url,p),true,url);
 for(const url of [
  pathToFileURL(join(tmpdir(),'smartpos-app','out','main','index.js')).href,
  pathToFileURL(join(tmpdir(),'smartpos-app','out','renderer-evil','a')).href,
  pathToFileURL(join(tmpdir(),'smartpos-app','secrets.txt')).href,
  pathToFileURL(join(tmpdir(),'other','index.html')).href,
  'file:///../../etc/passwd','https://example.com/a.js',
  'http://127.0.0.1:5173/src/main.tsx',
  pathToFileURL(entry).href+'?x=1',
  'data:application/javascript;base64,YQ==',
 ])assert.equal(isAllowedRendererResource(url,p),false,url);
 assert.equal(isAllowedDocumentUrl(entry,p),false);
 assert.equal(isAllowedDocumentUrl(p.documentUrl,p),true);
 assert.throws(()=>createShellPolicy(undefined,join(root,'not-index.html')),
  /DEMO_SHELL_INVALID_ENTRY/);
 assert.throws(()=>createShellPolicy(undefined,'index.html'),/DEMO_SHELL_INVALID_ENTRY/);
});

test('POS-027 mainFrame+sender reference identity required for app-info IPC',()=>{
 const p=createShellPolicy(dev,join(tmpdir(),'out','renderer','index.html'));
 const frame={url:dev},webContents={mainFrame:frame,getURL:()=>dev};
 assert.equal(isTrustedReadOnlyIpcSender(webContents,frame,webContents,p),true);
 assert.equal(isTrustedReadOnlyIpcSender({},frame,webContents,p),false);
 assert.equal(isTrustedReadOnlyIpcSender(webContents,{url:dev},webContents,p),false);
 assert.equal(isTrustedReadOnlyIpcSender(webContents,null,webContents,p),false);
 assert.equal(isTrustedReadOnlyIpcSender(webContents,undefined,webContents,p),false);
 const changedFrame={url:dev+'admin'};
 assert.equal(isTrustedReadOnlyIpcSender({...webContents,mainFrame:changedFrame},
   changedFrame,webContents,p),false);
 const wrongURLWebContents={mainFrame:frame,getURL:()=>dev+'evil'};
 assert.equal(isTrustedReadOnlyIpcSender(wrongURLWebContents,frame,wrongURLWebContents,p),false);
});
