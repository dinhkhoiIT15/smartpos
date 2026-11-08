import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openLocalDatabase } from '../src/main/local-db/index.ts';
import { applyInitialCatalogSnapshot } from '../src/main/local-db/catalog-cache.ts';
import { commitLocalCashSale } from '../src/main/local-db/offline-sale.ts';
import { loadCommittedLocalReceipt } from '../src/main/local-db/receipt.ts';
import {
  OutboxRetryWorker, calculateOutboxRetryMs, recoverOrphanedOutbox,
  retryOutboxNow, type OutboxTransport,
} from '../src/main/local-db/outbox-worker.ts';
import {
  syncPushRequestSchema, syncPushResponseSchema, computeSyncPayloadHash,
  syncSaleCompletedEventSchema, type SyncPushRequest,
} from '../../../packages/contracts/src/sync-v1.ts';

const uuid=()=>randomUUID();
const TIME='2026-11-08T02:00:00.000Z';
const ACK_AT='2026-11-08T02:05:00.000Z';
const NOW=Date.parse('2026-11-08T02:10:00.000Z');
type Db=ReturnType<typeof openLocalDatabase>;

function fixture(t:TestContext){
  const dir=mkdtempSync(join(tmpdir(),'smartpos-pos022-'));
  const file=join(dir,'cash.sqlite');
  const opened=new Set<Db>();
  const open=()=>{const db=openLocalDatabase(file);opened.add(db);return db;};
  let db=open();
  const ids={storeId:uuid(),deviceId:uuid(),cashierId:uuid(),
    offlineGrantId:uuid(),phoneId:uuid(),caseId:uuid()};
  const identity={storeId:ids.storeId,deviceId:ids.deviceId};
  applyInitialCatalogSnapshot(db,{
    protocolVersion:1,storeId:ids.storeId,catalogSeq:'9007199254740993',
    variants:[
      {variantId:ids.phoneId,storeId:ids.storeId,sku:'PHONE-128',
        name:'Điện thoại 128GB',attributes:{storage:'128GB'},
        priceVnd:'8990000',revision:'4',active:true},
      {variantId:ids.caseId,storeId:ids.storeId,sku:'CASE-01',
        name:'Ốp lưng',attributes:{color:'Đen'},
        priceVnd:'350000',revision:'8',active:true},
    ],
  });
  db.prepare('INSERT INTO local_device_metadata(store_id,device_id,provisioned_at) VALUES(?,?,?)')
    .run(ids.storeId,ids.deviceId,TIME);
  for(const id of [ids.phoneId,ids.caseId]){
    db.prepare(`INSERT INTO local_inventory_balances
      (store_id,variant_id,server_qty,pending_delta) VALUES(?,?,10,0)`)
      .run(ids.storeId,id);
  }
  t.after(()=>{
    const errs:unknown[]=[];
    for(const item of opened){try{if(item.isOpen)item.close();}catch(e){errs.push(e);}}
    try{rmSync(dir,{recursive:true,force:true,maxRetries:8,retryDelay:125});}
    catch(e){errs.push(e);}
    if(errs.length)throw new AggregateError(errs,'POS-022 temp cleanup');
  });
  const request=()=>({
    saleId:uuid(),eventId:uuid(),paymentId:uuid(),...identity,
    cashierId:ids.cashierId,offlineGrantId:ids.offlineGrantId,
    clientCreatedAt:TIME,catalogRevision:'9007199254740993',
    tenderedVnd:'9500000',items:[
      {itemId:uuid(),variantId:ids.phoneId,skuSnapshot:'PHONE-128',
        expectedUnitPriceVnd:'8990000',expectedServerRevision:'4',quantity:1},
      {itemId:uuid(),variantId:ids.caseId,skuSnapshot:'CASE-01',
        expectedUnitPriceVnd:'350000',expectedServerRevision:'8',quantity:1},
    ],
  });
  const commit=()=>{const r=request();commitLocalCashSale(db,r);return r;};
  const outbox=(id:string)=>db.prepare(`
    SELECT event_id,sale_id,state,attempt_count,ack_json,next_retry_at,
      payload_json,payload_hash FROM outbox_events WHERE event_id=?`).get(id) as {
      event_id:string;sale_id:string;state:string;attempt_count:number;ack_json:string|null;
      next_retry_at:string|null;payload_json:string;payload_hash:string;
    };
  const saleState=(id:string)=>(db.prepare(`
    SELECT sync_status FROM local_sales WHERE sale_id=?`)
    .get(id) as {sync_status:string}).sync_status;
  const pending=(id:string)=>{
    const s=db.prepare('SELECT pending_delta FROM local_inventory_balances WHERE variant_id=?');
    s.setReadBigInts(true);
    return (s.get(id) as {pending_delta:bigint}).pending_delta;
  };
  const ack=(req:SyncPushRequest,resultCode:'APPLIED'|
    'STOCK_SHORTAGE_RECONCILIATION'|'STALE_PRICE_REVIEW'='APPLIED')=>({
      protocolVersion:1,deviceId:req.deviceId,
      results:[{eventId:req.events[0]!.eventId,saleId:req.events[0]!.saleId,
        status:'ACKED',resultCode,serverReceivedAt:ACK_AT,
        conflictIds:resultCode==='APPLIED'?[]:[uuid()]}],
    });
  let now=NOW;
  const worker=(transport:OutboxTransport)=>new OutboxRetryWorker(db,{
    identity,transport,now:()=>now,random:()=>0,
  });
  return {get db(){return db;},open:()=>{
    db=open();return db;
  },close:()=>db.close(),file,ids,identity,request,commit,
  outbox,saleState,pending,ack,worker,setNow:(n:number)=>{now=n;},get now(){return now;}};
}

