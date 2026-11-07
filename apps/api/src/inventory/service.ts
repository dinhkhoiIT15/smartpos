import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { z } from 'zod';
import type { CatalogPrincipal } from '../catalog/service.js';
import {
  adjustInventorySchema, inventoryHistoryQuerySchema, MAX_QTY,
} from './schemas.js';

/**
 * POS-015 inventory is deliberately SERVER-ONLY. There is no live staff
 * authentication yet, so normal Fastify startup MUST NOT mount these routes.
 * No direct database connection or secret is created by this module.
 */
export type InventoryPrincipal = CatalogPrincipal;
export type InventoryBalance = Readonly<{
  storeId: string; variantId: string; qty: string; revision: string;
}>;
export type InventoryMovement = Readonly<{
  movementId: string; storeId: string; variantId: string; deltaQty: string;
  kind: 'RECEIPT' | 'ISSUE' | 'CORRECTION'; createdAt: string;
}>;
export type InventoryAdjustment = Readonly<{
  status: 'APPLIED' | 'REPLAYED'; movementId: string; balance: InventoryBalance;
}>;
export type InventoryErrorCode =
  'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INACTIVE_VARIANT' |
  'INSUFFICIENT_STOCK' | 'QUANTITY_OVERFLOW' | 'REVISION_OVERFLOW' |
  'IDEMPOTENCY_CONFLICT' | 'DATABASE_UNAVAILABLE';

export class InventoryError extends Error {
  constructor(readonly code: InventoryErrorCode, readonly httpStatus: number) {
    super(code);
    this.name = 'InventoryError';
  }
}

const uuid = z.uuid();
type BalanceRow = QueryResultRow & {
  qty: string; revision: string;
};
type MovementRow = QueryResultRow & {
  id: string; store_id: string; variant_id: string; qty_delta: string;
  kind: InventoryMovement['kind']; created_at: Date;
};
type ReplayRow = QueryResultRow & {
  store_id: string; variant_id: string; qty_delta: string; kind: string;
  sale_id: string | null; actor_id: string | null; reason: string | null;
};

function safePg(error: unknown): Error {
  if (error instanceof InventoryError || error instanceof z.ZodError) return error;
  const code = error !== null && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code : undefined;
  if (code === '23503') return new InventoryError('NOT_FOUND', 404);
  if (code === '23505') return new InventoryError('IDEMPOTENCY_CONFLICT', 409);
  if (code === '22003' || code === '23514') return new InventoryError('QUANTITY_OVERFLOW', 422);
  return new InventoryError('DATABASE_UNAVAILABLE', 503);
}

function checkPrincipal(actor: InventoryPrincipal | null | undefined, write: boolean):
  asserts actor is InventoryPrincipal {
  if (!actor || !uuid.safeParse(actor.userId).success ||
    !uuid.safeParse(actor.storeId).success) throw new InventoryError('UNAUTHORIZED', 401);
  if (!['ADMIN', 'MANAGER', 'CASHIER'].includes(actor.role)) {
    throw new InventoryError('FORBIDDEN', 403);
  }
  if (write && actor.role === 'CASHIER') throw new InventoryError('FORBIDDEN', 403);
}

const asBalance = (actor: InventoryPrincipal, variantId: string, row: BalanceRow): InventoryBalance =>
  ({ storeId: actor.storeId, variantId, qty: row.qty, revision: row.revision });

/**
 * In addition to the future trusted session resolver, check the current
 * authoritative DB membership. Revoked/mismatching roles are denied;
 * a live server session verifier is still required before exposing HTTP.
 */
async function checkActiveMembership(
  db: Pool | PoolClient, actor: InventoryPrincipal, write: boolean,
): Promise<void> {
  const result = await db.query<{ role: string }>(
    `SELECT m.role FROM store_memberships m
     JOIN users u ON u.id=m.user_id
     WHERE m.store_id=$1 AND m.user_id=$2 AND m.role=$3
       AND m.active=true AND u.active=true
       AND (NOT $4::boolean OR m.role IN ('ADMIN','MANAGER'))`,
    [actor.storeId, actor.userId, actor.role, write],
  );
  if (!result.rows[0]) throw new InventoryError('FORBIDDEN', 403);
}

