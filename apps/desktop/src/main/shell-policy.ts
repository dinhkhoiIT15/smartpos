import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,isAbsolute,relative,resolve,sep} from 'node:path';

/**
 * POS-027: pure Electron MAIN allowlist policy.
 * Non-persistent partition = no disk HTTP cache/cookies/localStorage. Never
 * place credentials here: D-013 OS-backed secrets and auth are not ready.
 */
export const DEMO_SESSION_PARTITION='smartpos-demo-memory-only';
export type ShellPolicy=Readonly<{
  mode:'DEVELOPMENT'|'PACKAGED';
  documentUrl:string;
  resourceBase:string;
}>;

const LOOPBACK=new Set(['localhost','127.0.0.1','[::1]']);
function isAllowedLoopbackUrl(value:string):URL|null{
  try{
    const u=new URL(value);
    if(u.protocol!=='http:'||!LOOPBACK.has(u.hostname)||
      !u.port||u.username||u.password||u.search||u.hash||
      u.pathname!=='/'||u.origin==='null')return null;
    return u;
  }catch{return null;}
}
export function createShellPolicy(devRendererUrl:string|undefined,
  packagedHtmlPath:string):ShellPolicy {
  if(devRendererUrl!==undefined){
    const url=isAllowedLoopbackUrl(devRendererUrl);
    if(!url)throw new Error('DEMO_SHELL_UNTRUSTED_DEV_URL');
    return {mode:'DEVELOPMENT',documentUrl:url.href,resourceBase:url.origin};
  }
  if(!isAbsolute(packagedHtmlPath)||!packagedHtmlPath.endsWith(sep+'index.html'))
    throw new Error('DEMO_SHELL_INVALID_ENTRY');
  const file=resolve(packagedHtmlPath);
  return {mode:'PACKAGED',documentUrl:pathToFileURL(file).href,
    resourceBase:dirname(file)};
}
export function isAllowedDocumentUrl(value:string,policy:ShellPolicy):boolean{
  if(typeof value!=='string')return false;
  // No unexpected path, query, fragment, alternate casing or origin.
  return value===policy.documentUrl;
}
export function isAllowedRendererResource(value:string,policy:ShellPolicy):boolean{
  let u:URL;
  try{u=new URL(value);}catch{return false;}
  if(u.username||u.password)return false;
  if(policy.mode==='DEVELOPMENT'){
    // Vite script/assets + HMR websocket can use ONLY its exact loopback
    // origin (host+port). No proxies, external domains or neighboring ports.
    if(u.protocol!=='http:'&&u.protocol!=='ws:')return false;
    const expected=new URL(policy.resourceBase);
    return u.hostname===expected.hostname&&u.port===expected.port;
  }
  if(u.protocol!=='file:'||u.search||u.hash||u.host)return false;
  let path:string;
  try{path=fileURLToPath(u);}catch{return false;}
  const rel=relative(policy.resourceBase,path);
  // Reject sibling-prefix, .. and absolute/file URL path escape.
  return rel===''||(!isAbsolute(rel)&&rel!=='..'&&
    !rel.startsWith('..'+sep));
}
