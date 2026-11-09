import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,
  symlinkSync,linkSync,existsSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {stageDemoPackage,STAGE_NAME,STAGE_MARKER,ELECTRON_PIN}
 from '../scripts/stage-demo.mjs';
import {verifyDemoArtifacts} from '../scripts/verify-demo-artifacts.mjs';
import {commandForWindows,BUILDER_VERSION} from '../scripts/run-win-builder.mjs';

function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'smartpos-pos028-'));
 t.after(()=>rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:125}));
 const pkg={
  name:'@smartpos/desktop',version:'0.1.0',type:'commonjs',
  main:'./out/main/index.js',devDependencies:{electron:ELECTRON_PIN},
 };
 writeFileSync(join(root,'package.json'),JSON.stringify(pkg));
 writeFileSync(join(root,'electron-builder.yml'),
  'productName: SmartPOS Retail DEMO\nelectronVersion: 44.9.3\nasar: true\ndirectories:\n  output: ../demo-artifacts\n');
 const files={
  'out/main/index.js':'const electron=require("electron");const sqlite=require("node:sqlite");const MODE="DEMO_ONLY";',
  'out/preload/index.js':'const {contextBridge}=require("electron");',
  'out/renderer/index.html':'<!DOCTYPE html><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"><script src="./assets/index.js"></script>',
  'out/renderer/assets/index.js':'window.DEMO_ONLY=true;',
  'out/renderer/assets/index.css':'body { color: #123; }',
 };
 for(const [name,body] of Object.entries(files)){
  const path=join(root,name);mkdirSync(dirname(path),{recursive:true});
  writeFileSync(path,body);
 }
 return {root,files};
}
test('POS-028 stage only bundles Vite output and minimal versioned demo manifest',t=>{
 const {root,files}=fixture(t);
 const stage=stageDemoPackage(root);
 assert.deepEqual(stage,{version:'0.1.0',electron:ELECTRON_PIN,files:5,
  stagedRelative:STAGE_NAME});
 const stagedRoot=join(root,STAGE_NAME);
 const pkg=JSON.parse(readFileSync(join(stagedRoot,'package.json'),'utf8'));
 assert.equal(pkg.version,'0.1.0');
 assert.equal(pkg.name,'smartpos-retail-demo');
 assert.equal(pkg.main,'out/main/index.js');
 assert.equal(pkg.type,'commonjs');
 assert.deepEqual(pkg.dependencies,{});
 assert.equal(pkg.private,true);
 assert.equal(readFileSync(join(stagedRoot,STAGE_MARKER),'utf8'),
  'SmartPOS-POS-028-OWNED\n');
 for(const [path,content] of Object.entries(files))
  assert.equal(readFileSync(join(stagedRoot,path),'utf8'),content);
 assert.deepEqual(readdirSync(stagedRoot).sort(),
  [STAGE_MARKER,'out','package.json','electron-builder.yml'].sort());
 // An idempotent rebuild leaves exactly the same staged bits.
 const first=readFileSync(join(stagedRoot,'package.json'));
 stageDemoPackage(root);
 assert.deepEqual(readFileSync(join(stagedRoot,'package.json')),first);
});
test('POS-028 never overwrites an unmarked staging folder or traverses stage links',t=>{
 const {root}=fixture(t),folder=join(root,STAGE_NAME);
 mkdirSync(folder);writeFileSync(join(folder,'important.txt'),'do-not-delete');
 assert.throws(()=>stageDemoPackage(root),/DEMO_STAGE_REFUSE_EXISTING_STAGE/);
 assert.equal(readFileSync(join(folder,'important.txt'),'utf8'),'do-not-delete');
 rmSync(folder,{recursive:true});
 const target=join(root,'outside');mkdirSync(target);
 writeFileSync(join(target,'keep'),'untouched');
 try{symlinkSync(target,folder,process.platform==='win32'?'junction':'dir');}
 catch(e){if(['EPERM','EACCES','ENOTSUP'].includes(e.code))return t.skip('OS symlink restriction');throw e;}
 assert.throws(()=>stageDemoPackage(root),/DEMO_STAGE_REFUSE_EXISTING_STAGE/);
 assert.equal(readFileSync(join(target,'keep'),'utf8'),'untouched');
});
test('POS-028 rejects sensitive output, symlink sources and source maps',t=>{
 const {root}=fixture(t);
 for(const name of ['out/renderer/.env','out/renderer/source.map',
  'out/renderer/secret.pem','out/main/local.sqlite-wal']){
  writeFileSync(join(root,name),'SYNTHETIC_TEST_SECRET');
  assert.throws(()=>stageDemoPackage(root),/DEMO_STAGE_DISALLOWED_OUTPUT/);
  rmSync(join(root,name));
 }
 const remote=join(root,'sensitive.txt');writeFileSync(remote,'never package');
 const name=join(root,'out','renderer','assets','linked.js');
 try{symlinkSync(remote,name,'file');}
 catch(e){if(['EPERM','EACCES','ENOTSUP'].includes(e.code))return t.skip('OS symlink restriction');throw e;}
 assert.throws(()=>stageDemoPackage(root),/DEMO_STAGE_SYMLINK/);
 assert.equal(readFileSync(remote,'utf8'),'never package');
});
test('POS-028 refuses hardlinked compiled bundles, missing files, unpinned Electron or placeholders',t=>{
 const {root}=fixture(t);
 const path=join(root,'out','main','index.js'),mirror=join(root,'mirror.js');
 try{linkSync(path,mirror);}
 catch(e){if(['EPERM','EACCES','ENOTSUP'].includes(e.code))return t.skip('OS hardlink restriction');throw e;}
 assert.throws(()=>stageDemoPackage(root),/DEMO_STAGE_LINK_OR_SPECIAL_FILE/);
 rmSync(mirror);
 const pkgPath=join(root,'package.json');
 const pkg=JSON.parse(readFileSync(pkgPath,'utf8'));
 pkg.devDependencies.electron='45.0.0';
 writeFileSync(pkgPath,JSON.stringify(pkg));
 assert.throws(()=>stageDemoPackage(root),/DEMO_STAGE_UNPINNED_PROJECT/);
 pkg.devDependencies.electron=ELECTRON_PIN;writeFileSync(pkgPath,JSON.stringify(pkg));
 const html=join(root,'out','renderer','index.html');
 writeFileSync(html,'Content-Security-Policy __SMARTPOS_SCRIPT_POLICY__');
 assert.throws(()=>stageDemoPackage(root),/DEMO_STAGE_UNSAFE_RENDERER_BUILD/);
});
function binary(path,signature){
 const buffer=Buffer.alloc(1024*1024+513);
 Buffer.from(signature).copy(buffer,0);
 if(path.endsWith('.dmg'))Buffer.from('koly').copy(buffer,buffer.length-512);
 writeFileSync(path,buffer);
}
test('POS-028 verifies versioned Windows NSIS binary and stable hash provenance',t=>{
 const {root}=fixture(t),dir=join(root,'artifacts');mkdirSync(dir);
 const name='SmartPOS-DEMO-0.1.0-win-x64-setup.exe';
 binary(join(dir,name),'MZ');
 const commit='f'.repeat(40);
 const data=verifyDemoArtifacts(dir,{platform:'win',arch:'x64',
  version:'0.1.0',commit});
 assert.equal(data.kind,'UNSIGNED_DEMO_ONLY');
 assert.equal(data.publish,false);
 assert.equal(data.version,'0.1.0');
 assert.deepEqual(data.installerTargets,['win-x64']);
 assert.equal(data.artifactChecksums.length,1);
 const hash=createHash('sha256').update(readFileSync(join(dir,name))).digest('hex');
 assert.equal(data.artifactChecksums[0].sha256,hash);
 assert.equal(readFileSync(join(dir,'SHA256SUMS.txt'),'utf8'),hash+'  '+name+'\n');
 assert.deepEqual(JSON.parse(readFileSync(join(dir,'BUILD_PROVENANCE.json'),'utf8')),data);
 assert.throws(()=>verifyDemoArtifacts(dir,{platform:'win',arch:'arm64',
  version:'0.1.0'}),/DEMO_RELEASE_UNSUPPORTED_TARGET/);
 assert.throws(()=>verifyDemoArtifacts(dir,{platform:'win',arch:'x64',
  version:'0.1.0',commit:'invalid'}),/DEMO_RELEASE_INVALID_COMMIT/);
});
test('POS-028 requires BOTH macOS DMG/ZIP and rejects corrupt or wrong version packages',t=>{
 const {root}=fixture(t),dir=join(root,'artifacts');mkdirSync(dir);
 const prefix='SmartPOS-DEMO-0.1.0-mac-arm64';
 binary(join(dir,prefix+'.dmg'),'some');
 assert.throws(()=>verifyDemoArtifacts(dir,{platform:'mac',arch:'arm64',
  version:'0.1.0'}),/DEMO_RELEASE_MISSING_INSTALLER/);
 binary(join(dir,prefix+'.zip'),'PK');
 const result=verifyDemoArtifacts(dir,{platform:'mac',arch:'arm64',version:'0.1.0'});
 assert.equal(result.artifactChecksums.length,2);
 const other=join(dir,'SmartPOS-DEMO-0.1.0-win-x64-setup.exe');
 binary(other,'MZ');
 assert.throws(()=>verifyDemoArtifacts(dir,{platform:'mac',arch:'arm64',
  version:'0.1.0'}),/DEMO_RELEASE_UNEXPECTED_INSTALLER/);
 rmSync(other);
 assert.throws(()=>verifyDemoArtifacts(dir,{platform:'mac',arch:'arm64',
  version:'0.1.1'}),/DEMO_RELEASE_UNEXPECTED_INSTALLER/);
 binary(join(dir,prefix+'.zip'),'NO');
 assert.throws(()=>verifyDemoArtifacts(dir,{platform:'mac',arch:'arm64',
  version:'0.1.0'}),/DEMO_RELEASE_INVALID_ZIP/);
});

test('POS-028 Windows NSIS uses short per-user pnpm dlx cache, not userData',()=>{
 const {cache,args}=commandForWindows('win','x64','C:\\Users\\runneradmin');
 assert.ok(cache.endsWith('.spx'));
 assert.equal(BUILDER_VERSION,'26.18.1');
 assert.deepEqual(args.slice(0,2),['dlx','electron-builder@26.18.1']);
 assert.ok(args.join(' ').includes('--publish never'));
 assert.throws(()=>commandForWindows('mac','x64','C:\\Users\\runneradmin'),
  /DEMO_BUILDER_UNSUPPORTED_TARGET/);
 assert.throws(()=>commandForWindows('win','arm64','C:\\Users\\runneradmin'),
  /DEMO_BUILDER_UNSUPPORTED_TARGET/);
 assert.throws(()=>commandForWindows('win','x64',
  'C:\\Users\\this_profile_is_very_long_and_can_break_nsis_paths_on_windows'),
  /DEMO_BUILDER_CACHE_PATH_TOO_LONG/);
});
