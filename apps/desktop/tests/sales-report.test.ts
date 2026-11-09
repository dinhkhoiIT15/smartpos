import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openLocalDatabase} from '../src/main/local-db/index.ts';
import {applyInitialCatalogSnapshot} from '../src/main/local-db/catalog-cache.ts';
import {commitLocalCashSale} from '../src/main/local-db/offline-sale.ts';
import {readLocalSalesReport} from '../src/main/local-db/sales-report.ts';

const id=()=>randomUUID(),TIME='2026-11-08T02:00:00.000Z';
type Db=ReturnType<typeof openLocalDatabase>;
function fixture(t:TestContext,phonePrice='8990000'){
 const dir=mkdtempSync(join(tmpdir(),'smartpos-pos026-'));
 const file=join(dir,'report.sqlite'),opened=new Set<Db>();
 const open=()=>{const db=openLocalDatabase(file);opened.add(db);return db;};
 let db=open();
 const ids={storeId:id(),deviceId:id(),cashierId:id(),secondCashierId:id(),
  offlineGrantId:id(),phoneId:id(),caseId:id()};
 applyInitialCatalogSnapshot(db,{protocolVersion:1,storeId:ids.storeId,catalogSeq:'42',
  variants:[
   {variantId:ids.phoneId,storeId:ids.storeId,sku:'PHONE-128',
    name:'Điện thoại',attributes:{storage:'128GB'},priceVnd:phonePrice,
    revision:'3',active:true},
   {variantId:ids.caseId,storeId:ids.storeId,sku:'CASE-01',
    name:'Ốp lưng',attributes:{color:'Đen'},priceVnd:'350000',revision:'4',active:true},
  ],
 });
 db.prepare('INSERT INTO local_device_metadata(store_id,device_id,provisioned_at) VALUES(?,?,?)')
  .run(ids.storeId,ids.deviceId,TIME);
 for(const variant of [ids.phoneId,ids.caseId])
  db.prepare(`INSERT INTO local_inventory_balances(store_id,variant_id,server_qty,pending_delta)
    VALUES(?,?,100,0)`).run(ids.storeId,variant);
 t.after(()=>{
  for(const handle of opened)if(handle.isOpen)handle.close();
  rmSync(dir,{recursive:true,force:true,maxRetries:8,retryDelay:125});
 });
 const scope=(role:'ADMIN'|'MANAGER'|'CASHIER'='MANAGER',userId=ids.cashierId)=>({
  storeId:ids.storeId,deviceId:ids.deviceId,userId,role,
 });
 const request=(at=TIME,cashierId=ids.cashierId,includeCase=true)=>{
  const a={saleId:id(),eventId:id(),paymentId:id(),storeId:ids.storeId,
   deviceId:ids.deviceId,cashierId,offlineGrantId:ids.offlineGrantId,
   clientCreatedAt:at,catalogRevision:'42',
   tenderedVnd:String(BigInt(phonePrice)+(includeCase?350000n:0n)+1n),
   items:[{itemId:id(),variantId:ids.phoneId,skuSnapshot:'PHONE-128',
    expectedUnitPriceVnd:phonePrice,expectedServerRevision:'3',quantity:1}]};
  if(includeCase)a.items.push({itemId:id(),variantId:ids.caseId,
   skuSnapshot:'CASE-01',expectedUnitPriceVnd:'350000',
   expectedServerRevision:'4',quantity:1});
  return a;
 };
 const mark=(sale:{saleId:string;eventId:string},
  code:'APPLIED'|'STOCK_SHORTAGE_RECONCILIATION'|'STALE_PRICE_REVIEW'='APPLIED')=>{
   db.prepare(`UPDATE outbox_events SET state='SYNCED',ack_json=? WHERE event_id=?`)
    .run(JSON.stringify({
     eventId:sale.eventId,saleId:sale.saleId,status:'ACKED',resultCode:code,
     conflictIds:code==='APPLIED'?[]:[id()],
     serverReceivedAt:'2026-11-09T02:05:00.000Z',
    }),sale.eventId);
   db.prepare('UPDATE local_sales SET sync_status=? WHERE sale_id=?')
    .run(code==='APPLIED'?'SYNCED':'NEEDS_REVIEW',sale.saleId);
 };
 const commit=(at=TIME,cashierId=ids.cashierId,includeCase=true)=>{
  const req=request(at,cashierId,includeCase);
  commitLocalCashSale(db,req);
  return req;
 };
 const report=(from='2026-11-08',to='2026-11-09',
   extra:Record<string,unknown>={})=>readLocalSalesReport(db,scope(),{from,to,...extra});
 const count=(name:string)=>{
  const valid=['local_sales','local_sale_items','local_payments','outbox_events'];
  if(!valid.includes(name))throw Error('unsafe test identifier');
  return (db.prepare('SELECT count(*) AS n FROM '+name).get() as {n:number}).n;
 };
 return {get db(){return db;},ids,scope,request,commit,mark,report,
  count,close:()=>db.close(),reopen:()=>{db=open();return db;}};
}

