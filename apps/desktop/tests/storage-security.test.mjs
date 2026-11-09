import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,linkSync,symlinkSync,existsSync,statSync,readFileSync,
  writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openLocalDatabase,backupLocalDatabase,getLocalSchemaVersion}
 from '../src/main/local-db/index.ts';
import {secureSqliteStoragePath,refuseExistingBackupTarget}
 from '../src/main/local-db/storage-policy.mts';

function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'smartpos-pos027-'));
 const file=join(dir,'main.sqlite');
 const handles=[];
 const open=(target=file)=>{const db=openLocalDatabase(target);handles.push(db);return db;};
 t.after(()=>{
  for(const db of handles)if(db.isOpen)db.close();
  rmSync(dir,{recursive:true,force:true,maxRetries:8,retryDelay:125});
 });
 return {dir,file,open};
}
test('POS-027 existing SQLite v1 is never reset, WAL and paid evidence survive reopen',t=>{
 const f=fixture(t),db=f.open();
 db.prepare(`INSERT INTO local_sales(sale_id,store_id,device_id,cashier_id,
   client_created_at,total_vnd) VALUES(?,?,?,?,?,?)`)
   .run('sale-kept','store-kept','device-kept','cashier-kept',
    '2026-11-09T10:00:00.000Z',9007199254740993n);
 db.prepare(`INSERT INTO outbox_events(event_id,sale_id,store_id,device_id,
  payload_json,payload_hash,created_at) VALUES(?,?,?,?,?,?,?)`)
  .run('event-kept','sale-kept','store-kept','device-kept',
   '{"schemaVersion":1}', 'f'.repeat(64),'2026-11-09T10:00:00.000Z');
 db.close();
 assert.ok(existsSync(f.file));
 const reopened=f.open();
 const raw=reopened.prepare('SELECT total_vnd FROM local_sales');
 raw.setReadBigInts(true);
 assert.equal(raw.get().total_vnd,9007199254740993n);
 assert.equal(reopened.prepare('SELECT payload_hash FROM outbox_events')
  .get().payload_hash,'f'.repeat(64));
 assert.equal(getLocalSchemaVersion(reopened),1);
 assert.equal(reopened.prepare('PRAGMA journal_mode').get().journal_mode,'wal');
 if(process.platform!=='win32'){
  assert.equal(statSync(f.dir).mode & 0o777,0o700);
  assert.equal(statSync(f.file).mode & 0o777,0o600);
 }
});
test('POS-027 refuse real hardlinks and special file targets before SQLite open',t=>{
 const f=fixture(t),db=f.open();db.close();
 const alias=join(f.dir,'alias.sqlite');
 try{linkSync(f.file,alias);}catch(error){
  if(error&&typeof error==='object'&&
    ['EPERM','ENOTSUP','EACCES'].includes(error.code))return t.skip('Hardlinks restricted');
  throw error;
 }
 assert.throws(()=>f.open(),/SQLITE_STORAGE_LINKED_FILE/);
 assert.ok(existsSync(f.file));
 assert.ok(existsSync(alias));
 assert.equal(readFileSync(f.file).length>0,true);
});
test('POS-027 refuses database and WAL symlinks even if target data exists',t=>{
 const f=fixture(t);
 const external=join(f.dir,'legit.bin');
 writeFileSync(external,'evidence-do-not-modify');
 for(const suffix of ['','-wal','-shm']){
  const dest=f.file+suffix;
  try{symlinkSync(external,dest,'file');}catch(error){
   if(error&&typeof error==='object'&&
     ['EPERM','ENOTSUP','EACCES'].includes(error.code))
       return t.skip('OS disallows symlink creation');
   throw error;
  }
  assert.throws(()=>f.open(),/SQLITE_STORAGE_LINK_OR_SPECIAL_FILE/);
  assert.equal(readFileSync(external,'utf8'),'evidence-do-not-modify');
  rmSync(dest);
 }
});
test('POS-027 rejects symlinked direct storage directory before opening DB',t=>{
 const f=fixture(t),target=join(f.dir,'actual'),redirect=join(f.dir,'redirect');
 mkdirSync(target);
 try{symlinkSync(target,redirect,process.platform==='win32'?'junction':'dir');}
 catch(error){
  if(error&&typeof error==='object'&&
    ['EPERM','ENOTSUP','EACCES'].includes(error.code))
      return t.skip('OS disallows directory symlinks');
  throw error;
 }
 assert.throws(()=>f.open(join(redirect,'ev.sqlite')),
   /SQLITE_STORAGE_LINK_OR_SPECIAL_FILE/);
 assert.equal(existsSync(join(target,'ev.sqlite')),false);
});
test('POS-027 backup path refuses dangling symlink; no overwrite and snapshot remains readable',async t=>{
 const f=fixture(t),db=f.open();
 db.prepare('INSERT INTO local_device_metadata(store_id,device_id,provisioned_at) VALUES(?,?,?)')
  .run('store1','device1','2026-11-09T10:00:00.000Z');
 const backupDir=join(f.dir,'backup');mkdirSync(backupDir);
 const dest=join(backupDir,'safe.sqlite');
 await backupLocalDatabase(db,dest);
 const backup=f.open(dest);
 assert.equal(backup.prepare('SELECT device_id FROM local_device_metadata')
  .get().device_id,'device1');
 backup.close();
 await assert.rejects(()=>backupLocalDatabase(db,dest),/Refusing to overwrite/);
 const missing=join(backupDir,'not-there'),dangling=join(backupDir,'dangling.sqlite');
 try{symlinkSync(missing,dangling,'file');}catch(error){
  if(error&&typeof error==='object'&&
    ['EPERM','ENOTSUP','EACCES'].includes(error.code))
      return t.skip('OS disallows symlink creation');
  throw error;
 }
 assert.throws(()=>refuseExistingBackupTarget(dangling),/SQLITE_STORAGE_BACKUP_EXISTS/);
 await assert.rejects(()=>backupLocalDatabase(db,dangling),/Refusing to overwrite/);
 assert.equal(existsSync(missing),false);
});
test('POS-027 storage guard fails closed on file not directory and never deletes its contents',t=>{
 const f=fixture(t),notDirectory=join(f.dir,'not-dir');
 writeFileSync(notDirectory,'keep');
 assert.throws(()=>secureSqliteStoragePath(join(notDirectory,'db.sqlite')),
  /SQLITE_STORAGE_LINK_OR_SPECIAL_FILE/);
 assert.equal(readFileSync(notDirectory,'utf8'),'keep');
 assert.throws(()=>secureSqliteStoragePath('relative.sqlite'),/SQLITE_STORAGE_ABSOLUTE_PATH_REQUIRED/);
});
