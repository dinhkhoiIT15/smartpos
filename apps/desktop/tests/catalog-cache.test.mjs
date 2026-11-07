import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLocalDatabase } from '../src/main/local-db/index.ts';
import {
  applyInitialCatalogSnapshot, getLocalCatalogCursor,
  lookupLocalCatalogBySku, parseInitialCatalogSnapshot,
} from '../src/main/local-db/catalog-cache.ts';

function temporaryDatabase(t) {
  const dir = mkdtempSync(join(tmpdir(), 'smartpos-pos017-'));
  const handles = new Set();
  const file = join(dir, 'local.sqlite');
  function open() {
    const db = openLocalDatabase(file);
    handles.add(db);
    return db;
  }
  t.after(() => {
    const errors = [];
    for (const db of handles) {
      try { if (db.isOpen) db.close(); } catch (error) { errors.push(error); }
    }
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 });
    } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'POS-017 SQLite cleanup failed');
  });
  return { open };
}
function sample(storeId = randomUUID()) {
  return {
    protocolVersion: 1, storeId, catalogSeq: '9007199254740993',
    variants: [
      { variantId: randomUUID(), storeId, sku: 'ABC_1', name: 'Laptop 16GB',
        attributes: { ram: '16GB' }, priceVnd: '9007199254740993', revision: '2', active: true },
      { variantId: randomUUID(), storeId, sku: 'ABCX1', name: 'Laptop 8GB',
        attributes: { ram: '8GB' }, priceVnd: '1000000', revision: '1', active: true },
      { variantId: randomUUID(), storeId, sku: 'OFF-1', name: 'Ngừng bán',
        attributes: {}, priceVnd: '0', revision: '0', active: false },
    ],
  };
}
function clone(value) { return structuredClone(value); }
function count(db, table) {
  // table names below are hardcoded by tests, never supplied as input.
  return db.prepare('SELECT count(*) AS n FROM ' + table).get().n;
}

test('initial import is atomic, restart durable and local SKU lookup returns bigint-safe decimal', (t) => {
  const { open } = temporaryDatabase(t);
  let db = open();
  const snapshot = sample();
  assert.equal(getLocalCatalogCursor(db, snapshot.storeId), null);
  assert.deepEqual(applyInitialCatalogSnapshot(db, snapshot), {
    cursor: snapshot.catalogSeq, count: 3, replay: false,
  });
  assert.equal(count(db, 'local_catalog_variants'), 3);
  assert.equal(getLocalCatalogCursor(db, snapshot.storeId), snapshot.catalogSeq);
  assert.deepEqual(lookupLocalCatalogBySku(db, snapshot.storeId, 'abc_').map((row) => row.sku), ['ABC_1']);
  const exact = lookupLocalCatalogBySku(db, snapshot.storeId, 'abc_1');
  assert.equal(exact.length, 1);
  assert.equal(exact[0].priceVnd, '9007199254740993');
  assert.equal(exact[0].serverRevision, '2');
  assert.equal(typeof exact[0].priceVnd, 'string');
  assert.deepEqual(lookupLocalCatalogBySku(db, snapshot.storeId, 'ABC').map((row) => row.sku),
    ['ABCX1', 'ABC_1'].sort((a, b) => a.localeCompare(b, 'en'))); 
  assert.deepEqual(lookupLocalCatalogBySku(db, snapshot.storeId, 'OFF'), []);
  db.close();
  db = open();
  assert.equal(getLocalCatalogCursor(db, snapshot.storeId), snapshot.catalogSeq);
  assert.equal(lookupLocalCatalogBySku(db, snapshot.storeId, 'ABC_1')[0].name, 'Laptop 16GB');
  assert.deepEqual(applyInitialCatalogSnapshot(db, snapshot), {
    cursor: snapshot.catalogSeq, count: 3, replay: true,
  });
  assert.equal(count(db, 'local_catalog_variants'), 3);
});

