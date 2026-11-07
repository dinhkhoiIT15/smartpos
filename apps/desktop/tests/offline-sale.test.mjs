import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLocalDatabase } from '../src/main/local-db/index.ts';
import { applyInitialCatalogSnapshot } from '../src/main/local-db/catalog-cache.ts';
import {
  commitLocalCashSale, parseLocalCashSaleRequest,
} from '../src/main/local-db/offline-sale.ts';

const UUID = () => randomUUID();
const TIME = '2026-11-08T09:15:00.000Z';

function fixture(t, { phonePrice = '8990000', phoneQty = 5n, caseQty = 10n } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'smartpos-pos019-'));
  const file = join(dir, 'sqlite-local.db');
  const handles = new Set();
  const open = () => { const db = openLocalDatabase(file); handles.add(db); return db; };
  const ids = { storeId: UUID(), deviceId: UUID(), cashierId: UUID(), offlineGrantId: UUID(),
    phoneId: UUID(), caseId: UUID() };
  const variants = [
    { variantId: ids.phoneId,storeId: ids.storeId,sku:'PHONE-128',
      name:'Điện thoại 128GB',attributes:{storage:'128GB'},priceVnd:phonePrice,
      revision:'7',active:true },
    { variantId: ids.caseId,storeId: ids.storeId,sku:'CASE-01',
      name:'Ốp lưng',attributes:{color:'Đen'},priceVnd:'350000',
      revision:'2',active:true },
  ];
  let db = open();
  applyInitialCatalogSnapshot(db, {protocolVersion:1,storeId:ids.storeId,catalogSeq:'42',variants});
  db.prepare(`INSERT INTO local_device_metadata
    (store_id,device_id,provisioned_at) VALUES (?,?,?)`).run(ids.storeId,ids.deviceId,TIME);
  const insert = db.prepare(`INSERT INTO local_inventory_balances
    (store_id,variant_id,server_qty,pending_delta,server_revision) VALUES (?,?,?,0,?)`);
  insert.run(ids.storeId,ids.phoneId,phoneQty,7n);
  insert.run(ids.storeId,ids.caseId,caseQty,2n);
  t.after(() => {
    const problems = [];
    for (const handle of handles) try { if (handle.isOpen) handle.close(); } catch (error) { problems.push(error); }
    try { rmSync(dir,{recursive:true,force:true,maxRetries:8,retryDelay:125}); }
    catch (error) { problems.push(error); }
    if (problems.length) throw new AggregateError(problems, 'POS-019 Windows-safe temp cleanup');
  });
  function request() {
    return {
      saleId: UUID(), eventId: UUID(), paymentId: UUID(),
      storeId: ids.storeId, deviceId: ids.deviceId,
      cashierId: ids.cashierId, offlineGrantId: ids.offlineGrantId,
      clientCreatedAt: TIME, catalogRevision: '42', tenderedVnd: '9500000',
      items: [
        {itemId: UUID(),variantId:ids.phoneId,skuSnapshot:'PHONE-128',
          expectedUnitPriceVnd:phonePrice,expectedServerRevision:'7',quantity:1},
        {itemId: UUID(),variantId:ids.caseId,skuSnapshot:'CASE-01',
          expectedUnitPriceVnd:'350000',expectedServerRevision:'2',quantity:1},
      ],
    };
  }
  return {db,open,ids,request,file,variants};
}
function count(db, table) {
  // Only static test constant table names, never runtime SQL identifiers.
  return db.prepare('SELECT count(*) AS n FROM ' + table).get().n;
}
function intRow(db,sql,values=[]) {
  const stmt=db.prepare(sql);
  stmt.setReadBigInts(true);
  return stmt.get(...values);
}
function allCounts(db) {
  return ['local_sales','local_sale_items','local_payments','outbox_events']
    .map(name=>count(db,name));
}
function pending(db,id) {
  return intRow(db,`SELECT pending_delta FROM local_inventory_balances
    WHERE variant_id=?`,[id]).pending_delta;
}

