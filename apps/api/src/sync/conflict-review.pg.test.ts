/** POS-024: real PostgreSQL 16 on disposable CI ONLY; never Neon. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {sampleIds,sampleEvent,sampleBatch,type TestIds} from './fixtures.js';
import {SyncPushService} from './service.js';
import {ConflictReviewService,ConflictReviewError,type ConflictPrincipal} from './conflict-review.js';

const dbUrl = process.env.POS_DB_TEST_URL;
if (!dbUrl) throw new Error('POS_DB_TEST_URL required: disposable PostgreSQL CI only');
const url = new URL(dbUrl);
if (url.hostname !== '127.0.0.1' || url.pathname !== '/smartpos_ci' ||
    (url.port && url.port !== '5432'))
  throw new Error('POS-024 PG tests allow localhost:5432/smartpos_ci ONLY');

test('POS-024 manager review: real POS-021 conflicts, audit and immutable evidence', async t => {
  const pool = new pg.Pool({connectionString: dbUrl, max: 12});
  t.after(async () => pool.end());
  const push = new SyncPushService(pool), reviews = new ConflictReviewService(pool);

  type Fixture = {
    ids: TestIds; manager: ConflictPrincipal; cashier: ConflictPrincipal;
    eventId: string; saleId: string;
  };
  async function seed(): Promise<Fixture> {
    const ids = sampleIds();
    const managerId = randomUUID(), categoryId = randomUUID(),
      brandId = randomUUID(), productId = randomUUID();
    await pool.query('INSERT INTO stores(id,name) VALUES($1,$2)',
      [ids.storeId, 'POS024-SYNTHETIC']);
    for (const userId of [ids.cashierId,managerId]) {
      await pool.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)',
        [userId, randomUUID() + '@example.test', 'SYNTHETIC_NEVER_LIVE']);
      await pool.query('INSERT INTO store_memberships(store_id,user_id,role) VALUES($1,$2,$3)',
        [ids.storeId,userId,userId===managerId?'MANAGER':'CASHIER']);
    }
    await pool.query(`INSERT INTO devices(id,store_id,name,offline_checkout_enabled)
      VALUES($1,$2,'POS024-FAKE',true)`, [ids.deviceId,ids.storeId]);
    await pool.query('INSERT INTO categories(id,store_id,name) VALUES($1,$2,$3)',
      [categoryId,ids.storeId,'TEST']);
    await pool.query('INSERT INTO brands(id,store_id,name) VALUES($1,$2,$3)',
      [brandId,ids.storeId,'TEST']);
    await pool.query(`INSERT INTO products(id,store_id,category_id,brand_id,name)
      VALUES($1,$2,$3,$4,'POS024-SYNTHETIC')`,
      [productId,ids.storeId,categoryId,brandId]);
    for (const [variantId,sku,price] of [
      [ids.phoneId,'PHONE-128','1'], // stale price
      [ids.caseId,'CASE-01','350000'],
    ]) {
      await pool.query(`INSERT INTO product_variants
        (id,store_id,product_id,sku,attributes,attributes_key,price_vnd)
        VALUES($1,$2,$3,$4,'{}'::jsonb,$5,$6::bigint)`,
        [variantId,ids.storeId,productId,sku,randomUUID(),price]);
      await pool.query(`INSERT INTO inventory_balances(store_id,variant_id,qty)
        VALUES($1,$2,0)`, [ids.storeId,variantId]);
    }
    const event = sampleEvent(ids);
    const ctx = {storeId:ids.storeId, deviceId:ids.deviceId,
      cashierId:ids.cashierId, offlineGrantId:ids.offlineGrantId};
    const ack = (await push.push(ctx,sampleBatch(ids,[event]))).results[0]!;
    assert.equal(ack.status,'ACKED');
    assert.equal(ack.resultCode,'STOCK_SHORTAGE_RECONCILIATION');
    assert.equal(ack.conflictIds.length,3); // two shortage + one stale price
    return {
      ids,eventId:event.eventId,saleId:event.saleId,
      manager:{storeId:ids.storeId,userId:managerId,role:'MANAGER'},
      cashier:{storeId:ids.storeId,userId:ids.cashierId,role:'CASHIER'},
    };
  }
  const count = async (table:string, col:string, value:string) => {
    // table/column always fixed in tests, never user input.
    const found = await pool.query<{n:string}>(
      'SELECT count(*)::text AS n FROM '+table+' WHERE '+col+'=$1',[value]);
    return Number(found.rows[0]?.n);
  };

  await t.test('store-scoped shortage/stale-price queue includes sale context and exact VND',async()=>{
    const f = await seed();
    const open = await reviews.list(f.manager,{status:'OPEN',limit:'10',offset:'0'});
    const own = open.filter(v=>v.saleId===f.saleId);
    assert.equal(own.length,3);
    assert.equal(own.filter(v=>v.kind==='STOCK_SHORTAGE').length,2);
    assert.equal(own.filter(v=>v.kind==='STALE_PRICE').length,1);
    for (const c of own) {
      assert.equal(c.eventId,f.eventId);
      assert.equal(c.sale.totalVnd,'9340000');
      assert.equal(c.status,'OPEN');
      assert.equal((await reviews.get(f.manager,c.conflictId)).conflictId,c.conflictId);
    }
    assert.deepEqual((await reviews.list(f.manager,{limit:1})).length,1);
  });

  await t.test('manager notes: atomic status + single audit; retries replay, no cash/stock edits',async()=>{
    const f = await seed();
    const conflict = (await reviews.list(f.manager,{limit:100})).find(
      x=>x.saleId===f.saleId && x.kind==='STOCK_SHORTAGE')!;
    const beforeSale = await pool.query('SELECT * FROM sales WHERE id=$1',[f.saleId]);
    const beforePayment = await pool.query('SELECT * FROM payments WHERE sale_id=$1',[f.saleId]);
    const beforeItems = await pool.query('SELECT * FROM sale_items WHERE sale_id=$1 ORDER BY id',[f.saleId]);
    const beforeBalances = await pool.query(`
      SELECT variant_id,qty::text AS qty,revision::text AS revision
      FROM inventory_balances WHERE store_id=$1 ORDER BY variant_id`, [f.ids.storeId]);
    const beforeReceipt = await pool.query('SELECT * FROM sync_receipts WHERE sale_id=$1',[f.saleId]);
    const note = 'Inventory discrepancy investigated; separate adjustment required';
    const input = {resolutionId:randomUUID(),note};
    const replies = await Promise.all(Array.from({length:6},()=>
      reviews.resolve(f.manager,conflict.conflictId,input)));
    assert.equal(replies.filter(x=>x.outcome==='RESOLVED').length,1);
    assert.equal(replies.filter(x=>x.outcome==='REPLAYED').length,5);
    const after = await reviews.get(f.manager,conflict.conflictId);
    assert.equal(after.status,'RESOLVED');
    assert.equal(after.resolution?.note,note);
    assert.equal(after.resolution?.actorId,f.manager.userId);
    assert.ok(after.resolvedAt);
    assert.equal(await count('audit_logs','entity_id',conflict.conflictId),1);
    await assert.rejects(
      ()=>reviews.resolve(f.manager,conflict.conflictId,{resolutionId:randomUUID(),note}),
      (e:unknown)=>e instanceof ConflictReviewError && e.code==='ALREADY_RESOLVED');
    const where = [f.saleId];
    assert.deepEqual((await pool.query('SELECT * FROM sales WHERE id=$1',where)).rows,beforeSale.rows);
    assert.deepEqual((await pool.query('SELECT * FROM payments WHERE sale_id=$1',where)).rows,beforePayment.rows);
    assert.deepEqual((await pool.query('SELECT * FROM sale_items WHERE sale_id=$1 ORDER BY id',where)).rows,beforeItems.rows);
    assert.deepEqual((await pool.query(`SELECT variant_id,qty::text AS qty,revision::text AS revision
      FROM inventory_balances WHERE store_id=$1 ORDER BY variant_id`,
      [f.ids.storeId])).rows,beforeBalances.rows);
    assert.deepEqual((await pool.query('SELECT * FROM sync_receipts WHERE sale_id=$1',where)).rows,beforeReceipt.rows);
  });

  await t.test('cashier and revoked/changed manager denied; cross-store IDs hidden',async()=>{
    const a=await seed(),b=await seed();
    const c=(await reviews.list(a.manager,{limit:100})).find(x=>x.saleId===a.saleId)!;
    await assert.rejects(()=>reviews.list(a.cashier,{}),
      (e:unknown)=>e instanceof ConflictReviewError&&e.code==='FORBIDDEN');
    await assert.rejects(()=>reviews.get(b.manager,c.conflictId),
      (e:unknown)=>e instanceof ConflictReviewError&&e.code==='NOT_FOUND');
    await assert.rejects(()=>reviews.resolve(b.manager,c.conflictId,{
      resolutionId:randomUUID(),note:'Cross store mutation must be impossible'}),
      (e:unknown)=>e instanceof ConflictReviewError&&e.code==='NOT_FOUND');
    await pool.query(`UPDATE store_memberships SET role='CASHIER'
      WHERE store_id=$1 AND user_id=$2`,[a.ids.storeId,a.manager.userId]);
    await assert.rejects(()=>reviews.resolve(a.manager,c.conflictId,{
      resolutionId:randomUUID(),note:'Stale server role must not authorize'}),
      (e:unknown)=>e instanceof ConflictReviewError&&e.code==='FORBIDDEN');
    await pool.query('UPDATE users SET active=false WHERE id=$1',[b.manager.userId]);
    await assert.rejects(()=>reviews.list(b.manager,{}),
      (e:unknown)=>e instanceof ConflictReviewError&&e.code==='FORBIDDEN');
    assert.equal((await pool.query('SELECT status FROM sync_conflicts WHERE id=$1',
      [c.conflictId])).rows[0]?.status,'OPEN');
  });

  await t.test('audit insertion failure rolls back status and leaves conflict OPEN',async()=>{
    const f=await seed();
    const conflict=(await reviews.list(f.manager,{limit:100})).find(x=>x.saleId===f.saleId)!;
    await pool.query(`CREATE OR REPLACE FUNCTION pos024_fail_audit_insert() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='SYNC_CONFLICT_RESOLVED' THEN
        RAISE EXCEPTION 'synthetic audit failure';
      END IF;
      RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER pos024_fail_review_audit BEFORE INSERT ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION pos024_fail_audit_insert()`);
    try {
      await assert.rejects(()=>reviews.resolve(f.manager,conflict.conflictId,{
        resolutionId:randomUUID(),note:'Should be rolled back on failed audit insert'}),
        (e:unknown)=>e instanceof ConflictReviewError&&e.code==='DATABASE_UNAVAILABLE');
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS pos024_fail_review_audit ON audit_logs');
      await pool.query('DROP FUNCTION IF EXISTS pos024_fail_audit_insert()');
    }
    const current=await reviews.get(f.manager,conflict.conflictId);
    assert.equal(current.status,'OPEN');
    assert.equal(current.resolvedAt,null);
    assert.equal(await count('audit_logs','entity_id',conflict.conflictId),0);
    assert.equal((await reviews.resolve(f.manager,conflict.conflictId,{
      resolutionId:randomUUID(),note:'Successfully reviewed after DB rollback'})).outcome,'RESOLVED');
  });
});
