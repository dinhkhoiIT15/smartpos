import {spawnSync} from 'node:child_process';
import {lstatSync,mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * POS-028 Windows-only electron-builder launcher. NSIS has a conservative
 * pathname limit for !include StdUtils.nsh. pnpm dlx under the default long
 * %LOCALAPPDATA%\pnpm-cache\dlx\... produces a long app-builder-lib path.
 * Use an owner-controlled SHORT cache under the SAME Windows user profile.
 *
 * This cache holds only installer CLI dependencies; NEVER set ELECTRON
 * userData / SQLite, never write to production file paths, never elevate.
 */
const fail=code=>{throw new Error('DEMO_BUILDER_'+code);};
export const BUILDER_VERSION='26.18.1';
export function commandForWindows(platform,arch,home){
  if(platform!=='win'||arch!=='x64')fail('UNSUPPORTED_TARGET');
  if(typeof home!=='string'||home.length<3)fail('INVALID_HOME');
  const cache=join(home,'.spx');
  // A long Windows profile root would leave NSIS include paths too deep.
  if(cache.length>48)fail('CACHE_PATH_TOO_LONG');
  return {
    cache,
    args:['dlx','electron-builder@'+BUILDER_VERSION,'--projectDir','.demo-package',
      '--win','nsis','--x64','--publish','never'],
  };
}
export function runWindowsBuilder({home=homedir(),root=resolve(dirname(fileURLToPath(import.meta.url)),'..')}={}){
  if(process.platform!=='win32')fail('WINDOWS_ONLY');
  const planned=commandForWindows('win','x64',home);
  mkdirSync(planned.cache,{recursive:true});
  const stat=lstatSync(planned.cache);
  if(!stat.isDirectory()||stat.isSymbolicLink())fail('UNTRUSTED_CACHE');
  // pnpm v10 cacheDir setting: this changes only dlx package extraction.
  // All arguments are static, no untrusted paths are interpolated in shell.
  const env={...process.env,PNPM_CONFIG_CACHE_DIR:planned.cache};
  const outcome=spawnSync('pnpm.cmd',planned.args,{
    cwd:root,env,stdio:'inherit',shell:true,
  });
  if(outcome.error)throw outcome.error;
  if(outcome.status!==0)fail('PACKAGE_FAILED');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{runWindowsBuilder();}
  catch(error){console.error(error instanceof Error?error.message:'PACKAGE_FAILED');
    process.exitCode=1;}
}