test('POS-022: v1 verified ACK applies outbox/sale status atomically; cash/outbox/stock immutable',async t=>{
 const x=fixture(t),sale=x.commit(),before=x.outbox(sale.eventId);
 assert.equal(before.state,'PENDING');
 assert.equal(x.saleState(sale.saleId),'PENDING_SYNC');
 let sent:SyncPushRequest|undefined;
 const runner=x.worker(async request=>{sent=request;return x.ack(request);});
 const result=await runner.runOnce();
 assert.deepEqual(result,{kind:'ACKED',eventId:sale.eventId,resultCode:'APPLIED'});
 assert.ok(sent);
 assert.deepEqual(syncPushRequestSchema.parse(sent),sent);
 const after=x.outbox(sale.eventId);
 assert.equal(after.state,'SYNCED');
 assert.equal(after.attempt_count,1);
 assert.equal(after.payload_json,before.payload_json);
 assert.equal(after.payload_hash,before.payload_hash);
 assert.equal(after.next_retry_at,null);
 assert.deepEqual(JSON.parse(after.ack_json!),syncPushResponseSchema.parse(x.ack(sent)).results[0]);
 assert.equal(x.saleState(sale.saleId),'SYNCED');
 assert.equal(x.pending(x.ids.phoneId),-1n);
 assert.equal(x.pending(x.ids.caseId),-1n);
 assert.equal(loadCommittedLocalReceipt(x.db,x.ids.storeId,sale.saleId)?.syncStatus,'SYNCED');
 assert.deepEqual(await runner.runOnce(),{kind:'IDLE'});
});

