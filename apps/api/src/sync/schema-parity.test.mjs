import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleIds, sampleEvent, sampleBatch } from './fixtures.ts';
import { parsePushBatch, hashPushEvent, canonicalPushJson } from './schema.ts';
import {
  syncPushRequestSchema, computeSyncPayloadHash, canonicalSyncJson,
} from '../../../../packages/contracts/src/sync-v1.ts';

/**
 * Compile-time API-local mirror must stay wire-compatible with the exact
 * POS-016 source. Run with the existing API tsx dev tool, never deploy this.
 */
const ids=sampleIds();
const event=sampleEvent(ids);
const request=sampleBatch(ids,[event]);
test('POS-021 generated event accepted by exact POS-016 Zod v1 contract',()=>{
 const local=parsePushBatch(request);
 const shared=syncPushRequestSchema.parse(request);
 assert.deepEqual(local,shared);
 const {payloadHash,...body}=event;
 assert.equal(event.payloadHash,computeSyncPayloadHash(body));
 assert.equal(hashPushEvent(body),computeSyncPayloadHash(body));
 assert.equal(canonicalPushJson(body),canonicalSyncJson(body));
});
test('POS-021 and shared contract reject bad hash, totals, duplicate batch, unknown fields, wrong device',()=>{
 const cases=[
  {...request,extra:1},
  {...request,deviceId:sampleIds().deviceId},
  {...request,events:[event,event]},
  {...request,events:[{...event,payloadHash:'a'.repeat(64)}]},
  {...request,events:[{...event,sale:{...event.sale,totalVnd:'1'}}]},
  {...request,events:[{...event,sale:{...event.sale,
    payment:{...event.sale.payment,tenderedVnd:'9000000'}}]},
  {...request,events:[{...event,sale:{...event.sale,items:[]}}]},
  {...request,events:[{...event,sale:{...event.sale,
    items:[event.sale.items[0],event.sale.items[0]]}}]},
  {...request,events:[]},
 ];
 for(const invalid of cases){
   assert.throws(()=>parsePushBatch(invalid));
   assert.equal(syncPushRequestSchema.safeParse(invalid).success,false);
 }
});
test('canonical unicode, sorted key and prices beyond JS safe integer agree with POS-016',()=>{
 const body={
  ...event,
  sale:{
    ...event.sale,
    totalVnd:'9007199254740993',
    items:[{...event.sale.items[0],attributesSnapshot:{storage:'128GB',color:'Đen'},
      unitPriceVnd:'9007199254740993',discountVnd:'0',
      lineTotalVnd:'9007199254740993'}],
    payment:{method:'CASH',dueVnd:'9007199254740993',
      tenderedVnd:'9007199254740994',changeVnd:'1'},
  },
 };
 const {payloadHash:_,...withoutHash}=body;
 const revised={...withoutHash,payloadHash:computeSyncPayloadHash(withoutHash)};
 assert.deepEqual(parsePushBatch(sampleBatch(ids,[revised])).events[0],
   syncPushRequestSchema.parse(sampleBatch(ids,[revised])).events[0]);
 assert.equal(hashPushEvent(withoutHash),revised.payloadHash);
});