test('POS-026 local source buckets: pending != unconfirmed review != ACKED mirror',t=>{
 const x=fixture(t);
 const pending=x.commit('2026-11-07T17:30:00.000Z');
 const synced=x.commit('2026-11-08T01:00:00.000Z',x.ids.secondCashierId);
 const acceptedConflict=x.commit('2026-11-08T02:00:00.000Z');
 const unconfirmed=x.commit('2026-11-08T17:01:00.000Z');
 x.mark(synced);
 x.mark(acceptedConflict,'STOCK_SHORTAGE_RECONCILIATION');
 x.db.prepare(`UPDATE outbox_events SET state='NEEDS_REVIEW',
  ack_json=? WHERE event_id=?`).run(JSON.stringify({
   eventId:unconfirmed.eventId,saleId:unconfirmed.saleId,status:'NEEDS_REVIEW',
   resultCode:'REVOKED_DEVICE',conflictIds:[],
 }),unconfirmed.eventId);
 x.db.prepare("UPDATE local_sales SET sync_status='NEEDS_REVIEW' WHERE sale_id=?")
  .run(unconfirmed.saleId);
 const counts=['local_sales','local_sale_items','local_payments','outbox_events']
  .map(n=>x.count(n));
 const result=x.report();
 assert.equal(result.source,'LOCAL_SQLITE');
 assert.equal(result.combinedCloudLocalTotalAvailable,false);
 assert.equal(result.matchedSaleCount,'4');
 assert.deepEqual(result.byKind.map(k=>[k.kind,k.saleCount,k.grossVnd]),[
  ['LOCAL_PENDING','1','9340000'],
  ['LOCAL_NEEDS_REVIEW_UNCONFIRMED','1','9340000'],
  ['SERVER_ACKED_MIRROR','2','18680000'],
 ]);
 assert.equal(result.matchedSalesGrossVnd,'37360000'); // DEVICE ONLY; never add to cloud
 assert.equal(result.skuLineGrossVnd,'37360000');
 assert.deepEqual(result.days.map(v=>[v.day,v.saleCount]),[
  ['2026-11-08','3'],['2026-11-09','1'],
 ]);
 const caseOnly=x.report('2026-11-08','2026-11-09',{sku:'CASE-01'});
 assert.equal(caseOnly.matchedSalesGrossVnd,'37360000');
 assert.equal(caseOnly.skuLineGrossVnd,'1400000');
 assert.deepEqual(caseOnly.topSkus.map(v=>v.sku),['CASE-01']);
 assert.equal(x.report('2026-11-08','2026-11-09',
  {kind:'SERVER_ACKED_MIRROR'}).matchedSaleCount,'2');
 const unverified=x.report('2026-11-08','2026-11-09',
  {kind:'LOCAL_NEEDS_REVIEW_UNCONFIRMED'});
 assert.deepEqual(unverified.sales.map(s=>s.saleId),[unconfirmed.saleId]);
 const page=x.report('2026-11-08','2026-11-09',{limit:1});
 assert.equal(page.sales.length,1);
 assert.equal(page.hasMore,true);
 assert.equal(page.matchedSalesGrossVnd,result.matchedSalesGrossVnd);
 assert.ok(page.sales.every(s=>s.kind==='LOCAL_NEEDS_REVIEW_UNCONFIRMED'));
 const cashier=readLocalSalesReport(x.db,x.scope('CASHIER'),
  {from:'2026-11-08',to:'2026-11-09'});
 assert.equal(cashier.matchedSaleCount,'3');
 assert.ok(cashier.sales.every(s=>s.cashierId===x.ids.cashierId));
 assert.throws(()=>readLocalSalesReport(x.db,x.scope('CASHIER'),{
  from:'2026-11-08',to:'2026-11-09',cashierId:x.ids.secondCashierId,
 }),/LOCAL_REPORT_FORBIDDEN/);
 assert.deepEqual(['local_sales','local_sale_items','local_payments','outbox_events']
  .map(n=>x.count(n)),counts);
 assert.ok(pending.saleId);
 x.close();
 const reopened=x.reopen();
 const again=readLocalSalesReport(reopened,x.scope(),
  {from:'2026-11-08',to:'2026-11-09'});
 assert.equal(again.matchedSalesGrossVnd,result.matchedSalesGrossVnd);
 assert.deepEqual(again.byKind,result.byKind);
});

