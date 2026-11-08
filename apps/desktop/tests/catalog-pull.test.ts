import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openLocalDatabase} from '../src/main/local-db/index.ts';
import {applyInitialCatalogSnapshot,lookupLocalCatalogBySku,getLocalCatalogCursor}
 from '../src/main/local-db/catalog-cache.ts';
import {commitLocalCashSale} from '../src/main/local-db/offline-sale.ts';
import {applyCatalogPullPage,CatalogPullWorker}
 from '../src/main/local-db/catalog-pull.ts';
import {syncPullResponseSchema} from '../../../packages/contracts/src/sync-v1.ts';

const id=()=>randomUUID(),TIME='2026-11-08T01:00:00.000Z';
const at='2026-11-08T02:00:00.000Z';
type Db=ReturnType<typeof openLocalDatabase>;
function fixture(t:TestContext){
 const dir=mkdtempSync(join(tmpdir(),'smartpos-pos023-'));
 const file=join(dir,'local.sqlite');
 const handles=new Set<Db>();
 const open=()=>{const db=openLocalDatabase(file);handles.add(db);return db;};
 let db=open();
 t.after(()=>{
  for(const x of handles)if(x.isOpen)x.close();
  rmSync(dir,{recursive:true,force:true,maxRetries:8,retryDelay:125});
 });
 const storeId=id(),deviceId=id(),cashierId=id(),offlineGrantId=id(),productId=id();
 const phoneId=id(),caseId=id(),saleId=id(),eventId=id();
 applyInitialCatalogSnapshot(db,{
  protocolVersion:1,storeId,catalogSeq:'0',
  variants:[
   {variantId:phoneId,storeId,sku:'PHONE-128',name:'Điện thoại 128GB',
    attributes:{storage:'128GB'},priceVnd:'8990000',revision:'0',active:true},
   {variantId:caseId,storeId,sku:'CASE-01',name:'Ốp lưng',
    attributes:{color:'Đen'},priceVnd:'350000',revision:'0',active:true},
  ],
 });
 db.prepare(`INSERT INTO local_device_metadata(store_id,device_id,provisioned_at)
   VALUES(?,?,?)`).run(storeId,deviceId,TIME);
 for(const v of [phoneId,caseId])db.prepare(`
   INSERT INTO local_inventory_balances(store_id,variant_id,server_qty,pending_delta)
   VALUES(?,?,10,0)`).run(storeId,v);
 const saleRequest={
  saleId,eventId,paymentId:id(),storeId,deviceId,cashierId,offlineGrantId,
  clientCreatedAt:TIME,catalogRevision:'0',tenderedVnd:'9500000',
  items:[{itemId:id(),variantId:phoneId,skuSnapshot:'PHONE-128',
    expectedUnitPriceVnd:'8990000',expectedServerRevision:'0',quantity:1}],
 };
 const variant=(patch:Record<string,unknown>={})=>({
   id:phoneId,storeId,productId,sku:'PHONE-128',
   name:'Điện thoại 128GB',attributes:{storage:'128GB'},
   priceVnd:'8990000',revision:'0',active:true,...patch,
 });
 const balance=(qty='7',revision='1')=>({
   storeId,variantId:phoneId,qty,revision,
 });
 const change=(seq:string,type:'product_variant'|'inventory_balance',
  payload:unknown,op:'UPDATE'|'UPSERT'='UPDATE')=>({
   seq,entityType:type,entityId:phoneId,op,
   payload,createdAt:at,
 });
 const page=(changes:unknown[],from='0',next='2',high=next,more=false)=>({
   protocolVersion:1,storeId,fromCursor:from,nextCursor:next,
   highWatermark:high,hasMore:more,changes,
 });
 const row=()=>{
  const q=db.prepare(`SELECT server_qty,pending_delta,server_revision
   FROM local_inventory_balances WHERE store_id=? AND variant_id=?`);
  q.setReadBigInts(true);
  return q.get(storeId,phoneId) as {
    server_qty:bigint;pending_delta:bigint;server_revision:bigint;
  };
 };
 const sale=()=>{commitLocalCashSale(db,saleRequest);};
 const secondSale=()=>{
  const next={...saleRequest,saleId:id(),eventId:id(),
    paymentId:id(),items:saleRequest.items.map(v=>({...v,itemId:id()}))};
  commitLocalCashSale(db,next);
  return next;
 };
 const markSynced=(saleIdInput:string,eventIdInput:string)=>{
   const ack={eventId:eventIdInput,saleId:saleIdInput,status:'ACKED',
     resultCode:'APPLIED',serverReceivedAt:'2026-11-08T02:05:00.000Z',
     conflictIds:[]};
   db.prepare(`UPDATE outbox_events SET state='SYNCED',ack_json=?
     WHERE event_id=? AND sale_id=?`)
     .run(JSON.stringify(ack),eventIdInput,saleIdInput);
   db.prepare(`UPDATE local_sales SET sync_status='SYNCED'
     WHERE sale_id=?`).run(saleIdInput);
 };
 return {get db(){return db;},open:()=>{db=open();return db;},
  close:()=>db.close(),storeId,deviceId,phoneId,caseId,saleId,eventId,
  variant,balance,change,page,row,sale,secondSale,markSynced,
  getCursor:()=>getLocalCatalogCursor(db,storeId),
  getVariant:()=>lookupLocalCatalogBySku(db,storeId,'PHONE-128')[0],
 };
}

