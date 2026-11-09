import {chmodSync,lstatSync,mkdirSync} from 'node:fs';
import {dirname,isAbsolute} from 'node:path';

/**
 * POS-027: safeguard file-backed SQLite and its WAL/SHM against directly
 * redirected or linked paths. No deletion/renaming/reset is ever performed.
 *
 * This is NOT database encryption, user authentication or a security boundary
 * against an administrator/malicious local process with the user's OS rights.
 * Windows chmod DOES NOT enforce NTFS DACLs. Do not assert Windows ACL safety
 * until owner verifies icacls and approves D-009/D-013 operational policy.
 */
const suffixes=['','-wal','-shm'] as const;
function reject(code:string):never{throw new Error('SQLITE_STORAGE_'+code);}
function isErrnoNotFound(error:unknown):boolean{
  return !!error&&typeof error==='object'&&'code' in error&&
    (error as {code:unknown}).code==='ENOENT';
}
function inspect(path:string,kind:'DIRECTORY'|'FILE'):boolean{
  let info:ReturnType<typeof lstatSync>;
  try{info=lstatSync(path);}catch(error){
    if(isErrnoNotFound(error))return false;
    return reject('UNAVAILABLE');
  }
  if(info.isSymbolicLink()||(kind==='DIRECTORY'?!info.isDirectory():!info.isFile()))
    reject('LINK_OR_SPECIAL_FILE');
  if(kind==='FILE'&&info.nlink!==1)reject('LINKED_FILE');
  return true;
}
/**
 * Call BEFORE SQLite opens and AFTER journal mode is enabled. Keep mode
 * restrictive on POSIX; fail rather than silently continue if chmod fails.
 * Windows needs separate DACL/volume inspection (documented, never faked).
 */
export function secureSqliteStoragePath(path:string):void{
  if(!isAbsolute(path)||path===':memory:')reject('ABSOLUTE_PATH_REQUIRED');
  const directory=dirname(path);
  // Ensure existing directory is not a direct symlink/junction.
  if(!inspect(directory,'DIRECTORY'))
    mkdirSync(directory,{recursive:true,mode:0o700});
  inspect(directory,'DIRECTORY');
  // Do not touch or truncate an existing SQLite, WAL or SHM file.
  for(const suffix of suffixes)inspect(path+suffix,'FILE');
  if(process.platform!=='win32'){
    try{
      chmodSync(directory,0o700);
      for(const suffix of suffixes)if(inspect(path+suffix,'FILE'))
        chmodSync(path+suffix,0o600);
    }catch(error){
      if(error instanceof Error&&error.message.startsWith('SQLITE_STORAGE_'))throw error;
      reject('PERMISSION_UPDATE_FAILED');
    }
  }
}
export function refuseExistingBackupTarget(path:string):void{
  if(!isAbsolute(path))reject('ABSOLUTE_PATH_REQUIRED');
  // lstat, not existsSync: dangling symlinks must be rejected as occupied.
  try{lstatSync(path);}catch(error){
    if(isErrnoNotFound(error))return;
    reject('UNAVAILABLE');
  }
  reject('BACKUP_EXISTS');
}
