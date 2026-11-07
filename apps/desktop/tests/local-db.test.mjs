import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  openLocalDatabase, getLocalSchemaVersion, withLocalTransaction,
  backupLocalDatabase, SQLITE_SCHEMA_VERSION,
} from '../src/main/local-db/index.ts';

function temporaryDatabase(t) {
  const dir = mkdtempSync(join(tmpdir(), 'smartpos-pos013-'));
  const connections = new Set();

  // Register each handle at creation, including database reopen and backup reads.
  // On Windows, SQLite holds a filesystem lock until every handle is closed.
  function open(file) {
    const db = openLocalDatabase(file);
    connections.add(db);
    return db;
  }
  function openRaw(file) {
    const db = new DatabaseSync(file);
    connections.add(db);
    return db;
  }

  t.after(() => {
    const errors = [];
    for (const db of connections) {
      if (db.isOpen) {
        try {
          db.close();
        } catch (error) {
          errors.push(error);
        }
      }
    }
    try {
      // Only remove this test's OS-generated temp directory; never Electron userData.
      // Bounded retries tolerate transient Windows antivirus/file-indexing locks.
      rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 });
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) {
      throw new AggregateError(errors, 'SQLite test cleanup failed after closing handles');
    }
  });

  return { file: join(dir, 'smartpos-local.sqlite'), dir, open, openRaw };
}
function count(db, table) {
  // 'table' comes only from test source, never user-controlled input.
  return db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n;
}
function insertVariant(db, variantId = 'v1', storeId = 'store1', sku = 'SKU-A') {
  db.prepare(`INSERT INTO local_catalog_variants
    (variant_id,store_id,sku,name_snapshot,attributes_json,price_vnd)
    VALUES (?,?,?,?,?,?)`).run(variantId, storeId, sku, 'Test product', '{"color":"black"}', 8_990_000n);
}

test('POS-013 migration v1 is atomic, file-backed, idempotent, WAL and strict', (t) => {
  const {file,open} = temporaryDatabase(t);
  let db = open(file);
  assert.equal(getLocalSchemaVersion(db), SQLITE_SCHEMA_VERSION);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.equal(db.prepare('PRAGMA synchronous').get().synchronous, 2);
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode.toLowerCase(), 'wal');
  assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout, 5000);
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x => x.name);
  assert.deepEqual(names, [
    'local_catalog_variants','local_device_metadata','local_inventory_balances','local_payments',
    'local_sale_items','local_sales','local_schema_migrations','outbox_events','sync_cursors',
  ]);
  assert.equal(count(db, 'local_schema_migrations'), 1);
  db.close();
  assert.equal(existsSync(file), true);
  db = open(file);
  assert.equal(getLocalSchemaVersion(db), 1);
  assert.equal(count(db, 'local_schema_migrations'), 1);
  db.close();
});

test('rollback on injected failure leaves neither sale, payment, stock delta nor event', (t) => {
  const {file,open} = temporaryDatabase(t);
  const db = open(file);
  insertVariant(db);
  assert.throws(() => withLocalTransaction(db, () => {
    db.prepare(`INSERT INTO local_sales
      (sale_id,store_id,device_id,cashier_id,client_created_at,total_vnd)
      VALUES (?,?,?,?,?,?)`).run('sale-fail','store1','dev1','cashier1','2026-11-07T00:00:00Z',8_990_000n);
    db.prepare(`INSERT INTO local_payments
      (payment_id,sale_id,method,due_vnd,tendered_vnd,change_vnd)
      VALUES (?,?,?,?,?,?)`).run('pay-fail','sale-fail','CASH',8_990_000n,9_000_000n,10_000n);
    db.prepare(`INSERT INTO local_inventory_balances
      (store_id,variant_id,server_qty,pending_delta) VALUES (?,?,?,?)`)
      .run('store1','v1',10n,-1n);
    throw new Error('simulated crash before commit');
  }), /simulated crash/);
  assert.equal(count(db, 'local_sales'), 0);
  assert.equal(count(db, 'local_payments'), 0);
  assert.equal(count(db, 'local_inventory_balances'), 0);
  assert.equal(count(db, 'outbox_events'), 0);
});

