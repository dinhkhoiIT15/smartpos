import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { z } from 'zod';
import type { CatalogPrincipal } from '../catalog/service.js';

/**
 * POS-024: internal manager conflict review. Neither these methods nor the
 * synthetic-principal test routes authenticate a real HTTP user.
 * Do not mount publicly before D-013 / POS-025 trusted staff RBAC.
 * Resolution DOCUMENTS an investigation; it NEVER corrects stock or edits
 * immutable sale, payment, event, receipt or conflict details.
 */
const uuid = z.uuid();
const pageInt = (min: number, max: number) => z.union([
  z.number().int(), z.string().regex(/^(0|[1-9][0-9]*)$/).transform(Number),
]).pipe(z.number().int().min(min).max(max));
export const conflictListQuerySchema = z.strictObject({
  status: z.enum(['OPEN', 'RESOLVED']).default('OPEN'),
  limit: pageInt(1, 100).default(25),
  offset: pageInt(0, 10000).default(0),
});
export const conflictReviewSchema = z.strictObject({
  resolutionId: uuid, // stable idempotency key, supplied by trusted manager UI
  note: z.string().trim().min(12).max(1000),
});
export type ConflictPrincipal = CatalogPrincipal;
export type ConflictReviewCode =
  'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'ALREADY_RESOLVED' |
  'DATABASE_UNAVAILABLE';
export class ConflictReviewError extends Error {
  constructor(readonly code: ConflictReviewCode, readonly httpStatus: number) {
    super(code);
    this.name = 'ConflictReviewError';
  }
}

type ConflictRow = QueryResultRow & {
  id: string; event_id: string; sale_id: string; kind: string;
  details: unknown; status: string; created_at: Date; resolved_at: Date | null;
  device_id: string; cashier_id: string; total_vnd: string;
  client_created_at: Date; server_received_at: Date;
};
type AuditRow = QueryResultRow & {
  actor_id: string | null; created_at: Date;
  metadata: unknown;
};
export type ConflictRecord = Readonly<{
  conflictId: string; eventId: string; saleId: string;
  kind: 'STOCK_SHORTAGE' | 'STALE_PRICE';
  status: 'OPEN' | 'RESOLVED'; details: unknown;
  createdAt: string; resolvedAt: string | null;
  sale: Readonly<{
    deviceId: string; cashierId: string; totalVnd: string;
    clientCreatedAt: string; serverReceivedAt: string;
  }>;
  resolution: Readonly<{
    resolutionId: string; actorId: string; note: string; recordedAt: string;
  }> | null;
}>;
export type ConflictReviewResult = Readonly<{
  outcome: 'RESOLVED' | 'REPLAYED'; conflict: ConflictRecord;
}>;

function validActor(actor: ConflictPrincipal | null | undefined):
  asserts actor is ConflictPrincipal {
  if (!actor || !uuid.safeParse(actor.userId).success ||
      !uuid.safeParse(actor.storeId).success)
    throw new ConflictReviewError('UNAUTHORIZED', 401);
  if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER')
    throw new ConflictReviewError('FORBIDDEN', 403);
}
function safe(error: unknown): ConflictReviewError | z.ZodError {
  if (error instanceof ConflictReviewError || error instanceof z.ZodError) return error;
  return new ConflictReviewError('DATABASE_UNAVAILABLE', 503);
}
async function membership(db: PoolClient, actor: ConflictPrincipal): Promise<void> {
  const found = await db.query<{ role: string }>(`
    SELECT m.role FROM store_memberships m JOIN users u ON u.id=m.user_id
    WHERE m.store_id=$1 AND m.user_id=$2 AND m.role=$3
      AND m.role IN ('ADMIN','MANAGER') AND m.active=true AND u.active=true
    FOR SHARE OF m,u
  `, [actor.storeId, actor.userId, actor.role]);
  if (found.rows.length !== 1) throw new ConflictReviewError('FORBIDDEN', 403);
}
const baseSelect = `
  SELECT c.id,c.event_id,c.sale_id,c.kind,c.details,c.status,
    c.created_at,c.resolved_at,s.device_id,s.cashier_id,
    s.total_vnd::text AS total_vnd,s.client_created_at,s.server_received_at
  FROM sync_conflicts c JOIN sales s ON s.id=c.sale_id
`;

async function findRow(
  db: PoolClient, storeId: string, conflictId: string, write = false,
): Promise<ConflictRow> {
  const query = baseSelect +
    ` WHERE s.store_id=$1 AND c.id=$2` + (write ? ' FOR UPDATE OF c' : '');
  const row = (await db.query<ConflictRow>(query, [storeId, conflictId])).rows[0];
  if (!row || !['STOCK_SHORTAGE', 'STALE_PRICE'].includes(row.kind))
    throw new ConflictReviewError('NOT_FOUND', 404);
  return row;
}

