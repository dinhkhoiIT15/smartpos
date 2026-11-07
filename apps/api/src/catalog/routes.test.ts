import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildServer } from '../server.js';
import { CatalogError, type CatalogPrincipal } from './service.js';
import type { CatalogApi } from './routes.js';

const storeId = randomUUID(), userId = randomUUID();
const productId = randomUUID(), variantId = randomUUID();
const categoryId = randomUUID(), brandId = randomUUID();
const actor = (role: CatalogPrincipal['role']): CatalogPrincipal => ({ storeId, userId, role });
const product = {
  id: productId, storeId, categoryId, brandId, name: 'Phone test', active: true,
};
const variant = {
  id: variantId, storeId, productId, sku: 'SKU-128',
  attributes: { color: 'Black' }, priceVnd: '8990000', revision: '0', active: true,
};

function fixture() {
  const calls: Array<{ op: string; actor: CatalogPrincipal; input: unknown }> = [];
  let failWith: Error | null = null;
  let principal: CatalogPrincipal | null = actor('MANAGER');
  const capture = async (op: string, a: CatalogPrincipal, input: unknown, result: unknown) => {
    calls.push({ op, actor: a, input });
    if (failWith) throw failWith;
    return result;
  };
  const service: CatalogApi = {
    createCategory: async (a, input) =>
      await capture('createCategory', a, input, { id: categoryId, storeId, name: 'Phones' }) as { id: string; storeId: string; name: string },
    updateCategory: async (a, id, input) =>
      await capture('updateCategory', a, { id, input }, { id, storeId, name: 'Updated' }) as { id: string; storeId: string; name: string },
    createBrand: async (a, input) =>
      await capture('createBrand', a, input, { id: brandId, storeId, name: 'Brand' }) as { id: string; storeId: string; name: string },
    updateBrand: async (a, id, input) =>
      await capture('updateBrand', a, { id, input }, { id, storeId, name: 'Updated' }) as { id: string; storeId: string; name: string },
    createProduct: async (a, input) =>
      await capture('createProduct', a, input, product) as typeof product,
    updateProduct: async (a, id, input) =>
      await capture('updateProduct', a, { id, input }, product) as typeof product,
    createVariant: async (a, input) =>
      await capture('createVariant', a, input, variant) as typeof variant,
    updateVariant: async (a, id, input) =>
      await capture('updateVariant', a, { id, input }, variant) as typeof variant,
    getProduct: async (a, id) =>
      await capture('getProduct', a, id, product) as typeof product,
    getVariant: async (a, id) =>
      await capture('getVariant', a, id, variant) as typeof variant,
    listProducts: async (a, query) =>
      await capture('listProducts', a, query, [product]) as Array<typeof product>,
    listVariants: async (a, query) =>
      await capture('listVariants', a, query, [variant]) as Array<typeof variant>,
  };
  const app = buildServer({
    catalog: { service, resolvePrincipal: async () => principal },
  });
  return { app, calls, setPrincipal: (next: CatalogPrincipal | null) => { principal = next; },
    setError: (error: Error | null) => { failWith = error; } };
}

test('normal API entrypoint exposes health only; x-role cannot open catalog write routes', async (t) => {
  const app = buildServer();
  t.after(async () => { await app.close(); });
  const health = await app.inject({ method: 'GET', url: '/v1/health' });
  assert.equal(health.statusCode, 200);
  const restricted = await app.inject({
    method: 'POST', url: '/v1/catalog/products',
    headers: { 'x-role': 'ADMIN', 'x-store-id': storeId },
    payload: { categoryId, brandId, name: 'Unsafe' },
  });
  assert.equal(restricted.statusCode, 404);
});

test('injected catalog routes deny unauthenticated and CASHIER mutations by default', async (t) => {
  const f = fixture();
  t.after(async () => { await f.app.close(); });
  f.setPrincipal(null);
  const noSession = await f.app.inject({ method: 'POST', url: '/v1/catalog/categories', payload: { name: 'Phones' } });
  assert.equal(noSession.statusCode, 401);
  assert.equal(noSession.json().error, 'UNAUTHORIZED');
  const noRead = await f.app.inject({ method: 'GET', url: '/v1/catalog/products' });
  assert.equal(noRead.statusCode, 401);
  f.setPrincipal(actor('CASHIER'));
  const cannotWrite = await f.app.inject({ method: 'POST', url: '/v1/catalog/brands', payload: { name: 'A' } });
  assert.equal(cannotWrite.statusCode, 403);
  assert.equal(cannotWrite.json().error, 'FORBIDDEN');
  const mayRead = await f.app.inject({ method: 'GET', url: '/v1/catalog/products' });
  assert.equal(mayRead.statusCode, 200);
  assert.equal(mayRead.json()[0].storeId, storeId);
  assert.equal(f.calls.length, 1);
});

