import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLocalDatabase } from '../src/main/local-db/index.ts';
import { applyInitialCatalogSnapshot } from '../src/main/local-db/catalog-cache.ts';
import { commitLocalCashSale } from '../src/main/local-db/offline-sale.ts';
import { loadCommittedLocalReceipt } from '../src/main/local-db/receipt.ts';
import { buildPersistedInternalReceipt } from '@smartpos/domain/receipt';

const TIME='2026-11-08T02:10:00.000Z';
const id=()=>randomUUID();
function fixture(t:import('node:test').TestContext, price='8990000') {
  const dir=mkdtempSync(join(tmpdir(),'smartpos-pos020-'));
  const path=join(dir,'db.sqlite');
  const opened=new Set<ReturnType<typeof openLocalDatabase>>();
  const open=()=>{
    const db=openLocalDatabase(path);
    opened.add(db);
    return db;
  };
  let db=open();
  t.after(()=>{
    const errors:unknown[]=[];
    for(const connection of opened)try{if(connection.isOpen)connection.close();}
      catch(error){errors.push(error);}
    try{rmSync(dir,{recursive:true,force:true,maxRetries:8,retryDelay:125});}
      catch(error){errors.push(error);}
    if(errors.length)throw new AggregateError(errors,'POS-020 temporary SQLite cleanup');
  });
  const storeId=id(),deviceId=id(),cashierId=id(),offlineGrantId=id();
  const phoneId=id(),caseId=id();
  applyInitialCatalogSnapshot(db,{
    protocolVersion:1,storeId,catalogSeq:'42',
    variants:[
      {variantId:phoneId,storeId,sku:'PHONE-128',name:'Điện thoại 128GB',
        attributes:{storage:'128GB'},priceVnd:price,revision:'3',active:true},
      {variantId:caseId,storeId,sku:'CASE-01',name:'Ốp lưng',
        attributes:{color:'Đen'},priceVnd:'350000',revision:'7',active:true},
    ],
  });
  db.prepare(`INSERT INTO local_device_metadata
    (store_id,device_id,provisioned_at) VALUES(?,?,?)`).run(storeId,deviceId,TIME);
  const stmt=db.prepare(`INSERT INTO local_inventory_balances
    (store_id,variant_id,server_qty,pending_delta) VALUES(?,?,10,0)`);
  stmt.run(storeId,phoneId);
  stmt.run(storeId,caseId);
  function request(){
    return {
      saleId:id(),eventId:id(),paymentId:id(),storeId,deviceId,cashierId,offlineGrantId,
      clientCreatedAt:TIME,catalogRevision:'42',tenderedVnd:'9500000',
      items:[
        {itemId:id(),variantId:phoneId,skuSnapshot:'PHONE-128',
          expectedUnitPriceVnd:price,expectedServerRevision:'3',quantity:1},
        {itemId:id(),variantId:caseId,skuSnapshot:'CASE-01',
          expectedUnitPriceVnd:'350000',expectedServerRevision:'7',quantity:1},
      ],
    };
  }
  return {db,open,storeId,deviceId,cashierId,phoneId,caseId,request};
}
function counts(db:ReturnType<typeof openLocalDatabase>){
  return ['local_sales','local_sale_items','local_payments','outbox_events']
    .map(name=>(db.prepare('SELECT count(*) AS n FROM '+name).get() as {n:number}).n);
}
test('POS-020: read-only internal receipt derives from committed SQLite snapshots, survives reopen',t=>{
  const x=fixture(t),req=x.request();
  assert.equal(loadCommittedLocalReceipt(x.db,x.storeId,req.saleId),null);
  commitLocalCashSale(x.db,req);
  const before=counts(x.db);
  const data=loadCommittedLocalReceipt(x.db,x.storeId,req.saleId);
  assert.ok(data);
  assert.equal(data.saleId,req.saleId);
  assert.equal(data.cashierId,req.cashierId);
  assert.equal(data.syncStatus,'PENDING_SYNC');
  assert.equal(data.items.length,2);
  assert.deepEqual(data.items.map(item=>item.sku),['CASE-01','PHONE-128']);
  assert.equal(data.items.find(item=>item.sku==='PHONE-128')?.name,'Điện thoại 128GB');
  assert.deepEqual(data.items.find(item=>item.sku==='PHONE-128')?.attributes,{storage:'128GB'});
  assert.equal(data.dueVnd,'9340000');
  assert.equal(data.tenderedVnd,'9500000');
  assert.equal(data.changeVnd,'160000');
  assert.deepEqual(counts(x.db),before);
  const model=buildPersistedInternalReceipt(data);
  assert.equal(model.createdAtLocal,'08/11/2026 09:10:00 (VN)');
  assert.match(model.syncLabel,/CHƯA ĐỒNG BỘ/);
  assert.equal(model.notice,'PHIẾU NỘI BỘ — KHÔNG PHẢI HÓA ĐƠN THUẾ');
  x.db.close();
  const reopened=x.open();
  assert.deepEqual(loadCommittedLocalReceipt(reopened,x.storeId,req.saleId),data);
  assert.deepEqual(counts(reopened),before);
});
test('receipt uses immutable sale prices, not revised/deactivated catalog',t=>{
  const x=fixture(t),req=x.request();
  commitLocalCashSale(x.db,req);
  x.db.prepare(`UPDATE local_catalog_variants SET price_vnd=1,name_snapshot='Tên mới',
     active=0,server_revision=99 WHERE variant_id=?`).run(x.phoneId);
  const data=loadCommittedLocalReceipt(x.db,x.storeId,req.saleId);
  assert.ok(data);
  assert.equal(data.items.find(line=>line.sku==='PHONE-128')?.unitPriceVnd,'8990000');
  assert.equal(data.items.find(line=>line.sku==='PHONE-128')?.name,'Điện thoại 128GB');
  assert.equal(buildPersistedInternalReceipt(data).dueVnd,'9340000');
});
test('receipt refuses wrong-store/unknown sale and malformed IDs without cross-store leakage',t=>{
  const x=fixture(t),req=x.request();
  commitLocalCashSale(x.db,req);
  assert.equal(loadCommittedLocalReceipt(x.db,id(),req.saleId),null);
  assert.equal(loadCommittedLocalReceipt(x.db,x.storeId,id()),null);
  assert.throws(()=>loadCommittedLocalReceipt(x.db,x.storeId,'bad-sale'),/RECEIPT_DB_INVALID_UUID/);
  assert.throws(()=>loadCommittedLocalReceipt(x.db,'other-store',req.saleId),/RECEIPT_DB_INVALID_UUID/);
});
test('missing CASH payment or missing outbox blocks rendering; no fallback paid receipt',t=>{
  const x=fixture(t),req=x.request();
  commitLocalCashSale(x.db,req);
  x.db.exec('DROP TRIGGER local_payments_no_delete');
  x.db.prepare('DELETE FROM local_payments WHERE sale_id=?').run(req.saleId);
  assert.throws(()=>loadCommittedLocalReceipt(x.db,x.storeId,req.saleId),/RECEIPT_DB_PAYMENT/);
  const y=fixture(t),next=y.request();
  commitLocalCashSale(y.db,next);
  y.db.exec('DROP TRIGGER outbox_no_delete');
  y.db.prepare('DELETE FROM outbox_events WHERE sale_id=?').run(next.saleId);
  assert.throws(()=>loadCommittedLocalReceipt(y.db,y.storeId,next.saleId),/RECEIPT_DB_OUTBOX/);
});
test('tampered outbox hash, payload or line-name mismatch fails closed; no mutation by read path',t=>{
  const x=fixture(t),req=x.request();
  commitLocalCashSale(x.db,req);
  x.db.exec('DROP TRIGGER outbox_payload_immutable');
  x.db.prepare('UPDATE outbox_events SET payload_hash=? WHERE event_id=?').run('a'.repeat(64),req.eventId);
  assert.throws(()=>loadCommittedLocalReceipt(x.db,x.storeId,req.saleId),/RECEIPT_DB_EVENT_HASH/);
  const y=fixture(t),next=y.request();
  commitLocalCashSale(y.db,next);
  y.db.exec('DROP TRIGGER local_items_no_update');
  y.db.prepare('UPDATE local_sale_items SET name_snapshot=? WHERE item_id=?')
    .run('Tampered item',next.items[0]!.itemId);
  assert.throws(()=>loadCommittedLocalReceipt(y.db,y.storeId,next.saleId),/RECEIPT_DB_EVENT_ITEMS/);
});
test('payment cash discrepancy or corrupted line total rejects even if SQLite checks were bypassed',t=>{
  const x=fixture(t),req=x.request();
  commitLocalCashSale(x.db,req);
  x.db.exec('DROP TRIGGER local_payments_no_update');
  // Deliberately bypass SQLite CHECK constraints in the disposable test only;
  // the read-model must reject inconsistent cash even with a damaged file.
  x.db.exec('PRAGMA ignore_check_constraints = ON');
  x.db.prepare('UPDATE local_payments SET tendered_vnd=tendered_vnd+1 WHERE sale_id=?')
    .run(req.saleId);
  assert.throws(()=>loadCommittedLocalReceipt(x.db,x.storeId,req.saleId),/RECEIPT_DB_PAYMENT_CASH/);
  const y=fixture(t),next=y.request();
  commitLocalCashSale(y.db,next);
  y.db.exec('DROP TRIGGER local_items_no_update');
  y.db.exec('PRAGMA ignore_check_constraints = ON');
  y.db.prepare('UPDATE local_sale_items SET line_total_vnd=2 WHERE item_id=?')
    .run(next.items[0]!.itemId);
  assert.throws(()=>loadCommittedLocalReceipt(y.db,y.storeId,next.saleId),/RECEIPT_DB_LINE_TOTAL/);
});
test('persisted >2^53 VND totals are returned as canonical decimal strings, not floats',t=>{
  const big='9007199254740993',x=fixture(t,big);
  const req=x.request();
  req.items=[req.items[0]!];
  req.tenderedVnd='9007199254740994';
  commitLocalCashSale(x.db,req);
  const data=loadCommittedLocalReceipt(x.db,x.storeId,req.saleId);
  assert.ok(data);
  assert.equal(data.dueVnd,big);
  assert.equal(data.tenderedVnd,'9007199254740994');
  assert.equal(data.changeVnd,'1');
  assert.equal(typeof data.dueVnd,'string');
  assert.equal(JSON.stringify(data).includes(big),true);
  assert.equal(buildPersistedInternalReceipt(data).dueVnd,big);
});
test('local sync state is honest: pending/review/synced are read as local state only',t=>{
  const x=fixture(t),req=x.request();
  commitLocalCashSale(x.db,req);
  for(const status of ['PENDING_SYNC','NEEDS_REVIEW','SYNCED'] as const) {
    x.db.prepare('UPDATE local_sales SET sync_status=? WHERE sale_id=?').run(status,req.saleId);
    const data=loadCommittedLocalReceipt(x.db,x.storeId,req.saleId);
    assert.equal(data?.syncStatus,status);
    assert.equal(buildPersistedInternalReceipt(data!).kind,'PERSISTED');
  }
  assert.deepEqual(counts(x.db),[1,2,1,1]);
});