test('BR-002: one atomic local sale, cash snapshot, pending stock and hashed v1 outbox; reopen',t=>{
  const x=fixture(t),req=x.request();
  const result=commitLocalCashSale(x.db,req);
  assert.deepEqual(result,{saleId:req.saleId,eventId:req.eventId,
    totalVnd:'9340000',tenderedVnd:'9500000',changeVnd:'160000',
    syncStatus:'PENDING_SYNC',replay:false});
  assert.deepEqual(allCounts(x.db),[1,2,1,1]);
  assert.equal(pending(x.db,x.ids.phoneId),-1n);
  assert.equal(pending(x.db,x.ids.caseId),-1n);
  const sale=intRow(x.db,'SELECT total_vnd,sync_status FROM local_sales WHERE sale_id=?',[req.saleId]);
  assert.equal(sale.total_vnd,9340000n);
  assert.equal(sale.sync_status,'PENDING_SYNC');
  const payment=intRow(x.db,'SELECT method,due_vnd,tendered_vnd,change_vnd FROM local_payments');
  assert.deepEqual({...payment},{method:'CASH',due_vnd:9340000n,
    tendered_vnd:9500000n,change_vnd:160000n});
  const outbox=x.db.prepare('SELECT state,payload_json,payload_hash,attempt_count FROM outbox_events').get();
  assert.equal(outbox.state,'PENDING');
  assert.equal(outbox.attempt_count,0);
  const event=JSON.parse(outbox.payload_json);
  assert.equal(event.schemaVersion,1);
  assert.equal(event.eventType,'SALE_COMPLETED');
  assert.equal(event.catalogRevision,'42');
  assert.equal(event.offlineGrantId,req.offlineGrantId);
  assert.equal(event.sale.items[0].unitPriceVnd,'8990000');
  assert.equal(event.sale.items[1].nameSnapshot,'Ốp lưng');
  assert.equal(event.sale.payment.changeVnd,'160000');
  assert.equal(outbox.payload_hash,event.payloadHash);
  assert.match(outbox.payload_hash,/^[a-f0-9]{64}$/);
  assert.notEqual(outbox.payload_hash,'a'.repeat(64));
  // Canonical key-order-independent SHA256 of body, never JSON.stringify order.
  const {payloadHash,...withoutHash}=event;
  function canonical(v) {
    if (v===null || typeof v!=='object') return JSON.stringify(v);
    if (Array.isArray(v)) return '['+v.map(canonical).join(',')+']';
    return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
  }
  assert.equal(payloadHash,createHash('sha256').update(canonical(withoutHash)).digest('hex'));
  const db=x.db;
  db.close();
  const reopened=x.open();
  assert.deepEqual(allCounts(reopened),[1,2,1,1]);
  assert.equal(pending(reopened,x.ids.phoneId),-1n);
  assert.equal(reopened.prepare('SELECT state FROM outbox_events').get().state,'PENDING');
  assert.equal(reopened.prepare('SELECT payload_json FROM outbox_events').get().payload_json,outbox.payload_json);
});

test('exact retry does not duplicate sale/payment/outbox or decrement stock twice, including after reopen',t=>{
  const x=fixture(t),request=x.request();
  commitLocalCashSale(x.db,request);
  assert.equal(commitLocalCashSale(x.db,request).replay,true);
  assert.deepEqual(allCounts(x.db),[1,2,1,1]);
  assert.equal(pending(x.db,x.ids.phoneId),-1n);
  x.db.close();
  const reopened=x.open();
  assert.equal(commitLocalCashSale(reopened,request).replay,true);
  reopened.prepare("UPDATE local_sales SET sync_status='NEEDS_REVIEW' WHERE sale_id=?").run(request.saleId);
  assert.equal(commitLocalCashSale(reopened,request).syncStatus,'NEEDS_REVIEW');
  assert.deepEqual(allCounts(reopened),[1,2,1,1]);
});

