/** POS-021 disposable PostgreSQL 16 integration: NEVER Neon or production. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { SyncPushService, SyncApplyError } from './service.js';
import { sampleIds,sampleEvent,sampleBatch,type TestIds } from './fixtures.js';
import { parsePushBatch, type PushEvent } from './schema.js';

const dbUrl=process.env.POS_DB_TEST_URL;
if(!dbUrl)throw new Error('POS_DB_TEST_URL required (disposable CI only)');
const url=new URL(dbUrl);
if(url.hostname!=='127.0.0.1'||url.pathname!=='/smartpos_ci' ||
  (url.port&&url.port!=='5432'))throw new Error('POS-021 tests allow localhost:5432/smartpos_ci ONLY');

test('POS-021 PostgreSQL: transaction, idempotency, concurrency, conflict, rollback',async t=>{
 const pool=new pg.Pool({connectionString:dbUrl,max:12});
 t.after(async()=>{await pool.end();});
 const svc=new SyncPushService(pool);
 const count=async(table:string,key:string,column:string)=>{
  const result=await pool.query<{n:string}>(
    'SELECT count(*)::text AS n FROM '+table+' WHERE '+column+'=$1',[key]);
  return Number(result.rows[0]?.n);
 };
 type Fixture={ids:TestIds;ctx:{storeId:string;deviceId:string;cashierId:string;offlineGrantId:string}};
 async function seed(qty='5'):Promise<Fixture>{
  const ids=sampleIds();
  const {storeId,deviceId,cashierId,offlineGrantId,phoneId,caseId}=ids;
  const categoryId=randomUUID(),brandId=randomUUID(),productId=randomUUID();
  await pool.query('INSERT INTO stores(id,name) VALUES($1,$2)',[storeId,'CI-SYNTHETIC']);
  await pool.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)',
    [cashierId,randomUUID()+'@example.test','FAKE_HASH_FOR_DISPOSABLE_TEST']);
  await pool.query("INSERT INTO store_memberships(store_id,user_id,role) VALUES($1,$2,'CASHIER')",
    [storeId,cashierId]);
  await pool.query("INSERT INTO devices(id,store_id,name,offline_checkout_enabled) VALUES($1,$2,'CI',true)",
    [deviceId,storeId]);
  await pool.query('INSERT INTO categories(id,store_id,name) VALUES($1,$2,$3)',
    [categoryId,storeId,'CI']);
  await pool.query('INSERT INTO brands(id,store_id,name) VALUES($1,$2,$3)',
    [brandId,storeId,'CI']);
  await pool.query('INSERT INTO products(id,store_id,category_id,brand_id,name) VALUES($1,$2,$3,$4,$5)',
    [productId,storeId,categoryId,brandId,'CI-SKU']);
  for(const [variantId,sku,price] of [[phoneId,'PHONE-128','8990000'],
      [caseId,'CASE-01','350000']]){
    await pool.query(`INSERT INTO product_variants
      (id,store_id,product_id,sku,attributes,attributes_key,price_vnd)
      VALUES($1,$2,$3,$4,'{}'::jsonb,$5,$6::bigint)`,
      [variantId,storeId,productId,sku,randomUUID(),price]);
    await pool.query(`INSERT INTO inventory_balances(store_id,variant_id,qty)
      VALUES($1,$2,$3::bigint)`,[storeId,variantId,qty]);
  }
  return {ids,ctx:{storeId,deviceId,cashierId,offlineGrantId}};
 }
 const qty=async(f:Fixture,variantId:string)=>{
  const res=await pool.query<{qty:string}>(`SELECT qty::text FROM inventory_balances
    WHERE store_id=$1 AND variant_id=$2`,[f.ids.storeId,variantId]);
  return res.rows[0]?.qty;
 };
 const push=(f:Fixture,e:PushEvent)=>svc.push(f.ctx,sampleBatch(f.ids,[e]));

 await t.test('atomic POSTED sale, two immutable items, cash and exact durable ACK/replay',async()=>{
  const f=await seed(),event=sampleEvent(f.ids);
  const first=(await push(f,event)).results[0]!;
  assert.equal(first.status,'ACKED');
  assert.equal(first.resultCode,'APPLIED');
  assert.equal(await qty(f,f.ids.phoneId),'4');
  assert.equal(await qty(f,f.ids.caseId),'4');
  assert.equal(await count('sale_items',event.saleId,'sale_id'),2);
  assert.equal(await count('inventory_movements',event.saleId,'sale_id'),2);
  assert.equal(await count('payments',event.saleId,'sale_id'),1);
  const payment=await pool.query<{due_vnd:string;tendered_vnd:string;change_vnd:string}>(`
    SELECT due_vnd::text,tendered_vnd::text,change_vnd::text
    FROM payments WHERE sale_id=$1`,[event.saleId]);
  assert.deepEqual(payment.rows[0],{due_vnd:'9340000',tendered_vnd:'9500000',change_vnd:'160000'});
  const receipt=await pool.query<{ack_json:unknown;payload_hash:string}>(`
    SELECT ack_json,payload_hash FROM sync_receipts WHERE sale_id=$1`,[event.saleId]);
  assert.deepEqual(receipt.rows[0]?.ack_json,first);
  assert.equal(receipt.rows[0]?.payload_hash,event.payloadHash);
  assert.deepEqual((await push(f,event)).results[0],first);
  assert.equal(await qty(f,f.ids.phoneId),'4');
 });

 await t.test('8 concurrent retries give identical ACK, one sale and one movement per SKU',async()=>{
  const f=await seed(),e=sampleEvent(f.ids);
  const replies=await Promise.all(Array.from({length:8},()=>push(f,e)));
  for(const reply of replies)assert.deepEqual(reply.results[0],replies[0]?.results[0]);
  assert.equal(await count('sales',e.saleId,'id'),1);
  assert.equal(await count('sync_receipts',e.saleId,'sale_id'),1);
  assert.equal(await count('inventory_movements',e.saleId,'sale_id'),2);
  assert.equal(await qty(f,f.ids.phoneId),'4');
 });

 await t.test('lost ACK after a new PostgreSQL pool/session replays the original durable receipt',async()=>{
  const f=await seed(),e=sampleEvent(f.ids);
  const original=(await push(f,e)).results[0];
  const newPool=new pg.Pool({connectionString:dbUrl,max:2});
  try{
    const restarted=new SyncPushService(newPool);
    const again=(await restarted.push(f.ctx,sampleBatch(f.ids,[e]))).results[0];
    assert.deepEqual(again,original);
    assert.equal(await count('sales',e.saleId,'id'),1);
    assert.equal(await count('inventory_movements',e.saleId,'sale_id'),2);
    assert.equal(await qty(f,f.ids.phoneId),'4');
  }finally{await newPool.end();}
 });

 await t.test('sale/event ID collision and changed hash return NEEDS_REVIEW, no double stock',async()=>{
  const f=await seed(),e=sampleEvent(f.ids);
  const ack=(await push(f,e)).results[0];
  const changed=sampleEvent(f.ids,{eventId:e.eventId,saleId:e.saleId});
  assert.equal((await push(f,changed)).results[0]?.resultCode,'PAYLOAD_HASH_MISMATCH');
  assert.equal((await push(f,sampleEvent(f.ids,{saleId:e.saleId}))).results[0]?.resultCode,'DUPLICATE_SALE');
  assert.equal((await push(f,sampleEvent(f.ids,{eventId:e.eventId}))).results[0]?.status,'NEEDS_REVIEW');
  assert.equal(await qty(f,f.ids.phoneId),'4');
  assert.equal(await count('sales',e.saleId,'id'),1);
  assert.deepEqual((await push(f,e)).results[0],ack);
 });

 await t.test('two concurrent distinct sales can yield negative cloud stock ONLY with conflicts',async()=>{
  const f=await seed('1'),a=sampleEvent(f.ids),b=sampleEvent(f.ids);
  const answers=await Promise.all([push(f,a),push(f,b)]);
  assert.deepEqual(answers.map(r=>r.results[0]?.resultCode).sort(),
    ['APPLIED','STOCK_SHORTAGE_RECONCILIATION']);
  assert.equal(await qty(f,f.ids.phoneId),'-1');
  assert.equal(await qty(f,f.ids.caseId),'-1');
  assert.equal(await count('sync_conflicts',a.saleId,'sale_id')+
    await count('sync_conflicts',b.saleId,'sale_id'),2);
  assert.equal(await count('inventory_movements',a.saleId,'sale_id')+
    await count('inventory_movements',b.saleId,'sale_id'),4);
  assert.deepEqual((await push(f,b)).results[0],answers[1]?.results[0]);
 });

 await t.test('stale price retains CASH snapshot and writes manager conflict',async()=>{
  const f=await seed(),e=sampleEvent(f.ids);
  await pool.query('UPDATE product_variants SET price_vnd=1,revision=revision+1 WHERE id=$1',
    [f.ids.phoneId]);
  const r=(await push(f,e)).results[0];
  assert.equal(r?.status,'ACKED');
  assert.equal(r?.resultCode,'STALE_PRICE_REVIEW');
  assert.equal(r?.conflictIds.length,1);
  const row=await pool.query<{unit_price_vnd:string}>(`
    SELECT unit_price_vnd::text FROM sale_items WHERE sale_id=$1 AND variant_id=$2`,
    [e.saleId,f.ids.phoneId]);
  assert.equal(row.rows[0]?.unit_price_vnd,'8990000');
 });

 await t.test('wrong principal, revoked device and inactive membership deny all mutation',async()=>{
  const f=await seed(),e=sampleEvent(f.ids),other=await seed();
  await assert.rejects(()=>svc.push({...f.ctx,deviceId:other.ids.deviceId},sampleBatch(f.ids,[e])),
    (err:unknown)=>err instanceof SyncApplyError&&err.code==='FORBIDDEN');
  await pool.query('UPDATE devices SET revoked_at=now() WHERE id=$1',[f.ids.deviceId]);
  await assert.rejects(()=>push(f,e),
    (err:unknown)=>err instanceof SyncApplyError&&err.code==='FORBIDDEN');
  assert.equal(await count('sales',e.saleId,'id'),0);
  const second=await seed(),next=sampleEvent(second.ids);
  await pool.query('UPDATE store_memberships SET active=false WHERE store_id=$1',
    [second.ids.storeId]);
  await assert.rejects(()=>push(second,next),
    (err:unknown)=>err instanceof SyncApplyError&&err.code==='FORBIDDEN');
  assert.equal(await count('sales',next.saleId,'id'),0);
 });

 await t.test('foreign-store SKU and malformed hash fail closed, no partial sale or stock',async()=>{
  const f=await seed(),other=await seed(),original=sampleEvent(f.ids);
  const lines=original.sale.items.map((item,i)=>
    i===0?{...item,variantId:other.ids.phoneId}:item);
  const e=sampleEvent(f.ids,{sale:{...original.sale,items:lines}});
  assert.equal((await push(f,e)).results[0]?.resultCode,'INVALID_EVENT');
  assert.equal(await count('sales',e.saleId,'id'),0);
  assert.equal(await qty(f,f.ids.phoneId),'5');
  assert.throws(()=>parsePushBatch(sampleBatch(f.ids,[{...e,payloadHash:'a'.repeat(64)}])));
 });

 await t.test('late sync_receipt INSERT failure rolls back ALL writes; retry then applies once',async()=>{
  const f=await seed(),e=sampleEvent(f.ids);
  await pool.query(`CREATE OR REPLACE FUNCTION pos021_fail_receipt_insert() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'test-only receipt failure'; RETURN NEW; END $$`);
  await pool.query(`CREATE TRIGGER pos021_fail_receipt BEFORE INSERT ON sync_receipts
    FOR EACH ROW EXECUTE FUNCTION pos021_fail_receipt_insert()`);
  try{
    assert.equal((await push(f,e)).results[0]?.status,'RETRY');
    for(const [table,col] of [['sales','id'],['payments','sale_id'],['sale_items','sale_id'],
      ['inventory_movements','sale_id'],['sync_receipts','sale_id']]){
      assert.equal(await count(table!,e.saleId,col!),0);
    }
    assert.equal(await qty(f,f.ids.phoneId),'5');
  }finally{
    await pool.query('DROP TRIGGER IF EXISTS pos021_fail_receipt ON sync_receipts');
    await pool.query('DROP FUNCTION IF EXISTS pos021_fail_receipt_insert()');
  }
  assert.equal((await push(f,e)).results[0]?.status,'ACKED');
  assert.equal(await count('sales',e.saleId,'id'),1);
  assert.equal(await qty(f,f.ids.phoneId),'4');
 });

 await t.test('exact VND greater than JS safe integer survives PostgreSQL BIGINT',async()=>{
  const f=await seed(),price='9007199254740993',base=sampleEvent(f.ids);
  await pool.query('UPDATE product_variants SET price_vnd=$1 WHERE id=$2',
    [price,f.ids.phoneId]);
  const item={...base.sale.items[0]!,unitPriceVnd:price,lineTotalVnd:price};
  const e=sampleEvent(f.ids,{sale:{status:'POSTED',totalVnd:price,items:[item],
    payment:{method:'CASH',dueVnd:price,tenderedVnd:'9007199254740994',changeVnd:'1'}}});
  assert.equal((await push(f,e)).results[0]?.status,'ACKED');
  const result=await pool.query<{total_vnd:string}>(
    'SELECT total_vnd::text FROM sales WHERE id=$1',[e.saleId]);
  assert.equal(result.rows[0]?.total_vnd,price);
 });
});
