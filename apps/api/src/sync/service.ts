import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { z } from 'zod';
import { parsePushBatch, type PushEvent, type PushAck, type PushBatch } from './schema.js';

/**
 * POS-021: INTERNAL ONLY. This is not an authentication API.
 * D-013 real signed offline grant, OS device key proof, role/session/clock
 * anti-rollback & revocation are STILL REQUIRED before routes can be mounted.
 * A string offlineGrantId is not cryptographic evidence. Never register a
 * fake resolver from apps/api/src/main.ts. CI uses synthetic trusted context.
 */
export type VerifiedSyncContext = Readonly<{
  storeId:string;deviceId:string;cashierId:string;offlineGrantId:string;
}>;
export class SyncApplyError extends Error {
  constructor(readonly code:'UNAUTHORIZED'|'FORBIDDEN'|'INVALID_EVENT'|'DATABASE_UNAVAILABLE',
    readonly httpStatus:number){super(code);this.name='SyncApplyError';}
}
const uuid=z.uuid();
const MAX=9_223_372_036_854_775_807n;
type ReceiptRow=QueryResultRow & {
  event_id:string;device_id:string;sale_id:string;payload_hash:string;ack_json:PushAck;
};
type VariantRow=QueryResultRow & {
  id:string;sku:string;price_vnd:string;revision:string;active:boolean;
};
type BalanceRow=QueryResultRow & { qty:string;revision:string };
type DateRow=QueryResultRow & {received_at:Date};
function forbidden():never{throw new SyncApplyError('FORBIDDEN',403);}
function invalid():never{throw new SyncApplyError('INVALID_EVENT',422);}
function safe(error:unknown):SyncApplyError{
  if(error instanceof SyncApplyError)return error;
  return new SyncApplyError('DATABASE_UNAVAILABLE',503);
}
function review(event:PushEvent,code:'PAYLOAD_HASH_MISMATCH'|'DUPLICATE_SALE'|'INVALID_EVENT'):PushAck{
  return {eventId:event.eventId,saleId:event.saleId,status:'NEEDS_REVIEW',
    resultCode:code,conflictIds:[]};
}
function retry(event:PushEvent):PushAck{
  return {eventId:event.eventId,saleId:event.saleId,status:'RETRY',
    resultCode:'TEMPORARY_UNAVAILABLE',retryAfterSeconds:30};
}
function contextMatches(ctx:VerifiedSyncContext|null|undefined,event:PushEvent):void{
  if(!ctx||![ctx.storeId,ctx.deviceId,ctx.cashierId,ctx.offlineGrantId]
    .every(s=>uuid.safeParse(s).success))throw new SyncApplyError('UNAUTHORIZED',401);
  if(event.storeId!==ctx.storeId||event.deviceId!==ctx.deviceId||
     event.cashierId!==ctx.cashierId||event.offlineGrantId!==ctx.offlineGrantId)forbidden();
}
async function enforceServerMembership(db:PoolClient,ctx:VerifiedSyncContext):Promise<void>{
  const row=await db.query<{device_id:string}>(`
    SELECT d.id AS device_id FROM devices d
    JOIN store_memberships m ON m.store_id=d.store_id AND m.user_id=$3
    JOIN users u ON u.id=m.user_id
    WHERE d.store_id=$1 AND d.id=$2
      AND d.offline_checkout_enabled=true AND d.revoked_at IS NULL
      AND m.active=true AND u.active=true
      AND m.role IN ('ADMIN','MANAGER','CASHIER')
    FOR SHARE OF d,m,u`,[ctx.storeId,ctx.deviceId,ctx.cashierId]);
  if(!row.rows[0])forbidden();
}

async function findReceipt(db:PoolClient,event:PushEvent):Promise<ReceiptRow|undefined>{
  const r=await db.query<ReceiptRow>(`
    SELECT event_id,device_id,sale_id,payload_hash,ack_json
    FROM sync_receipts WHERE (device_id=$1 AND event_id=$2) OR sale_id=$3
    ORDER BY sale_id LIMIT 2`,[event.deviceId,event.eventId,event.saleId]);
  // With two contradictory existing records, never pick one arbitrarily.
  if(r.rows.length>1)invalid();
  return r.rows[0];
}
function replayResult(row:ReceiptRow,event:PushEvent):PushAck{
  if(row.sale_id!==event.saleId ||row.device_id!==event.deviceId ||
     row.event_id!==event.eventId)return review(event,'DUPLICATE_SALE');
  if(row.payload_hash!==event.payloadHash)return review(event,'PAYLOAD_HASH_MISMATCH');
  if(row.ack_json.status!=='ACKED'||
     row.ack_json.eventId!==event.eventId||
     row.ack_json.saleId!==event.saleId)invalid();
  return row.ack_json;
}