test('conflicting retry identities, cash, same item mismatch and incomplete evidence fail closed',t=>{
  const x=fixture(t),req=x.request();
  commitLocalCashSale(x.db,req);
  const wrong=[
    {...req,eventId:UUID()},
    {...req,paymentId:UUID()},
    {...req,cashierId:UUID()},
    {...req,offlineGrantId:UUID()},
    {...req,tenderedVnd:'10000000'},
    {...req,catalogRevision:'43'},
    {...req,items:req.items.map((v,i)=>i===0?{...v,quantity:2}:v)},
    {...req,items:req.items.map((v,i)=>i===0?{...v,expectedUnitPriceVnd:'1'}:v)},
    {...req,items:req.items.map((v,i)=>i===0?{...v,itemId:UUID()}:v)},
  ];
  for (const item of wrong) assert.throws(()=>commitLocalCashSale(x.db,item),/REPLAY_COLLISION/);
  assert.deepEqual(allCounts(x.db),[1,2,1,1]);
  assert.equal(pending(x.db,x.ids.phoneId),-1n);
  // Simulate an old/incomplete local record; no fallback "successful" replay.
  const second=x.request();
  x.db.prepare(`INSERT INTO local_sales
    (sale_id,store_id,device_id,cashier_id,client_created_at,total_vnd)
    VALUES (?,?,?,?,?,?)`).run(second.saleId,second.storeId,second.deviceId,
      second.cashierId,second.clientCreatedAt,1n);
  assert.throws(()=>commitLocalCashSale(x.db,second),/REPLAY_COLLISION/);
});

test('outbox trigger failure after stock/items/payment inserts rolls back ALL writes and allows retry',t=>{
  const x=fixture(t),request=x.request();
  x.db.exec(`CREATE TRIGGER injected_outbox_crash BEFORE INSERT ON outbox_events
    BEGIN SELECT RAISE(ABORT, 'crash before outbox'); END`);
  assert.throws(()=>commitLocalCashSale(x.db,request),/crash before outbox/);
  assert.deepEqual(allCounts(x.db),[0,0,0,0]);
  assert.equal(pending(x.db,x.ids.phoneId),0n);
  assert.equal(pending(x.db,x.ids.caseId),0n);
  assert.equal(count(x.db,'sync_cursors'),1);
  assert.equal(count(x.db,'local_catalog_variants'),2);
  x.db.exec('DROP TRIGGER injected_outbox_crash');
  assert.equal(commitLocalCashSale(x.db,request).replay,false);
  assert.deepEqual(allCounts(x.db),[1,2,1,1]);
});
test('second line failure rolls back first line pending stock and first item',t=>{
  const x=fixture(t),req=x.request();
  x.db.exec(`CREATE TRIGGER injected_payment_crash BEFORE INSERT ON local_payments
    BEGIN SELECT RAISE(ABORT, 'payment failure'); END`);
  assert.throws(()=>commitLocalCashSale(x.db,req),/payment failure/);
  assert.deepEqual(allCounts(x.db),[0,0,0,0]);
  assert.equal(pending(x.db,x.ids.phoneId),0n);
  assert.equal(pending(x.db,x.ids.caseId),0n);
});

test('stock shortages, missing row, inactive variant and stale catalog deny without any partial write',t=>{
  const x=fixture(t,{phoneQty:1n,caseQty:0n}),req=x.request();
  assert.throws(()=>commitLocalCashSale(x.db,req),/INSUFFICIENT_STOCK/);
  assert.deepEqual(allCounts(x.db),[0,0,0,0]);
  assert.equal(pending(x.db,x.ids.phoneId),0n);
  x.db.prepare('UPDATE local_inventory_balances SET server_qty=1 WHERE variant_id=?').run(x.ids.caseId);
  x.db.prepare('UPDATE local_catalog_variants SET active=0 WHERE variant_id=?').run(x.ids.caseId);
  assert.throws(()=>commitLocalCashSale(x.db,req),/STALE_CATALOG/);
  x.db.prepare('UPDATE local_catalog_variants SET active=1 WHERE variant_id=?').run(x.ids.caseId);
  x.db.prepare('UPDATE local_catalog_variants SET price_vnd=349000 WHERE variant_id=?').run(x.ids.caseId);
  assert.throws(()=>commitLocalCashSale(x.db,req),/STALE_CATALOG/);
  x.db.prepare('UPDATE local_catalog_variants SET price_vnd=350000,server_revision=3 WHERE variant_id=?').run(x.ids.caseId);
  assert.throws(()=>commitLocalCashSale(x.db,req),/STALE_CATALOG/);
  assert.deepEqual(allCounts(x.db),[0,0,0,0]);
  assert.equal(pending(x.db,x.ids.phoneId),0n);
});

