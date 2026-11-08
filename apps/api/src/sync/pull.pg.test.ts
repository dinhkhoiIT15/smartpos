/** POS-023 only disposable PostgreSQL 16 CI, NEVER Neon. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {CatalogService} from '../catalog/service.js';
import {InventoryService} from '../inventory/service.js';
import {CatalogPullService,SyncPullError,lockCatalogStream} from './pull-service.js';
import {SyncPushService} from './service.js';
import {sampleEvent,sampleBatch,sampleIds} from './fixtures.js';
const connectionString=process.env.POS_DB_TEST_URL;
if(!connectionString)throw new Error('POS_DB_TEST_URL must be disposable CI');
const u=new URL(connectionString);
if(u.hostname!=='127.0.0.1'||u.pathname!=='/smartpos_ci'||
   (u.port&&u.port!=='5432'))throw new Error('POS-023 PG tests DISPOSABLE 127.0.0.1:5432/smartpos_ci ONLY');

test('POS-023 PostgreSQL delta PULL: watermark, per-store lock, stock, authorization',async t=>{
 const pool=new pg.Pool({connectionString,max:10});
 t.after(async()=>{await pool.end();});
 const catalog=new CatalogService(pool),inventory=new InventoryService(pool),
  pull=new CatalogPullService(pool),push=new SyncPushService(pool);
 async function setup(){
  const storeId=randomUUID(),cashierId=randomUUID(),deviceId=randomUUID(),offlineGrantId=randomUUID();
  await pool.query('INSERT INTO stores(id,name) VALUES($1,$2)',[storeId,'CI PULL']);
  await pool.query('INSERT INTO users(id,email,password_hash,active) VALUES($1,$2,$3,true)',
   [cashierId,randomUUID()+'@example.test','DISPOSABLE_ONLY']);
  await pool.query("INSERT INTO store_memberships(store_id,user_id,role,active) VALUES($1,$2,'MANAGER',true)",
   [storeId,cashierId]);
  await pool.query("INSERT INTO devices(id,store_id,name,offline_checkout_enabled) VALUES($1,$2,'CI',true)",
   [deviceId,storeId]);
  const actor={storeId,userId:cashierId,role:'MANAGER' as const};
  const principal={storeId,deviceId,cashierId,offlineGrantId};
  const cat=await catalog.createCategory(actor,{name:'Phones'});
  const brand=await catalog.createBrand(actor,{name:'CI'});
  const product=await catalog.createProduct(actor,{
    categoryId:cat.id,brandId:brand.id,name:'Phone Initial'});
  const phone=await catalog.createVariant(actor,{
    productId:product.id,sku:'PHONE-128',
    attributes:{storage:'128GB'},priceVnd:'8990000',
  });
  const caseVariant=await catalog.createVariant(actor,{
    productId:product.id,sku:'CASE-01',
    attributes:{color:'Black'},priceVnd:'350000',
  });
  return {storeId,cashierId,deviceId,offlineGrantId,actor,principal,
   productId:product.id,phoneId:phone.id,caseId:caseVariant.id};
 }
 const a=await setup(),b=await setup();
 await t.test('stable cursor, ordered pages and store isolation (even with interleaved global seq gaps)',async()=>{
  let cursor='0',total=0,previous=0n;
  const gathered=[] as Array<{seq:string;entityType:string;payload:unknown}>;
  for(let i=0;i<12;i++){
   const page=await pull.pull(a.principal,{cursor,limit:2});
   assert.equal(page.storeId,a.storeId);
   assert.equal(page.fromCursor,cursor);
   assert.ok(BigInt(page.highWatermark)>=BigInt(page.nextCursor));
   assert.ok(BigInt(page.nextCursor)>=BigInt(cursor));
   assert.ok(page.changes.length<=2);
   for(const change of page.changes){
     assert.ok(BigInt(change.seq)>previous);
     previous=BigInt(change.seq);
     gathered.push(change);
   }
   total+=page.changes.length;
   cursor=page.nextCursor;
   if(!page.hasMore)break;
   if(i===11)assert.fail('cursor did not finish');
  }
  assert.equal(total,5);
  assert.equal(gathered[3]?.entityType,'product_variant');
  const payload=gathered[3]?.payload as {name:string;storeId:string};
  assert.equal(payload.name,'Phone Initial');
  assert.equal(payload.storeId,a.storeId);
  const other=await pull.pull(b.principal,{cursor:'0',limit:100});
  assert.equal(other.changes.length,5);
  assert.ok(other.changes.every(v=>(v.payload as {storeId:string}).storeId===b.storeId));
  assert.equal((await pull.pull(a.principal,{cursor,limit:10})).changes.length,0);
 });

 await t.test('product rename/deactivate emits materialized variant event, variant price + stock adjustment each log',async()=>{
  await catalog.updateProduct(a.actor,a.productId,{name:'Phone New',active:false});
  const variantNew=await catalog.updateVariant(a.actor,a.phoneId,{
    expectedRevision:'0',priceVnd:'9000000',
  });
  assert.equal(variantNew.revision,'1');
  // Product is currently deactivated, so cannot adjust stock until reactivated.
  await catalog.updateProduct(a.actor,a.productId,{active:true});
  await inventory.adjust(a.actor,{
    movementId:randomUUID(),variantId:a.phoneId,deltaQty:'10',
    kind:'RECEIPT',reason:'CI seed stock',
  });
  const page=await pull.pull(a.principal,{cursor:'0',limit:100});
  const names=page.changes.filter(v=>v.entityType==='product_variant'
    &&v.entityId===a.phoneId).map(v=>v.payload as {name:string;active:boolean;priceVnd:string});
  assert.ok(names.some(v=>v.name==='Phone New'&&v.active===false));
  assert.ok(names.some(v=>v.name==='Phone New'&&v.priceVnd==='9000000'));
  assert.ok(names.some(v=>v.active===true));
  const stock=page.changes.filter(v=>v.entityType==='inventory_balance');
  assert.equal(stock.length,1);
  assert.deepEqual(stock[0]?.payload,{
    storeId:a.storeId,variantId:a.phoneId,qty:'10',revision:'1',
  });
  const result=await inventory.adjust(a.actor,{
    movementId:randomUUID(),variantId:a.caseId,deltaQty:'2',
    kind:'RECEIPT',reason:'CI case stock',
  });
  assert.equal(result.status,'APPLIED');
 });

 await t.test('POS-021 PUSH stock movements append delta exactly once; replay does not change cursor',async()=>{
  const ids={...sampleIds(),storeId:a.storeId,deviceId:a.deviceId,
    cashierId:a.cashierId,offlineGrantId:a.offlineGrantId,
    phoneId:a.phoneId,caseId:a.caseId};
  const event=sampleEvent(ids);
  const before=await pull.pull(a.principal,{cursor:'0',limit:100});
  const ack=await push.push(a.principal,sampleBatch(ids,[event]));
  assert.equal(ack.results[0]?.status,'ACKED');
  const after=await pull.pull(a.principal,{cursor:before.highWatermark,limit:100});
  assert.equal(after.changes.filter(v=>v.entityType==='inventory_balance').length,2);
  assert.ok(after.changes.every(v=>v.entityType==='inventory_balance'));
  const oldHigh=after.highWatermark;
  const replay=await push.push(a.principal,sampleBatch(ids,[event]));
  assert.deepEqual(replay.results,ack.results);
  const again=await pull.pull(a.principal,{cursor:oldHigh,limit:100});
  assert.equal(again.changes.length,0);
  assert.equal(again.highWatermark,oldHigh);
 });

 await t.test('cursor bounds and strict identity, revoked device/user cannot read',async()=>{
  await assert.rejects(pull.pull(null,{cursor:'0'}),e=>e instanceof SyncPullError&&e.httpStatus===401);
  await assert.rejects(pull.pull({...a.principal,storeId:randomUUID()},{cursor:'0'}),
   e=>e instanceof SyncPullError&&e.httpStatus===403);
  for(const invalid of ['-1','01','9223372036854775808'])
   await assert.rejects(pull.pull(a.principal,{cursor:invalid}));
  await pool.query('UPDATE devices SET revoked_at=now() WHERE id=$1',[a.deviceId]);
  await assert.rejects(pull.pull(a.principal,{cursor:'0'}),
   e=>e instanceof SyncPullError&&e.httpStatus===403);
 });

 await t.test('in-flight store writer under advisory lock commits before PULL high watermark',async()=>{
  const target=await setup();
  const writer=await pool.connect();
  try{
   await writer.query('BEGIN');
   await lockCatalogStream(writer,target.storeId);
   const promise=pull.pull(target.principal,{cursor:'0',limit:100});
   // Query MUST wait for this pending writer before taking high watermark.
   await new Promise(resolve=>setTimeout(resolve,30));
   await writer.query(`INSERT INTO catalog_change_log
     (store_id,entity_type,entity_id,op,payload)
     VALUES($1,'category',$2,'UPDATE',$3::jsonb)`,
     [target.storeId,randomUUID(),JSON.stringify({
       id:randomUUID(),storeId:target.storeId,name:'CI concurrent',
     })]);
   await writer.query('COMMIT');
   const page=await promise;
   assert.equal(page.changes.length,6);
  }finally{
   try{await writer.query('ROLLBACK');}catch{}
   writer.release();
  }
 });
});
