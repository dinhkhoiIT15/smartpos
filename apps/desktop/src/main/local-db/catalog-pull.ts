import type { DatabaseSync } from 'node:sqlite';
import {
  syncPullResponseSchema, assertPullResponseMatchesQuery,
  type SyncPullResponse, type SyncPullQuery,
} from '@smartpos/contracts';
import {
  parseInitialCatalogSnapshot, getLocalCatalogCursor,
} from './catalog-cache.ts';
import { withLocalTransaction } from './index.ts';
import {recordCoveredStockDelta} from './inventory-rebase.ts';

/**
 * POS-023 — MAIN-only atomic server-to-client PULL projection.
 * No HTTP/credentials/IPC; tests inject a synthetic response. D-013 verified
 * signed device/cashier grant still blocks real activation.
 *
 * SQLite v2 records durable per-sale stock coverage. Financial sale/outbox
 * records and unrelated pending stock are never discarded. Only exact
 * cursor-covered sales with verified PUSH ACKs can release their pending
 * quantity, even if the ACK arrives after the PULL cursor advances.
 * Must bootstrap an authenticated POS-017 initial snapshot before deltas.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DECIMAL=/^(0|[1-9][0-9]*)$/;
const SIGNED=/^(0|-[1-9][0-9]*|[1-9][0-9]*)$/;
const MAX=9223372036854775807n;
const MIN=-9223372036854775808n;
function reject(code:string):never{throw new Error('CATALOG_PULL_'+code);}
function uuid(x:unknown):string{
 if(typeof x!=='string'||!UUID.test(x))reject('BAD_UUID');
 return x;
}
function bigint(x:unknown,signed=false):bigint{
 if(typeof x!=='string'||x.length>20||
   !(signed?SIGNED:DECIMAL).test(x))reject('INVALID_INTEGER');
 const value=BigInt(x);
 if(value>MAX||value<(signed?MIN:0n))reject('INTEGER_OVERFLOW');
 return value;
}
function object(value:unknown,keys:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))reject('INVALID_PAYLOAD');
 const obj=value as Record<string,unknown>;
 if(Object.keys(obj).length!==keys.length||
   Object.keys(obj).some(key=>!keys.includes(key)))reject('INVALID_PAYLOAD');
 return obj;
}
export type PullApplyResult=Readonly<{
 cursor:string;count:number;replay:boolean;hasMore:boolean;
}>;
function applyVariant(db:DatabaseSync,storeId:string,raw:unknown,entityId:string):void{
 const v=object(raw,['id','storeId','productId','sku','attributes',
   'priceVnd','revision','active','name']);
 if(uuid(v.id)!==entityId||uuid(v.storeId)!==storeId||
   !UUID.test(String(v.productId)))reject('WRONG_VARIANT');
 const validated=parseInitialCatalogSnapshot({
   protocolVersion:1,storeId,catalogSeq:'0',
   variants:[{
     variantId:v.id,storeId:v.storeId,sku:v.sku,name:v.name,
     attributes:v.attributes,priceVnd:v.priceVnd,
     revision:v.revision,active:v.active,
   }],
 }).variants[0]!;
 const stmt=db.prepare(`
   SELECT server_revision FROM local_catalog_variants WHERE variant_id=? AND store_id=?`);
 stmt.setReadBigInts(true);
 const existing=stmt.get(entityId,storeId) as {server_revision:bigint}|undefined;
 if(existing&&existing.server_revision>BigInt(validated.revision))
   reject('VARIANT_REVISION_REGRESSION');
 db.prepare(`
   INSERT INTO local_catalog_variants
    (variant_id,store_id,sku,name_snapshot,attributes_json,
     price_vnd,server_revision,active) VALUES(?,?,?,?,?,?,?,?)
   ON CONFLICT(variant_id) DO UPDATE SET
     sku=excluded.sku,name_snapshot=excluded.name_snapshot,
     attributes_json=excluded.attributes_json,price_vnd=excluded.price_vnd,
     server_revision=excluded.server_revision,active=excluded.active
   WHERE local_catalog_variants.store_id=excluded.store_id`)
 .run(validated.variantId,storeId,validated.sku,validated.name,
   JSON.stringify(validated.attributes),BigInt(validated.priceVnd),
   BigInt(validated.revision),Number(validated.active));
}
function applyBalance(
 db:DatabaseSync,storeId:string,raw:unknown,entityId:string,sequence:string,
):void{
 const hasSale=raw!==null&&typeof raw==='object'&&!Array.isArray(raw)&&
   ('saleId' in raw || 'eventId' in raw);
 const b=object(raw,hasSale
   ?['storeId','variantId','qty','revision','saleId','eventId']
   :['storeId','variantId','qty','revision']);
 if(uuid(b.storeId)!==storeId||uuid(b.variantId)!==entityId)
   reject('WRONG_BALANCE');
 const qty=bigint(b.qty,true),revision=bigint(b.revision);
 const local=db.prepare('SELECT server_revision,pending_delta '+
   'FROM local_inventory_balances WHERE store_id=? AND variant_id=?');
 local.setReadBigInts(true);
 const before=local.get(storeId,entityId) as {
   server_revision:bigint;pending_delta:bigint;
 }|undefined;
 if(before&&before.server_revision>revision)
   reject('BALANCE_REVISION_REGRESSION');
 // A server snapshot never clears all outstanding local reservations.
 const pending=before?.pending_delta??0n;
 db.prepare('INSERT INTO local_inventory_balances '+
   '(store_id,variant_id,server_qty,pending_delta,server_revision) '+
   'VALUES(?,?,?,?,?) ON CONFLICT(store_id,variant_id) DO UPDATE SET '+
   'server_qty=excluded.server_qty,server_revision=excluded.server_revision,'+
   'pending_delta=excluded.pending_delta'
 ).run(storeId,entityId,qty,pending,revision);
 if(hasSale){
   // PULL records a server-covered sale, NOT payment approval.
   // ACK may arrive later; its transaction releases this exact quantity.
   recordCoveredStockDelta(db,storeId,entityId,
     uuid(b.saleId),uuid(b.eventId),sequence);
 }
}
/**
 * Validates entire v1 page then applies in BEGIN IMMEDIATE. If ANY event
 * fails after prior updates, stock/catalog/cursor all roll back together.
 */
