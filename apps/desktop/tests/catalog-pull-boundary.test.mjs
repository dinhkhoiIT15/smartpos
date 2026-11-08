import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('POS-023 PULL not connected to normal Electron preload renderer or real Fastify entrypoint',()=>{
 const main=read('../src/main/index.ts'),preload=read('../src/preload/index.ts'),
  renderer=read('../src/renderer/src/app.tsx'),bridge=read('../src/renderer/src/desktop-bridge.d.ts');
 for(const [name,c] of [['MAIN',main],['preload',preload],['renderer',renderer],['bridge',bridge]]){
  assert.doesNotMatch(c,/CatalogPullWorker|applyCatalogPullPage|\/v1\/sync\/pull/,name);
 }
 const api=read('../../api/src/main.ts');
 assert.doesNotMatch(api,/syncPull:|CatalogPullService|\/v1\/sync\/pull/);
 assert.match(main,/mode: 'DEMO_ONLY'/);
});
test('POS-023 local importer is atomic and cannot mutate financial evidence or clear unsynced pending deltas',()=>{
 const apply=read('../src/main/local-db/catalog-pull.ts');
 assert.match(apply,/withLocalTransaction/);
 assert.match(apply,/assertPullResponseMatchesQuery/);
 assert.match(apply,/syncPullResponseSchema/);
 assert.ok(apply.includes('server_qty=excluded.server_qty') && apply.includes('server_revision=excluded.server_revision'));
 assert.match(apply,/pending_delta=excluded.pending_delta/);
 assert.match(apply,/syncPushResultSchema/);
 assert.doesNotMatch(apply,/\bfetch\s*\(|\baxios\b|ipcMain|ipcRenderer|DATABASE_URL|https?:\/\//);
 assert.doesNotMatch(apply,/\bUPDATE\s+(?:local_sales|local_payments|local_sale_items|outbox_events)\b/i);
 // A cursor-covered, validated ACKed sale can release only its own pending portion.
});
