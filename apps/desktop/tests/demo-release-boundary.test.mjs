import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=rel=>readFileSync(new URL(rel,import.meta.url),'utf8');

test('POS-028 production Electron always ignores externally injected dev renderer URLs',()=>{
 const main=get('../src/main/index.ts');
 assert.match(main,/app\.isPackaged\s*\?\s*undefined\s*:\s*process\.env\.ELECTRON_RENDERER_URL/);
 assert.match(main,/createShellPolicy\(DEV_RENDERER_URL/);
 assert.match(main,/mode: 'DEMO_ONLY'/);
 assert.doesNotMatch(main,/shell\.openExternal|autoUpdater|loadExtension/);
 const shell=get('../src/main/shell-policy.mts');
 assert.match(shell,/mode:'PACKAGED'/);
 assert.match(shell,/fileURLToPath/);
 assert.match(shell,/relative\(policy\.resourceBase,path\)/);
});
test('POS-028 unsigned installer config must be explicitly non-publishing and non-destructive',()=>{
 const conf=get('../electron-builder.yml');
 assert.match(conf,/electronVersion:\s*44\.9\.3/);
 assert.match(conf,/asar:\s*true/);
 assert.match(conf,/forceCodeSigning:\s*false/);
 assert.match(conf,/target:\s*nsis/);
 assert.match(conf,/target:\s*dmg/);
 assert.match(conf,/target:\s*zip/);
 assert.match(conf,/identity:\s*null/);
 assert.match(conf,/notarize:\s*false/);
 assert.match(conf,/deleteAppDataOnUninstall:\s*false/);
 assert.match(conf,/perMachine:\s*false/);
 assert.match(conf,/output:\s*\.\.\/demo-artifacts/);
 assert.doesNotMatch(conf,/provider:\s*(?:github|s3|generic)|publish:\s*(?:always|onTag)/);
 const scripts=JSON.parse(get('../package.json')).scripts;
 assert.match(scripts['package:demo:win'],/scripts\/run-win-builder\.mjs/);
 for(const name of ['package:demo:mac:x64','package:demo:mac:arm64']){
  assert.match(scripts[name],/electron-builder@26\.18\.1/);
  assert.match(scripts[name],/--publish never/);
 }
 for(const name of ['package:demo:win','package:demo:mac:x64','package:demo:mac:arm64']){
  assert.match(scripts[name],/scripts\/stage-demo\.mjs/);
  assert.match(scripts[name],/scripts\/verify-demo-artifacts\.mjs/);
 }
 const wrapper=get('../scripts/run-win-builder.mjs');
 assert.match(wrapper,/BUILDER_VERSION='26\.18\.1'/);
 assert.match(wrapper,/--no-package-lock/);
 assert.match(wrapper,/--ignore-scripts/);
 assert.match(wrapper,/npm-cli\.js/);
 assert.match(wrapper,/electron-builder','cli\.js/);
 assert.match(wrapper,/--publish','never'/);
 assert.doesNotMatch(wrapper,/PNPM_CONFIG_CACHE_DIR|shell:true/);
 assert.match(wrapper,/cache\.length>48/);
});
test('POS-028 repository workflow cannot create releases or expose production signing credentials',()=>{
 const workflow=get('../../../.github/workflows/demo-installers.yml');
 assert.match(workflow,/contents: read/);
 assert.match(workflow,/upload-artifact@v4/);
 assert.match(workflow,/retention-days: 5/);
 assert.match(workflow,/if-no-files-found: error/);
 assert.match(workflow,/windows-latest/);
 assert.match(workflow,/macos-15-intel/);
 assert.match(workflow,/runner: macos-15\n/);
 assert.doesNotMatch(workflow,/macos-14/);
 assert.match(workflow,/package:demo:mac:arm64/);
 assert.match(workflow,/pnpm install --frozen-lockfile/);
 assert.doesNotMatch(workflow,/create-release|softprops\/action-gh-release|release-action|contents: write|secrets\./);
 const ignore=get('../../../.gitignore');
 assert.match(ignore,/\.demo-package\//);
 assert.match(ignore,/demo-artifacts\//);
});