test('POS-023: variant/price and stock PULL preserves pending_delta and immutable local paid sale',t=>{
 const f=fixture(t);
 f.sale();
 const oldOutbox=f.db.prepare('SELECT payload_json,payload_hash FROM outbox_events').get();
 const oldPay=f.db.prepare('SELECT due_vnd,tendered_vnd,change_vnd FROM local_payments').get();
 const oldItem=f.db.prepare('SELECT unit_price_vnd FROM local_sale_items').get();
 assert.equal(f.row().pending_delta,-1n);
 const changes=[
  f.change('1','product_variant',f.variant({name:'Điện thoại đổi tên',
    priceVnd:'9000000',revision:'1'})),
  f.change('2','inventory_balance',f.balance('7','1'),'UPSERT'),
 ];
 assert.deepEqual(applyCatalogPullPage(f.db,f.storeId,f.page(changes)),
   {cursor:'2',count:2,replay:false,hasMore:false});
 assert.equal(f.getCursor(),'2');
 assert.equal(f.getVariant()?.name,'Điện thoại đổi tên');
 assert.equal(f.getVariant()?.priceVnd,'9000000');
 assert.deepEqual(f.row(),{
   server_qty:7n,pending_delta:-1n,server_revision:1n});
 assert.deepEqual(f.db.prepare('SELECT payload_json,payload_hash FROM outbox_events').get(),oldOutbox);
 assert.deepEqual(f.db.prepare('SELECT due_vnd,tendered_vnd,change_vnd FROM local_payments').get(),oldPay);
 assert.deepEqual(f.db.prepare('SELECT unit_price_vnd FROM local_sale_items').get(),oldItem);
});

test('POS-023: ACK-covered sale rebase clears ONLY its own pending part, other offline sale remains',t=>{
 const f=fixture(t);
 f.sale();
 const second=f.secondSale();
 assert.equal(f.row().pending_delta,-2n);
 f.markSynced(f.saleId,f.eventId);
 const saleBalance={...f.balance('9','1'),saleId:f.saleId,eventId:f.eventId};
 const page=f.page([f.change('1','inventory_balance',saleBalance,'UPSERT')],'0','1');
 assert.equal(applyCatalogPullPage(f.db,f.storeId,page).cursor,'1');
 assert.deepEqual(f.row(),{server_qty:9n,pending_delta:-1n,server_revision:1n});
 assert.equal(f.db.prepare("SELECT state FROM outbox_events WHERE event_id=?")
   .get(second.eventId)?.state,'PENDING');
 assert.equal(applyCatalogPullPage(f.db,f.storeId,page).replay,true);
 assert.equal(f.row().pending_delta,-1n);
});

