import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildServer } from '../server.js';
import type { InventoryApi } from './routes.js';
import { InventoryError, type InventoryPrincipal } from './service.js';

const storeId = randomUUID();
const variantId = randomUUID();
const userId = randomUUID();
const principal = (role: InventoryPrincipal['role']): InventoryPrincipal => ({
  storeId, userId, role,
});

function fixture() {
  const calls: Array<{ operation: string; actor: InventoryPrincipal; input: unknown }> = [];
  let actor: InventoryPrincipal | null = principal('MANAGER');
  let failure: Error | undefined;

  const service: InventoryApi = {
    getBalance: async (who, variant) => {
      calls.push({ operation: 'balance', actor: who, input: variant });
      if (failure) throw failure;
      return { storeId: who.storeId, variantId: variant, qty: '0', revision: '0' };
    },
    listMovements: async (who, variant, query) => {
      calls.push({ operation: 'history', actor: who, input: { variant, query } });
      if (failure) throw failure;
      return [];
    },
    adjust: async (who, input) => {
      calls.push({ operation: 'adjust', actor: who, input });
      if (failure) throw failure;
      return { status: 'APPLIED' as const, movementId: randomUUID(),
        balance: { storeId: who.storeId, variantId, qty: '10', revision: '1' } };
    },
  };
  const app = buildServer({
    inventory: { service, resolvePrincipal: async () => actor },
  });
  return { app, calls, setActor: (value: InventoryPrincipal | null) => { actor = value; },
    setFailure: (value?: Error) => { failure = value; } };
}
const valid = (patch: Record<string, unknown> = {}) => ({
  movementId: randomUUID(), variantId, deltaQty: '10', kind: 'RECEIPT',
  reason: 'Initial stock count validated', ...patch,
});

test('default Fastify health-only mode DOES NOT expose inventory despite forged headers', async (t) => {
  const app = buildServer();
  t.after(async () => { await app.close(); });
  const health = await app.inject({ method: 'GET', url: '/v1/health' });
  assert.equal(health.statusCode, 200);
  for (const method of ['GET','POST'] as const) {
    const res = await app.inject({
      method, url: method === 'GET'
        ? `/v1/inventory/variants/${variantId}/balance` : '/v1/inventory/adjustments',
      headers: { 'x-role': 'ADMIN', 'x-store-id': storeId },
      ...(method === 'POST' ? { payload: valid() } : {}),
    });
    assert.equal(res.statusCode, 404);
  }
});

test('test-only injected inventory routes deny missing principal and cashier stock adjustment', async (t) => {
  const f = fixture();
  t.after(async () => { await f.app.close(); });
  f.setActor(null);
  const noSession = await f.app.inject({ method: 'GET', url: `/v1/inventory/variants/${variantId}/balance` });
  assert.equal(noSession.statusCode, 401);
  assert.deepEqual(noSession.json(), { error: 'UNAUTHORIZED' });
  const noWrite = await f.app.inject({ method: 'POST', url: '/v1/inventory/adjustments', payload: valid() });
  assert.equal(noWrite.statusCode, 401);
  f.setActor(principal('CASHIER'));
  const prohibited = await f.app.inject({ method: 'POST', url: '/v1/inventory/adjustments', payload: valid() });
  assert.equal(prohibited.statusCode, 403);
  assert.deepEqual(prohibited.json(), { error: 'FORBIDDEN' });
  const read = await f.app.inject({ method: 'GET', url: `/v1/inventory/variants/${variantId}/balance` });
  assert.equal(read.statusCode, 200);
  assert.deepEqual(read.json(), { storeId, variantId, qty: '0', revision: '0' });
  assert.equal(f.calls.length, 1);
});

test('manager sends canonical signed quantity and receives no-store response', async (t) => {
  const f = fixture();
  t.after(async () => { await f.app.close(); });
  const request = valid({ kind: 'ISSUE', deltaQty: '-2', reason: '  Broken accessory writeoff  ' });
  const res = await f.app.inject({ method: 'POST', url: '/v1/inventory/adjustments', payload: request });
  assert.equal(res.statusCode, 201);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.deepEqual(f.calls[0]?.input, { ...request, reason: 'Broken accessory writeoff' });
  assert.equal(f.calls[0]?.actor.storeId, storeId);
  const history = await f.app.inject({
    method: 'GET', url: `/v1/inventory/variants/${variantId}/movements?limit=5`,
  });
  assert.equal(history.statusCode, 200);
  assert.deepEqual(f.calls[1]?.input, { variant: variantId, query: { limit: 5 } });
});

test('invalid quantities, unsupported kinds, store/role injection and bad routes fail before service calls', async (t) => {
  const f = fixture();
  t.after(async () => { await f.app.close(); });
  const invalid = [
    valid({ deltaQty: 1.25 }), valid({ deltaQty: '0' }), valid({ deltaQty: '01' }),
    valid({ deltaQty: '1e3' }), valid({ deltaQty: '-9223372036854775809' }),
    valid({ kind: 'RECEIPT', deltaQty: '-5' }), valid({ kind: 'SALE' }),
    valid({ reason: 'x' }), valid({ role: 'ADMIN' }), valid({ storeId }),
    valid({ variantId: 'bad' }),
  ];
  for (const payload of invalid) {
    const response = await f.app.inject({
      method: 'POST', url: '/v1/inventory/adjustments', payload,
    });
    assert.equal(response.statusCode, 400, JSON.stringify(payload));
    assert.deepEqual(response.json(), { error: 'VALIDATION_ERROR' });
  }
  for (const url of [
    '/v1/inventory/variants/not-a-uuid/balance',
    `/v1/inventory/variants/${variantId}/movements?limit=10000`,
    `/v1/inventory/variants/${variantId}/movements?storeId=${storeId}`,
  ]) {
    const response = await f.app.inject({ method: 'GET', url });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(f.calls.length, 0);
});

test('safe error codes and unexpected errors never leak database credentials', async (t) => {
  const f = fixture();
  t.after(async () => { await f.app.close(); });
  f.setFailure(new InventoryError('INSUFFICIENT_STOCK', 409));
  const shortage = await f.app.inject({ method: 'POST', url: '/v1/inventory/adjustments', payload: valid() });
  assert.equal(shortage.statusCode, 409);
  assert.deepEqual(shortage.json(), { error: 'INSUFFICIENT_STOCK' });
  f.setFailure(new Error('DATABASE_URL=postgresql://secret-user:secret-pass@neon'));
  const unavailable = await f.app.inject({ method: 'GET', url: `/v1/inventory/variants/${variantId}/balance` });
  assert.equal(unavailable.statusCode, 503);
  assert.deepEqual(unavailable.json(), { error: 'INVENTORY_UNAVAILABLE' });
  assert.doesNotMatch(unavailable.body, /secret|DATABASE_URL|neon|postgresql/i);
});