test('POS-022: NEEDS_REVIEW server response quarantines event without deleting sale',async t=>{
 const x=fixture(t),sale=x.commit();
 const runner=x.worker(async request=>({
   protocolVersion:1,deviceId:request.deviceId,
   results:[{eventId:request.events[0]!.eventId,saleId:request.events[0]!.saleId,
     status:'NEEDS_REVIEW',resultCode:'REVOKED_DEVICE',conflictIds:[]}],
 }));
 const outcome=await runner.runOnce();
 assert.equal(outcome.kind,'NEEDS_REVIEW');
 assert.equal(outcome.resultCode,'REVOKED_DEVICE');
 assert.equal(x.outbox(sale.eventId).state,'NEEDS_REVIEW');
 assert.equal(x.saleState(sale.saleId),'NEEDS_REVIEW');
 assert.equal(JSON.parse(x.outbox(sale.eventId).ack_json!).resultCode,'REVOKED_DEVICE');
 assert.equal(x.pending(x.ids.phoneId),-1n);
 assert.equal(await runner.runOnce().then(r=>r.kind),'IDLE');
 assert.equal(retryOutboxNow(x.db,x.identity,sale.eventId),false);
});

test('POS-022: acknowledged cloud shortage is SYNCED but local sale remains NEEDS_REVIEW',async t=>{
 const x=fixture(t),sale=x.commit();
 const outcome=await x.worker(async request=>
    x.ack(request,'STOCK_SHORTAGE_RECONCILIATION')).runOnce();
 assert.equal(outcome.kind,'ACKED');
 assert.equal(outcome.resultCode,'STOCK_SHORTAGE_RECONCILIATION');
 assert.equal(x.outbox(sale.eventId).state,'SYNCED');
 assert.equal(x.saleState(sale.saleId),'NEEDS_REVIEW');
 assert.equal(JSON.parse(x.outbox(sale.eventId).ack_json!).conflictIds.length,1);
 assert.equal(x.pending(x.ids.phoneId),-1n);
});

test('POS-022: network offline/backoff, next_retry_at, manual reconnect without extra sale',async t=>{
 const x=fixture(t),sale=x.commit();
 let calls=0;
 const worker=x.worker(async request=>{
   calls++;
   if(calls===1)throw new Error('NETWORK_DOWN');
   return x.ack(request);
 });
 const first=await worker.runOnce();
 assert.equal(first.kind,'RETRY');
 assert.equal(first.nextRetryAt,new Date(NOW+1000).toISOString());
 assert.equal(x.outbox(sale.eventId).attempt_count,1);
 assert.equal(x.outbox(sale.eventId).state,'RETRY');
 assert.equal(x.outbox(sale.eventId).ack_json,null);
 assert.equal(x.saleState(sale.saleId),'PENDING_SYNC');
 assert.deepEqual(await worker.runOnce(),{kind:'IDLE'});
 assert.equal(calls,1);
 assert.equal(retryOutboxNow(x.db,x.identity,sale.eventId),true);
 assert.equal(x.outbox(sale.eventId).next_retry_at,null);
 assert.equal((await worker.runOnce()).kind,'ACKED');
 assert.equal(calls,2);
 assert.equal(x.outbox(sale.eventId).attempt_count,2);
 assert.equal(x.pending(x.ids.phoneId),-1n);
 assert.equal((x.db.prepare('SELECT count(*) AS n FROM local_sales').get() as {n:number}).n,1);
});

test('POS-022: explicit RETRY result uses server retry-after floor and exponential jitter',async t=>{
 const x=fixture(t),sale=x.commit();
 assert.equal(calculateOutboxRetryMs(1,0),1000);
 assert.equal(calculateOutboxRetryMs(2,1),2400);
 assert.equal(calculateOutboxRetryMs(40,1),360000);
 assert.equal(calculateOutboxRetryMs(1,0,120),120000);
 assert.throws(()=>calculateOutboxRetryMs(0,0),/OUTBOX_INVALID_BACKOFF/);
 assert.throws(()=>calculateOutboxRetryMs(1,Infinity),/OUTBOX_INVALID_BACKOFF/);
 const worker=x.worker(async request=>({
   protocolVersion:1,deviceId:request.deviceId,
   results:[{eventId:request.events[0]!.eventId,saleId:request.events[0]!.saleId,
     status:'RETRY',resultCode:'TEMPORARY_UNAVAILABLE',retryAfterSeconds:120}],
 }));
 const r=await worker.runOnce();
 assert.equal(r.kind,'RETRY');
 assert.equal(r.nextRetryAt,new Date(NOW+120_000).toISOString());
 assert.equal(x.outbox(sale.eventId).ack_json,null);
 x.setNow(NOW+119_000);
 assert.equal((await worker.runOnce()).kind,'IDLE');
 x.setNow(NOW+120_000);
 assert.equal((await worker.runOnce()).kind,'RETRY');
 assert.equal(x.outbox(sale.eventId).attempt_count,2);
});