test('sequential sales consume pending stock without mutating server snapshot; oversell denied',t=>{
  const x=fixture(t,{phoneQty:2n,caseQty:2n});
  const a=x.request(),b=x.request(),c=x.request();
  assert.equal(commitLocalCashSale(x.db,a).syncStatus,'PENDING_SYNC');
  assert.equal(commitLocalCashSale(x.db,b).syncStatus,'PENDING_SYNC');
  assert.throws(()=>commitLocalCashSale(x.db,c),/INSUFFICIENT_STOCK/);
  assert.deepEqual(allCounts(x.db),[2,4,2,2]);
  const bal=intRow(x.db,`SELECT server_qty,pending_delta
    FROM local_inventory_balances WHERE variant_id=?`,[x.ids.phoneId]);
  assert.deepEqual({...bal},{server_qty:2n,pending_delta:-2n});
  assert.equal(pending(x.db,x.ids.caseId),-2n);
  // Previous sale evidence and pending outbox remain on disk.
  x.db.close();
  const reopened=x.open();
  assert.equal(count(reopened,'outbox_events'),2);
  assert.equal(pending(reopened,x.ids.phoneId),-2n);
});

test('metadata scope, missing catalog cursor and other-store device must fail closed',t=>{
  const x=fixture(t),req=x.request();
  assert.throws(()=>commitLocalCashSale(x.db,{...req,deviceId:UUID()}),/DEVICE_MISMATCH/);
  assert.throws(()=>commitLocalCashSale(x.db,{...req,storeId:UUID()}),/DEVICE_MISMATCH/);
  x.db.prepare('DELETE FROM sync_cursors').run();
  assert.throws(()=>commitLocalCashSale(x.db,req),/STALE_CATALOG/);
  assert.deepEqual(allCounts(x.db),[0,0,0,0]);
  assert.equal(pending(x.db,x.ids.phoneId),0n);
});

test('invalid payload/amount/timestamp/quantity or insufficient cash is rejected and rolls back',t=>{
  const x=fixture(t),r=x.request();
  const invalid=[
    {...r,notAllowed:true},
    {...r,saleId:'not-uuid'},
    {...r,clientCreatedAt:'2026-11-08T09:15:00Z'},
    {...r,catalogRevision:'042'},
    {...r,tenderedVnd:'9.500.000'},
    {...r,tenderedVnd:'-1'},
    {...r,tenderedVnd:'9223372036854775808'},
    {...r,tenderedVnd:'9000000'},
    {...r,items:[]},
    {...r,items:[...r.items,r.items[0]]},
    {...r,items:r.items.map((item,i)=>i===0?{...item,quantity:0}:item)},
    {...r,items:r.items.map((item,i)=>i===0?{...item,quantity:1.5}:item)},
    {...r,items:r.items.map((item,i)=>i===0?{...item,quantity:Number.MAX_SAFE_INTEGER}:item)},
    {...r,items:r.items.map((item,i)=>i===0?{...item,expectedUnitPriceVnd:'8990000.5'}:item)},
    {...r,items:r.items.map((item,i)=>i===0?{...item,expectedServerRevision:'-1'}:item)},
    {...r,items:r.items.map((item,i)=>i===0?{...item,skuSnapshot:'lowercase'}:item)},
  ];
  for(const request of invalid) assert.throws(()=>commitLocalCashSale(x.db,request));
  assert.deepEqual(allCounts(x.db),[0,0,0,0]);
  assert.equal(pending(x.db,x.ids.phoneId),0n);
});

