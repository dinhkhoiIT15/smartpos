import type { DatabaseSync } from 'node:sqlite';
import { syncPushResultSchema } from '@smartpos/contracts';

/**
 * BUG-023: cursor-covered server stock evidence for a local cash sale.
 * These helpers MUST run within an existing BEGIN IMMEDIATE SQLite transaction.
 * Coverage alone cannot authorize a payment or release local pending stock:
 * the exact POS-016 ACK must first be persisted and verified.
 */
const MAX=9223372036854775807n;
const MIN=-9223372036854775808n;
function reject(code:string):never{throw new Error('STOCK_REBASE_'+code);}
type SaleIdentity={event_id:string;device_id:string;local_device_id:string};
type Coverage={event_id:string;covered_qty:bigint;released:bigint};
type Pending={variant_id:string;event_id:string;covered_qty:bigint};
type Balance={pending_delta:bigint};

/** Remember the sale even if its ACK is missing while PULL advances cursor. */
export function recordCoveredStockDelta(
 db:DatabaseSync,storeId:string,variantId:string,
 saleId:string,eventId:string,sequence:string,
):void{
 const local=db.prepare(
  'SELECT o.event_id,o.device_id,s.device_id AS local_device_id '+
  'FROM outbox_events o JOIN local_sales s '+
  'ON s.store_id=o.store_id AND s.sale_id=o.sale_id '+
  'WHERE o.store_id=? AND o.sale_id=?'
 ).get(storeId,saleId) as SaleIdentity|undefined;
 // A server balance event from another device is not our pending sale.
 if(!local)return;
 if(local.event_id!==eventId||local.device_id!==local.local_device_id)
  reject('EVENT_IDENTITY');
 const device=db.prepare(
  'SELECT device_id FROM local_device_metadata WHERE store_id=?'
 ).get(storeId) as {device_id:string}|undefined;
 if(!device||device.device_id!==local.device_id)reject('DEVICE_SCOPE');
 const itemStmt=db.prepare(
  'SELECT quantity FROM local_sale_items '+
  'WHERE store_id=? AND sale_id=? AND variant_id=?'
 );
 itemStmt.setReadBigInts(true);
 const item=itemStmt.get(storeId,saleId,variantId) as {quantity:bigint}|undefined;
 if(!item||item.quantity<=0n)reject('SALE_ITEM');
 const seq=BigInt(sequence);
 if(seq<=0n||seq>MAX)reject('CURSOR_RANGE');
 const query=db.prepare(
  'SELECT event_id,covered_qty,released FROM local_stock_pull_coverage '+
  'WHERE store_id=? AND sale_id=? AND variant_id=?'
 );
 query.setReadBigInts(true);
 const prior=query.get(storeId,saleId,variantId) as Coverage|undefined;
 if(prior){
  if(prior.event_id!==eventId||prior.covered_qty!==item.quantity)
   reject('COVERAGE_COLLISION');
 }else{
  db.prepare(
   'INSERT INTO local_stock_pull_coverage '+
   '(store_id,variant_id,sale_id,event_id,covered_seq,covered_qty) '+
   'VALUES(?,?,?,?,?,?)'
  ).run(storeId,variantId,saleId,eventId,seq,item.quantity);
 }
 // ACK might have arrived before this PULL; release only when verified.
 releaseAckedCoveredStock(db,storeId,saleId,eventId);
}

/** Release each covered sale/SKU exactly once, atomically with its ACK. */
export function releaseAckedCoveredStock(
 db:DatabaseSync,storeId:string,saleId:string,eventId:string,
):number{
 const outbox=db.prepare(
  'SELECT state,ack_json,device_id,event_id FROM outbox_events '+
  'WHERE store_id=? AND sale_id=? AND event_id=?'
 ).get(storeId,saleId,eventId) as {
   state:string;ack_json:string|null;device_id:string;event_id:string
 }|undefined;
 if(!outbox||outbox.state!=='SYNCED')return 0;
 const sale=db.prepare(
  'SELECT device_id FROM local_sales WHERE store_id=? AND sale_id=?'
 ).get(storeId,saleId) as {device_id:string}|undefined;
 if(!sale||sale.device_id!==outbox.device_id)reject('ACK_DEVICE');
 let parsed:unknown;
 try{parsed=JSON.parse(outbox.ack_json??'');}catch{reject('INVALID_ACK');}
 const verified=syncPushResultSchema.safeParse(parsed);
 if(!verified.success||verified.data.status!=='ACKED'||
    verified.data.saleId!==saleId||verified.data.eventId!==eventId)
  reject('INVALID_ACK');
 const stmt=db.prepare(
  'SELECT variant_id,event_id,covered_qty FROM local_stock_pull_coverage '+
  'WHERE store_id=? AND sale_id=? AND released=0 ORDER BY variant_id'
 );
 stmt.setReadBigInts(true);
 const markers=stmt.all(storeId,saleId) as Pending[];
 for(const row of markers){
  if(row.event_id!==eventId||row.covered_qty<=0n)
   reject('COVERAGE_COLLISION');
  const balanceStmt=db.prepare(
   'SELECT pending_delta FROM local_inventory_balances '+
   'WHERE store_id=? AND variant_id=?'
  );
  balanceStmt.setReadBigInts(true);
  const before=balanceStmt.get(storeId,row.variant_id) as Balance|undefined;
  if(!before)reject('MISSING_BALANCE');
  const next=before.pending_delta+row.covered_qty;
  if(next>0n||next>MAX||next<MIN)reject('PENDING_OVERFLOW');
  const updated=db.prepare(
   'UPDATE local_inventory_balances SET pending_delta=? '+
   'WHERE store_id=? AND variant_id=? AND pending_delta=?'
  ).run(next,storeId,row.variant_id,before.pending_delta);
  if(updated.changes!==1)reject('BALANCE_RACE');
  const released=db.prepare(
   'UPDATE local_stock_pull_coverage SET released=1 '+
   'WHERE store_id=? AND sale_id=? AND variant_id=? '+
   'AND event_id=? AND released=0'
  ).run(storeId,saleId,row.variant_id,eventId);
  if(released.changes!==1)reject('COVERAGE_RACE');
 }
 return markers.length;
}