export function applyCatalogPullPage(
 db:DatabaseSync,storeIdInput:string,raw:unknown,
 now:()=>string=()=>new Date().toISOString(),
):PullApplyResult{
 const storeId=uuid(storeIdInput);
 const page=syncPullResponseSchema.parse(raw);
 if(page.storeId!==storeId)reject('WRONG_STORE');
 assertPullResponseMatchesQuery({cursor:page.fromCursor,limit:100},page);
 return withLocalTransaction(db,()=>{
   const local=getLocalCatalogCursor(db,storeId);
   if(local===null)reject('INITIAL_SNAPSHOT_REQUIRED');
   const hasOther=db.prepare(`SELECT 1 FROM local_device_metadata WHERE store_id<>?
     UNION SELECT 1 FROM sync_cursors WHERE store_id<>?
     UNION SELECT 1 FROM local_catalog_variants WHERE store_id<>?
     LIMIT 1`).get(storeId,storeId,storeId);
   if(hasOther)reject('STORE_SCOPE');
   // Exact replay after a commit may be dropped without reapplying stale data.
   if(local===page.nextCursor&&page.fromCursor!==local){
     return {cursor:local,count:0,replay:true,hasMore:page.hasMore};
   }
   if(page.fromCursor!==local)reject('CURSOR_MISMATCH');
   if(bigint(page.nextCursor)<bigint(local))reject('CURSOR_REGRESSION');
   for(const change of page.changes){
     if(change.entityType==='product_variant')
       applyVariant(db,storeId,change.payload,change.entityId);
     else if(change.entityType==='inventory_balance')
       applyBalance(db,storeId,change.payload,change.entityId,change.seq);
     // category/brand/product are metadata-only in SQLite v1. Product
     // rename/deactivation generates explicit product_variant delta on server.
   }
   if(page.nextCursor!==local){
     const updated=db.prepare(`
       UPDATE sync_cursors SET catalog_seq=?,updated_at=?
       WHERE store_id=? AND catalog_seq=?`)
       .run(bigint(page.nextCursor),now(),storeId,bigint(local));
     if(updated.changes!==1)reject('CURSOR_RACE');
   }
   return {cursor:page.nextCursor,count:page.changes.length,
     replay:false,hasMore:page.hasMore};
 });
}
export type PullTransport=(q:SyncPullQuery)=>Promise<unknown>;

/** An injected transport is NOT authenticated by this code. No live caller. */
export class CatalogPullWorker{
 private inflight:Promise<PullApplyResult>|null=null;
 constructor(private readonly db:DatabaseSync,
   private readonly storeId:string,private readonly transport:PullTransport){
   uuid(storeId);
 }
 runOnce(limit=100):Promise<PullApplyResult>{
  if(this.inflight)return this.inflight;
  const run=this.dispatch(limit);
  this.inflight=run;
  void run.then(()=>{if(this.inflight===run)this.inflight=null;},
    ()=>{if(this.inflight===run)this.inflight=null;});
  return run;
 }
 private async dispatch(limit:number):Promise<PullApplyResult>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)reject('BAD_LIMIT');
  const current=getLocalCatalogCursor(this.db,this.storeId);
  if(current===null)reject('INITIAL_SNAPSHOT_REQUIRED');
  const query={cursor:current as string,limit};
  const raw=await this.transport(query);
  const page=assertPullResponseMatchesQuery(query,raw);
  if(page.storeId!==this.storeId)reject('WRONG_STORE');
  return applyCatalogPullPage(this.db,this.storeId,page);
 }
}
