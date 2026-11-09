import {copyFileSync,existsSync,lstatSync,mkdirSync,readFileSync,
  readdirSync,rmSync,writeFileSync} from 'node:fs';
import {basename,dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * POS-028: source-free, credential-free packaging stage, NOT a release signer.
 * Rebuild from electron-vite output only, never package apps/desktop directory.
 * Stage deletion is limited to an explicitly marked, owned generated folder.
 */
export const STAGE_NAME='.demo-package';
export const STAGE_MARKER='.smartpos-generated-demo-stage';
export const ELECTRON_PIN='44.9.3';
export const DEMO_NAME='smartpos-retail-demo';
const VERSION=/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const FILE_ALLOWED=/\.(?:js|cjs|mjs|css|html|json|png|jpg|jpeg|webp|svg|woff2?|ico|ttf)$/i;
const FILE_DENY=/(?:^|[/\\])(?:\.env(?:\..*)?|\.npmrc|\.pnpmfile\.cjs|\.git|node_modules|src|tests|backups|local-data|exports)(?:[/\\]|$)|\.(?:sqlite3?|db|db-wal|db-shm|pem|pfx|p12|key|map|ts|tsx)$/i;
const MANDATORY=['out/main/index.js','out/preload/index.js','out/renderer/index.html'];
const reject=(code)=>{throw new Error('DEMO_STAGE_'+code);};
const validRelative=(value)=>value && !value.startsWith('..'+sep)&&
  value!=='..'&&!value.startsWith(sep)&&!value.includes('\0');

function safeRegularFile(path){
  const info=lstatSync(path);
  if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)
    reject('LINK_OR_SPECIAL_FILE');
  if(info.size===0||info.size>60*1024*1024)reject('FILE_SIZE');
}
function allOutputFiles(root){
  const result=[];
  function walk(where){
    const stats=lstatSync(where);
    if(!stats.isDirectory()||stats.isSymbolicLink())reject('LINK_OR_SPECIAL_DIRECTORY');
    for(const item of readdirSync(where,{withFileTypes:true})){
      const full=join(where,item.name);
      if(item.isSymbolicLink())reject('SYMLINK');
      if(item.isDirectory()){walk(full);continue;}
      safeRegularFile(full);
      const rel=relative(root,full);
      if(!validRelative(rel)||FILE_DENY.test(rel)||
        !FILE_ALLOWED.test(rel)||!rel.startsWith('out'+sep))
        reject('DISALLOWED_OUTPUT');
      result.push(rel);
    }
  }
  walk(join(root,'out','main'));
  walk(join(root,'out','preload'));
  walk(join(root,'out','renderer'));
  return result.sort();
}
export function stageDemoPackage(projectRoot,stageRoot=join(projectRoot,STAGE_NAME)){
  const root=resolve(projectRoot),dest=resolve(stageRoot);
  if(dest!==join(root,STAGE_NAME))reject('UNTRUSTED_STAGE_PATH');
  const projectPkg=join(root,'package.json');
  const config=join(root,'electron-builder.yml');
  safeRegularFile(config);
  const buildConfig=readFileSync(config,'utf8');
  if(!buildConfig.includes('electronVersion: '+ELECTRON_PIN)||
    !buildConfig.includes('productName: SmartPOS Retail DEMO')||
    !buildConfig.includes('asar: true')||
    !buildConfig.includes('output: ../demo-artifacts'))reject('UNPINNED_BUILD_CONFIG');
  safeRegularFile(projectPkg);
  const pkg=JSON.parse(readFileSync(projectPkg,'utf8'));
  if(typeof pkg.version!=='string'||!VERSION.test(pkg.version)||
    pkg.devDependencies?.electron!==ELECTRON_PIN||
    pkg.main!=='./out/main/index.js'||pkg.type!=='commonjs')
    reject('UNPINNED_PROJECT');
  for(const name of MANDATORY){
    const path=join(root,name);
    safeRegularFile(path);
  }
  const html=readFileSync(join(root,'out/renderer/index.html'),'utf8');
  if(!html.includes('Content-Security-Policy')||
    html.includes('__SMARTPOS_SCRIPT_POLICY__')||
    html.includes('__SMARTPOS_CONNECT_POLICY__')||
    html.includes('/src/main.tsx')||
    !html.includes('DEMO') && !readFileSync(join(root,'out/main/index.js'),'utf8')
      .includes('DEMO_ONLY'))
    reject('UNSAFE_RENDERER_BUILD');
  const paths=allOutputFiles(root);
  if(paths.length<MANDATORY.length||MANDATORY.some(f=>!paths.includes(f.split('/').join(sep))))
    reject('MISSING_BUILD');
  // A staging directory never gets recreated over an unmarked folder or link.
  if(existsSync(dest)){
    const info=lstatSync(dest);
    if(info.isSymbolicLink()||!info.isDirectory()||
      !existsSync(join(dest,STAGE_MARKER))||
      readFileSync(join(dest,STAGE_MARKER),'utf8')!=='SmartPOS-POS-028-OWNED\n')
      reject('REFUSE_EXISTING_STAGE');
    rmSync(dest,{recursive:true,force:false});
  }
  mkdirSync(dest,{recursive:false,mode:0o700});
  writeFileSync(join(dest,STAGE_MARKER),'SmartPOS-POS-028-OWNED\n',{mode:0o600});
  for(const path of paths){
    const source=join(root,path),output=join(dest,path);
    mkdirSync(dirname(output),{recursive:true});
    copyFileSync(source,output);
  }
  // Minimal package deliberately declares no runtime npm dependencies:
  // electron-vite bundles main/preload/renderer; Node built-ins + Electron
  // are supplied by the pinned Electron runtime.
  // Builder config is read only by the build tool and excluded from app.asar.
  copyFileSync(config,join(dest,'electron-builder.yml'));
  const manifest={
    name:DEMO_NAME,version:pkg.version,private:true,
    description:'SmartPOS Retail — unsigned development demo; NO LIVE SALES',
    main:'out/main/index.js',type:'commonjs',dependencies:{},
  };
  writeFileSync(join(dest,'package.json'),JSON.stringify(manifest,null,2)+'\n');
  // No raw sources, env files, caches, pnpm store, databases or symlinks.
  return {version:pkg.version,electron:ELECTRON_PIN,files:paths.length,
    stagedRelative:relative(root,dest)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
    console.log(JSON.stringify(stageDemoPackage(root)));
  }catch(error){console.error(error instanceof Error?error.message:'STAGE_FAILED');
    process.exitCode=1;}
}