test('strict input validation rejects other stores, collisions, unknown keys and money overflow', (t) => {
  const { open } = temporaryDatabase(t);
  const db = open();
  const base = sample();
  const invalid = [];
  const altered = (change) => { const v = clone(base); change(v); invalid.push(v); };
  altered((v) => { v.variants[0].storeId = randomUUID(); });
  altered((v) => { v.variants[1].variantId = v.variants[0].variantId; });
  altered((v) => { v.variants[1].sku = v.variants[0].sku; });
  altered((v) => { v.variants[0].sku = 'abc_1'; });
  altered((v) => { v.variants[0].priceVnd = '9223372036854775808'; });
  altered((v) => { v.variants[0].priceVnd = '1.5'; });
  altered((v) => { v.variants[0].revision = '-1'; });
  altered((v) => { v.variants[0].attributes = { INVALID: 'x' }; });
  altered((v) => { v.variants[0].active = 1; });
  altered((v) => { v.variants[0].token = 'should never be accepted'; });
  altered((v) => { v.catalogSeq = '00'; });
  altered((v) => { v.protocolVersion = 2; });
  for (const snapshot of invalid) {
    assert.throws(() => parseInitialCatalogSnapshot(snapshot), /CATALOG_/);
    assert.throws(() => applyInitialCatalogSnapshot(db, snapshot), /CATALOG_/);
  }
  assert.equal(getLocalCatalogCursor(db, base.storeId), null);
  assert.equal(count(db, 'local_catalog_variants'), 0);
  assert.equal(count(db, 'sync_cursors'), 0);
});

test('SQLite trigger failure rolls back all catalog rows and cursor; safe retry succeeds', (t) => {
  const { open } = temporaryDatabase(t);
  const db = open();
  const snapshot = sample();
  db.exec(`CREATE TRIGGER fail_catalog_import BEFORE INSERT ON local_catalog_variants
    WHEN NEW.sku = 'ABCX1'
    BEGIN SELECT RAISE(ABORT, 'injected failure'); END;`);
  assert.throws(() => applyInitialCatalogSnapshot(db, snapshot), /injected failure/);
  assert.equal(count(db, 'local_catalog_variants'), 0);
  assert.equal(count(db, 'sync_cursors'), 0);
  db.exec('DROP TRIGGER fail_catalog_import');
  assert.equal(applyInitialCatalogSnapshot(db, snapshot).replay, false);
  assert.equal(getLocalCatalogCursor(db, snapshot.storeId), snapshot.catalogSeq);
});

test('divergent replay, cursor rewind and unversioned cache refuse replacement', (t) => {
  const { open } = temporaryDatabase(t);
  const db = open();
  const snapshot = sample();
  applyInitialCatalogSnapshot(db, snapshot);
  const changedPrice = clone(snapshot);
  changedPrice.variants[0].priceVnd = '1';
  assert.throws(() => applyInitialCatalogSnapshot(db, changedPrice), /CATALOG_ALREADY_INITIALIZED/);
  const rewound = clone(snapshot);
  rewound.catalogSeq = '1';
  assert.throws(() => applyInitialCatalogSnapshot(db, rewound), /CATALOG_ALREADY_INITIALIZED/);
  assert.equal(lookupLocalCatalogBySku(db, snapshot.storeId, 'ABC_1')[0].priceVnd, '9007199254740993');
  assert.equal(getLocalCatalogCursor(db, snapshot.storeId), snapshot.catalogSeq);
  assert.deepEqual(lookupLocalCatalogBySku(db, randomUUID(), 'ABC'), []);
  assert.throws(() => lookupLocalCatalogBySku(db, snapshot.storeId, 'ABC', 0), /CATALOG_INVALID_LIMIT/);
  assert.throws(() => lookupLocalCatalogBySku(db, snapshot.storeId, 'ABC', 51), /CATALOG_INVALID_LIMIT/);
  assert.throws(() => lookupLocalCatalogBySku(db, snapshot.storeId, 'ABC%'), /CATALOG_INVALID_SKU/);
});

