import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {z} from 'zod';
import type {CatalogPrincipal} from '../catalog/service.js';

/**
 * POS-026: SERVER POSTED ONLY, internal read-only projection.
 * This is NOT a public reporting API or a login adapter. A trusted principal
 * must come from a verified server session (POS-025), never x-role/store headers.
 * No Neon is contacted by construction; normal main.ts does NOT mount routes.
 *
 * Reporting dates use CLIENT-created time in Asia/Ho_Chi_Minh (BR-012);
 * they are NOT proof of server receipt time or a settlement date. Never combine
 * these figures with the local ACKED mirror or uncertain local sales as one total.
 */
const uuid=z.uuid();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const pageInt=(min:number,max:number)=>z.union([
  z.number().int(),z.string().regex(/^(0|[1-9][0-9]*)$/).transform(Number),
]).pipe(z.number().int().min(min).max(max));
export const salesReportQuerySchema=z.strictObject({
  from:date,to:date,
  cashierId:uuid.optional(),
  sku:z.string().regex(/^[A-Z0-9][A-Z0-9._-]{0,63}$/).optional(),
  limit:pageInt(1,100).default(25),
  offset:pageInt(0,10000).default(0),
}).superRefine((value,ctx)=>{
  const from=Date.parse(value.from+'T00:00:00.000Z');
  const to=Date.parse(value.to+'T00:00:00.000Z');
  if(!Number.isFinite(from)||!Number.isFinite(to)||
    new Date(from).toISOString().slice(0,10)!==value.from||
    new Date(to).toISOString().slice(0,10)!==value.to||
    to<from||to-from>30*86_400_000)
    ctx.addIssue({code:'custom',message:'INVALID_REPORT_RANGE',path:['to']});
});
export type ReportQuery=z.infer<typeof salesReportQuerySchema>;
export class SalesReportError extends Error {
  constructor(readonly code:'UNAUTHORIZED'|'FORBIDDEN'|'DATABASE_UNAVAILABLE',
    readonly httpStatus:number){super(code);this.name='SalesReportError';}
}
export type ServerSaleHistory=Readonly<{
  saleId:string;cashierId:string;deviceId:string;
  clientCreatedAt:string;serverReceivedAt:string;totalVnd:string;
  openConflictCount:string;conflictCount:string;
  source:'CLOUD_POSTED';
  lines:readonly Readonly<{sku:string;name:string;quantity:number;
    lineTotalVnd:string;unitPriceVnd:string;discountVnd:string}>[];
}>;
export type ServerSalesReport=Readonly<{
  source:'CLOUD_POSTED';asOf:'DATABASE_SNAPSHOT';
  timezone:'Asia/Ho_Chi_Minh';dateBasis:'CLIENT_CREATED_AT';
  skuFilterMode:'FULL_SALE_TOTALS_FOR_MATCHED_SKU';
  storeId:string;from:string;to:string;
  cashierId:string|null;sku:string|null;limit:number;offset:number;
  matchedSaleCount:string;matchedSalesGrossVnd:string;
  skuLineGrossVnd:string;
  days:readonly Readonly<{day:string;saleCount:string;grossVnd:string}>[];
  cashiers:readonly Readonly<{cashierId:string;saleCount:string;grossVnd:string}>[];
  topSkus:readonly Readonly<{sku:string;quantity:string;lineGrossVnd:string}>[];
  topSkusTruncated:boolean;
  sales:readonly ServerSaleHistory[];
  hasMore:boolean;
}>;
type SaleRow=QueryResultRow&{
  id:string;cashier_id:string;device_id:string;
  client_created_at:Date;server_received_at:Date;total_vnd:string;
  open_conflicts:string;total_conflicts:string;
};
type ItemRow=QueryResultRow&{
  sale_id:string;sku_snapshot:string;name_snapshot:string;quantity:number;
  unit_price_vnd:string;discount_vnd:string;line_total_vnd:string;
};
type SummaryRow=QueryResultRow&{count:string;gross:string};
type DayRow=QueryResultRow&{day:string;count:string;gross:string};
type CashierRow=QueryResultRow&{cashier_id:string;count:string;gross:string};
type SkuRow=QueryResultRow&{sku:string;qty:string;gross:string};