test('POS-026 local date boundaries and full filtered totals are deterministic',t=>{
 const x=fixture(t);
 x.commit('2026-11-07T16:59:00.000Z'); // Nov 7 VN
 x.commit('2026-11-07T17:01:00.000Z'); // Nov 8 VN
 x.commit('2026-11-08T17:01:00.000Z'); // Nov 9 VN
 assert.equal(x.report('2026-11-07','2026-11-07').matchedSaleCount,'1');
 assert.equal(x.report('2026-11-08','2026-11-08').matchedSaleCount,'1');
 assert.equal(x.report('2026-11-09','2026-11-09').matchedSaleCount,'1');
 assert.equal(x.report('2026-11-07','2026-11-09').matchedSaleCount,'3');
 assert.equal(x.report('2026-11-07','2026-11-09',{offset:2,limit:1}).sales.length,1);
});
test('POS-026 fail-closed on corrupt receipt, forged ACK, missing outbox and wrong scope',t=>{
 const x=fixture(t),one=x.commit();
 const input={from:'2026-11-08',to:'2026-11-09'};
 assert.throws(()=>readLocalSalesReport(x.db,{...x.scope(),storeId:id()},input),
  /LOCAL_REPORT_DEVICE_SCOPE/);
 assert.throws(()=>readLocalSalesReport(x.db,{...x.scope(),deviceId:id()},input),
  /LOCAL_REPORT_DEVICE_SCOPE/);
 for(const bad of [
  {from:'2026-11-31',to:'2026-12-01'},
  {from:'2026-11-09',to:'2026-11-01'},
  {from:'2026-01-01',to:'2026-11-09'},
  {...input,limit:101},
  {...input,limit:0},
  {...input,offset:-1},
  {...input,sku:'LOWER-case'},
  {...input,kind:'UNKNOWN'},
  {...input,unknown:true},
 ])assert.throws(()=>readLocalSalesReport(x.db,x.scope(),bad));
 x.db.exec('DROP TRIGGER outbox_payload_immutable');
 x.db.prepare('UPDATE outbox_events SET payload_hash=? WHERE event_id=?')
  .run('f'.repeat(64),one.eventId);
 assert.throws(()=>x.report(),/RECEIPT_DB_EVENT_HASH/);
});
test('POS-026 invalid local SYNCED flag cannot manufacture a cloud ACK',t=>{
 const x=fixture(t),one=x.commit();
 x.db.prepare("UPDATE local_sales SET sync_status='SYNCED' WHERE sale_id=?")
  .run(one.saleId);
 assert.throws(()=>x.report(),/RECEIPT_DB_SYNC_ACK_REQUIRED|LOCAL_REPORT_STATE_CONTRADICTION/);
});
test('POS-026 multi-sale >JS safe integer exact VND totals as decimal strings',t=>{
 const big='9007199254740993',x=fixture(t,big);
 const one=x.commit(TIME,x.ids.cashierId,false),two=x.commit(TIME,x.ids.cashierId,false);
 x.mark(one);
 const report=x.report();
 assert.equal(report.matchedSaleCount,'2');
 assert.equal(report.matchedSalesGrossVnd,'18014398509481986');
 assert.equal(report.skuLineGrossVnd,'18014398509481986');
 assert.equal(report.byKind[0]?.grossVnd,big);
 assert.equal(report.byKind[2]?.grossVnd,big);
 assert.equal(report.topSkus[0]?.lineGrossVnd,'18014398509481986');
 assert.equal(typeof report.sales[0]?.totalVnd,'string');
 assert.ok(two.saleId);
});
