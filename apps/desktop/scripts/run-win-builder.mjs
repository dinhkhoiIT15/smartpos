import {spawnSync} from 'node:child_process';
import {existsSync,lstatSync,mkdirSync,readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname,isAbsolute,join,resolve,sep,win32} from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * POS-028 Windows-only Electron-builder launcher.
 *
 * NSIS's StdUtils.nsh include cannot resolve pnpm dlx's very deep virtual-store
 * path under %LOCALAPPDATA%\pnpm-cache\dlx. Use npm's flat module layout in a
 * SHORT temporary build-tool prefix under this user's home directory.
 * Uses the setup-node bundled npm CLI directly via node.exe (no cmd shell),
 * with lifecycle scripts disabled. This NEVER touches Electron userData,
 * SQLite/WAL/SHM, source workspace lockfile, or OS credential stores.
 *
 * Packaging tool dependencies are NOT frozen by pnpm-lock.yaml. D-011 still
 * requires approved supply-chain lock/provenance before any production release.
 */
const fail=code=>{throw new Error('DEMO_BUILDER_'+code);};
export const BUILDER_VERSION='26.18.1';

export function commandForWindows(platform,arch,home,nodeExec=process.execPath){
  if(platform!=='win'||arch!=='x64')fail('UNSUPPORTED_TARGET');
  if(typeof home!=='string'||!(isAbsolute(home)||win32.isAbsolute(home))||home.length<3||
    typeof nodeExec!=='string'||!(isAbsolute(nodeExec)||win32.isAbsolute(nodeExec)))
    fail('INVALID_HOME');
  // Only locally generated, no user-supplied shell command text. Reject
  // problematic characters even though we execute Node without a shell.
  const cache=join(home,'.spx');
  if(cache.length>48)fail('CACHE_PATH_TOO_LONG');
  const npmCli=join(dirname(nodeExec),'node_modules','npm','bin','npm-cli.js');
  const builder=join(cache,'node_modules','electron-builder','cli.js');
  return {
    cache,npmCli,builder,
    npmArgs:['install','--prefix',cache,'--no-save','--no-package-lock',
      '--ignore-scripts','--no-audit','--no-fund',
      'electron-builder@'+BUILDER_VERSION],
    builderArgs:['--projectDir','.demo-package','--win','nsis','--x64',
      '--publish','never'],
  };
}

function checkedDirectory(dir){
  mkdirSync(dir,{recursive:true});
  const stat=lstatSync(dir);
  if(!stat.isDirectory()||stat.isSymbolicLink())fail('UNTRUSTED_CACHE');
}
function runNode(exec,args,root){
  const run=spawnSync(exec,args,{cwd:root,stdio:'inherit',shell:false});
  if(run.error)throw run.error;
  if(run.status!==0)fail('PACKAGE_FAILED');
}
export function runWindowsBuilder({
  home=homedir(),root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),
  nodeExec=process.execPath,
}={}){
  if(process.platform!=='win32')fail('WINDOWS_ONLY');
  const planned=commandForWindows('win','x64',home,nodeExec);
  checkedDirectory(planned.cache);
  if(!existsSync(planned.npmCli))fail('MISSING_NPM_CLI');
  runNode(nodeExec,[planned.npmCli,...planned.npmArgs],root);
  const pkgPath=join(planned.cache,'node_modules','electron-builder','package.json');
  if(!existsSync(pkgPath))fail('MISSING_BUILDER');
  const pkg=JSON.parse(readFileSync(pkgPath,'utf8'));
  if(pkg.version!==BUILDER_VERSION||!pkg.bin)fail('UNPINNED_BUILDER');
  // Official package metadata may use './cli.js' or a direct bin string.
  // Resolve its bin in the verified pinned package directory, never from a
  // user-controlled PATH, arbitrary NPM bin shim or global executable.
  const bin=typeof pkg.bin==='string'?pkg.bin:pkg.bin['electron-builder'];
  if(typeof bin!=='string'||bin.length>100||bin.includes('\\0')||
    isAbsolute(bin)||win32.isAbsolute(bin))fail('UNPINNED_BUILDER');
  const base=join(planned.cache,'node_modules','electron-builder');
  const resolved=resolve(base,bin);
  const rel=resolved.startsWith(base+sep)?resolved.slice(base.length+1):'';
  if(!rel||rel.includes('..'+sep)||!existsSync(resolved))
    fail('MISSING_BUILDER_CLI');
  runNode(nodeExec,[resolved,...planned.builderArgs],root);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{runWindowsBuilder();}
  catch(error){
    console.error(error instanceof Error?error.message:'PACKAGE_FAILED');
    process.exitCode=1;
  }
}