test('POS-023: cloud delta with saleId but LOST local ACK must preserve pending quantities',t=>{
 const f=fixture(t);
 f.sale();
 const stock={...f.balance('9','1'),saleId:f.saleId,eventId:f.eventId};
 assert.equal(applyCatalogPullPage(f.db,f.storeId,
   f.page([f.change('1','inventory_balance',stock,'UPSERT')],'0','1')).cursor,'1');
 assert.equal(f.row().pending_delta,-1n);
 assert.equal(f.db.prepare("SELECT state FROM outbox_events WHERE event_id=?")
   .get(f.eventId)?.state,'PENDING');
});

test('POS-023: strict highWatermark paging with gaps, cursor persist/reopen, exact replay no stock changes',t=>{
 const f=fixture(t);
 const first=f.page([
  f.change('1','product_variant',f.variant({revision:'1',priceVnd:'8000000'})),
 ],'0','1','4',true);
 assert.equal(syncPullResponseSchema.parse(first).hasMore,true);
 assert.deepEqual(applyCatalogPullPage(f.db,f.storeId,first),
   {cursor:'1',count:1,replay:false,hasMore:true});
 const second=f.page([
  f.change('2','inventory_balance',f.balance('5','1'),'UPSERT'),
  f.change('4','product_variant',f.variant({
    revision:'2',priceVnd:'8500000',
  })),
 ],'1','4','4',false);
 assert.equal(applyCatalogPullPage(f.db,f.storeId,second).cursor,'4');
 assert.deepEqual(applyCatalogPullPage(f.db,f.storeId,second),
   {cursor:'4',count:0,replay:true,hasMore:false});
 f.close();f.open();
 assert.equal(f.getCursor(),'4');
 assert.equal(f.getVariant()?.priceVnd,'8500000');
 assert.equal(f.row().server_qty,5n);
 assert.throws(()=>applyCatalogPullPage(f.db,f.storeId,first),/CATALOG_PULL_CURSOR_MISMATCH/);
});

test('POS-023: one invalid event after valid row rolls back page including cursor',t=>{
 const f=fixture(t),bad=f.change('2','inventory_balance',{
   ...f.balance('10','1'),storeId:id(),
 },'UPSERT');
 assert.throws(()=>applyCatalogPullPage(f.db,f.storeId,f.page([
   f.change('1','product_variant',f.variant({priceVnd:'1',revision:'1'})),bad,
 ])),/CATALOG_PULL_WRONG_BALANCE/);
 assert.equal(f.getCursor(),'0');
 assert.equal(f.getVariant()?.priceVnd,'8990000');
 assert.deepEqual(f.row(),{server_qty:10n,pending_delta:0n,server_revision:0n});
});

test('POS-023: SQLite cursor UPDATE injected failure rolls back applied stock and SKU changes',t=>{
 const f=fixture(t);
 f.db.exec(`CREATE TRIGGER pos023_fail_cursor BEFORE UPDATE ON sync_cursors
  BEGIN SELECT RAISE(ABORT,'POS023_SYNTHETIC_CURSOR_FAILURE');END`);
 assert.throws(()=>applyCatalogPullPage(f.db,f.storeId,f.page([
   f.change('1','product_variant',f.variant({priceVnd:'10',revision:'1'})),
   f.change('2','inventory_balance',f.balance('3','1'),'UPSERT'),
 ])),/POS023_SYNTHETIC_CURSOR_FAILURE/);
 assert.equal(f.getCursor(),'0');
 assert.equal(f.getVariant()?.priceVnd,'8990000');
 assert.equal(f.row().server_qty,10n);
 f.db.exec('DROP TRIGGER pos023_fail_cursor');
 assert.equal(applyCatalogPullPage(f.db,f.storeId,f.page([
   f.change('1','product_variant',f.variant({priceVnd:'10',revision:'1'})),
   f.change('2','inventory_balance',f.balance('3','1'),'UPSERT'),
 ])).cursor,'2');
});

