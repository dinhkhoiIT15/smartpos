import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ReceiptInput, ReceiptLine, PersistedReceiptState } from '@smartpos/domain/receipt';

/**
 * POS-020: READ-ONLY persisted sale receipt projection, Electron MAIN only.
 *
 * IMPORTANT: Not exposed over IPC/preload or the demo cart. D-013 signed
 * offline device/cashier authorization and per-cashier read grants are still
 * required before a renderer may display any real committed sale.
 *
 * Never re-read mutable catalog prices for historic sales. Derive all
 * presentation fields from immutable sale/items/payment/outbox evidence and
 * fail closed on missing, inconsistent, duplicate or tampered rows.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_INT64 = 9_223_372_036_854_775_807n;
const MAX_QTY = 2_147_483_647n;
type SaleRow = {
  sale_id:string;store_id:string;device_id:string;cashier_id:string;
  client_created_at:string;total_vnd:bigint;sync_status:string;
};
type ItemRow = {
  item_id:string;store_id:string;variant_id:string;
  sku_snapshot:string;name_snapshot:string;attributes_snapshot_json:string;
  quantity:bigint;unit_price_vnd:bigint;discount_vnd:bigint;line_total_vnd:bigint;
};
type PaymentRow = {
  payment_id:string;method:string;due_vnd:bigint;
  tendered_vnd:bigint;change_vnd:bigint;
};
type OutboxRow = {
  event_id:string;sale_id:string;store_id:string;device_id:string;
  schema_version:bigint;payload_json:string;payload_hash:string;
};

function reject(code:string):never{ throw new Error('RECEIPT_DB_'+code); }
function uuid(value:unknown):string{
  if(typeof value!=='string' || !UUID.test(value)) reject('INVALID_UUID');
  return value;
}
function amount(v:bigint):string{
  if(typeof v!=='bigint'||v<0n||v>MAX_INT64) reject('INVALID_AMOUNT');
  return String(v);
}
function object(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)) reject('INVALID_EVENT');
  return value as Record<string,unknown>;
}
function canonicalJson(value:unknown):string{
  if(value===null)return 'null';
  if(typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){
    if(!Number.isSafeInteger(value))reject('INVALID_EVENT');
    return JSON.stringify(value);
  }
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  if(typeof value==='object'){
    return '{'+Object.entries(value)
      .sort(([a],[b])=>a<b?-1:a>b?1:0)
      .map(([key,val])=>JSON.stringify(key)+':'+canonicalJson(val)).join(',')+'}';
  }
  return reject('INVALID_EVENT');
}
function strictUtc(value:string):void {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString()!==value)reject('TIMESTAMP');
}
/** No mutation, never adds a sale, never marks an event synced. */
export function loadCommittedLocalReceipt(
  db:DatabaseSync,storeIdInput:string,saleIdInput:string,
):ReceiptInput|null {
  const storeId=uuid(storeIdInput),saleId=uuid(saleIdInput);
  const getSale=db.prepare(`SELECT sale_id,store_id,device_id,cashier_id,
    client_created_at,total_vnd,sync_status FROM local_sales
    WHERE store_id=? AND sale_id=?`);
  getSale.setReadBigInts(true);
  const sale=getSale.get(storeId,saleId) as SaleRow|undefined;
  if(!sale)return null;
  uuid(sale.device_id);uuid(sale.cashier_id);
  strictUtc(sale.client_created_at);
  if(!['PENDING_SYNC','SYNCED','NEEDS_REVIEW'].includes(sale.sync_status))reject('SYNC_STATE');
  const due=amount(sale.total_vnd);

  const getItems=db.prepare(`SELECT item_id,store_id,variant_id,sku_snapshot,
    name_snapshot,attributes_snapshot_json,quantity,unit_price_vnd,
    discount_vnd,line_total_vnd FROM local_sale_items
    WHERE store_id=? AND sale_id=? ORDER BY sku_snapshot, item_id`);
  getItems.setReadBigInts(true);
  const rawItems=getItems.all(storeId,saleId) as ItemRow[];
  if(rawItems.length<1||rawItems.length>100)reject('ITEM_COUNT');
  const skuSeen=new Set<string>(),itemSeen=new Set<string>();
  let computedTotal=0n;
  const items:ReceiptLine[]=[];
  for(const item of rawItems){
    uuid(item.item_id);uuid(item.variant_id);
    if(item.store_id!==storeId||itemSeen.has(item.item_id)||skuSeen.has(item.sku_snapshot))
      reject('ITEM_IDENTITY');
    itemSeen.add(item.item_id);skuSeen.add(item.sku_snapshot);
    if(item.quantity<1n||item.quantity>MAX_QTY)reject('QUANTITY');
    const unit=amount(item.unit_price_vnd);
    const discount=amount(item.discount_vnd);
    const lineTotal=amount(item.line_total_vnd);
    const product=item.quantity*BigInt(unit);
    if(product>MAX_INT64||BigInt(discount)>product||
      product-BigInt(discount)!==BigInt(lineTotal))reject('LINE_TOTAL');
    computedTotal+=BigInt(lineTotal);
    if(computedTotal>MAX_INT64)reject('INTEGER_OVERFLOW');
    let attrs:unknown;
    try{attrs=JSON.parse(item.attributes_snapshot_json);}
    catch{reject('ATTRIBUTES');}
    object(attrs);
    items.push({
      sku:item.sku_snapshot,name:item.name_snapshot,
      attributes:attrs as Record<string,string>,
      quantity:Number(item.quantity),unitPriceVnd:unit,
      discountVnd:discount,lineTotalVnd:lineTotal,
    });
  }
  if(computedTotal!==BigInt(due))reject('TOTAL_MISMATCH');

  const payStmt=db.prepare(`SELECT payment_id,method,due_vnd,
    tendered_vnd,change_vnd FROM local_payments WHERE sale_id=?`);
  payStmt.setReadBigInts(true);
  const payment=payStmt.get(saleId) as PaymentRow|undefined;
  if(!payment||payment.method!=='CASH')reject('PAYMENT');
  uuid(payment.payment_id);
  if(amount(payment.due_vnd)!==due)reject('PAYMENT_DUE');
  const tendered=amount(payment.tendered_vnd),change=amount(payment.change_vnd);
  if(BigInt(tendered)<BigInt(due) ||
    BigInt(tendered)-BigInt(due)!==BigInt(change))reject('PAYMENT_CASH');

  const eventStmt=db.prepare(`SELECT event_id,sale_id,store_id,device_id,
    schema_version,payload_json,payload_hash FROM outbox_events WHERE sale_id=?`);
  eventStmt.setReadBigInts(true);
  const outbox=eventStmt.get(saleId) as OutboxRow|undefined;
  if(!outbox||outbox.schema_version!==1n ||
     outbox.sale_id!==saleId||outbox.store_id!==storeId||
     outbox.device_id!==sale.device_id)reject('OUTBOX');
  uuid(outbox.event_id);
  let parsed:unknown;
  try{parsed=JSON.parse(outbox.payload_json);}catch{reject('EVENT_JSON');}
  const event=object(parsed);
  if(typeof event.payloadHash!=='string' ||
    event.payloadHash!==outbox.payload_hash ||
    !/^[0-9a-f]{64}$/.test(outbox.payload_hash))reject('EVENT_HASH');
  const {payloadHash,...body}=event;
  if(createHash('sha256').update(canonicalJson(body),'utf8').digest('hex')!==payloadHash)
    reject('EVENT_HASH');
  if(event.schemaVersion!==1||event.eventType!=='SALE_COMPLETED'||
    event.eventId!==outbox.event_id||event.saleId!==saleId||
    event.storeId!==storeId||event.deviceId!==sale.device_id||
    event.cashierId!==sale.cashier_id||event.clientCreatedAt!==sale.client_created_at)
    reject('EVENT_IDENTITY');
  const eventSale=object(event.sale),eventPay=object(eventSale.payment);
  if(eventSale.status!=='POSTED'||eventSale.totalVnd!==due||
    eventPay.method!=='CASH'||eventPay.dueVnd!==due||
    eventPay.tenderedVnd!==tendered||eventPay.changeVnd!==change)
    reject('EVENT_PAYMENT');
  if(!Array.isArray(eventSale.items)||eventSale.items.length!==rawItems.length)
    reject('EVENT_ITEMS');
  const savedById=new Map(rawItems.map(item=>[item.item_id,item]));
  const eventIds=new Set<string>();
  for(const raw of eventSale.items){
    const line=object(raw);
    if(typeof line.itemId!=='string'||eventIds.has(line.itemId))reject('EVENT_ITEMS');
    eventIds.add(line.itemId);
    const dbItem=savedById.get(line.itemId);
    if(!dbItem||line.variantId!==dbItem.variant_id||
      line.skuSnapshot!==dbItem.sku_snapshot||
      line.nameSnapshot!==dbItem.name_snapshot||
      line.quantity!==Number(dbItem.quantity)||
      line.unitPriceVnd!==String(dbItem.unit_price_vnd)||
      line.discountVnd!==String(dbItem.discount_vnd)||
      line.lineTotalVnd!==String(dbItem.line_total_vnd)||
      canonicalJson(line.attributesSnapshot)!==
        canonicalJson(JSON.parse(dbItem.attributes_snapshot_json)))reject('EVENT_ITEMS');
  }
  return {
    saleId,cashierId:sale.cashier_id,clientCreatedAt:sale.client_created_at,
    syncStatus:sale.sync_status as PersistedReceiptState,
    items,dueVnd:due,tenderedVnd:tendered,changeVnd:change,
  };
}