test('bootstrap never overwrites pending stock deltas, immutable sale evidence or outbox', (t) => {
  const { open } = temporaryDatabase(t);
  const db = open();
  const snapshot = sample();
  applyInitialCatalogSnapshot(db, snapshot);
  const variant = snapshot.variants[0];
  const saleId = randomUUID();
  const eventId = randomUUID();
  db.prepare(`INSERT INTO local_inventory_balances
    (store_id,variant_id,server_qty,pending_delta) VALUES (?,?,?,?)`)
    .run(snapshot.storeId, variant.variantId, 15n, -2n);
  db.prepare(`INSERT INTO local_sales
    (sale_id,store_id,device_id,cashier_id,client_created_at,total_vnd)
    VALUES (?,?,?,?,?,?)`)
    .run(saleId, snapshot.storeId, randomUUID(), randomUUID(), new Date().toISOString(), 2000000n);
  db.prepare(`INSERT INTO local_sale_items
    (item_id,store_id,sale_id,variant_id,sku_snapshot,name_snapshot,attributes_snapshot_json,
     quantity,unit_price_vnd,discount_vnd,line_total_vnd)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(randomUUID(), snapshot.storeId, saleId, variant.variantId,
      variant.sku, variant.name, '{}', 2, 1000000n, 0n, 2000000n);
  db.prepare(`INSERT INTO local_payments
    (payment_id,sale_id,method,due_vnd,tendered_vnd,change_vnd)
    VALUES (?,?,?,?,?,?)`).run(randomUUID(), saleId, 'CASH', 2000000n, 3000000n, 1000000n);
  db.prepare(`INSERT INTO outbox_events
    (event_id,sale_id,store_id,device_id,schema_version,payload_json,payload_hash,state,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(eventId, saleId, snapshot.storeId,
      randomUUID(), 1, '{}', 'a'.repeat(64), 'PENDING', new Date().toISOString());
  assert.equal(applyInitialCatalogSnapshot(db, snapshot).replay, true);
  const divergent = clone(snapshot);
  divergent.variants = [];
  assert.throws(() => applyInitialCatalogSnapshot(db, divergent), /CATALOG_ALREADY_INITIALIZED/);
  assert.equal(db.prepare('SELECT pending_delta FROM local_inventory_balances').get().pending_delta, -2);
  assert.equal(count(db, 'local_sales'), 1);
  assert.equal(count(db, 'local_sale_items'), 1);
  assert.equal(count(db, 'local_payments'), 1);
  assert.equal(count(db, 'outbox_events'), 1);
  assert.equal(db.prepare('SELECT state FROM outbox_events').get().state, 'PENDING');
});

test('store identity mismatch and pre-existing uncursored catalog data fail closed', (t) => {
  const { open } = temporaryDatabase(t);
  const db = open();
  const snapshot = sample();
  const otherStore = randomUUID();
  db.prepare(`INSERT INTO local_device_metadata
    (store_id,device_id,provisioned_at) VALUES (?,?,?)`)
    .run(otherStore, randomUUID(), new Date().toISOString());
  assert.throws(() => applyInitialCatalogSnapshot(db, snapshot), /CATALOG_WRONG_STORE/);
  db.prepare('DELETE FROM local_device_metadata WHERE store_id = ?').run(otherStore);
  db.prepare(`INSERT INTO local_catalog_variants
    (variant_id,store_id,sku,name_snapshot,attributes_json,price_vnd)
    VALUES (?,?,?,?,?,?)`).run(randomUUID(), snapshot.storeId, 'EXISTING', 'Existing', '{}', 1n);
  assert.throws(() => applyInitialCatalogSnapshot(db, snapshot), /CATALOG_UNVERSIONED_CACHE/);
  assert.equal(count(db, 'local_catalog_variants'), 1);
  assert.equal(count(db, 'sync_cursors'), 0);
  assert.deepEqual(lookupLocalCatalogBySku(db, snapshot.storeId, 'EXISTING'), []);
});