test('POS-022: crash-in-SYNCING and file reopen recover original same UUID/hash without cash duplication',async t=>{
 const x=fixture(t),sale=x.commit();
 const original=x.outbox(sale.eventId);
 x.db.prepare("UPDATE outbox_events SET state='SYNCING',attempt_count=1 WHERE event_id=?")
   .run(sale.eventId);
 x.close();const reopened=x.open();
 assert.equal(reopened.prepare('SELECT state FROM outbox_events WHERE event_id=?')
   .get(sale.eventId)?.state,'SYNCING');
 assert.equal(recoverOrphanedOutbox(reopened,x.identity),1);
 assert.equal(recoverOrphanedOutbox(reopened,x.identity),0);
 const recovered=x.outbox(sale.eventId);
 assert.equal(recovered.state,'RETRY');
 assert.equal(recovered.next_retry_at,null);
 assert.equal(recovered.payload_hash,original.payload_hash);
 assert.equal(recovered.payload_json,original.payload_json);
 let sent=0;
 const w=x.worker(async req=>{sent++;return x.ack(req);});
 assert.equal((await w.runOnce()).kind,'ACKED');
 assert.equal(sent,1);
 assert.equal(x.outbox(sale.eventId).attempt_count,2);
 assert.equal(x.pending(x.ids.phoneId),-1n);
 assert.equal(x.saleState(sale.saleId),'SYNCED');
});

test('POS-022: lost server ACK then reconnect/reopen sends identical event and accepts replay',async t=>{
 const x=fixture(t),sale=x.commit();
 let firstEvent:unknown;
 const worker=x.worker(async req=>{
   firstEvent=req.events[0];
   throw new Error('COMMITTED_ON_SERVER_BUT_RESPONSE_LOST');
 });
 assert.equal((await worker.runOnce()).kind,'RETRY');
 const first=x.outbox(sale.eventId);
 x.close();x.open();
 assert.equal(retryOutboxNow(x.db,x.identity,sale.eventId),true);
 let secondEvent:unknown;
 const resumed=x.worker(async req=>{
   secondEvent=req.events[0];return x.ack(req);
 });
 assert.equal((await resumed.runOnce()).kind,'ACKED');
 assert.deepEqual(secondEvent,firstEvent);
 assert.equal(x.outbox(sale.eventId).payload_hash,first.payload_hash);
 assert.equal(x.outbox(sale.eventId).payload_json,first.payload_json);
 assert.equal(x.pending(x.ids.phoneId),-1n);
});