test('> JS-safe VND is saved precisely as SQLite BIGINT and outbox decimal string',t=>{
  const price='9007199254740993';
  const x=fixture(t,{phonePrice:price,phoneQty:2n}),req=x.request();
  req.items=req.items.slice(0,1);
  req.tenderedVnd=price;
  const s=commitLocalCashSale(x.db,req);
  assert.equal(s.totalVnd,price);
  assert.equal(s.changeVnd,'0');
  assert.equal(intRow(x.db,'SELECT total_vnd FROM local_sales').total_vnd,9007199254740993n);
  const event=JSON.parse(x.db.prepare('SELECT payload_json FROM outbox_events').get().payload_json);
  assert.equal(event.sale.items[0].unitPriceVnd,price);
  assert.equal(event.sale.totalVnd,price);
  assert.equal(pending(x.db,x.ids.phoneId),-1n);
});

test('signed-64-bit line product overflow aborts even when stock is sufficient',t=>{
  const x=fixture(t,{phonePrice:'9223372036854775807',phoneQty:2n});
  const req=x.request();
  req.items=req.items.slice(0,1);
  req.items[0].quantity=2;
  req.tenderedVnd='9223372036854775807';
  assert.throws(()=>commitLocalCashSale(x.db,req),/INTEGER_OVERFLOW/);
  assert.equal(pending(x.db,x.ids.phoneId),0n);
  assert.deepEqual(allCounts(x.db),[0,0,0,0]);
});


test('reused event/payment/item IDs on a different sale roll back stock and financial rows',t=>{
  const x=fixture(t),original=x.request();
  commitLocalCashSale(x.db,original);
  const pendingBefore=pending(x.db,x.ids.phoneId);
  const variations=[
    {eventId:original.eventId},
    {paymentId:original.paymentId},
    {items:null},
  ];
  for(const change of variations) {
    const another=x.request();
    if(change.items===null) another.items[0].itemId=original.items[0].itemId;
    else Object.assign(another,change);
    assert.throws(()=>commitLocalCashSale(x.db,another));
    assert.deepEqual(allCounts(x.db),[1,2,1,1]);
    assert.equal(pending(x.db,x.ids.phoneId),pendingBefore);
  }
});

test('missing stock row on later SKU rolls back pending delta for the first SKU',t=>{
  const x=fixture(t),req=x.request();
  x.db.prepare('DELETE FROM local_inventory_balances WHERE variant_id=?').run(x.ids.caseId);
  assert.throws(()=>commitLocalCashSale(x.db,req),/INSUFFICIENT_STOCK/);
  assert.equal(pending(x.db,x.ids.phoneId),0n);
  assert.deepEqual(allCounts(x.db),[0,0,0,0]);
});

test('committed financial evidence and event payload cannot be edited/deleted',t=>{
  const x=fixture(t),req=x.request();
  commitLocalCashSale(x.db,req);
  assert.throws(()=>x.db.prepare('UPDATE local_sales SET total_vnd=0').run(),/immutable/);
  assert.throws(()=>x.db.prepare('UPDATE local_sale_items SET quantity=2').run(),/immutable/);
  assert.throws(()=>x.db.prepare('DELETE FROM local_payments').run(),/cannot be deleted/);
  assert.throws(()=>x.db.prepare("UPDATE outbox_events SET payload_hash=?").run('a'.repeat(64)),/immutable/);
  assert.throws(()=>x.db.prepare('DELETE FROM outbox_events').run(),/cannot be deleted/);
  assert.deepEqual(allCounts(x.db),[1,2,1,1]);
});

test('parser normalizes nothing silently: canonical IDs, exact fields, price and cache revision required',t=>{
  const x=fixture(t),r=x.request();
  assert.deepEqual(parseLocalCashSaleRequest(r),r);
  assert.throws(()=>parseLocalCashSaleRequest({...r,offlineGrantId:r.offlineGrantId.toUpperCase()}),/INVALID_UUID/);
  assert.throws(()=>parseLocalCashSaleRequest({...r,items:r.items.map((l,i)=>i===0?{...l,addedPrice:1}:l)}),/INVALID_ITEM/);
});
