/** POS-026 disposable PostgreSQL16 integration ONLY, NEVER Neon. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {SyncPushService} from '../sync/service.js';
import {sampleIds,sampleEvent,sampleBatch,type TestIds} from '../sync/fixtures.js';
import {SalesReportService,SalesReportError} from './sales-report.js';
import type {CatalogPrincipal} from '../catalog/service.js';

const connectionString=process.env.POS_DB_TEST_URL;
if(!connectionString)throw new Error('POS_DB_TEST_URL required: disposable CI only');
const url=new URL(connectionString);
if(url.hostname!=='127.0.0.1'||url.pathname!=='/smartpos_ci'||
  (url.port&&url.port!=='5432'))throw new Error('POS-026 PG tests allow localhost:5432/smartpos_ci ONLY');
const id=()=>randomUUID();
const range=(from='2026-11-08',to='2026-11-09',extra:Record<string,unknown>={})=>({
 from,to,...extra,
});
test('POS-026 cloud-posted reporting from real POS-021 committed sales only',async t=>{
 const pool=new pg.Pool({connectionString,max:8});
 t.after(()=>pool.end());
 const push=new SyncPushService(pool),svc=new SalesReportService(pool);
 type Fixture={ids:TestIds;manager:CatalogPrincipal;cashier:CatalogPrincipal;
  second:CatalogPrincipal};
 async function seed():Promise<Fixture>{
  const ids=sampleIds(),managerId=id(),secondId=id();
  const categoryId=id(),brandId=id(),productId=id();
  await pool.query('INSERT INTO stores(id,name) VALUES($1,$2)',[ids.storeId,'POS026 CI']);
  for(const [userId,role] of [
   [managerId,'MANAGER'],[ids.cashierId,'CASHIER'],[secondId,'CASHIER'],
  ]) {
   await pool.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)',
     [userId,id()+'@example.test','SYNTHETIC_ONLY']);
   await pool.query('INSERT INTO store_memberships(store_id,user_id,role) VALUES($1,$2,$3)',
     [ids.storeId,userId,role]);
  }
  await pool.query('INSERT INTO devices(id,store_id,name,offline_checkout_enabled) VALUES($1,$2,$3,true)',
    [ids.deviceId,ids.storeId,'CI DEVICE']);
  await pool.query('INSERT INTO categories(id,store_id,name) VALUES($1,$2,$3)',
    [categoryId,ids.storeId,'CI']);
  await pool.query('INSERT INTO brands(id,store_id,name) VALUES($1,$2,$3)',
    [brandId,ids.storeId,'CI']);
  await pool.query('INSERT INTO products(id,store_id,category_id,brand_id,name) VALUES($1,$2,$3,$4,$5)',
    [productId,ids.storeId,categoryId,brandId,'CI']);
  for(const [v,sku,price] of [
   [ids.phoneId,'PHONE-128','8990000'],[ids.caseId,'CASE-01','350000'],
  ]){
   await pool.query(`INSERT INTO product_variants
     (id,store_id,product_id,sku,attributes,attributes_key,price_vnd)
     VALUES($1,$2,$3,$4,'{}'::jsonb,$5,$6::bigint)`,
     [v,ids.storeId,productId,sku,id(),price]);
   await pool.query('INSERT INTO inventory_balances(store_id,variant_id,qty) VALUES($1,$2,100)',
    [ids.storeId,v]);
  }
  return {ids,manager:{storeId:ids.storeId,userId:managerId,role:'MANAGER'},
    cashier:{storeId:ids.storeId,userId:ids.cashierId,role:'CASHIER'},
    second:{storeId:ids.storeId,userId:secondId,role:'CASHIER'}};
 }
 async function post(f:Fixture,at:string,cashierId=f.ids.cashierId){
  const ids={...f.ids,cashierId};
  const event=sampleEvent(ids,{clientCreatedAt:at});
  const out=await push.push({
   storeId:f.ids.storeId,deviceId:f.ids.deviceId,
   cashierId,offlineGrantId:ids.offlineGrantId,
  },sampleBatch(ids,[event]));
  assert.equal(out.results[0]?.status,'ACKED');
  return {event,ack:out.results[0]!};
 }

 await t.test('VN midnight, cashier scope, pagination, SKU distinct line totals, conflict flag',async()=>{
  const f=await seed(),a=await post(f,'2026-11-07T17:30:00.000Z'),
   b=await post(f,'2026-11-08T01:00:00.000Z',f.second.userId),
   c=await post(f,'2026-11-08T17:01:00.000Z');
  const snapshot=await svc.report(f.manager,range());
  assert.equal(snapshot.source,'CLOUD_POSTED');
  assert.equal(snapshot.dateBasis,'CLIENT_CREATED_AT');
  assert.equal(snapshot.matchedSaleCount,'3');
  assert.equal(snapshot.matchedSalesGrossVnd,'28020000');
  assert.equal(snapshot.skuLineGrossVnd,'28020000');
  assert.deepEqual(snapshot.days.map(d=>[d.day,d.saleCount,d.grossVnd]),[
   ['2026-11-08','2','18680000'],['2026-11-09','1','9340000'],
  ]);
  assert.equal(snapshot.cashiers.length,2);
  assert.deepEqual(snapshot.topSkus.map(s=>[s.sku,s.quantity,s.lineGrossVnd]),[
   ['PHONE-128','3','26970000'],['CASE-01','3','1050000'],
  ]);
  assert.equal(snapshot.sales.length,3);
  assert.ok(snapshot.sales.every(s=>s.source==='CLOUD_POSTED'&&s.lines.length===2));
  const page1=await svc.report(f.manager,range('2026-11-08','2026-11-09',
    {limit:1,offset:0}));
  const page2=await svc.report(f.manager,range('2026-11-08','2026-11-09',
    {limit:1,offset:1}));
  assert.equal(page1.sales.length,1);
  assert.equal(page1.hasMore,true);
  assert.equal(page2.sales.length,1);
  assert.equal(page2.matchedSalesGrossVnd,snapshot.matchedSalesGrossVnd);
  assert.notEqual(page1.sales[0]?.saleId,page2.sales[0]?.saleId);
  const bySku=await svc.report(f.manager,range('2026-11-08','2026-11-09',
    {sku:'CASE-01'}));
  assert.equal(bySku.matchedSaleCount,'3');
  assert.equal(bySku.matchedSalesGrossVnd,'28020000'); // full-sale totals
  assert.equal(bySku.skuLineGrossVnd,'1050000'); // ONLY CASE-01
  assert.equal(bySku.topSkus.length,1);
  const own=await svc.report(f.cashier,range());
  assert.equal(own.matchedSaleCount,'2');
  assert.equal(own.matchedSalesGrossVnd,'18680000');
  assert.equal(own.cashierId,f.cashier.userId);
  assert.deepEqual(new Set(own.sales.map(s=>s.saleId)),new Set([a.event.saleId,c.event.saleId]));
  await assert.rejects(()=>svc.report(f.cashier,range('2026-11-08','2026-11-09',
   {cashierId:f.second.userId})),err=>err instanceof SalesReportError&&err.code==='FORBIDDEN');
  // Annotate genuine pre-existing conflict; the paid sale remains POSTED and
  // counted. Status is not a claim that reconciliation has been finalized.
  await pool.query(`INSERT INTO sync_conflicts
    (id,event_id,sale_id,kind,details,status)
    VALUES($1,$2,$3,'STOCK_SHORTAGE','{}'::jsonb,'OPEN')`,
    [id(),a.event.eventId,a.event.saleId]);
  const withConflict=await svc.report(f.manager,range());
  assert.equal(withConflict.sales.find(s=>s.saleId===a.event.saleId)?.openConflictCount,'1');
  assert.equal(withConflict.matchedSalesGrossVnd,'28020000');
  assert.ok(b.event.saleId);
 });

 await t.test('wrong store, inactive user, role change and forbidden role fail closed',async()=>{
  const f=await seed(),other=await seed();
  await post(f,'2026-11-08T01:00:00.000Z');
  const foreign=await svc.report(other.manager,range());
  assert.equal(foreign.matchedSaleCount,'0');
  await assert.rejects(()=>svc.report({...other.manager,storeId:f.ids.storeId},
    range()),err=>err instanceof SalesReportError&&err.code==='FORBIDDEN');
  await assert.rejects(()=>svc.report({...f.cashier,role:'SUPERUSER'} as never,
    range()),err=>err instanceof SalesReportError&&err.code==='FORBIDDEN');
  await pool.query(`UPDATE store_memberships SET role='CASHIER'
    WHERE store_id=$1 AND user_id=$2`,[f.ids.storeId,f.manager.userId]);
  await assert.rejects(()=>svc.report(f.manager,range()),
    err=>err instanceof SalesReportError&&err.code==='FORBIDDEN');
  await pool.query('UPDATE users SET active=false WHERE id=$1',[f.cashier.userId]);
  await assert.rejects(()=>svc.report(f.cashier,range()),
    err=>err instanceof SalesReportError&&err.code==='FORBIDDEN');
 });

 await t.test('exact VND > 2^53, no price float, no report-side mutations',async()=>{
  const f=await seed(),price='9007199254740993';
  await pool.query('UPDATE product_variants SET price_vnd=$1 WHERE id=$2',
   [price,f.ids.phoneId]);
  const origin=sampleEvent(f.ids,{clientCreatedAt:'2026-11-08T10:00:00.000Z'});
  const line={...origin.sale.items[0]!,unitPriceVnd:price,lineTotalVnd:price};
  const event=sampleEvent(f.ids,{clientCreatedAt:'2026-11-08T10:00:00.000Z',
   sale:{status:'POSTED',totalVnd:price,items:[line],
    payment:{method:'CASH',dueVnd:price,tenderedVnd:'9007199254740994',changeVnd:'1'}}});
  const ack=await push.push({...f.ids},sampleBatch(f.ids,[event]));
  assert.equal(ack.results[0]?.status,'ACKED');
  const before=await pool.query('SELECT * FROM sales WHERE id=$1',[event.saleId]);
  const beforeMovement=await pool.query('SELECT * FROM inventory_movements WHERE sale_id=$1',[event.saleId]);
  const beforeReceipt=await pool.query('SELECT * FROM sync_receipts WHERE sale_id=$1',[event.saleId]);
  const report=await svc.report(f.manager,range());
  assert.equal(report.matchedSalesGrossVnd,price);
  assert.equal(report.skuLineGrossVnd,price);
  assert.equal(report.topSkus[0]?.lineGrossVnd,price);
  assert.equal(report.sales[0]?.totalVnd,price);
  assert.equal((await pool.query('SELECT * FROM sales WHERE id=$1',[event.saleId])).rows.length,1);
  assert.deepEqual((await pool.query('SELECT * FROM sales WHERE id=$1',[event.saleId])).rows,before.rows);
  assert.deepEqual((await pool.query('SELECT * FROM inventory_movements WHERE sale_id=$1',[event.saleId])).rows,beforeMovement.rows);
  assert.deepEqual((await pool.query('SELECT * FROM sync_receipts WHERE sale_id=$1',[event.saleId])).rows,beforeReceipt.rows);
 });
});
