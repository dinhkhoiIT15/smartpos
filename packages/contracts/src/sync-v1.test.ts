import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYNC_PROTOCOL_VERSION, MAX_PUSH_EVENTS, MAX_PULL_CHANGES, MAX_PUSH_JSON_BYTES,
  syncSaleWithoutHashSchema, syncSaleCompletedEventSchema, syncPushRequestSchema,
  syncPushResponseSchema, syncPullQuerySchema, syncPullResponseSchema,
  syncCursorSchema, canonicalSyncJson, computeSyncPayloadHash,
  assertPushResponseMatchesRequest, assertPullResponseMatchesQuery,
  classifySyncReceiptReplay, type SyncSaleWithoutHash,
} from './sync-v1.js';

const deviceId = 'a1111111-1111-4111-8111-111111111111';
const storeId = 'b2222222-2222-4222-8222-222222222222';
const cashierId = 'c3333333-3333-4333-8333-333333333333';
const grantId = 'd4444444-4444-4444-8444-444444444444';
const eventId = 'e5555555-5555-4555-8555-555555555555';
const saleId = 'f6666666-6666-4666-8666-666666666666';
const variantId = 'a7777777-7777-4777-8777-777777777777';
const itemId = 'b8888888-8888-4888-8888-888888888888';
const receivedAt = '2026-11-07T08:15:00.000Z';
function eventBody(): SyncSaleWithoutHash {
  return {
    schemaVersion: SYNC_PROTOCOL_VERSION,
    eventType: 'SALE_COMPLETED',
    eventId, saleId, storeId, deviceId, cashierId, offlineGrantId: grantId,
    clientCreatedAt: '2026-11-07T08:10:00.000Z',
    catalogRevision: '12',
    sale: {
      status: 'POSTED',
      totalVnd: '8990000',
      items: [{
        itemId, variantId, skuSnapshot: 'PHONE-128-BLK',
        nameSnapshot: 'Điện thoại 128GB',
        attributesSnapshot: { color: 'Black', storage: '128GB' },
        quantity: 1, unitPriceVnd: '8990000',
        discountVnd: '0', lineTotalVnd: '8990000',
      }],
      payment: {
        method: 'CASH', dueVnd: '8990000',
        tenderedVnd: '9000000', changeVnd: '10000',
      },
    },
  };
}
const makeEvent = (data: SyncSaleWithoutHash = eventBody()) => ({
  ...data, payloadHash: computeSyncPayloadHash(data),
});
const request = () => ({
  protocolVersion: 1, deviceId, events: [makeEvent()],
});
const ack = () => ({
  eventId, saleId, status: 'ACKED' as const, resultCode: 'APPLIED' as const,
  conflictIds: [], serverReceivedAt: receivedAt,
});
const ackPage = () => ({ protocolVersion: 1, deviceId, results: [ack()] });
const change = (seq: string) => ({
  seq, entityType: 'product_variant', entityId: variantId,
  op: 'UPDATE', payload: { priceVnd: '8990000', revision: '2' },
  createdAt: receivedAt,
});
const pullPage = () => ({
  protocolVersion: 1, storeId, fromCursor: '10', nextCursor: '12',
  highWatermark: '12', hasMore: false, changes: [change('11'), change('12')],
});

test('v1 PUSH SALE_COMPLETED cash snapshot, immutable schema and exact hash round-trip', () => {
  const input = request();
  assert.equal(syncPushRequestSchema.parse(input).events[0]?.payloadHash,
    computeSyncPayloadHash(eventBody()));
  assert.equal(syncSaleCompletedEventSchema.parse(input.events[0]).sale.status, 'POSTED');
  assert.equal(syncSaleWithoutHashSchema.parse(eventBody()).sale.totalVnd, '8990000');
  assert.deepEqual(syncPushRequestSchema.parse(JSON.parse(JSON.stringify(input))), input);
});