test('POS-022: mismatched/missing/forged ACK never marks SYNCED even if HTTP transport resolves',async t=>{
 const wrongs=[
   (req:SyncPushRequest)=>({...{protocolVersion:1,deviceId:req.deviceId},
     results:[{eventId:uuid(),saleId:req.events[0]!.saleId,status:'ACKED',
       resultCode:'APPLIED',serverReceivedAt:ACK_AT,conflictIds:[]}]}),
   (req:SyncPushRequest)=>({protocolVersion:1,deviceId:req.deviceId,results:[]}),
   (req:SyncPushRequest)=>({protocolVersion:1,deviceId:req.deviceId,results:[{
     eventId:req.events[0]!.eventId,saleId:req.events[0]!.saleId,
     status:'ACKED',resultCode:'APPLIED',serverReceivedAt:ACK_AT,conflictIds:[],
     extra:'UNTRUSTED'}]}),
   (req:SyncPushRequest)=>({protocolVersion:1,deviceId:uuid(),results:[{
     eventId:req.events[0]!.eventId,saleId:req.events[0]!.saleId,
     status:'ACKED',resultCode:'APPLIED',serverReceivedAt:ACK_AT,conflictIds:[]}]}),
 ];
 for(const factory of wrongs){
   await t.test('reject one untrusted reply',async st=>{
     const x=fixture(st),sale=x.commit(),r=await x.worker(async req=>factory(req)).runOnce();
     assert.equal(r.kind,'NEEDS_REVIEW');
     assert.equal(r.resultCode,'INVALID_ACK');
     assert.equal(x.outbox(sale.eventId).state,'NEEDS_REVIEW');
     assert.equal(x.outbox(sale.eventId).ack_json,null);
     assert.equal(x.saleState(sale.saleId),'NEEDS_REVIEW');
     assert.equal(x.pending(x.ids.phoneId),-1n);
   });
 }
});

test('POS-022: rehashed malicious outbox event cannot reprice immutable cash evidence',async t=>{
 const x=fixture(t),sale=x.commit(),row=x.outbox(sale.eventId);
 const original=JSON.parse(row.payload_json) as Record<string,unknown> & {
   sale:{status:'POSTED';totalVnd:string;
     items:Array<{itemId:string;variantId:string;unitPriceVnd:string;lineTotalVnd:string}>;
     payment:{method:'CASH';dueVnd:string;tenderedVnd:string;changeVnd:string}};
 };
 const forged={
   ...original,
   sale:{
     ...original.sale,
     totalVnd:'9350000',
     items:original.sale.items.map((item,i)=>i===0?{
       ...item,unitPriceVnd:'9000000',lineTotalVnd:'9000000',
     }:item),
     payment:{
       ...original.sale.payment,dueVnd:'9350000',changeVnd:'150000',
     },
   },
 };
 const {payloadHash:_,...body}=forged;
 const hash=computeSyncPayloadHash(body as Parameters<typeof computeSyncPayloadHash>[0]);
 const event={...body,payloadHash:hash};
 assert.doesNotThrow(()=>syncSaleCompletedEventSchema.parse(event));
 // File corruption simulation ONLY on disposable SQLite fixture: no
 // financial sale/item/payment record is changed, just a rehashed outbox.
 x.db.exec('DROP TRIGGER outbox_payload_immutable');
 x.db.prepare('UPDATE outbox_events SET payload_json=?,payload_hash=? WHERE event_id=?')
   .run(JSON.stringify(event),hash,sale.eventId);
 let sent=false;
 const outcome=await x.worker(async req=>{sent=true;return x.ack(req);}).runOnce();
 assert.equal(outcome.kind,'NEEDS_REVIEW');
 assert.equal(outcome.resultCode,'INVALID_EVENT');
 assert.equal(sent,false);
 assert.equal(x.outbox(sale.eventId).state,'NEEDS_REVIEW');
 assert.equal(x.saleState(sale.saleId),'NEEDS_REVIEW');
 assert.equal(x.pending(x.ids.phoneId),-1n);
});

test('POS-022: mutated stored event hash quarantined before any transport; no fake ACK',async t=>{
 const x=fixture(t),sale=x.commit();
 // Disposable fixture ONLY: emulate external file tampering despite trigger.
 x.db.exec('DROP TRIGGER outbox_payload_immutable');
 x.db.prepare('UPDATE outbox_events SET payload_hash=? WHERE event_id=?')
   .run('a'.repeat(64),sale.eventId);
 let sent=false;
 const result=await x.worker(async req=>{sent=true;return x.ack(req);}).runOnce();
 assert.equal(result.kind,'NEEDS_REVIEW');
 assert.equal(result.resultCode,'INVALID_EVENT');
 assert.equal(sent,false);
 assert.equal(x.outbox(sale.eventId).state,'NEEDS_REVIEW');
 assert.equal(x.saleState(sale.saleId),'NEEDS_REVIEW');
});

