import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildServer } from '../server.js';
import type { VerifiedSyncContext } from './service.js';

const id=()=>randomUUID();
const actor:VerifiedSyncContext={storeId:id(),deviceId:id(),cashierId:id(),offlineGrantId:id()};
test('POS-023 normal Fastify has no GET /v1/sync/pull even with fake staff/device headers',async t=>{
 const app=buildServer();
 t.after(async()=>{await app.close();});
 const response=await app.inject({
  method:'GET',url:'/v1/sync/pull?cursor=0&limit=10',
  headers:{'x-role':'ADMIN','x-device-id':actor.deviceId},
 });
 assert.equal(response.statusCode,404);
});
test('POS-023 opt-in pull GET uses only injected trusted context; invalid query cannot invoke DB',async t=>{
 let trusted:VerifiedSyncContext|null=null,calls=0;
 const app=buildServer({syncPull:{
  resolvePrincipal:async()=>trusted,
  service:{pull:async context=>{
    calls++;
    assert.deepEqual(context,actor);
    return {protocolVersion:1,storeId:actor.storeId,fromCursor:'0',
      nextCursor:'0',highWatermark:'0',hasMore:false,changes:[]};
  }},
 }});
 t.after(async()=>{await app.close();});
 const get=(url:string,headers?:Record<string,string>)=>app.inject({
  method:'GET',url,...(headers?{headers}:{}),
 });
 assert.equal((await get('/v1/sync/pull?cursor=0&limit=10',
   {'x-role':'ADMIN','x-device-id':actor.deviceId})).statusCode,401);
 assert.equal(calls,0);
 trusted=actor;
 assert.equal((await get('/v1/sync/pull?cursor=0&limit=10')).statusCode,200);
 assert.equal(calls,1);
 for(const q of ['cursor=00','cursor=-1','cursor=9223372036854775808',
   'limit=0','limit=101','cursor=0&unknown=1']){
   assert.equal((await get('/v1/sync/pull?'+q)).statusCode,400,q);
 }
 assert.equal(calls,1);
});
