/**
 * Runs ONLY against ephemeral GitHub Actions PostgreSQL, never Neon.
 * The test DB must be named smartpos_ci and hosted on 127.0.0.1.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const connectionString = process.env.POS_DB_TEST_URL;
if (!connectionString) throw new Error('POS_DB_TEST_URL required for isolated CI migration test');
const parsed = new URL(connectionString);
if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/smartpos_ci') {
  throw new Error('Migration tests must run against disposable local smartpos_ci only');
}
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

async function failsWith(client: PoolClient, query: string, values: unknown[], code: string): Promise<void> {
  await client.query('SAVEPOINT invalid_write');
  try {
    await assert.rejects(
      client.query(query, values),
      (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === code,
      'Expected PostgreSQL error code ' + code,
    );
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT invalid_write');
    await client.query('RELEASE SAVEPOINT invalid_write');
  }
}

test('POS-012 migration v1 creates 17 tables and enforces retail invariants', async (t) => {
  const pool = new Pool({ connectionString, max: 2 });
  t.after(async () => pool.end());

  await t.test('initial migration applies and repeat migrate is idempotent', async () => {
    await migrate(drizzle(pool), { migrationsFolder });
    await migrate(drizzle(pool), { migrationsFolder });
    const expected = [
      'stores','users','store_memberships','devices','categories','brands',
      'products','product_variants','inventory_balances','inventory_movements',
      'sales','sale_items','payments','sync_receipts','sync_conflicts',
      'audit_logs','catalog_change_log',
    ];
    const tables = await pool.query<{ table_name: string }>(
      'SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_name = ANY($2)',
      ['public', expected],
    );
    assert.deepEqual(tables.rows.map((x) => x.table_name).sort(), expected.sort());
    const history = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations');
    assert.equal(history.rows[0]?.count, '1');
  });

  await t.test('one offline device per store, FK, SKU and negative price checks', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const store = randomUUID(), otherStore = randomUUID();
      const category = randomUUID(), brand = randomUUID(), product = randomUUID(), variant = randomUUID();
      const device = randomUUID(), secondDevice = randomUUID();
      await c.query('INSERT INTO stores (id, name) VALUES ($1, $2), ($3, $4)', [store,'Test Store',otherStore,'Other Store']);
      await c.query('INSERT INTO categories (id,store_id,name) VALUES ($1,$2,$3)', [category,store,'Phones']);
      await c.query('INSERT INTO brands (id,store_id,name) VALUES ($1,$2,$3)', [brand,store,'SmartPOS Test Brand']);
      await c.query('INSERT INTO products (id,store_id,category_id,brand_id,name) VALUES ($1,$2,$3,$4,$5)', [product,store,category,brand,'Phone']);
      await c.query('INSERT INTO devices (id,store_id,name,offline_checkout_enabled) VALUES ($1,$2,$3,true)', [device,store,'Cashier POS']);
      await failsWith(c,'INSERT INTO devices (id,store_id,name,offline_checkout_enabled) VALUES ($1,$2,$3,true)',[secondDevice,store,'Another offline POS'],'23505');
      await c.query('INSERT INTO devices (id,store_id,name,offline_checkout_enabled) VALUES ($1,$2,$3,false)', [secondDevice,store,'Online management']);
      await c.query('INSERT INTO product_variants (id,store_id,product_id,sku,attributes,attributes_key,price_vnd) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [variant,store,product,'SKU-BLK-128','{"color":"black"}','black-128','8990000']);
      await failsWith(c,'INSERT INTO product_variants (id,store_id,product_id,sku,attributes,attributes_key,price_vnd) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [randomUUID(),store,product,'SKU-BLK-128','{}','different-attributes','8990000'],'23505');
      await failsWith(c,'INSERT INTO product_variants (id,store_id,product_id,sku,attributes,attributes_key,price_vnd) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [randomUUID(),store,product,'NEGATIVE','{}','negative','-1'],'23514');
      await failsWith(c,'INSERT INTO product_variants (id,store_id,product_id,sku,attributes,attributes_key,price_vnd) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [randomUUID(),otherStore,product,'WRONG-STORE','{}','wrong-store','1'],'23503');
      // Signed stock can go negative only under reconciliation policy at service layer.
      await c.query('INSERT INTO inventory_balances (store_id,variant_id,qty,revision) VALUES ($1,$2,-1,0)',[store,variant]);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  await t.test('sales preserve snapshots, bigint cash constraints and no cascade delete', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const store = randomUUID(), employee = randomUUID(), device = randomUUID();
      const category = randomUUID(), brand = randomUUID(), product = randomUUID(), variant = randomUUID(), sale = randomUUID();
      const item = randomUUID(), payment = randomUUID();
      await c.query('INSERT INTO stores (id,name) VALUES ($1,$2)',[store,'Payments test store']);
      await c.query('INSERT INTO users (id,email,password_hash) VALUES ($1,$2,$3)',[employee,randomUUID()+'@example.test','NON_REAL_HASH']);
      await c.query('INSERT INTO store_memberships (store_id,user_id,role) VALUES ($1,$2,$3)',[store,employee,'CASHIER']);
      await c.query('INSERT INTO devices (id,store_id,name,offline_checkout_enabled) VALUES ($1,$2,$3,true)',[device,store,'POS']);
      await c.query('INSERT INTO categories (id,store_id,name) VALUES ($1,$2,$3)',[category,store,'Phones']);
      await c.query('INSERT INTO brands (id,store_id,name) VALUES ($1,$2,$3)',[brand,store,'Brand']);
      await c.query('INSERT INTO products (id,store_id,category_id,brand_id,name) VALUES ($1,$2,$3,$4,$5)',[product,store,category,brand,'Product']);
      await c.query('INSERT INTO product_variants (id,store_id,product_id,sku,attributes,attributes_key,price_vnd) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [variant,store,product,'SALE-SKU','{}','base','9340000']);
      const insertSale = 'INSERT INTO sales (id,store_id,device_id,cashier_id,client_created_at,total_vnd,status) VALUES ($1,$2,$3,$4,now(),$5,$6)';
      await failsWith(c,insertSale,[randomUUID(),store,device,employee,'-1','POSTED'],'23514');
      await c.query(insertSale,[sale,store,device,employee,'9340000','POSTED']);
      const itemSql='INSERT INTO sale_items (id,sale_id,variant_id,sku_snapshot,name_snapshot,attributes_snapshot,quantity,unit_price_vnd,discount_vnd,line_total_vnd) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)';
      await failsWith(c,itemSql,[randomUUID(),sale,variant,'SKU','Phone','{}',0,'9340000','0','9340000'],'23514');
      await failsWith(c,itemSql,[randomUUID(),sale,variant,'SKU','Phone','{}',1,'9340000','0','9000000'],'23514');
      await c.query(itemSql,[item,sale,variant,'SALE-SKU','Phone','{}',1,'9340000','0','9340000']);
      const paymentSql='INSERT INTO payments (id,sale_id,method,due_vnd,tendered_vnd,change_vnd) VALUES ($1,$2,$3,$4,$5,$6)';
      await failsWith(c,paymentSql,[randomUUID(),sale,'CARD','9340000','9500000','160000'],'23514');
      await failsWith(c,paymentSql,[randomUUID(),sale,'CASH','9340000','9500000','0'],'23514');
      await c.query(paymentSql,[payment,sale,'CASH','9340000','9500000','160000']);
      await failsWith(c,paymentSql,[randomUUID(),sale,'CASH','9340000','9500000','160000'],'23505');
      await failsWith(c,'DELETE FROM sales WHERE id=$1',[sale],'23503');
      const event = randomUUID();
      const receipt='INSERT INTO sync_receipts (device_id,event_id,sale_id,payload_hash,result_code,ack_json) VALUES ($1,$2,$3,$4,$5,$6)';
      await c.query(receipt,[device,event,sale,'fake_sha256','APPLIED','{}']);
      await failsWith(c,receipt,[device,event,sale,'other_hash','APPLIED','{}'],'23505');
      await failsWith(c,receipt,[device,randomUUID(),sale,'fake_sha256','APPLIED','{}'],'23505');
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });
});
