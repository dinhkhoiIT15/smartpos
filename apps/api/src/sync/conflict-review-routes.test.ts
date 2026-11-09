import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildServer } from '../server.js';
import type { ConflictPrincipal, ConflictRecord } from './conflict-review.js';

const id = () => randomUUID();
const storeId = id(), userId = id(), conflictId = id();
const manager: ConflictPrincipal = {storeId, userId, role: 'MANAGER'};
const view: ConflictRecord = {
  conflictId, saleId: id(), eventId: id(), kind: 'STOCK_SHORTAGE',
  status: 'OPEN', details: {sku: 'DEMO-ONLY', beforeQty: '0', afterQty: '-1'},
  createdAt: '2026-11-08T00:00:00.000Z', resolvedAt: null, resolution: null,
  sale: {
    deviceId: id(), cashierId: id(), totalVnd: '9007199254740993',
    clientCreatedAt: '2026-11-08T00:00:00.000Z',
    serverReceivedAt: '2026-11-08T00:00:01.000Z',
  },
};
test('POS-024 default Fastify refuses all conflict HTTP paths, even forged manager headers', async t => {
  const app = buildServer();
  t.after(() => app.close());
  for (const [method, url] of [
    ['GET', '/v1/sync/conflicts'], ['GET', '/v1/sync/conflicts/' + conflictId],
    ['POST', '/v1/sync/conflicts/' + conflictId + '/resolve'],
  ]) {
    const res = await app.inject({
      method: method as 'GET' | 'POST', url,
      headers: {'x-role': 'ADMIN', 'x-store-id': storeId},
      ...(method === 'POST' ? {payload: {
        resolutionId: id(), note: 'Forged unauthenticated attempt',
      }} : {}),
    });
    assert.equal(res.statusCode, 404, method + ' ' + url);
  }
});

test('POS-024 opt-in manager routes validate trusted principal and strict inputs', async t => {
  let trusted: ConflictPrincipal | null = null;
  const called: string[] = [];
  const app = buildServer({conflictReview: {
    resolvePrincipal: async () => trusted,
    service: {
      list: async (actor, query) => {
        assert.deepEqual(actor, manager);
        called.push('list:' + JSON.stringify(query));
        return [view];
      },
      get: async (actor, target) => {
        assert.deepEqual(actor, manager);
        assert.equal(target, conflictId);
        called.push('get');
        return view;
      },
      resolve: async (actor, target, input) => {
        assert.deepEqual(actor, manager);
        assert.equal(target, conflictId);
        called.push('resolve:' + JSON.stringify(input));
        return {outcome: 'RESOLVED' as const, conflict: view};
      },
    },
  }});
  t.after(() => app.close());
  const get = (url: string) => app.inject({method: 'GET', url,
    headers: {'x-role': 'MANAGER', 'x-store-id': storeId}});
  assert.equal((await get('/v1/sync/conflicts')).statusCode, 401);
  trusted = {...manager, role: 'CASHIER'};
  assert.equal((await get('/v1/sync/conflicts')).statusCode, 403);
  trusted = manager;
  for (const bad of [
    '?status=ALL', '?limit=0', '?limit=101', '?limit=01',
    '?offset=-1', '?offset=10001', '?unknown=1',
  ]) assert.equal((await get('/v1/sync/conflicts' + bad)).statusCode, 400, bad);
  assert.equal((await get('/v1/sync/conflicts?status=OPEN&limit=10&offset=0')).statusCode, 200);
  assert.equal((await get('/v1/sync/conflicts/' + conflictId)).statusCode, 200);
  assert.equal((await get('/v1/sync/conflicts/not-a-uuid')).statusCode, 400);
  const resolve = (payload: Record<string, unknown>) => app.inject({
    method: 'POST', url: '/v1/sync/conflicts/' + conflictId + '/resolve', payload,
  });
  for (const payload of [
    {resolutionId: id(), note: 'short'},
    {resolutionId: 'wrong', note: 'This reason is long enough'},
    {resolutionId: id(), note: 'This reason is long enough', extra: true},
  ]) assert.equal((await resolve(payload)).statusCode, 400);
  assert.equal(called.length, 2);
  const resolutionId = id();
  assert.equal((await resolve({resolutionId, note: 'Stock was reconciled manually'})).statusCode, 200);
  assert.equal(called.length, 3);
  assert.ok(called[2]?.includes(resolutionId));
});