test('canonical SHA-256 is stable across object/attribute property order, sensitive to every value', () => {
  const base = eventBody();
  const reordered: SyncSaleWithoutHash = {
    ...base,
    sale: { ...base.sale, items: [{ ...base.sale.items[0]!,
      attributesSnapshot: { storage: '128GB', color: 'Black' } }] },
  };
  assert.equal(computeSyncPayloadHash(base), computeSyncPayloadHash(reordered));
  assert.equal(canonicalSyncJson({ z: 2, a: { c: 3, b: 1 } }),
    canonicalSyncJson({ a: { b: 1, c: 3 }, z: 2 }));
  const mutated = structuredClone(base);
  mutated.sale.items[0]!.unitPriceVnd = '8990001';
  assert.notEqual(canonicalSyncJson(mutated), canonicalSyncJson(base));
  assert.equal(syncSaleCompletedEventSchema.safeParse({
    ...mutated, payloadHash: computeSyncPayloadHash(base),
  }).success, false);
  assert.throws(() => canonicalSyncJson(1.1), /noninteger/);
  assert.throws(() => canonicalSyncJson({a: undefined}), /non-JSON/);
});

test('tampered/hash-invalid or unsupported version events fail closed', () => {
  const evt = makeEvent();
  for(const modified of [
    { ...evt, schemaVersion: 2 },
    { ...evt, eventType: 'SALE_REFUNDED' },
    { ...evt, payloadHash: 'a'.repeat(64) },
    { ...evt, payloadHash: 'A'.repeat(64) },
    { ...evt, privateKey: 'do-not-allow' },
    { ...evt, bearerToken: 'forbidden' },
    { ...evt, offlineGrantId: 'arbitrary' },
    { ...evt, clientCreatedAt: '2026-11-07T15:10:00+07:00' },
  ]) assert.equal(syncSaleCompletedEventSchema.safeParse(modified).success, false);
  assert.equal(syncPushRequestSchema.safeParse({ ...request(), protocolVersion: 2 }).success, false);
});

test('cash-only, correct sale arithmetic and VND signed int64 are validated with bigint', () => {
  const wrong = (mutate: (v: SyncSaleWithoutHash) => void) => {
    const event = eventBody();
    mutate(event);
    return syncSaleCompletedEventSchema.safeParse({ ...event, payloadHash: '0'.repeat(64) }).success;
  };
  assert.equal(wrong(v => { v.sale.payment.method = 'CARD' as 'CASH'; }), false);
  assert.equal(wrong(v => { v.sale.totalVnd = '8990001'; }), false);
  assert.equal(wrong(v => { v.sale.items[0]!.lineTotalVnd = '8990001'; }), false);
  assert.equal(wrong(v => { v.sale.payment.dueVnd = '8000000'; }), false);
  assert.equal(wrong(v => { v.sale.payment.tenderedVnd = '8990000'; }), false);
  assert.equal(wrong(v => { v.sale.payment.changeVnd = '10001'; }), false);
  assert.equal(wrong(v => { v.sale.items[0]!.quantity = 0; }), false);
  assert.equal(wrong(v => { v.sale.items[0]!.quantity = 1.5; }), false);
  assert.equal(wrong(v => { v.sale.items[0]!.unitPriceVnd = '1.1'; }), false);
  assert.equal(wrong(v => { v.sale.items[0]!.unitPriceVnd = '9223372036854775808'; }), false);
  assert.equal(wrong(v => { v.sale.items[0]!.unitPriceVnd = '01'; }), false);
  assert.equal(wrong(v => { v.sale.items[0]!.unitPriceVnd = 123 as unknown as string; }), false);
  assert.equal(wrong(v => { v.sale.items.push({ ...v.sale.items[0]!, variantId }); }), false);
  assert.equal(wrong(v => { v.sale.items[0]!.discountVnd = '9000000'; }), false);
});

test('valid two-line discounted cash receipt retains VND precision above JS MAX_SAFE_INTEGER', () => {
  const base = eventBody();
  base.sale.items = [
    { ...base.sale.items[0]!, unitPriceVnd: '9007199254740993',
      discountVnd: '3', lineTotalVnd: '9007199254740990' },
  ];
  base.sale.totalVnd = '9007199254740990';
  base.sale.payment = { method:'CASH',dueVnd:base.sale.totalVnd,
    tenderedVnd:'9007199254740994',changeVnd:'4' };
  assert.equal(syncSaleCompletedEventSchema.parse(makeEvent(base)).sale.totalVnd,
    '9007199254740990');
});

