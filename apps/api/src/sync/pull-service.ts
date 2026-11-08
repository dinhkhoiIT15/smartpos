import type { Pool,PoolClient,QueryResultRow } from 'pg';
import { z } from 'zod';
import type { VerifiedSyncContext } from './service.js';

/**
 * POS-023 internal read-side PULL only. Not registered in production server:
 * D-013 cryptographically verified device/cashier session and signed grant
 * remain mandatory. A caller-provided UUID/header is never authorization.
 *
 * Writer transactions must use lockCatalogStream() BEFORE their first change
 * in catalog_change_log. This prevents PostgreSQL identity allocation/commit
 * reordering across concurrent writers from silently skipping sequence IDs.
 * Distinct stores use separate advisory locks; gaps across stores are legal.
 */
export const CATALOG_STREAM_LOCK_SEED=21;
export async function lockCatalogStream(client:PoolClient,storeId:string):Promise<void>{
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,21))',
    ['smartpos:sync:'+storeId]);
}

const uuid=z.uuid();
const cursor=z.string().regex(/^(0|[1-9][0-9]*)$/).max(19)
  .refine(v=>/^(0|[1-9][0-9]*)$/.test(v)&&BigInt(v)<=9223372036854775807n);
const schema=z.strictObject({
  cursor:cursor.optional().default('0'),
  limit:z.union([z.number().int().min(1).max(100),
    z.string().regex(/^[1-9][0-9]{0,2}$/).transform(Number)
      .pipe(z.number().max(100))]).optional().default(100),
});
export class SyncPullError extends Error{
 constructor(readonly code:'UNAUTHORIZED'|'FORBIDDEN'|'TEMPORARY_UNAVAILABLE',
   readonly httpStatus:number){super(code);this.name='SyncPullError';}
}
export type CatalogChange=Readonly<{
  seq:string;entityType:'category'|'brand'|'product'|'product_variant'|'inventory_balance';
  entityId:string;op:'CREATE'|'UPDATE'|'DEACTIVATE'|'UPSERT';payload:unknown;
  createdAt:string;
}>;
export type CatalogPage=Readonly<{
 protocolVersion:1;storeId:string;fromCursor:string;nextCursor:string;
 highWatermark:string;hasMore:boolean;changes:CatalogChange[];
}>;
type LogRow=QueryResultRow&{
 seq:string;entity_type:CatalogChange['entityType'];entity_id:string;
 op:CatalogChange['op'];payload:unknown;created_at:Date;
};
export class CatalogPullService{
 constructor(private readonly pool:Pool){}
 async pull(principal:VerifiedSyncContext|null|undefined,raw:unknown):Promise<CatalogPage>{
  if(!principal||![principal.storeId,principal.deviceId,
    principal.cashierId,principal.offlineGrantId]
    .every(v=>uuid.safeParse(v).success))throw new SyncPullError('UNAUTHORIZED',401);
  const params=schema.parse(raw);
  let c:PoolClient;
  try{c=await this.pool.connect();}
  catch{throw new SyncPullError('TEMPORARY_UNAVAILABLE',503);}
  try{
    await c.query('BEGIN');
    await lockCatalogStream(c,principal.storeId);
    const allowed=await c.query(`
      SELECT d.id FROM devices d
      JOIN store_memberships m ON m.store_id=d.store_id AND m.user_id=$3
      JOIN users u ON u.id=m.user_id
      WHERE d.store_id=$1 AND d.id=$2
       AND d.offline_checkout_enabled=true AND d.revoked_at IS NULL
       AND m.active=true AND u.active=true
       AND m.role IN ('ADMIN','MANAGER','CASHIER')
      FOR SHARE OF d,m,u`,
      [principal.storeId,principal.deviceId,principal.cashierId]);
    if(allowed.rows.length!==1)throw new SyncPullError('FORBIDDEN',403);
    const max=await c.query<{high:string}>(`
      SELECT COALESCE(MAX(seq),0)::text AS high FROM catalog_change_log
      WHERE store_id=$1`,[principal.storeId]);
    const high=max.rows[0]?.high??'0';
    const rows=await c.query<LogRow>(`
      SELECT seq::text AS seq,entity_type,entity_id,op,payload,created_at
      FROM catalog_change_log WHERE store_id=$1
        AND seq>$2::bigint AND seq<=$3::bigint
      ORDER BY seq ASC LIMIT $4`,
      [principal.storeId,params.cursor,high,params.limit+1]);
    const more=rows.rows.length>params.limit;
    const visible=rows.rows.slice(0,params.limit);
    const next=more?visible[visible.length-1]!.seq:high;
    const changes:CatalogChange[]=[];
    for(const r of visible){
      let payload:unknown=r.payload;
      // Pre-POS-023 log rows contain VariantView without product name.
      // Backfill the missing field for a one-time upgrade path. New writes
      // materialize name in the log and remain immutable across pages.
      if(r.entity_type==='product_variant' && payload &&
          typeof payload==='object' && !Array.isArray(payload) &&
          !('name' in payload)){
        const name=await c.query<{name:string;active:boolean}>(`
          SELECT p.name,p.active FROM product_variants v JOIN products p
          ON p.store_id=v.store_id AND p.id=v.product_id
          WHERE v.store_id=$1 AND v.id=$2`,
          [principal.storeId,r.entity_id]);
        if(!name.rows[0])throw new SyncPullError('TEMPORARY_UNAVAILABLE',503);
        const v=payload as Record<string,unknown>;
        payload={...v,name:name.rows[0].name,
          active:v.active===true && name.rows[0].active};
      }
      changes.push({
        seq:r.seq,entityType:r.entity_type,entityId:r.entity_id,op:r.op,
        payload,createdAt:r.created_at.toISOString(),
      });
    }
    const page:CatalogPage={
      protocolVersion:1,storeId:principal.storeId,fromCursor:params.cursor,
      nextCursor:next,highWatermark:high,hasMore:more,changes,
    };
    await c.query('COMMIT');
    return page;
  }catch(e){
    try{await c.query('ROLLBACK');}catch{}
    if(e instanceof z.ZodError||e instanceof SyncPullError)throw e;
    throw new SyncPullError('TEMPORARY_UNAVAILABLE',503);
  }finally{c.release();}
 }
}