test('committed sale/items/CASH/stock/outbox remain on disk after close/reopen', (t) => {
  const {file,open} = temporaryDatabase(t);
  let db = open(file);
  insertVariant(db);
  withLocalTransaction(db, () => {
    db.prepare('INSERT INTO local_inventory_balances (store_id,variant_id,server_qty,pending_delta) VALUES (?,?,?,?)')
      .run('store1','v1',10n,-1n);
    db.prepare(`INSERT INTO local_sales
      (sale_id,store_id,device_id,cashier_id,client_created_at,total_vnd)
      VALUES (?,?,?,?,?,?)`).run('sale1','store1','dev1','cashier1','2026-11-07T00:00:00Z',8_990_000n);
    db.prepare(`INSERT INTO local_sale_items
      (item_id,store_id,sale_id,variant_id,sku_snapshot,name_snapshot,
       attributes_snapshot_json,quantity,unit_price_vnd,discount_vnd,line_total_vnd)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run('item1','store1','sale1','v1','SKU-A','Test product','{"color":"black"}',1,8_990_000n,0n,8_990_000n);
    db.prepare(`INSERT INTO local_payments
      (payment_id,sale_id,method,due_vnd,tendered_vnd,change_vnd)
      VALUES (?,?,?,?,?,?)`).run('payment1','sale1','CASH',8_990_000n,9_000_000n,10_000n);
    db.prepare(`INSERT INTO outbox_events
      (event_id,sale_id,store_id,device_id,payload_json,payload_hash,created_at)
      VALUES (?,?,?,?,?,?,?)`)
      .run('event1','sale1','store1','dev1','{"schema_version":1}', 'a'.repeat(64), '2026-11-07T00:00:00Z');
  });
  db.close();
  db = open(file);
  assert.equal(count(db, 'local_sales'), 1);
  assert.equal(count(db, 'local_sale_items'), 1);
  assert.equal(count(db, 'local_payments'), 1);
  assert.equal(count(db, 'outbox_events'), 1);
  assert.equal(db.prepare('SELECT pending_delta FROM local_inventory_balances').get().pending_delta, -1);
  assert.equal(db.prepare('SELECT state FROM outbox_events').get().state, 'PENDING');
  // Sync state can move forward, but local cash evidence cannot be edited.
  db.prepare("UPDATE local_sales SET sync_status='SYNCED' WHERE sale_id='sale1'").run();
  db.prepare("UPDATE outbox_events SET state='SYNCED' WHERE event_id='event1'").run();
  assert.throws(() => db.prepare("UPDATE local_sales SET total_vnd=0 WHERE sale_id='sale1'").run(), /immutable/);
  assert.throws(() => db.prepare("DELETE FROM local_sales WHERE sale_id='sale1'").run(), /cannot be deleted/);
  assert.throws(() => db.prepare("UPDATE local_payments SET tendered_vnd=0 WHERE sale_id='sale1'").run(), /immutable/);
  assert.throws(() => db.prepare("DELETE FROM local_sale_items WHERE item_id='item1'").run(), /cannot be deleted/);
  assert.throws(() => db.prepare("UPDATE outbox_events SET payload_hash=? WHERE event_id='event1'").run('b'.repeat(64)), /immutable/);
  assert.throws(() => db.prepare("DELETE FROM outbox_events WHERE event_id='event1'").run(), /cannot be deleted/);
  db.close();
});

test('SQLite enforces per-store SKU, same-store FK, CASH, quantity and bigint money', (t) => {
  const {file,open} = temporaryDatabase(t);
  const db = open(file);
  insertVariant(db);
  assert.throws(() => insertVariant(db, 'v2', 'store1', 'SKU-A'), /UNIQUE/);
  assert.throws(() => db.prepare(`INSERT INTO local_catalog_variants
    (variant_id,store_id,sku,name_snapshot,attributes_json,price_vnd)
    VALUES (?,?,?,?,?,?)`).run('v3','store1','SKU-B','Another','{}',-1n), /CHECK/);
  assert.throws(() => db.prepare('INSERT INTO local_inventory_balances (store_id,variant_id,server_qty) VALUES (?,?,?)')
    .run('other-store','v1',3n), /FOREIGN KEY/);
  assert.throws(() => db.prepare('INSERT INTO local_inventory_balances (store_id,variant_id,server_qty,pending_delta) VALUES (?,?,?,?)')
    .run('store1','v1',3n,1n), /CHECK/);
  db.prepare(`INSERT INTO local_sales
    (sale_id,store_id,device_id,cashier_id,client_created_at,total_vnd)
    VALUES (?,?,?,?,?,?)`).run('sale1','store1','dev1','cashier','2026-11-07T00:00:00Z',9_007_199_254_740_993n);
  const totalStmt = db.prepare('SELECT total_vnd FROM local_sales');
  totalStmt.setReadBigInts(true);
  const total = totalStmt.get().total_vnd;
  assert.equal(total, 9_007_199_254_740_993n);
  assert.throws(() => db.prepare('INSERT INTO local_payments (payment_id,sale_id,method,due_vnd,tendered_vnd,change_vnd) VALUES (?,?,?,?,?,?)')
    .run('p1','sale1','CARD',100n,200n,100n), /CHECK/);
  assert.throws(() => db.prepare('INSERT INTO local_payments (payment_id,sale_id,method,due_vnd,tendered_vnd,change_vnd) VALUES (?,?,?,?,?,?)')
    .run('p1','sale1','CASH',100n,99n,0n), /CHECK/);
  assert.throws(() => db.prepare('INSERT INTO local_sale_items (item_id,store_id,sale_id,variant_id,sku_snapshot,name_snapshot,attributes_snapshot_json,quantity,unit_price_vnd,discount_vnd,line_total_vnd) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run('it1','store1','sale1','v1','SKU-A','Product','{}',0,100n,0n,0n), /CHECK/);
  assert.throws(() => db.prepare('INSERT INTO local_sale_items (item_id,store_id,sale_id,variant_id,sku_snapshot,name_snapshot,attributes_snapshot_json,quantity,unit_price_vnd,discount_vnd,line_total_vnd) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run('it1','store1','sale1','v1','SKU-A','Product','{}',1,100n,0n,99n), /CHECK/);
});

test('unknown, newer and tampered schema files are rejected without data deletion', (t) => {
  const {dir,open,openRaw} = temporaryDatabase(t);
  const legacyPath = join(dir, 'legacy.sqlite');
  let db = openRaw(legacyPath);
  db.exec('CREATE TABLE original_data (id INTEGER PRIMARY KEY, payload TEXT)');
  db.prepare('INSERT INTO original_data (id,payload) VALUES (?,?)').run(1,'preserve');
  db.close();
  assert.throws(() => openLocalDatabase(legacyPath), /Existing data was preserved/);
  db = openRaw(legacyPath);
  assert.equal(db.prepare('SELECT payload FROM original_data').get().payload, 'preserve');
  db.close();

  const futurePath = join(dir, 'future.sqlite');
  db = open(futurePath);
  db.exec('PRAGMA user_version = 99');
  db.close();
  assert.throws(() => openLocalDatabase(futurePath), /Existing data was preserved/);
  db = openRaw(futurePath);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 99);
  db.close();

  const tamperedPath = join(dir,'tampered.sqlite');
  db = open(tamperedPath);
  db.prepare("UPDATE local_schema_migrations SET name='tampered' WHERE version=1").run();
  db.close();
  assert.throws(() => openLocalDatabase(tamperedPath), /Existing data was preserved/);
});

test('WAL-consistent SQLite backup reopens as separate DB, never overwrites files', async (t) => {
  const {file,dir,open} = temporaryDatabase(t);
  const db = open(file);
  insertVariant(db);
  const backupFile = join(dir,'backups','snapshot.sqlite');
  await backupLocalDatabase(db,backupFile);
  const copy = open(backupFile);
  try {
    assert.equal(getLocalSchemaVersion(copy),1);
    assert.equal(count(copy,'local_catalog_variants'),1);
    assert.equal(copy.prepare('SELECT sku FROM local_catalog_variants').get().sku,'SKU-A');
  } finally {
    copy.close();
  }
  await assert.rejects(() => backupLocalDatabase(db,backupFile),/Refusing to overwrite/);
  await assert.rejects(() => backupLocalDatabase(db,file),/existing SQLite backup/);
  await assert.rejects(() => backupLocalDatabase(db,'relative.sqlite'),/absolute/);
});

test('Windows cleanup closes an intentionally open WAL SQLite handle before removing the temp directory', (t) => {
  const {file,dir,open} = temporaryDatabase(t);
  const db = open(file);
  insertVariant(db);
  assert.equal(db.isOpen, true);
  // Do not close manually; temporaryDatabase must close every tracked handle.
  // The after-hook is registered later, so it verifies cleanup has completed.
  t.after(() => {
    assert.equal(db.isOpen, false);
    assert.equal(existsSync(dir), false);
  });
});