test('POS-023: invalid order, forged store, negative/overflow stock, stale revision fail closed',t=>{
 const f=fixture(t);
 const good=f.change('1','inventory_balance',f.balance('-1','1'),'UPSERT');
 const tests=[
  f.page([good],'1','1'),
  f.page([good],'0','0'),
  {...f.page([good],'0','1'),storeId:id()},
  f.page([f.change('1','inventory_balance',f.balance('9223372036854775808','1'),'UPSERT')],'0','1'),
  f.page([f.change('1','inventory_balance',f.balance('01','1'),'UPSERT')],'0','1'),
  f.page([f.change('1','inventory_balance',{...f.balance('-1','1'),extra:1},'UPSERT')],'0','1'),
  f.page([f.change('1','product_variant',f.variant({sku:'BAD%SKU'}))],'0','1'),
 ];
 for(const item of tests)assert.throws(()=>applyCatalogPullPage(f.db,f.storeId,item));
 assert.equal(f.getCursor(),'0');
 assert.equal(f.row().pending_delta,0n);
 // Signed negative cloud stock is allowed for already-paid reconciliation.
 assert.equal(applyCatalogPullPage(f.db,f.storeId,f.page([good],'0','1')).cursor,'1');
 assert.equal(f.row().server_qty,-1n);
 assert.equal(f.row().pending_delta,0n);
 assert.throws(()=>applyCatalogPullPage(f.db,f.storeId,
   f.page([f.change('2','inventory_balance',f.balance('5','0'),'UPSERT')],'1','2')),
   /CATALOG_PULL_BALANCE_REVISION_REGRESSION/);
});

test('POS-023: injected transport requests cursor on each page, survives restart and serializes concurrent run',async t=>{
 const f=fixture(t);
 let calls=0,waiting:(v:unknown)=>void=()=>{};
 const pages=[
  f.page([f.change('1','product_variant',f.variant({revision:'1'}))],'0','1','2',true),
  f.page([f.change('2','inventory_balance',f.balance('6','1'),'UPSERT')],'1','2','2',false),
 ];
 const gate=new Promise<unknown>(resolve=>waiting=resolve);
 const firstWorker=new CatalogPullWorker(f.db,f.storeId,async req=>{
  assert.equal(req.cursor,'0');assert.equal(req.limit,2);
  calls++;await gate;return pages[0];
 });
 const a=firstWorker.runOnce(2),b=firstWorker.runOnce(2);
 assert.strictEqual(a,b);
 waiting(null);
 assert.equal((await a).cursor,'1');
 assert.equal(calls,1);
 f.close();f.open();
 const nextWorker=new CatalogPullWorker(f.db,f.storeId,async req=>{
   assert.equal(req.cursor,'1');calls++;return pages[1];
 });
 const result=await nextWorker.runOnce(2);
 assert.equal(result.cursor,'2');
 assert.equal(calls,2);
 assert.equal(f.row().server_qty,6n);
});

test('POS-023: without trusted POS-017 bootstrap or other store scope, no page mutates data',t=>{
 const f=fixture(t);
 assert.throws(()=>applyCatalogPullPage(f.db,id(),f.page([],'0','0')),
  /CATALOG_PULL_WRONG_STORE/);
 const orphan=id();
 assert.throws(()=>applyCatalogPullPage(f.db,f.storeId,
   {...f.page([],'0','0'),fromCursor:'1'}),
   /CATALOG_PULL_CURSOR_MISMATCH/);
 const other=f.db.prepare('SELECT store_id FROM sync_cursors').get();
 assert.ok(other);
 assert.equal(f.getCursor(),'0');
});