function validPrincipal(actor:CatalogPrincipal|null|undefined):
  asserts actor is CatalogPrincipal {
  if(!actor||!uuid.safeParse(actor.userId).success||!uuid.safeParse(actor.storeId).success)
    throw new SalesReportError('UNAUTHORIZED',401);
  if(!['ADMIN','MANAGER','CASHIER'].includes(actor.role))
    throw new SalesReportError('FORBIDDEN',403);
}
function safe(error:unknown):SalesReportError|z.ZodError {
  if(error instanceof SalesReportError||error instanceof z.ZodError)return error;
  return new SalesReportError('DATABASE_UNAVAILABLE',503);
}
// Same filter for all queries. $4=effective cashier, $5=optional SKU.
// EXISTS limits sales to those containing SKU, but matchedSalesGrossVnd is
// explicitly the ENTIRE gross of those sales; skuLineGrossVnd is only that
// SKU's line totals. Never confuse these two numbers in the UI.
const filtered=`
 FROM sales s WHERE s.store_id=$1 AND s.status='POSTED'
  AND (s.client_created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      BETWEEN $2::date AND $3::date
  AND ($4::uuid IS NULL OR s.cashier_id=$4::uuid)
  AND ($5::text IS NULL OR EXISTS (
    SELECT 1 FROM sale_items f WHERE f.sale_id=s.id AND f.sku_snapshot=$5
  ))
`;
const values=(actor:CatalogPrincipal,q:ReportQuery):[string,string,string,string|null,string|null]=>
  [actor.storeId,q.from,q.to,actor.role==='CASHIER'?actor.userId:q.cashierId??null,q.sku??null];