/**
 * A single sale event is all-or-nothing. Every transaction obtains a
 * per-store advisory lock *before* inspecting receipt uniqueness/stock.
 * MVP has one offline POS per store; serializing an offline store's sales
 * prevents concurrent duplicate/lost ACK races and balance lost updates.
 * Other stores proceed independently. Database uniqueness is the final guard.
 */
export class SyncPushService {
  constructor(private readonly pool:Pool) {}

  async push(ctx:VerifiedSyncContext|null|undefined,raw:unknown):Promise<{
    protocolVersion:1;deviceId:string;results:PushAck[];
  }>{
    const input=parsePushBatch(raw);
    if(!ctx||![ctx.storeId,ctx.deviceId,ctx.cashierId,ctx.offlineGrantId]
      .every(s=>uuid.safeParse(s).success))throw new SyncApplyError('UNAUTHORIZED',401);
    if(ctx.deviceId!==input.deviceId || ctx.storeId!==input.events[0]?.storeId)forbidden();

    const results:PushAck[]=[];
    for(const event of input.events){
      contextMatches(ctx,event);
      results.push(await this.applyOne(ctx,event));
    }
    return {protocolVersion:1,deviceId:input.deviceId,results};
  }

  private async applyOne(ctx:VerifiedSyncContext,event:PushEvent):Promise<PushAck>{
    let db:PoolClient;
    try{db=await this.pool.connect();}
    catch{return retry(event);}
    try{
      await db.query('BEGIN');
      // One transaction-level advisory lock per store. It is not a permission.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 21))',
        ['smartpos:sync:'+ctx.storeId]);
      await enforceServerMembership(db,ctx);
      const previous=await findReceipt(db,event);
      if(previous){
        const ack=replayResult(previous,event);
        await db.query('COMMIT');
        return ack;
      }
      const duplicate=await db.query<{id:string}>(`
        SELECT id FROM sales WHERE id=$1`,[event.saleId]);
      if(duplicate.rows.length){
        await db.query('COMMIT');
        return review(event,'DUPLICATE_SALE');
      }
      const variants=new Map<string,VariantRow>();
      for(const item of event.sale.items){
        if(variants.has(item.variantId))invalid();
        const found=await db.query<VariantRow>(`
          SELECT id,sku,price_vnd::text AS price_vnd,revision::text AS revision,active
          FROM product_variants WHERE store_id=$1 AND id=$2
          FOR SHARE`,[ctx.storeId,item.variantId]);
        const variant=found.rows[0];
        if(!variant||variant.sku!==item.skuSnapshot)invalid();
        variants.set(item.variantId,variant);
      }

      const sale=event.sale;
      const received=await db.query<DateRow>(`
        INSERT INTO sales(id,store_id,device_id,cashier_id,client_created_at,
          total_vnd,status) VALUES ($1,$2,$3,$4,$5,$6::bigint,'POSTED')
        RETURNING server_received_at AS received_at`,
        [event.saleId,ctx.storeId,ctx.deviceId,ctx.cashierId,
          event.clientCreatedAt,sale.totalVnd]);
      const receivedAt=received.rows[0]?.received_at?.toISOString();
      if(!receivedAt)invalid();

      const p=sale.payment;
      await db.query(`INSERT INTO payments
        (id,sale_id,method,due_vnd,tendered_vnd,change_vnd)
        VALUES ($1,$2,'CASH',$3::bigint,$4::bigint,$5::bigint)`,
        [randomUUID(),event.saleId,p.dueVnd,p.tenderedVnd,p.changeVnd]);

      const conflicts:string[]=[];
      let shortage=false,stale=false;
      for(const item of sale.items){
        const variant=variants.get(item.variantId);
        if(!variant)invalid();
        await db.query(`INSERT INTO sale_items
          (id,sale_id,variant_id,sku_snapshot,name_snapshot,
           attributes_snapshot,quantity,unit_price_vnd,discount_vnd,line_total_vnd)
          VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8::bigint,$9::bigint,$10::bigint)`,
          [item.itemId,event.saleId,item.variantId,item.skuSnapshot,item.nameSnapshot,
            JSON.stringify(item.attributesSnapshot),item.quantity,item.unitPriceVnd,
            item.discountVnd,item.lineTotalVnd]);

        await db.query(`INSERT INTO inventory_balances
          (store_id,variant_id,qty,revision) VALUES($1,$2,0,0)
          ON CONFLICT(store_id,variant_id) DO NOTHING`,[ctx.storeId,item.variantId]);
        const before=await db.query<BalanceRow>(`
          SELECT qty::text AS qty,revision::text AS revision
          FROM inventory_balances WHERE store_id=$1 AND variant_id=$2
          FOR UPDATE`,[ctx.storeId,item.variantId]);
        const bal=before.rows[0];
        if(!bal)invalid();
        const after=BigInt(bal.qty)-BigInt(item.quantity);
        if(after < -MAX-1n || after>MAX || BigInt(bal.revision)>=MAX)invalid();
        const updated=await db.query<BalanceRow>(`
          UPDATE inventory_balances SET qty=$3::bigint,revision=revision+1
          WHERE store_id=$1 AND variant_id=$2
          RETURNING qty::text AS qty,revision::text AS revision`,
          [ctx.storeId,item.variantId,String(after)]);
        if(updated.rows.length!==1)invalid();
        await db.query(`INSERT INTO inventory_movements
          (id,store_id,variant_id,sale_id,qty_delta,kind)
          VALUES($1,$2,$3,$4,$5::bigint,'SALE_OFFLINE')`,
          [randomUUID(),ctx.storeId,item.variantId,event.saleId,String(-BigInt(item.quantity))]);
        // POS-023 PULL: record the exact committed server stock snapshot
        // under the SAME per-store advisory lock and sale transaction.
        // Duplicate PUSH replay returns the stored ACK before reaching here.
        await db.query(`INSERT INTO catalog_change_log
          (store_id,entity_type,entity_id,op,payload)
          VALUES($1,'inventory_balance',$2,'UPSERT',$3::jsonb)`,
          [ctx.storeId,item.variantId,JSON.stringify({
            storeId:ctx.storeId,variantId:item.variantId,
            qty:updated.rows[0]!.qty,revision:updated.rows[0]!.revision,
          })]);
        if(after<0n){
          shortage=true;
          const conflictId=randomUUID();
          await db.query(`INSERT INTO sync_conflicts
            (id,event_id,sale_id,kind,details,status)
            VALUES($1,$2,$3,'STOCK_SHORTAGE',$4::jsonb,'OPEN')`,
            [conflictId,event.eventId,event.saleId,JSON.stringify({
              variantId:item.variantId,sku:item.skuSnapshot,beforeQty:bal.qty,
              afterQty:String(after),soldQty:String(item.quantity),
            })]);
          if(conflicts.length<20)conflicts.push(conflictId);
        }
        if(!variant.active || variant.price_vnd!==item.unitPriceVnd){
          stale=true;
          const conflictId=randomUUID();
          await db.query(`INSERT INTO sync_conflicts
            (id,event_id,sale_id,kind,details,status)
            VALUES($1,$2,$3,'STALE_PRICE',$4::jsonb,'OPEN')`,
            [conflictId,event.eventId,event.saleId,JSON.stringify({
              variantId:item.variantId,sku:item.skuSnapshot,
              soldPriceVnd:item.unitPriceVnd,serverPriceVnd:variant.price_vnd,
              variantActive:variant.active,
            })]);
          if(conflicts.length<20)conflicts.push(conflictId);
        }
      }
      const resultCode=shortage?'STOCK_SHORTAGE_RECONCILIATION':
        stale?'STALE_PRICE_REVIEW':'APPLIED';
      const ack:PushAck={
        eventId:event.eventId,saleId:event.saleId,status:'ACKED',
        resultCode,conflictIds:conflicts,serverReceivedAt:receivedAt,
      };
      // Receipt LAST. Fault here MUST roll back everything above.
      await db.query(`INSERT INTO sync_receipts
        (event_id,device_id,sale_id,payload_hash,result_code,ack_json)
        VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[
          event.eventId,event.deviceId,event.saleId,event.payloadHash,
          resultCode,JSON.stringify(ack),
        ]);
      await db.query('COMMIT');
      return ack;
    }catch(error){
      try{await db.query('ROLLBACK');}catch{ /* no confidential logs */ }
      const problem=safe(error);
      if(problem.code==='FORBIDDEN'||problem.code==='UNAUTHORIZED')throw problem;
      if(problem.code==='INVALID_EVENT')return review(event,'INVALID_EVENT');
      return retry(event);
    }finally{db.release();}
  }
}