test('POS-022: injected local sale-status write failure rolls back ACK; restart retries safely',async t=>{
 const x=fixture(t),sale=x.commit();
 x.db.exec(`CREATE TRIGGER pos022_fault BEFORE UPDATE OF sync_status ON local_sales
   BEGIN SELECT RAISE(ABORT,'POS022_STAGED_STATUS_FAULT');END`);
 const worker=x.worker(async req=>x.ack(req));
 await assert.rejects(()=>worker.runOnce(),/POS022_STAGED_STATUS_FAULT/);
 assert.equal(x.outbox(sale.eventId).state,'SYNCING');
 assert.equal(x.outbox(sale.eventId).ack_json,null);
 assert.equal(x.saleState(sale.saleId),'PENDING_SYNC');
 assert.equal(x.pending(x.ids.phoneId),-1n);
 x.db.exec('DROP TRIGGER pos022_fault');
 x.close();const reopened=x.open();
 assert.equal(recoverOrphanedOutbox(reopened,x.identity),1);
 assert.equal((await x.worker(async req=>x.ack(req)).runOnce()).kind,'ACKED');
 assert.equal(x.outbox(sale.eventId).state,'SYNCED');
 assert.equal(x.pending(x.ids.phoneId),-1n);
});

test('POS-022: overlapping runOnce calls of same worker share one in-flight transport',async t=>{
 const x=fixture(t),sale=x.commit();
 let unblock:(v:unknown)=>void=()=>{};
 let calls=0;
 const deferred=new Promise<unknown>(resolve=>{unblock=resolve;});
 const worker=x.worker(async req=>{calls++;await deferred;return x.ack(req);});
 const a=worker.runOnce(),b=worker.runOnce();
 assert.strictEqual(a,b);
 assert.equal(calls,1);
 assert.equal(x.outbox(sale.eventId).state,'SYNCING');
 unblock(null);
 assert.equal((await a).kind,'ACKED');
 assert.equal((await b).kind,'ACKED');
 assert.equal(calls,1);
});

test('POS-022: stable createdAt/eventId ordering, second payment untouched by first ACK',async t=>{
 const x=fixture(t),a=x.commit(),b=x.commit();
 const ordered=[a.eventId,b.eventId].sort();
 const seen:string[]=[];
 const worker=x.worker(async req=>{seen.push(req.events[0]!.eventId);return x.ack(req);});
 assert.equal((await worker.runOnce()).kind,'ACKED');
 assert.equal((await worker.runOnce()).kind,'ACKED');
 assert.deepEqual(seen,ordered);
 assert.equal((await worker.runOnce()).kind,'IDLE');
 assert.equal(x.outbox(a.eventId).state,'SYNCED');
 assert.equal(x.outbox(b.eventId).state,'SYNCED');
 assert.equal(x.pending(x.ids.phoneId),-2n);
 assert.equal((x.db.prepare('SELECT count(*) AS n FROM local_payments').get() as {n:number}).n,2);
});

test('POS-022: wrong store/device cannot dispatch or clear pending outbox',async t=>{
 const x=fixture(t),sale=x.commit();
 let touched=false;
 const wrong=new OutboxRetryWorker(x.db,{
   identity:{storeId:x.ids.storeId,deviceId:uuid()},
   transport:async()=>{touched=true;throw new Error('no');},
 });
 await assert.rejects(()=>wrong.runOnce(),/OUTBOX_DEVICE_SCOPE/);
 assert.equal(touched,false);
 assert.equal(x.outbox(sale.eventId).state,'PENDING');
 assert.equal(retryOutboxNow(x.db,{storeId:x.ids.storeId,deviceId:uuid()},sale.eventId),false);
 assert.equal(recoverOrphanedOutbox(x.db,{storeId:uuid(),deviceId:x.ids.deviceId}),0);
});
