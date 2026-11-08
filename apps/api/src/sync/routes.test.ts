import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildServer } from '../server.js';
import { parsePushBatch, hashPushEvent, type PushBatch } from './schema.js';
import { sampleIds, sampleEvent, sampleBatch } from './fixtures.js';
import type { VerifiedSyncContext, SyncApplyError } from './service.js';
import type { SyncApi } from './routes.js';

const ids=sampleIds();
const event=sampleEvent(ids);
const context:VerifiedSyncContext={
  storeId:ids.storeId,deviceId:ids.deviceId,cashierId:ids.cashierId,
  offlineGrantId:ids.offlineGrantId,
};

test('normal main Fastify server keeps POST /v1/sync/push unregistered regardless of forged headers',async t=>{
  const app=buildServer();
  t.after(async()=>{await app.close();});
  const response=await app.inject({
    method:'POST',url:'/v1/sync/push',
    headers:{'x-role':'CASHIER','x-device-id':ids.deviceId},
    payload:sampleBatch(ids,[event]),
  });
  assert.equal(response.statusCode,404);
  assert.equal((await app.inject({method:'GET',url:'/v1/health'})).statusCode,200);
});

test('strict v1 cash payload, SHA-256 canonical validation, VND bounds and payload limits',()=>{
  const base=sampleBatch(ids,[event]);
  assert.deepEqual(parsePushBatch(base),base);
  const broken=[
    {...base,deviceId:randomUUID()},
    {...base,events:[event,event]},
    {...base,events:[]},
    {...base,events:[{...event,payloadHash:'a'.repeat(64)}]},
    {...base,events:[{...event,sale:{...event.sale,totalVnd:'1'}}]},
    {...base,events:[{...event,sale:{...event.sale,
      payment:{...event.sale.payment,tenderedVnd:'9000000'}}}]},
    {...base,events:[{...event,sale:{...event.sale,
      items:[event.sale.items[0],event.sale.items[0]]}}]},
    {...base,events:[{...event,sale:{...event.sale,
      items:[{...event.sale.items[0]!,unitPriceVnd:'9223372036854775808'},
        event.sale.items[1]! ]}}]},
    {...base,unknown:true},
  ];
  for(const v of broken) assert.throws(()=>parsePushBatch(v));
  const big={...base,events:[{...event,sale:{...event.sale,items:[{
    ...event.sale.items[0]!,nameSnapshot:'X'.repeat(100_000),
  }]}}]};
  assert.throws(()=>parsePushBatch(big));
  const {payloadHash:_,...body}=event;
  assert.equal(event.payloadHash,hashPushEvent(body));
});

test('opt-in injected sync routes require a server-owned principal, support safe version/error envelopes',async t=>{
  let principal:VerifiedSyncContext|null=null;
  const requests:Array<{actor:VerifiedSyncContext|null;body:unknown}>=[];
  const api:SyncApi={push:async(actor,body)=>{
    requests.push({actor:actor??null,body});
    return {protocolVersion:1 as const,deviceId:ids.deviceId,results:[{
      eventId:event.eventId,saleId:event.saleId,status:'ACKED' as const,
      resultCode:'APPLIED' as const,conflictIds:[],
      serverReceivedAt:'2026-11-08T01:01:00.000Z',
    }]};
  }};
  const app=buildServer({
    sync:{service:api,resolvePrincipal:async()=>principal},
  });
  t.after(async()=>{await app.close();});
  const send=async(payload:unknown)=>app.inject({method:'POST',url:'/v1/sync/push',
    payload:payload as object});
  assert.equal((await send(sampleBatch(ids,[event]))).statusCode,401);
  principal=context;
  const good=await send(sampleBatch(ids,[event]));
  assert.equal(good.statusCode,200);
  assert.equal(good.json().results[0].resultCode,'APPLIED');
  assert.equal(good.headers['cache-control'],'no-store');
  assert.equal(requests.length,1);
  assert.equal((await send({...sampleBatch(ids,[event]),protocolVersion:2})).statusCode,409);
  assert.deepEqual((await send({...sampleBatch(ids,[event]),protocolVersion:2})).json(),
    {error:'UNSUPPORTED_VERSION',supportedProtocolVersions:[1]});
  assert.equal((await send({...sampleBatch(ids,[event]),unknown:true})).statusCode,400);
  assert.equal((await send({...sampleBatch(ids,[event]),events:[]})).statusCode,400);
  assert.equal((await send({...sampleBatch(ids,[event]),events:[{...event,payloadHash:'x'}]})).statusCode,400);
  assert.equal(requests.length,1);
  // A header is not identity. The only successful request used the test resolver.
  principal=null;
  assert.equal((await app.inject({method:'POST',url:'/v1/sync/push',
    headers:{'x-role':'ADMIN','x-device-id':ids.deviceId},
    payload:sampleBatch(ids,[event])})).statusCode,401);
});