test('MANAGER can create products and variants only using server-scoped principal', async (t) => {
  const f = fixture();
  t.after(async () => { await f.app.close(); });
  const resp = await f.app.inject({
    method: 'POST', url: '/v1/catalog/products',
    payload: { categoryId, brandId, name: '  Phone test  ' },
  });
  assert.equal(resp.statusCode, 201);
  assert.equal(f.calls[0]?.op, 'createProduct');
  assert.deepEqual(f.calls[0]?.input, { categoryId, brandId, name: 'Phone test' });
  assert.equal(f.calls[0]?.actor.storeId, storeId);
  const second = await f.app.inject({
    method: 'POST', url: '/v1/catalog/variants',
    payload: { productId, sku: ' sku-128 ', attributes: { color: 'Black' }, priceVnd: '8990000' },
  });
  assert.equal(second.statusCode, 201);
  assert.deepEqual(f.calls[1]?.input, {
    productId, sku: 'SKU-128', attributes: { color: 'Black' }, priceVnd: '8990000',
  });
  assert.equal(second.json().priceVnd, '8990000');
  assert.equal(second.headers['cache-control'], 'no-store');
});

test('untrusted store/role fields, invalid SKU, float/overflow VND are rejected before service call', async (t) => {
  const f = fixture();
  t.after(async () => { await f.app.close(); });
  const bad = [
    { productId, sku: 'SKU', attributes: {}, priceVnd: '1', storeId: randomUUID() },
    { productId, sku: 'SKU', attributes: {}, priceVnd: 1.5 },
    { productId, sku: 'SKU', attributes: {}, priceVnd: '-1' },
    { productId, sku: 'SKU', attributes: {}, priceVnd: '9223372036854775808' },
    { productId, sku: 'SKU BAD', attributes: {}, priceVnd: '1' },
    { productId, sku: 'SKU', attributes: { color: [] }, priceVnd: '1' },
    { productId, sku: 'SKU', attributes: {}, priceVnd: '1', role: 'ADMIN' },
  ];
  for (const payload of bad) {
    const response = await f.app.inject({ method: 'POST', url: '/v1/catalog/variants', payload });
    assert.equal(response.statusCode, 400, JSON.stringify(payload));
    assert.deepEqual(response.json(), { error: 'VALIDATION_ERROR' });
  }
  assert.equal(f.calls.length, 0);
});

test('invalid path/query and empty updates are denied without service dispatch', async (t) => {
  const f = fixture();
  t.after(async () => { await f.app.close(); });
  const requests = [
    { method: 'GET', url: '/v1/catalog/products/not-a-uuid' },
    { method: 'GET', url: '/v1/catalog/variants?limit=999' },
    { method: 'GET', url: '/v1/catalog/products?offset=-1' },
    { method: 'PATCH', url: '/v1/catalog/products/' + productId, payload: {} },
    { method: 'PATCH', url: '/v1/catalog/variants/' + variantId, payload: { expectedRevision: '0' } },
    { method: 'PATCH', url: '/v1/catalog/variants/' + variantId, payload: { expectedRevision: '0', sku: 'NEW' } },
  ] as const;
  for (const request of requests) {
    const response = await f.app.inject(request);
    assert.equal(response.statusCode, 400, request.url);
    assert.deepEqual(response.json(), { error: 'VALIDATION_ERROR' });
  }
  assert.equal(f.calls.length, 0);
});

test('catalog responses hide DB details on duplicate, revision conflict and unexpected errors', async (t) => {
  const f = fixture();
  t.after(async () => { await f.app.close(); });
  f.setError(new CatalogError('DUPLICATE', 409));
  const d = await f.app.inject({ method: 'POST', url: '/v1/catalog/categories', payload: { name: 'Phone' } });
  assert.deepEqual(d.json(), { error: 'DUPLICATE' });
  assert.equal(d.statusCode, 409);
  f.setError(new CatalogError('STALE_REVISION', 409));
  const stale = await f.app.inject({
    method: 'PATCH', url: '/v1/catalog/variants/' + variantId,
    payload: { expectedRevision: '0', priceVnd: '10' },
  });
  assert.equal(stale.statusCode, 409);
  assert.deepEqual(stale.json(), { error: 'STALE_REVISION' });
  f.setError(new Error('DATABASE_URL=secret:postgresql://user:pass@server'));
  const unexpected = await f.app.inject({ method: 'GET', url: '/v1/catalog/variants' });
  assert.equal(unexpected.statusCode, 503);
  assert.deepEqual(unexpected.json(), { error: 'CATALOG_UNAVAILABLE' });
  assert.doesNotMatch(unexpected.body, /pass|DATABASE_URL|postgresql/);
});

test('store/role are not taken from untrusted headers or query fields', async (t) => {
  const f = fixture();
  t.after(async () => { await f.app.close(); });
  f.setPrincipal(actor('CASHIER'));
  const response = await f.app.inject({
    method: 'POST', url: '/v1/catalog/categories',
    headers: { 'x-role': 'MANAGER', 'x-store-id': randomUUID() },
    payload: { name: 'Cannot create' },
  });
  assert.equal(response.statusCode, 403);
  const read = await f.app.inject({ method: 'GET', url: '/v1/catalog/variants?limit=5&offset=0' });
  assert.equal(read.statusCode, 200);
  assert.deepEqual(f.calls[0]?.input, { limit: 5, offset: 0 });
  assert.equal(f.calls[0]?.actor.role, 'CASHIER');
});
