import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLocalDatabase } from '../src/main/local-db/index.ts';
import { applyInitialCatalogSnapshot } from '../src/main/local-db/catalog-cache.ts';
import { commitLocalCashSale } from '../src/main/local-db/offline-sale.ts';
import {
  computeSyncPayloadHash, syncSaleCompletedEventSchema, syncPushRequestSchema,
} from '../../../packages/contracts/src/sync-v1.ts';

/**
 * Run under existing @smartpos/contracts's tsx dev tool, which resolves the
 * shared Zod contract's '.js' TS imports; no production Electron dependency
 * is needed and no production API/Neon DB is accessed.
 */
test('POS-019 outbox JSON is exactly interoperable with POS-016 hash + PUSH v1 wire schema',t=>{
  const dir=mkdtempSync(join(tmpdir(),'smartpos-pos019-wire-'));
  const db=openLocalDatabase(join(dir,'local.db'));
  t.after(()=>{
    db.close();
    rmSync(dir,{recursive:true,force:true,maxRetries:8,retryDelay:125});
  });
  const storeId=randomUUID(),deviceId=randomUUID(),cashierId=randomUUID(),
    offlineGrantId=randomUUID(),variantId=randomUUID(),saleId=randomUUID(),itemId=randomUUID(),
    paymentId=randomUUID(),eventId=randomUUID();
  const at='2026-11-08T10:00:00.000Z';
  applyInitialCatalogSnapshot(db,{
    protocolVersion:1,storeId,catalogSeq:'9007199254740993',
    variants:[{variantId,storeId,sku:'PHONE-128',name:'Điện thoại 128GB',
      attributes:{storage:'128GB'},priceVnd:'8990000',revision:'44',active:true}],
  });
  db.prepare(`INSERT INTO local_device_metadata(store_id,device_id,provisioned_at)
    VALUES(?,?,?)`).run(storeId,deviceId,at);
  db.prepare(`INSERT INTO local_inventory_balances
    (store_id,variant_id,server_qty,pending_delta) VALUES(?,?,3,0)`).run(storeId,variantId);
  const result=commitLocalCashSale(db,{
    storeId,deviceId,cashierId,offlineGrantId,variantId,
    saleId,itemId,paymentId,eventId,clientCreatedAt:at,
    catalogRevision:'9007199254740993',tenderedVnd:'9000000',
    items:[{itemId,variantId,skuSnapshot:'PHONE-128',quantity:1,
      expectedUnitPriceVnd:'8990000',expectedServerRevision:'44'}],
  });
  assert.equal(result.changeVnd,'10000');
  const row=db.prepare('SELECT payload_json,payload_hash FROM outbox_events').get() as {
    payload_json:string;payload_hash:string;
  };
  const event=JSON.parse(row.payload_json);
  const checked=syncSaleCompletedEventSchema.parse(event);
  const {payloadHash,...body}=checked;
  assert.equal(row.payload_hash,payloadHash);
  assert.equal(computeSyncPayloadHash(body),payloadHash);
  const push=syncPushRequestSchema.parse({
    protocolVersion:1,deviceId,events:[event],
  });
  assert.equal(push.events[0]?.saleId,saleId);
  assert.equal(push.events[0]?.sale.items[0]?.skuSnapshot,'PHONE-128');
  assert.equal(push.events[0]?.catalogRevision,'9007199254740993');
  assert.throws(()=>syncSaleCompletedEventSchema.parse({
    ...event,payloadHash:'a'.repeat(64),
  }));
});
