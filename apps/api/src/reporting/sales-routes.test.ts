import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildServer} from '../server.js';
import {createStaffPrincipalResolver} from '../auth/staff-routes.js';
import type {CatalogPrincipal} from '../catalog/service.js';

const id=()=>randomUUID();
const actor:CatalogPrincipal={storeId:id(),userId:id(),role:'MANAGER'};
const good='/v1/reports/sales?from=2026-11-01&to=2026-11-09&limit=10';
test('POS-026 normal API keeps reporting HTTP 404 even with spoofed roles and bearer',async t=>{
 const app=buildServer();t.after(()=>app.close());
 for(const url of [good,'/v1/reports/sales']){
  const res=await app.inject({method:'GET',url,headers:{
   'x-role':'ADMIN','x-user-id':actor.userId,'x-store-id':actor.storeId,
   authorization:'Bearer '+'A'.repeat(43),
  }});
  assert.equal(res.statusCode,404);
 }
});
test('POS-026 opt-in route validates query and gets trusted principal, not headers',async t=>{
 let trusted:CatalogPrincipal|null=null;
 let calls=0;
 const app=buildServer({salesReport:{
  resolvePrincipal:async()=>trusted,
  service:{report:async(p,q)=>{
   calls++;
   assert.deepEqual(p,actor);
   assert.equal(q.limit,10);
   assert.equal(q.from,'2026-11-01');
   return {source:'CLOUD_POSTED',sales:[],matchedSaleCount:'0',
     matchedSalesGrossVnd:'0'};
  }},
 }});
 t.after(()=>app.close());
 const get=(url:string)=>app.inject({method:'GET',url,headers:{
  'x-role':'ADMIN','x-store-id':actor.storeId,
 }});
 assert.equal((await get(good)).statusCode,401);
 trusted=actor;
 for(const q of [
  'from=2026-13-01&to=2026-11-09',
  'from=2026-11-31&to=2026-12-02',
  'from=2026-11-09&to=2026-11-01',
  'from=2026-01-01&to=2026-11-09',
  'from=2026-11-01&to=2026-11-09&limit=0',
  'from=2026-11-01&to=2026-11-09&limit=101',
  'from=2026-11-01&to=2026-11-09&limit=01',
  'from=2026-11-01&to=2026-11-09&offset=-1',
  'from=2026-11-01&to=2026-11-09&cashierId=bad',
  'from=2026-11-01&to=2026-11-09&sku=%25BAD',
  'from=2026-11-01&to=2026-11-09&something=1',
 ])assert.equal((await get('/v1/reports/sales?'+q)).statusCode,400,q);
 assert.equal(calls,0);
 const response=await get(good);
 assert.equal(response.statusCode,200);
 assert.equal(response.json().source,'CLOUD_POSTED');
 assert.equal(calls,1);
});
test('POS-026 staff session resolver can be injected, does not accept role spoof',async t=>{
 const token='A'.repeat(43),another={...actor,role:'CASHIER' as const};
 const app=buildServer({salesReport:{
  resolvePrincipal:createStaffPrincipalResolver({
   resolve:async value=>{
    assert.equal(value,token);
    return {...another,sessionId:id()};
   },
  }),
  service:{report:async principal=>{
   assert.deepEqual(principal,another);
   return {source:'CLOUD_POSTED',sales:[]};
  }},
 }});
 t.after(()=>app.close());
 const url=good;
 assert.equal((await app.inject({method:'GET',url,headers:{
  'x-role':'ADMIN','x-store-id':actor.storeId,
 }})).statusCode,401);
 assert.equal((await app.inject({method:'GET',url,headers:{
  authorization:'Bearer '+token,'x-role':'ADMIN','x-store-id':id(),
 }})).statusCode,200);
});