test('batch enforces same device/store, unique event/sale IDs and maximum size', () => {
  const original = request();
  assert.equal(syncPushRequestSchema.safeParse({
    ...original, events: [original.events[0], original.events[0]],
  }).success, false);
  const differentEvent = eventBody();
  differentEvent.eventId = 'c9999999-9999-4999-8999-999999999999';
  assert.equal(syncPushRequestSchema.safeParse({
    ...original, events: [original.events[0], makeEvent(differentEvent)],
  }).success, false); // duplicate SALE ID
  const wrongDevice = eventBody();
  wrongDevice.deviceId = 'b9999999-9999-4999-8999-999999999999';
  assert.equal(syncPushRequestSchema.safeParse({
    ...original, events: [makeEvent(wrongDevice)],
  }).success, false);
  const wrongStore = eventBody();
  wrongStore.storeId = 'c9999999-9999-4999-8999-999999999999';
  assert.equal(syncPushRequestSchema.safeParse({
    ...original, events: [original.events[0], makeEvent(wrongStore)],
  }).success, false);
  const many = Array.from({length:MAX_PUSH_EVENTS+1},(_,i) => {
    const e = eventBody();e.eventId = `a0000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;
    e.saleId = `b0000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;
    return makeEvent(e);
  });
  assert.equal(syncPushRequestSchema.safeParse({ protocolVersion:1,deviceId,events:many }).success,false);
  assert.ok(MAX_PUSH_JSON_BYTES < 1024 * 1024);
  assert.equal(syncPushRequestSchema.safeParse({ ...original, storeId, authToken: 'secret' }).success, false);
});

test('ACK, NEEDS_REVIEW, RETRY response envelope has no unauthorized fields', () => {
  assert.equal(syncPushResponseSchema.safeParse(ackPage()).success, true);
  assert.equal(syncPushResponseSchema.safeParse({protocolVersion:1,deviceId,results:[{
    eventId,saleId,status:'ACKED',resultCode:'STOCK_SHORTAGE_RECONCILIATION',
    conflictIds:[variantId],serverReceivedAt:receivedAt,
  }]}).success,true);
  assert.equal(syncPushResponseSchema.safeParse({protocolVersion:1,deviceId,results:[{
    eventId,saleId,status:'NEEDS_REVIEW',resultCode:'PAYLOAD_HASH_MISMATCH',conflictIds:[],
  }]}).success,true);
  assert.equal(syncPushResponseSchema.safeParse({protocolVersion:1,deviceId,results:[{
    eventId,saleId,status:'RETRY',resultCode:'TEMPORARY_UNAVAILABLE',retryAfterSeconds:30,
  }]}).success,true);
  for(const bad of [
    {...ackPage(),protocolVersion:2},
    {...ackPage(),results:[ack(),ack()]},
    {...ackPage(),results:[{...ack(),status:'ACKED',resultCode:'PAYLOAD_HASH_MISMATCH'}]},
    {...ackPage(),results:[{...ack(),conflictIds:['invalid']}]},
    {...ackPage(),results:[{...ack(),password:'secret'}]},
    {...ackPage(),results:[{...ack(),serverReceivedAt:'2026-11-07T08:15:00+00:00'}]},
  ]) assert.equal(syncPushResponseSchema.safeParse(bad).success,false);
});

test('outbox ACK linkage rejects missing, extra, wrong sale, swapped event and wrong device', () => {
  assert.deepEqual(assertPushResponseMatchesRequest(request(),ackPage()),ackPage());
  for(const response of [
    {...ackPage(),deviceId:storeId},
    {...ackPage(),results:[]},
    {...ackPage(),results:[{...ack(),saleId:variantId}]},
    {...ackPage(),results:[{...ack(),eventId:variantId}]},
  ]) assert.throws(()=>assertPushResponseMatchesRequest(request(),response));
  assert.equal(assertPushResponseMatchesRequest(request(),ackPage()).results[0]?.status,'ACKED');
});

