import type {DatabaseSync} from 'node:sqlite';
import {loadCommittedLocalReceipt} from './receipt.ts';

/**
 * POS-026 MAIN-only historical projection, NEVER exposed through IPC.
 * Caller scope below is a consistency boundary, not an authentication grant:
 * real cashier/shift/device proof (D-013) is still required prior to exposure.
 * This module reads only; no UPDATE, transport, secrets or network access.
 *
 * Do not sum server ACKED local copies with server POSTED; do not claim that
 * unconfirmed local NEEDS_REVIEW was definitely absent on the server.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const SKU=/^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const OFFSET_VN_MS=7*3600_000;
const MAX_SCAN=5000;
const kindValues=['LOCAL_PENDING','LOCAL_NEEDS_REVIEW_UNCONFIRMED',
  'SERVER_ACKED_MIRROR'] as const;
export type LocalReportKind=typeof kindValues[number];
export type LocalReportIdentity=Readonly<{
  storeId:string;deviceId:string;userId:string;
  role:'ADMIN'|'MANAGER'|'CASHIER';
}>;
export type LocalHistoryQuery=Readonly<{
  from:string;to:string;cashierId?:string;sku?:string;
  kind?:LocalReportKind;limit?:number;offset?:number;
}>;
export type LocalHistoryRow=Readonly<{
  saleId:string;cashierId:string;deviceId:string;clientCreatedAt:string;
  totalVnd:string;kind:LocalReportKind;syncStatus:string;
  lines:readonly Readonly<{
    sku:string;name:string;quantity:number;
    unitPriceVnd:string;discountVnd:string;lineTotalVnd:string;
  }>[];
}>;
export type LocalSalesReport=Readonly<{
  source:'LOCAL_SQLITE';timezone:'Asia/Ho_Chi_Minh';
  dateBasis:'CLIENT_CREATED_AT';storeId:string;deviceId:string;
  from:string;to:string;cashierId:string|null;sku:string|null;kind:LocalReportKind|null;
  limit:number;offset:number;matchedSaleCount:string;matchedSalesGrossVnd:string;
  skuLineGrossVnd:string;byKind:readonly Readonly<{
    kind:LocalReportKind;saleCount:string;grossVnd:string;
  }>[];
  days:readonly Readonly<{day:string;saleCount:string;grossVnd:string}>[];
  cashiers:readonly Readonly<{cashierId:string;saleCount:string;grossVnd:string}>[];
  topSkus:readonly Readonly<{sku:string;quantity:string;lineGrossVnd:string}>[];
  topSkusTruncated:boolean;
  sales:readonly LocalHistoryRow[];hasMore:boolean;
  readLimit:5000;combinedCloudLocalTotalAvailable:false;
}>;
type SaleRow={sale_id:string;cashier_id:string;client_created_at:string;
  sync_status:string;state:string;ack_json:string|null;event_id:string;};
function reject(code:string):never{throw new Error('LOCAL_REPORT_'+code);}
function validateId(v:unknown):string{
  if(typeof v!=='string'||!UUID.test(v))reject('INVALID_ID');
  return v;
}
function vnDay(dateIso:string):string{
  const time=Date.parse(dateIso);
  if(!Number.isFinite(time))reject('INVALID_TIMESTAMP');
  return new Date(time+OFFSET_VN_MS).toISOString().slice(0,10);
}
function bounds(raw:LocalHistoryQuery):{start:string;end:string}{
  if(typeof raw.from!=='string'||typeof raw.to!=='string'||
      !DATE.test(raw.from)||!DATE.test(raw.to))reject('INVALID_DATE');
  const from=Date.parse(raw.from+'T00:00:00.000Z'),
    to=Date.parse(raw.to+'T00:00:00.000Z');
  if(!Number.isFinite(from)||!Number.isFinite(to)||
      new Date(from).toISOString().slice(0,10)!==raw.from||
      new Date(to).toISOString().slice(0,10)!==raw.to||
      to<from||to-from>30*86400000)reject('INVALID_DATE');
  return {start:new Date(from-OFFSET_VN_MS).toISOString(),
    end:new Date(to+86400000-OFFSET_VN_MS).toISOString()};
}
function parseQuery(raw:unknown):LocalHistoryQuery&{limit:number;offset:number}{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))reject('INVALID_QUERY');
  const q=raw as Record<string,unknown>;
  if(Object.keys(q).some(k=>!['from','to','cashierId','sku','kind','limit','offset'].includes(k)))
    reject('INVALID_QUERY');
  const limit=q.limit??25,offset=q.offset??0;
  if(typeof limit!=='number'||!Number.isInteger(limit)||limit<1||limit>100||
     typeof offset!=='number'||!Number.isInteger(offset)||offset<0||offset>10000)
    reject('INVALID_PAGINATION');
  if(q.cashierId!==undefined)validateId(q.cashierId);
  if(q.sku!==undefined&&(typeof q.sku!=='string'||!SKU.test(q.sku)))
    reject('INVALID_SKU');
  if(q.kind!==undefined&&!kindValues.includes(q.kind as LocalReportKind))
    reject('INVALID_KIND');
  return {...q,from:q.from as string,to:q.to as string,limit,offset} as
    LocalHistoryQuery&{limit:number;offset:number};
}
function classify(sale:SaleRow):LocalReportKind{
  const state=sale.state,status=sale.sync_status;
  if(state==='SYNCED'){
    if(status!=='SYNCED'&&status!=='NEEDS_REVIEW')reject('STATE_CONTRADICTION');
    if(!sale.ack_json)reject('MISSING_ACK');
    let ack:Record<string,unknown>;
    try{
      const parsed:unknown=JSON.parse(sale.ack_json);
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))reject('INVALID_ACK');
      ack=parsed as Record<string,unknown>;
    }catch{reject('INVALID_ACK');}
    if(ack.eventId!==sale.event_id||ack.saleId!==sale.sale_id||
      ack.status!=='ACKED'||typeof ack.serverReceivedAt!=='string'||
      !['APPLIED','STOCK_SHORTAGE_RECONCILIATION','STALE_PRICE_REVIEW']
        .includes(String(ack.resultCode)) ||
      (status==='SYNCED'&&ack.resultCode!=='APPLIED')||
      (status==='NEEDS_REVIEW'&&ack.resultCode==='APPLIED'))
      reject('INVALID_ACK');
    return 'SERVER_ACKED_MIRROR';
  }
  if(status==='PENDING_SYNC'&&['PENDING','SYNCING','RETRY'].includes(state))
    return 'LOCAL_PENDING';
  if(status==='NEEDS_REVIEW'&&state==='NEEDS_REVIEW')
    return 'LOCAL_NEEDS_REVIEW_UNCONFIRMED';
  return reject('STATE_CONTRADICTION');
}
const byKey=<T extends string>(map:Map<T,{n:bigint;gross:bigint}>,
  key:T,amount:bigint)=>{
  const old=map.get(key)??{n:0n,gross:0n};
  map.set(key,{n:old.n+1n,gross:old.gross+amount});
};
export function readLocalSalesReport(db:DatabaseSync,scope:LocalReportIdentity,
  raw:unknown):LocalSalesReport {
  const storeId=validateId(scope.storeId),deviceId=validateId(scope.deviceId),
    userId=validateId(scope.userId);
  if(!['ADMIN','MANAGER','CASHIER'].includes(scope.role))reject('INVALID_ROLE');
  const q=parseQuery(raw),{start,end}=bounds(q);
  if(q.cashierId&&scope.role==='CASHIER'&&q.cashierId!==userId)
    reject('FORBIDDEN');
  const cashier=scope.role==='CASHIER'?userId:q.cashierId??null;
  const device=db.prepare(`SELECT device_id FROM local_device_metadata
    WHERE store_id=? AND device_id=?`).get(storeId,deviceId);
  if(!device)reject('DEVICE_SCOPE');
  // Hard scan cap: never return a partial summary and call it complete.
  const records=db.prepare(`
    SELECT s.sale_id,s.cashier_id,s.client_created_at,s.sync_status,
      o.state,o.ack_json,o.event_id
    FROM local_sales s JOIN outbox_events o
      ON o.sale_id=s.sale_id AND o.store_id=s.store_id AND o.device_id=s.device_id
    WHERE s.store_id=? AND s.device_id=? AND s.client_created_at>=?
      AND s.client_created_at<? AND (? IS NULL OR s.cashier_id=?)
    ORDER BY s.client_created_at DESC,s.sale_id DESC LIMIT 5001
  `).all(storeId,deviceId,start,end,cashier,cashier) as SaleRow[];
  if(records.length>MAX_SCAN)reject('SCAN_LIMIT');
  // Anti-loss check: join cannot hide sales with missing outbox.
  const total=db.prepare(`SELECT count(*) AS n FROM local_sales
    WHERE store_id=? AND device_id=? AND client_created_at>=?
      AND client_created_at<? AND (? IS NULL OR cashier_id=?)`)
    .get(storeId,deviceId,start,end,cashier,cashier) as {n:number};
  if(total.n!==records.length)reject('MISSING_EVIDENCE');
  const selected:LocalHistoryRow[]=[];
  const byKind=new Map<LocalReportKind,{n:bigint;gross:bigint}>(),
    byDay=new Map<string,{n:bigint;gross:bigint}>(),
    byCashier=new Map<string,{n:bigint;gross:bigint}>(),
    bySku=new Map<string,{qty:bigint;gross:bigint}>();
  let gross=0n,skuGross=0n;
  for(const row of records){
    const receipt=loadCommittedLocalReceipt(db,storeId,row.sale_id);
    if(!receipt||receipt.cashierId!==row.cashier_id||
      receipt.clientCreatedAt!==row.client_created_at||
      receipt.syncStatus!==row.sync_status)reject('RECEIPT_MISMATCH');
    const kind=classify(row);
    if(q.kind&&kind!==q.kind)continue;
    if(q.sku&&!receipt.items.some(line=>line.sku===q.sku))continue;
    const subtotal=BigInt(receipt.dueVnd);
    gross+=subtotal;
    byKey(byKind,kind,subtotal);
    byKey(byDay,vnDay(receipt.clientCreatedAt),subtotal);
    byKey(byCashier,receipt.cashierId,subtotal);
    for(const item of receipt.items){
      if(q.sku&&item.sku!==q.sku)continue;
      const value=BigInt(item.lineTotalVnd);
      skuGross+=value;
      const previous=bySku.get(item.sku)??{qty:0n,gross:0n};
      bySku.set(item.sku,{qty:previous.qty+BigInt(item.quantity),
        gross:previous.gross+value});
    }
    selected.push({
      saleId:row.sale_id,cashierId:row.cashier_id,deviceId,
      clientCreatedAt:receipt.clientCreatedAt,totalVnd:receipt.dueVnd,
      syncStatus:row.sync_status,kind,
      lines:receipt.items.map(item=>({
        sku:item.sku,name:item.name,quantity:item.quantity,
        unitPriceVnd:item.unitPriceVnd,discountVnd:item.discountVnd,
        lineTotalVnd:item.lineTotalVnd,
      })),
    });
  }
  const skuSorted=[...bySku].sort((a,b)=>{
    if(a[1].gross!==b[1].gross)return a[1].gross>b[1].gross?-1:1;
    return a[0]<b[0]?-1:1;
  });
  return {
    source:'LOCAL_SQLITE',timezone:'Asia/Ho_Chi_Minh',dateBasis:'CLIENT_CREATED_AT',
    storeId,deviceId,from:q.from,to:q.to,cashierId:cashier,
    sku:q.sku??null,kind:q.kind??null,limit:q.limit,offset:q.offset,
    matchedSaleCount:String(selected.length),
    matchedSalesGrossVnd:String(gross),skuLineGrossVnd:String(skuGross),
    byKind:kindValues.map(kind=>({
      kind,saleCount:String(byKind.get(kind)?.n??0n),
      grossVnd:String(byKind.get(kind)?.gross??0n),
    })),
    days:[...byDay].sort((a,b)=>a[0].localeCompare(b[0])).map(([day,v])=>({
      day,saleCount:String(v.n),grossVnd:String(v.gross),
    })),
    cashiers:[...byCashier].sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([cashierId,v])=>({cashierId,
        saleCount:String(v.n),grossVnd:String(v.gross)})),
    topSkus:skuSorted.slice(0,50).map(([sku,v])=>({
      sku,quantity:String(v.qty),lineGrossVnd:String(v.gross),
    })),topSkusTruncated:skuSorted.length>50,
    sales:selected.slice(q.offset,q.offset+q.limit),
    hasMore:selected.length>q.offset+q.limit,
    readLimit:5000,combinedCloudLocalTotalAvailable:false,
  };
}
