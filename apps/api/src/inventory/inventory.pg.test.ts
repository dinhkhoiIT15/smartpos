/**
 * POS-015 real PostgreSQL 16 integration test, against DISPOSABLE CI database
 * ONLY. The preexisting POS-012 migration runs before this test in CI.
 * NEVER connect to Neon or a developer's real database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { InventoryService, InventoryError, type InventoryPrincipal } from './service.js';
import { MAX_QTY } from './schemas.js';

const dbUrl = process.env.POS_DB_TEST_URL;
if (!dbUrl) throw new Error('POS_DB_TEST_URL is required; NEVER use Neon for POS-015 tests');
const target = new URL(dbUrl);
if (target.hostname !== '127.0.0.1' || target.pathname !== '/smartpos_ci' ||
  (target.port && target.port !== '5432')) {
  throw new Error('POS-015 tests require 127.0.0.1:5432/smartpos_ci only');
}

const hasError = (code: InventoryError['code']) => (error: unknown): boolean =>
  error instanceof InventoryError && error.code === code;

test('POS-015 manual stock adjustments: real PostgreSQL atomic, audit, replay and concurrency', async (t) => {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 8 });
  t.after(async () => { await pool.end(); });
  const inventory = new InventoryService(pool);

  async function seedStore(): Promise<{ actor: InventoryPrincipal; variantId: string }> {
    const storeId = randomUUID(), userId = randomUUID();
    const catId = randomUUID(), brandId = randomUUID(), productId = randomUUID(), variantId = randomUUID();
    await pool.query('INSERT INTO stores (id,name) VALUES ($1,$2)', [storeId, 'POS-015 CI fixture']);
    await pool.query(
      'INSERT INTO users (id,email,password_hash,active) VALUES ($1,$2,$3,true)',
      [userId, randomUUID() + '@example.test', 'FAKE_HASH_CI_ONLY'],
    );
    await pool.query(
      'INSERT INTO store_memberships (store_id,user_id,role,active) VALUES ($1,$2,$3,true)',
      [storeId, userId, 'MANAGER'],
    );
    await pool.query('INSERT INTO categories (id,store_id,name) VALUES ($1,$2,$3)', [catId, storeId, 'Demo']);
    await pool.query('INSERT INTO brands (id,store_id,name) VALUES ($1,$2,$3)', [brandId, storeId, 'Test']);
    await pool.query(
      'INSERT INTO products (id,store_id,category_id,brand_id,name) VALUES ($1,$2,$3,$4,$5)',
      [productId, storeId, catId, brandId, 'Demo product'],
    );
    await pool.query(
      `INSERT INTO product_variants
       (id,store_id,product_id,sku,attributes,attributes_key,price_vnd)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::bigint)`,
      [variantId, storeId, productId, 'CI-' + variantId.slice(0,8).toUpperCase(),
        '{}', randomUUID(), '1000'],
    );
    return { actor: { storeId, userId, role: 'MANAGER' }, variantId };
  }

  const one = await seedStore();
  const two = await seedStore();
  const { actor, variantId } = one;
  const command = (
    deltaQty: string, kind: 'RECEIPT'|'ISSUE'|'CORRECTION',
    overrides: Record<string, unknown> = {},
  ) => ({
    movementId: randomUUID(), variantId, deltaQty, kind,
    reason: 'Stock adjustment in disposable CI', ...overrides,
  });
  const auditCount = async (storeId: string): Promise<number> => {
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_logs
       WHERE store_id=$1 AND action='INVENTORY_MANUAL_ADJUST'`, [storeId],
    );
    return Number(rows[0]?.n);
  };
  const movementCount = async (storeId: string): Promise<number> => {
    const { rows } = await pool.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM inventory_movements WHERE store_id=$1', [storeId],
    );
    return Number(rows[0]?.n);
  };

  await t.test('missing balance reads as zero without writing, wrong store denied', async () => {
    assert.deepEqual(await inventory.getBalance(actor, variantId), {
      storeId: actor.storeId, variantId, qty: '0', revision: '0',
    });
    const noBalance = await pool.query(
      'SELECT 1 FROM inventory_balances WHERE store_id=$1 AND variant_id=$2',
      [actor.storeId, variantId],
    );
    assert.equal(noBalance.rows.length, 0);
    await assert.rejects(inventory.getBalance(actor, two.variantId), hasError('NOT_FOUND'));
    await assert.rejects(inventory.getBalance(two.actor, variantId), hasError('NOT_FOUND'));
    await assert.rejects(inventory.adjust(two.actor, command('5', 'RECEIPT')), hasError('NOT_FOUND'));
    assert.equal(await movementCount(two.actor.storeId), 0);
  });

  await t.test('stock receipt bootstraps balance and writes one immutable movement+audit', async () => {
    const payload = command('10', 'RECEIPT');
    const applied = await inventory.adjust(actor, payload);
    assert.equal(applied.status, 'APPLIED');
    assert.deepEqual(applied.balance, {
      storeId: actor.storeId, variantId, qty: '10', revision: '1',
    });
    assert.equal(await movementCount(actor.storeId), 1);
    assert.equal(await auditCount(actor.storeId), 1);
    const events = await inventory.listMovements(actor, variantId, { limit: 20 });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.movementId, payload.movementId);
    assert.equal(events[0]?.deltaQty, '10');
    assert.equal(events[0]?.kind, 'RECEIPT');

    const logs = await pool.query<{ reason: string; delta: string; actor_id: string }>(
      `SELECT metadata->>'reason' AS reason,metadata->>'deltaQty' AS delta,actor_id
       FROM audit_logs WHERE entity_id=$1 AND action='INVENTORY_MANUAL_ADJUST'`,
      [payload.movementId],
    );
    assert.equal(logs.rows[0]?.reason, payload.reason);
    assert.equal(logs.rows[0]?.delta, '10');
    assert.equal(logs.rows[0]?.actor_id, actor.userId);
    // Existing POS-012 migration protects movement/audit history from mutation.
    await assert.rejects(pool.query(
      'UPDATE inventory_movements SET qty_delta=999 WHERE id=$1', [payload.movementId],
    ));
    await assert.rejects(pool.query(
      'DELETE FROM inventory_movements WHERE id=$1', [payload.movementId],
    ));
    await assert.rejects(pool.query(
      'DELETE FROM audit_logs WHERE entity_id=$1', [payload.movementId],
    ));
  });

  await t.test('same movementId retry returns REPLAYED with no duplicate change or audit', async () => {
    const payload = command('-3', 'ISSUE');
    const first = await inventory.adjust(actor, payload);
    assert.equal(first.status, 'APPLIED');
    assert.equal(first.balance.qty, '7');
    const movements = await movementCount(actor.storeId);
    const audits = await auditCount(actor.storeId);

    const retry = await inventory.adjust(actor, payload);
    assert.equal(retry.status, 'REPLAYED');
    assert.equal(retry.balance.qty, '7');
    assert.equal(retry.balance.revision, '2');
    assert.equal(await movementCount(actor.storeId), movements);
    assert.equal(await auditCount(actor.storeId), audits);

    for (const override of [
      { deltaQty: '-2' }, { reason: 'A different adjustment reason' },
      { variantId: two.variantId }, { kind: 'CORRECTION' },
    ]) {
      await assert.rejects(
        inventory.adjust(actor, { ...payload, ...override }),
        hasError('IDEMPOTENCY_CONFLICT'),
      );
    }
    await assert.rejects(
      inventory.adjust(two.actor, { ...payload, variantId: two.variantId }),
      hasError('IDEMPOTENCY_CONFLICT'),
    );
    assert.equal(await movementCount(actor.storeId), movements);
    assert.equal(await auditCount(actor.storeId), audits);
  });

  await t.test('concurrent duplicate delivery applies adjustment once', async () => {
    const payload = command('5', 'RECEIPT');
    const before = await inventory.getBalance(actor, variantId);
    const [a, b] = await Promise.all([
      inventory.adjust(actor, payload), inventory.adjust(actor, payload),
    ]);
    assert.deepEqual(new Set([a.status, b.status]), new Set(['APPLIED', 'REPLAYED']));
    const after = await inventory.getBalance(actor, variantId);
    assert.equal(after.qty, (BigInt(before.qty) + 5n).toString());
    assert.equal(after.revision, (BigInt(before.revision) + 1n).toString());
    assert.equal(await auditCount(actor.storeId), 3);
    assert.equal(await movementCount(actor.storeId), 3);
  });

  await t.test('two independent receipts cannot lose stock updates', async () => {
    const before = await inventory.getBalance(actor, variantId);
    const twoWrites = await Promise.all([
      inventory.adjust(actor, command('12', 'RECEIPT')),
      inventory.adjust(actor, command('13', 'RECEIPT')),
    ]);
    assert.equal(twoWrites.filter(v => v.status === 'APPLIED').length, 2);
    const after = await inventory.getBalance(actor, variantId);
    assert.equal(after.qty, (BigInt(before.qty) + 25n).toString());
    assert.equal(after.revision, (BigInt(before.revision) + 2n).toString());
  });

  await t.test('insufficient stock and overflow roll back movement, balance and audit', async () => {
    const before = await inventory.getBalance(actor, variantId);
    const movements = await movementCount(actor.storeId);
    const audits = await auditCount(actor.storeId);
    await assert.rejects(inventory.adjust(actor, command('-999', 'ISSUE')), hasError('INSUFFICIENT_STOCK'));
    assert.deepEqual(await inventory.getBalance(actor, variantId), before);
    assert.equal(await movementCount(actor.storeId), movements);
    assert.equal(await auditCount(actor.storeId), audits);
    // Test-only forced near-bigint-max state; no live stock and no Neon.
    await pool.query(
      'UPDATE inventory_balances SET qty=$3::bigint WHERE store_id=$1 AND variant_id=$2',
      [actor.storeId, variantId, (MAX_QTY - 1n).toString()],
    );
    await assert.rejects(inventory.adjust(actor, command('3', 'RECEIPT')), hasError('QUANTITY_OVERFLOW'));
    assert.equal((await inventory.getBalance(actor, variantId)).qty, (MAX_QTY - 1n).toString());
    assert.equal(await movementCount(actor.storeId), movements);
    assert.equal(await auditCount(actor.storeId), audits);
    await pool.query('UPDATE inventory_balances SET qty=30 WHERE store_id=$1 AND variant_id=$2',
      [actor.storeId, variantId]);
  });

  await t.test('simultaneous oversells permit only one issue and never below zero', async () => {
    await pool.query('UPDATE inventory_balances SET qty=3 WHERE store_id=$1 AND variant_id=$2',
      [actor.storeId, variantId]);
    const before = await inventory.getBalance(actor, variantId);
    const counts = { movements: await movementCount(actor.storeId), audit: await auditCount(actor.storeId) };
    const completed = await Promise.allSettled([
      inventory.adjust(actor, command('-2', 'ISSUE')),
      inventory.adjust(actor, command('-2', 'ISSUE')),
    ]);
    assert.equal(completed.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(completed.filter(x => x.status === 'rejected').length, 1);
    const rejected = completed.find(x => x.status === 'rejected');
    assert.ok(rejected && rejected.status === 'rejected' &&
      hasError('INSUFFICIENT_STOCK')(rejected.reason));
    const current = await inventory.getBalance(actor, variantId);
    assert.equal(current.qty, '1');
    assert.equal(current.revision, (BigInt(before.revision) + 1n).toString());
    assert.equal(await movementCount(actor.storeId), counts.movements + 1);
    assert.equal(await auditCount(actor.storeId), counts.audit + 1);
  });

  await t.test('reject revoked member, cashier role or inactive variant; no mutation', async () => {
    const countBefore = await movementCount(actor.storeId);
    const cashier: InventoryPrincipal = { ...actor, role: 'CASHIER' };
    await assert.rejects(inventory.adjust(cashier, command('10', 'RECEIPT')), hasError('FORBIDDEN'));
    // Forging CASHIER while the database membership is MANAGER is forbidden
    // even for read access; the server may not trust a principal's role claim.
    await assert.rejects(inventory.getBalance(cashier, two.variantId), hasError('FORBIDDEN'));
    // A genuinely assigned CASHIER can read their own store, but never adjust.
    await pool.query("UPDATE store_memberships SET role='CASHIER' WHERE store_id=$1 AND user_id=$2",
      [actor.storeId, actor.userId]);
    assert.equal((await inventory.getBalance(cashier, variantId)).qty, '1');
    await assert.rejects(inventory.adjust(cashier, command('10', 'RECEIPT')), hasError('FORBIDDEN'));
    await assert.rejects(inventory.getBalance(cashier, two.variantId), hasError('NOT_FOUND'));
    await pool.query("UPDATE store_memberships SET role='MANAGER' WHERE store_id=$1 AND user_id=$2",
      [actor.storeId, actor.userId]);
    const forged: InventoryPrincipal = { ...actor, userId: randomUUID() };
    await assert.rejects(inventory.adjust(forged, command('10', 'RECEIPT')), hasError('FORBIDDEN'));
    await pool.query('UPDATE store_memberships SET active=false WHERE store_id=$1 AND user_id=$2',
      [actor.storeId, actor.userId]);
    await assert.rejects(inventory.adjust(actor, command('10', 'RECEIPT')), hasError('FORBIDDEN'));
    await pool.query('UPDATE store_memberships SET active=true WHERE store_id=$1 AND user_id=$2',
      [actor.storeId, actor.userId]);
    await pool.query('UPDATE product_variants SET active=false WHERE store_id=$1 AND id=$2',
      [actor.storeId, variantId]);
    await assert.rejects(inventory.adjust(actor, command('10', 'RECEIPT')), hasError('INACTIVE_VARIANT'));
    await pool.query('UPDATE product_variants SET active=true WHERE store_id=$1 AND id=$2',
      [actor.storeId, variantId]);
    assert.equal(await movementCount(actor.storeId), countBefore);
  });

  await t.test('audit insert failure AFTER stock update rolls back movement and balance', async () => {
    const previous = await inventory.getBalance(actor, variantId);
    const counts = { movements: await movementCount(actor.storeId), audits: await auditCount(actor.storeId) };
    const trigger = `
      CREATE FUNCTION pos015_ci_block_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action = 'INVENTORY_MANUAL_ADJUST' THEN
          RAISE EXCEPTION 'CI synthetic audit failure';
        END IF;
        RETURN NEW;
      END; $$;
      CREATE TRIGGER pos015_ci_reject_audit BEFORE INSERT ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION pos015_ci_block_audit();`;
    await pool.query(trigger);
    try {
      await assert.rejects(inventory.adjust(actor, command('9', 'RECEIPT')),
        hasError('DATABASE_UNAVAILABLE'));
    } finally {
      await pool.query('DROP TRIGGER pos015_ci_reject_audit ON audit_logs');
      await pool.query('DROP FUNCTION pos015_ci_block_audit()');
    }
    assert.deepEqual(await inventory.getBalance(actor, variantId), previous);
    assert.equal(await movementCount(actor.storeId), counts.movements);
    assert.equal(await auditCount(actor.storeId), counts.audits);
  });
});