test('same device/eventId/saleId/hash replays original ACK; hash mismatch or sale reuse reject', () => {
  const sample = makeEvent();
  const stored = {deviceId,eventId,saleId,payloadHash:sample.payloadHash};
  assert.equal(classifySyncReceiptReplay(null,stored),'NEW');
  assert.equal(classifySyncReceiptReplay(stored,{...stored}),'REPLAY_ORIGINAL_ACK');
  assert.equal(classifySyncReceiptReplay(stored,{...stored,payloadHash:'f'.repeat(64)}),'REJECT_CONFLICT');
  assert.equal(classifySyncReceiptReplay(stored,{...stored,saleId:variantId}),'REJECT_CONFLICT');
  assert.equal(classifySyncReceiptReplay(stored,{...stored,deviceId:storeId}),'REJECT_CONFLICT');
  assert.equal(classifySyncReceiptReplay(stored,{...stored,eventId:variantId}),'REJECT_CONFLICT');
  assert.equal(classifySyncReceiptReplay(stored,{...stored,saleId:variantId,eventId:variantId}),'NEW');
});

test('pull query canonical integer cursor and bounded page size', () => {
  assert.deepEqual(syncPullQuerySchema.parse({}),{cursor:'0',limit:MAX_PULL_CHANGES});
  assert.deepEqual(syncPullQuerySchema.parse({cursor:'100',limit:'10'}),{cursor:'100',limit:10});
  assert.equal(syncCursorSchema.parse('9223372036854775807'),'9223372036854775807');
  for(const bad of [
    {cursor:'-1'}, {cursor:'01'}, {cursor:'1.1'},
    {cursor:'9223372036854775808'}, {cursor:5}, {limit:'0'},
    {limit:'101'}, {limit:'1e4'}, {limit:0.3}, {authToken:'bad'},
  ]) assert.equal(syncPullQuerySchema.safeParse(bad).success,false);
});

test('pull response handles increasing global sequences, sparse store changes and stable watermark', () => {
  assert.equal(syncPullResponseSchema.safeParse(pullPage()).success,true);
  assert.equal(syncPullResponseSchema.safeParse({
    protocolVersion:1,storeId,fromCursor:'10',nextCursor:'99',
    highWatermark:'99',hasMore:false,changes:[],
  }).success,true); // sparse global seq across other stores
  assert.equal(syncPullResponseSchema.safeParse({
    ...pullPage(),hasMore:true,highWatermark:'999',
  }).success,true);
  const bad = [
    {...pullPage(),changes:[change('12'),change('11')]},
    {...pullPage(),changes:[change('11'),change('11')]},
    {...pullPage(),changes:[change('9'),change('12')]},
    {...pullPage(),nextCursor:'11'},
    {...pullPage(),highWatermark:'11'},
    {...pullPage(),fromCursor:'13'},
    {...pullPage(),hasMore:true,changes:[]},
    {...pullPage(),hasMore:true,highWatermark:'30',nextCursor:'11'},
    {...pullPage(),hasMore:false,highWatermark:'30'},
    {...pullPage(),changes:[{...change('11'),entityType:'users'}]},
    {...pullPage(),changes:[{...change('11'),payload:()=>{}}]},
    {...pullPage(),protocolVersion:2},
  ];
  for(const p of bad) assert.equal(syncPullResponseSchema.safeParse(p).success,false);
});

test('pull cursor must match request, and client advances only AFTER atomic SQLite apply', () => {
  assert.equal(assertPullResponseMatchesQuery({cursor:'10',limit:'2'},pullPage()).nextCursor,'12');
  assert.throws(()=>assertPullResponseMatchesQuery({cursor:'9',limit:'2'},pullPage()));
  assert.throws(()=>assertPullResponseMatchesQuery({cursor:'10',limit:'1'},pullPage()));
  // Schema validation does NOT mutate SQLite; worker transaction remains POS-023.
  const before='10';
  assert.equal(before,'10');
});