export class SalesReportService {
  constructor(private readonly pool:Pool){}
  async report(actor:CatalogPrincipal|null|undefined,raw:unknown):Promise<ServerSalesReport>{
    validPrincipal(actor);
    const q=salesReportQuerySchema.parse(raw);
    if(actor.role==='CASHIER'&&q.cashierId&&q.cashierId!==actor.userId)
      throw new SalesReportError('FORBIDDEN',403);
    let db:PoolClient;
    try{db=await this.pool.connect();}
    catch{throw new SalesReportError('DATABASE_UNAVAILABLE',503);}
    try{
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const membership=await db.query<{role:string}>(`
        SELECT m.role FROM store_memberships m JOIN users u ON u.id=m.user_id
        WHERE m.store_id=$1 AND m.user_id=$2 AND m.role=$3
          AND m.active=true AND u.active=true
          AND m.role IN ('ADMIN','MANAGER','CASHIER')`,
        [actor.storeId,actor.userId,actor.role]);
      if(membership.rows.length!==1)throw new SalesReportError('FORBIDDEN',403);
      const params=values(actor,q);
      const main=await db.query<SummaryRow>(`
        SELECT count(*)::text AS count,
          COALESCE(sum(s.total_vnd::numeric),0)::text AS gross
      `+filtered,params);
      const days=await db.query<DayRow>(`
        SELECT (s.client_created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS day,
          count(*)::text AS count,coalesce(sum(s.total_vnd::numeric),0)::text AS gross
      `+filtered+`
        GROUP BY day ORDER BY day`,params);
      const cashiers=await db.query<CashierRow>(`
        SELECT s.cashier_id,count(*)::text AS count,
          coalesce(sum(s.total_vnd::numeric),0)::text AS gross
      `+filtered+`
        GROUP BY s.cashier_id ORDER BY s.cashier_id`,params);
      const skuSum=await db.query<{gross:string}>(`
        SELECT coalesce(sum(i.line_total_vnd::numeric),0)::text AS gross
        FROM sale_items i JOIN sales s ON s.id=i.sale_id
        WHERE s.store_id=$1 AND s.status='POSTED'
          AND (s.client_created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
              BETWEEN $2::date AND $3::date
          AND ($4::uuid IS NULL OR s.cashier_id=$4::uuid)
          AND ($5::text IS NULL OR i.sku_snapshot=$5)`,params);
      // This query intentionally groups all eligible lines, not JOINing sale
      // totals (which would overcount multi-line sales).
      const top=await db.query<SkuRow>(`
        SELECT i.sku_snapshot AS sku,sum(i.quantity::numeric)::text AS qty,
          sum(i.line_total_vnd::numeric)::text AS gross
        FROM sale_items i JOIN sales s ON s.id=i.sale_id
        WHERE s.store_id=$1 AND s.status='POSTED'
          AND (s.client_created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
              BETWEEN $2::date AND $3::date
          AND ($4::uuid IS NULL OR s.cashier_id=$4::uuid)
          AND ($5::text IS NULL OR i.sku_snapshot=$5)
        GROUP BY i.sku_snapshot ORDER BY gross::numeric DESC,i.sku_snapshot
        LIMIT 51`,params);
      const history=await db.query<SaleRow>(`
        SELECT s.id,s.cashier_id,s.device_id,s.client_created_at,
          s.server_received_at,s.total_vnd::text,
          (SELECT count(*)::text FROM sync_conflicts c WHERE c.sale_id=s.id
            AND c.status='OPEN') AS open_conflicts,
          (SELECT count(*)::text FROM sync_conflicts c WHERE c.sale_id=s.id)
            AS total_conflicts
      `+filtered+`
        ORDER BY s.client_created_at DESC,s.id DESC LIMIT $6 OFFSET $7`,
        [...params,q.limit+1,q.offset]);
      const visible=history.rows.slice(0,q.limit);
      const ids=visible.map(r=>r.id);
      const lines=ids.length ? await db.query<ItemRow>(`
        SELECT i.sale_id,i.sku_snapshot,i.name_snapshot,i.quantity,
          i.unit_price_vnd::text,i.discount_vnd::text,i.line_total_vnd::text
        FROM sale_items i JOIN sales s ON s.id=i.sale_id
        WHERE s.store_id=$1 AND i.sale_id=ANY($2::uuid[])
        ORDER BY i.sale_id,i.sku_snapshot,i.id`,[actor.storeId,ids]) : {rows:[]};
      const bySale=new Map<string,ItemRow[]>();
      for(const row of lines.rows){
        const list=bySale.get(row.sale_id)??[];
        list.push(row);bySale.set(row.sale_id,list);
      }
      const sales:ServerSaleHistory[]=visible.map(row=>({
        saleId:row.id,cashierId:row.cashier_id,deviceId:row.device_id,
        clientCreatedAt:row.client_created_at.toISOString(),
        serverReceivedAt:row.server_received_at.toISOString(),
        totalVnd:row.total_vnd,openConflictCount:row.open_conflicts,
        conflictCount:row.total_conflicts,source:'CLOUD_POSTED',
        lines:(bySale.get(row.id)??[]).map(i=>({
          sku:i.sku_snapshot,name:i.name_snapshot,quantity:i.quantity,
          lineTotalVnd:i.line_total_vnd,unitPriceVnd:i.unit_price_vnd,
          discountVnd:i.discount_vnd,
        })),
      }));
      const response:ServerSalesReport={
        source:'CLOUD_POSTED',asOf:'DATABASE_SNAPSHOT',
        timezone:'Asia/Ho_Chi_Minh',dateBasis:'CLIENT_CREATED_AT',
        skuFilterMode:'FULL_SALE_TOTALS_FOR_MATCHED_SKU',
        storeId:actor.storeId,from:q.from,to:q.to,
        cashierId:params[3],sku:params[4],limit:q.limit,offset:q.offset,
        matchedSaleCount:main.rows[0]?.count??'0',
        matchedSalesGrossVnd:main.rows[0]?.gross??'0',
        skuLineGrossVnd:skuSum.rows[0]?.gross??'0',
        days:days.rows.map(r=>({day:r.day,saleCount:r.count,grossVnd:r.gross})),
        cashiers:cashiers.rows.map(r=>({cashierId:r.cashier_id,
          saleCount:r.count,grossVnd:r.gross})),
        topSkus:top.rows.slice(0,50).map(r=>({sku:r.sku,quantity:r.qty,
          lineGrossVnd:r.gross})),
        topSkusTruncated:top.rows.length>50,
        sales,hasMore:history.rows.length>q.limit,
      };
      await db.query('COMMIT');
      return response;
    }catch(error){
      try{await db.query('ROLLBACK');}catch{ /* fail closed, no secrets */ }
      throw safe(error);
    }finally{db.release();}
  }
}