const resolutionSchema = z.strictObject({
  resolutionId: uuid, note: z.string().min(1).max(1000),
});
async function auditFor(db: PoolClient, storeId: string, conflictId: string):
  Promise<ConflictRecord['resolution']> {
  const rows = await db.query<AuditRow>(`
    SELECT actor_id,created_at,metadata FROM audit_logs
    WHERE store_id=$1 AND entity_type='SYNC_CONFLICT' AND entity_id=$2
      AND action='SYNC_CONFLICT_RESOLVED'
    ORDER BY created_at DESC,id DESC LIMIT 1
  `, [storeId, conflictId]);
  const row = rows.rows[0];
  if (!row) return null;
  const parsed = resolutionSchema.safeParse(row.metadata);
  if (!parsed.success || !row.actor_id)
    throw new ConflictReviewError('DATABASE_UNAVAILABLE', 503);
  return {
    resolutionId: parsed.data.resolutionId, note: parsed.data.note,
    actorId: row.actor_id, recordedAt: row.created_at.toISOString(),
  };
}
async function record(db: PoolClient, storeId: string, row: ConflictRow):
  Promise<ConflictRecord> {
  if (!['OPEN', 'RESOLVED'].includes(row.status))
    throw new ConflictReviewError('DATABASE_UNAVAILABLE', 503);
  return {
    conflictId: row.id, eventId: row.event_id, saleId: row.sale_id,
    kind: row.kind as ConflictRecord['kind'],
    status: row.status as ConflictRecord['status'],
    details: row.details, createdAt: row.created_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    sale: {
      deviceId: row.device_id, cashierId: row.cashier_id,
      totalVnd: row.total_vnd,
      clientCreatedAt: row.client_created_at.toISOString(),
      serverReceivedAt: row.server_received_at.toISOString(),
    },
    resolution: row.status === 'RESOLVED'
      ? await auditFor(db, storeId, row.id) : null,
  };
}
export class ConflictReviewService {
  constructor(private readonly pool: Pool) {}

  private async transact<T>(actor: ConflictPrincipal,
    perform: (db: PoolClient) => Promise<T>): Promise<T> {
    let db: PoolClient;
    try { db = await this.pool.connect(); }
    catch { throw new ConflictReviewError('DATABASE_UNAVAILABLE', 503); }
    try {
      await db.query('BEGIN');
      await membership(db, actor);
      const result = await perform(db);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      try { await db.query('ROLLBACK'); } catch { /* no secret logging */ }
      throw safe(error);
    } finally { db.release(); }
  }

  async list(actor: ConflictPrincipal | null | undefined, raw: unknown):
    Promise<ConflictRecord[]> {
    validActor(actor);
    const query = conflictListQuerySchema.parse(raw);
    return this.transact(actor, async db => {
      const rows = await db.query<ConflictRow>(baseSelect + `
        WHERE s.store_id=$1 AND c.status=$2
          AND c.kind IN ('STOCK_SHORTAGE','STALE_PRICE')
        ORDER BY c.created_at DESC,c.id DESC LIMIT $3 OFFSET $4`,
        [actor.storeId, query.status, query.limit, query.offset]);
      const result: ConflictRecord[] = [];
      for (const row of rows.rows) result.push(await record(db, actor.storeId, row));
      return result;
    });
  }

  async get(actor: ConflictPrincipal | null | undefined, conflictId: unknown):
    Promise<ConflictRecord> {
    validActor(actor);
    const id = uuid.parse(conflictId);
    return this.transact(actor, async db =>
      record(db, actor.storeId, await findRow(db, actor.storeId, id)));
  }

  async resolve(actor: ConflictPrincipal | null | undefined, conflictId: unknown,
    raw: unknown): Promise<ConflictReviewResult> {
    validActor(actor);
    const id = uuid.parse(conflictId);
    const input = conflictReviewSchema.parse(raw);
    return this.transact(actor, async db => {
      const row = await findRow(db, actor.storeId, id, true);
      if (row.status === 'RESOLVED') {
        const previous = await auditFor(db, actor.storeId, id);
        if (!previous || previous.actorId !== actor.userId ||
            previous.resolutionId !== input.resolutionId || previous.note !== input.note)
          throw new ConflictReviewError('ALREADY_RESOLVED', 409);
        return {outcome: 'REPLAYED', conflict: await record(db, actor.storeId, row)};
      }
      if (row.status !== 'OPEN')
        throw new ConflictReviewError('DATABASE_UNAVAILABLE', 503);
      const updated = await db.query<ConflictRow>(baseSelect + `
        WHERE s.store_id=$1 AND c.id=$2 AND c.status='OPEN'`, [actor.storeId, id]);
      if (updated.rows.length !== 1)
        throw new ConflictReviewError('ALREADY_RESOLVED', 409);
      await db.query(`
        UPDATE sync_conflicts SET status='RESOLVED',resolved_at=now()
        WHERE id=$1 AND status='OPEN'`, [id]);
      await db.query(`
        INSERT INTO audit_logs(id,store_id,actor_id,action,entity_type,entity_id,metadata)
        VALUES($1,$2,$3,'SYNC_CONFLICT_RESOLVED','SYNC_CONFLICT',$4,$5::jsonb)`,
        [randomUUID(), actor.storeId, actor.userId, id,
          JSON.stringify({resolutionId: input.resolutionId, note: input.note})]);
      return {outcome: 'RESOLVED',
        conflict: await record(db, actor.storeId, await findRow(db, actor.storeId, id))};
    });
  }
}
