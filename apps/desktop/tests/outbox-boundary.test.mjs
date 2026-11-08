import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(rel)=>readFileSync(new URL(rel,import.meta.url),'utf8');

test('POS-022 MAIN-only outbox transport remains disconnected from app, preload, IPC and renderer',()=>{
  const main=read('../src/main/index.ts');
  const preload=read('../src/preload/index.ts');
  const renderer=read('../src/renderer/src/app.tsx');
  const bridge=read('../src/renderer/src/desktop-bridge.d.ts');
  for(const [name,source] of [
    ['main',main],['preload',preload],['renderer',renderer],['bridge',bridge],
  ]){
    assert.doesNotMatch(source,/OutboxRetryWorker|recoverOrphanedOutbox|retryOutboxNow|test:outbox-worker/,
      name+' must not activate PUSH or expose outbox until D-013 signed auth');
    assert.doesNotMatch(source,/\/v1\/sync\/push/,name+' cannot create live sync HTTP');
  }
  assert.match(main,/mode: 'DEMO_ONLY'/);
  assert.match(preload,/getAppInfo/);
});
test('POS-022 uses exact POS-016 wire validator and no network, secret or renderer modules',()=>{
  const worker=read('../src/main/local-db/outbox-worker.ts');
  assert.match(worker,/assertPushResponseMatchesRequest/);
  assert.match(worker,/syncSaleCompletedEventSchema/);
  assert.match(worker,/syncPushRequestSchema/);
  assert.match(worker,/withLocalTransaction/);
  assert.match(worker,/OUTBOX_MAX_BACKOFF_MS/);
  assert.match(worker,/NOT ENABLED IN NORMAL APP/);
  assert.doesNotMatch(worker,/\bfetch\s*\(|\baxios\b|https?:\/\/|DATABASE_URL|process\.env|ipcMain|ipcRenderer|contextBridge|\/v1\/sync\/push/);
  assert.match(worker,/SET state='RETRY',next_retry_at=NULL/);
  assert.match(worker,/state='SYNCING'/);
  assert.match(worker,/ORDER BY o\.created_at ASC,o\.event_id ASC/);
});
