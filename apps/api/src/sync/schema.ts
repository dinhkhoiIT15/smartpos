import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * POS-021 API-local validation mirror of POS-016 wire v1.
 * Keep sync/schema-parity.test.ts against the ACTUAL shared contract in CI.
 * The API build uses NodeNext rootDir=src and cannot emit source from an
 * outside workspace. Never treat an opaque payloadHash as authentication.
 */
const MAX = 9_223_372_036_854_775_807n;
export const PUSH_MAX_BYTES = 512 * 1024;
const id = z.uuid();
const money = z.string().regex(/^(0|[1-9][0-9]*)$/).max(19)
  .refine(s => /^(0|[1-9][0-9]*)$/.test(s) && s.length<=19 && BigInt(s)<=MAX, 'signed int64 VND');
const utc = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(s => Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString() === s, 'invalid UTC timestamp');
const attributes = z.record(z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
  z.string().min(1).max(64)).refine(v => Object.keys(v).length <= 8);
const cursor = z.string().regex(/^(0|[1-9][0-9]*)$/).max(19)
  .refine(s => /^(0|[1-9][0-9]*)$/.test(s) && s.length<=19 && BigInt(s)<=MAX);
const text = (limit: number) => z.string().min(1).max(limit)
  .refine(s => s.trim() === s);
const itemSchema = z.strictObject({
  itemId:id,variantId:id,skuSnapshot:text(64),nameSnapshot:text(200),
  attributesSnapshot:attributes,quantity:z.int().min(1).max(2_147_483_647),
  unitPriceVnd:money,discountVnd:money,lineTotalVnd:money,
});
const paymentSchema = z.strictObject({
  method:z.literal('CASH'),dueVnd:money,tenderedVnd:money,changeVnd:money,
});
const saleSchema = z.strictObject({
  status:z.literal('POSTED'),totalVnd:money,
  items:z.array(itemSchema).min(1).max(100),payment:paymentSchema,
});
const rawEvent = z.strictObject({
  schemaVersion:z.literal(1),eventType:z.literal('SALE_COMPLETED'),
  eventId:id,saleId:id,storeId:id,deviceId:id,cashierId:id,offlineGrantId:id,
  clientCreatedAt:utc,catalogRevision:cursor,sale:saleSchema,
  payloadHash:z.string().regex(/^[0-9a-f]{64}$/),
});
export type PushEvent = z.infer<typeof rawEvent>;
export type PushAck =
  | Readonly<{eventId:string;saleId:string;status:'ACKED';
    resultCode:'APPLIED'|'STOCK_SHORTAGE_RECONCILIATION'|'STALE_PRICE_REVIEW';
    serverReceivedAt:string;conflictIds:string[]}>
  | Readonly<{eventId:string;saleId:string;status:'NEEDS_REVIEW';
    resultCode:'PAYLOAD_HASH_MISMATCH'|'INVALID_EVENT'|'AUTH_EXPIRED'|
      'REVOKED_DEVICE'|'DUPLICATE_SALE'|'UNAUTHORIZED_DEVICE'|'UNSUPPORTED_VERSION';
    conflictIds:string[]}>
  | Readonly<{eventId:string;saleId:string;status:'RETRY';
    resultCode:'TEMPORARY_UNAVAILABLE';retryAfterSeconds:number}>;
export type PushBatch = Readonly<{protocolVersion:1;deviceId:string;events:PushEvent[]}>;

function reject():never{throw new Error('SYNC_INVALID_EVENT');}
export function canonicalPushJson(value:unknown):string{
  if(value===null)return 'null';
  if(typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){
    if(!Number.isSafeInteger(value))reject();
    return JSON.stringify(value);
  }
  if(Array.isArray(value))return '['+value.map(canonicalPushJson).join(',')+']';
  if(typeof value==='object')return '{'+Object.entries(value)
    .sort(([a],[b])=>a<b?-1:a>b?1:0)
    .map(([k,v])=>JSON.stringify(k)+':'+canonicalPushJson(v)).join(',')+'}';
  return reject();
}
export function hashPushEvent(body:Omit<PushEvent,'payloadHash'>):string{
  return createHash('sha256').update(canonicalPushJson(body),'utf8').digest('hex');
}
function validateEvent(event:PushEvent):void{
  const lines=event.sale.items;
  let total=0n;
  const itemIds=new Set<string>();
  for(const line of lines){
    if(itemIds.has(line.itemId))reject();
    itemIds.add(line.itemId);
    const extended=BigInt(line.quantity)*BigInt(line.unitPriceVnd);
    const discounted=extended-BigInt(line.discountVnd);
    if(extended>MAX||discounted<0n||discounted>MAX ||
      discounted!==BigInt(line.lineTotalVnd))reject();
    total+=discounted;
    if(total>MAX)reject();
  }
  const payment=event.sale.payment;
  const due=BigInt(payment.dueVnd),tender=BigInt(payment.tenderedVnd);
  if(total!==BigInt(event.sale.totalVnd)||due!==total||
    tender<due||tender-due!==BigInt(payment.changeVnd))reject();
  const {payloadHash,...body}=event;
  if(hashPushEvent(body)!==payloadHash)reject();
}
/** Reject unknown fields, wrong store/device batches and anything >512KiB. */
export function parsePushBatch(input:unknown):PushBatch{
  let size:number;
  try{size=Buffer.byteLength(JSON.stringify(input),'utf8');}
  catch{reject();}
  if(size>PUSH_MAX_BYTES)throw new Error('SYNC_PAYLOAD_TOO_LARGE');
  const parsed=z.strictObject({
    protocolVersion:z.literal(1),deviceId:id,
    events:z.array(rawEvent).min(1).max(25),
  }).parse(input);
  const eventIds=new Set<string>(),saleIds=new Set<string>(),storeId=parsed.events[0]?.storeId;
  for(const event of parsed.events){
    if(event.deviceId!==parsed.deviceId||event.storeId!==storeId||
      eventIds.has(event.eventId)||saleIds.has(event.saleId))reject();
    eventIds.add(event.eventId);saleIds.add(event.saleId);
    validateEvent(event);
  }
  return parsed;
}