/** Never read/modify stock across a store boundary, including missing rows. */
async function getBalanceRow(
  db: Pool | PoolClient, storeId: string, variantId: string,
): Promise<BalanceRow> {
  const found = await db.query<BalanceRow>(
    `SELECT COALESCE(b.qty,0)::text AS qty,COALESCE(b.revision,0)::text AS revision
     FROM product_variants v
     LEFT JOIN inventory_balances b ON b.store_id=v.store_id AND b.variant_id=v.id
     WHERE v.store_id=$1 AND v.id=$2`,
    [storeId, variantId],
  );
  if (!found.rows[0]) throw new InventoryError('NOT_FOUND', 404);
  return found.rows[0];
}

export class InventoryService {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
    let db: PoolClient;
    try { db = await this.pool.connect(); } catch (error) { throw safePg(error); }
    try {
      await db.query('BEGIN');
      const result = await work(db);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      try { await db.query('ROLLBACK'); } catch { /* never leak SQL credentials */ }
      throw safePg(error);
    } finally { db.release(); }
  }

  async getBalance(actor: InventoryPrincipal, variantId: string): Promise<InventoryBalance> {
    checkPrincipal(actor, false);
    uuid.parse(variantId);
    try {
      await checkActiveMembership(this.pool, actor, false);
      const row = await getBalanceRow(this.pool, actor.storeId, variantId);
      return asBalance(actor, variantId, row);
    } catch (error) { throw safePg(error); }
  }

  async listMovements(actor: InventoryPrincipal, variantId: string, query: unknown):
    Promise<InventoryMovement[]> {
    checkPrincipal(actor, false);
    uuid.parse(variantId);
    const { limit } = inventoryHistoryQuerySchema.parse(query);
    try {
      await checkActiveMembership(this.pool, actor, false);
      await getBalanceRow(this.pool, actor.storeId, variantId);
      const { rows } = await this.pool.query<MovementRow>(
        `SELECT id,store_id,variant_id,qty_delta::text AS qty_delta,kind,created_at
         FROM inventory_movements WHERE store_id=$1 AND variant_id=$2
         ORDER BY created_at DESC,id DESC LIMIT $3`,
        [actor.storeId, variantId, limit],
      );
      return rows.map((row) => ({
        movementId: row.id, storeId: row.store_id, variantId: row.variant_id,
        deltaQty: row.qty_delta, kind: row.kind, createdAt: row.created_at.toISOString(),
      }));
    } catch (error) { throw safePg(error); }
  }

  /**
   * Atomic manual stock operation:
   *  - prior movementId is the idempotency key, not a new ID on retry;
   *  - INSERT movement first, so concurrent identical submissions serialize
   *    on its PostgreSQL unique primary key without applying stock twice;
   *  - additive UPDATE protects balance against lost updates and overdraw;
   *  - audit inserts in the same transaction; failure rolls back all three.
   *
   * Ordinary manual actions NEVER produce negative final stock. A negative
   * balance arising from future offline-sale reconciliation (BR-009) is
   * entirely out of scope and must use the POS-021 policy-specific workflow.
   */
  async adjust(actor: InventoryPrincipal, input: unknown): Promise<InventoryAdjustment> {
    checkPrincipal(actor, true);
    const data = adjustInventorySchema.parse(input);
    return this.transaction(async (db) => {
      await checkActiveMembership(db, actor, true);

      // First check for an already committed event: a retry after deactivation
      // must return the exact prior outcome without mutating inventory again.
      const findReplay = async (): Promise<ReplayRow | undefined> => {
        const result = await db.query<ReplayRow>(
          `SELECT m.store_id,m.variant_id,m.qty_delta::text AS qty_delta,
             m.kind,m.sale_id,a.actor_id,a.metadata->>'reason' AS reason
           FROM inventory_movements m
           LEFT JOIN audit_logs a ON a.store_id=m.store_id
             AND a.entity_type='inventory_movement' AND a.entity_id=m.id
             AND a.action='INVENTORY_MANUAL_ADJUST'
           WHERE m.id=$1`,
          [data.movementId],
        );
        return result.rows[0];
      };
      const replay = async (row: ReplayRow): Promise<InventoryAdjustment> => {
        if (row.store_id !== actor.storeId || row.variant_id !== data.variantId ||
          row.sale_id !== null || row.qty_delta !== data.deltaQty ||
          row.kind !== data.kind || row.actor_id !== actor.userId ||
          row.reason !== data.reason) {
          throw new InventoryError('IDEMPOTENCY_CONFLICT', 409);
        }
        const balance = await getBalanceRow(db, actor.storeId, data.variantId);
        return { status: 'REPLAYED', movementId: data.movementId,
          balance: asBalance(actor, data.variantId, balance) };
      };
      const prior = await findReplay();
      if (prior) return replay(prior);

      const variant = await db.query<{ active: boolean }>(
        'SELECT active FROM product_variants WHERE store_id=$1 AND id=$2',
        [actor.storeId, data.variantId],
      );
      if (!variant.rows[0]) throw new InventoryError('NOT_FOUND', 404);
      if (!variant.rows[0].active) throw new InventoryError('INACTIVE_VARIANT', 409);

      const inserted = await db.query<{ id: string }>(
        `INSERT INTO inventory_movements (id,store_id,variant_id,qty_delta,kind)
         VALUES ($1,$2,$3,$4::bigint,$5)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [data.movementId, actor.storeId, data.variantId, data.deltaQty, data.kind],
      );
      if (!inserted.rows[0]) {
        const raced = await findReplay();
        if (!raced) throw new InventoryError('IDEMPOTENCY_CONFLICT', 409);
        return replay(raced);
      }

      // Bootstrap an initially missing balance inside the transaction.
      // ON CONFLICT + UPDATE serialize concurrent independent first writes.
      await db.query(
        `INSERT INTO inventory_balances (store_id,variant_id,qty,revision)
         VALUES ($1,$2,0,0) ON CONFLICT (store_id,variant_id) DO NOTHING`,
        [actor.storeId, data.variantId],
      );

      const updated = await db.query<BalanceRow>(
        `UPDATE inventory_balances
         SET qty=qty+$3::bigint, revision=revision+1
         WHERE store_id=$1 AND variant_id=$2
           AND qty::numeric+$3::numeric >= 0
           AND qty::numeric+$3::numeric <= $4::numeric
           AND revision < $4::bigint
         RETURNING qty::text AS qty,revision::text AS revision`,
        [actor.storeId, data.variantId, data.deltaQty, MAX_QTY.toString()],
      );
      if (!updated.rows[0]) {
        const current = await getBalanceRow(db, actor.storeId, data.variantId);
        if (BigInt(current.revision) >= MAX_QTY) throw new InventoryError('REVISION_OVERFLOW', 422);
        const candidate = BigInt(current.qty) + BigInt(data.deltaQty);
        if (candidate < 0n) throw new InventoryError('INSUFFICIENT_STOCK', 409);
        throw new InventoryError('QUANTITY_OVERFLOW', 422);
      }

      await db.query(
        `INSERT INTO audit_logs
           (id,store_id,actor_id,action,entity_type,entity_id,metadata)
         VALUES ($1,$2,$3,'INVENTORY_MANUAL_ADJUST','inventory_movement',$4,$5::jsonb)`,
        [randomUUID(), actor.storeId, actor.userId, data.movementId,
          JSON.stringify({ reason: data.reason, kind: data.kind, deltaQty: data.deltaQty,
            variantId: data.variantId, qtyAfter: updated.rows[0].qty,
            revisionAfter: updated.rows[0].revision })],
      );
      return { status: 'APPLIED', movementId: data.movementId,
        balance: asBalance(actor, data.variantId, updated.rows[0]) };
    });
  }
}
