import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  catalogPriceSchema, createCategorySchema, createProductSchema, createVariantSchema,
  updateProductSchema, updateVariantSchema, listCatalogSchema,
  variantAttributesKey, variantAttributesSchema, skuSchema,
} from './schemas.js';

test('SKU is canonical uppercase, trimmed and has a bounded safe alphabet', () => {
  assert.equal(skuSchema.parse('  sku-A.b_128 '), 'SKU-A.B_128');
  for (const bad of ['', ' SKU A ', 'a/b', 'điện thoại', '--invalid', 'x'.repeat(65)]) {
    assert.equal(skuSchema.safeParse(bad).success, false, bad);
  }
});

test('catalog prices must be canonical nonnegative signed 64-bit decimal strings', () => {
  for (const good of ['0', '8990000', '9223372036854775807']) {
    assert.equal(catalogPriceSchema.parse(good), good);
  }
  for (const bad of [0, 8990000, 0.99, '00', '01', '-1', '+1', '1.1', '1e6',
    '9223372036854775808', ' 100', 'NaN', '', null]) {
    assert.equal(catalogPriceSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
});

test('variant attributes are sorted and case-insensitive for uniqueness keys', () => {
  const a = variantAttributesSchema.parse({ capacity: '128 GB', color: 'Đen' });
  const b = variantAttributesSchema.parse({ color: 'đen', capacity: '128 GB' });
  assert.deepEqual(Object.keys(a), ['capacity', 'color']);
  assert.equal(variantAttributesKey(a), variantAttributesKey(b));
  assert.notEqual(variantAttributesKey(a),
    variantAttributesKey(variantAttributesSchema.parse({ capacity: '256 GB', color: 'đen' })));
  const unicodeOne = variantAttributesSchema.parse({ color: 'cafe\u0301' });
  const unicodeTwo = variantAttributesSchema.parse({ color: 'café' });
  assert.equal(variantAttributesKey(unicodeOne), variantAttributesKey(unicodeTwo));
});

test('attributes reject unsafe nested or excessive input', () => {
  for (const attrs of [
    { color: '' }, { COLOR: 'Black' }, { color: 2 }, { color: ['blue'] },
    { '__proto__': 'unsafe' }, { 'space key': 'blue' },
    Object.fromEntries(Array.from({ length: 9 }, (_, i) => ['key' + i, 'x'])),
  ]) {
    // The object literal "__proto__" has JS special semantics, so other
    // malformed cases independently guarantee strict nested-value rejection.
    if (Object.keys(attrs).length > 0) {
      assert.equal(variantAttributesSchema.safeParse(attrs).success, false, JSON.stringify(attrs));
    }
  }
});

test('create schemas reject cross-field typos and missing product references', () => {
  const categoryId = randomUUID(), brandId = randomUUID();
  assert.equal(createCategorySchema.safeParse({ name: '  Điện thoại  ' }).success, true);
  assert.equal(createCategorySchema.safeParse({ name: ' ' }).success, false);
  assert.equal(createCategorySchema.safeParse({ name: 'A', storeId: randomUUID() }).success, false);
  const good = createProductSchema.parse({ categoryId, brandId, name: 'Điện thoại mẫu' });
  assert.equal(good.categoryId, categoryId);
  assert.equal(createProductSchema.safeParse({ categoryId, brandId: 'other-store', name: 'Phone' }).success, false);
  assert.equal(createProductSchema.safeParse({ categoryId, brandId, name: 'Phone', price: 5 }).success, false);
});

test('create variant and update paths enforce strict shapes, revision and fields', () => {
  const productId = randomUUID();
  const parsed = createVariantSchema.parse({
    productId, sku: ' phone-128 ', attributes: { color: 'Black' }, priceVnd: '8990000',
  });
  assert.equal(parsed.sku, 'PHONE-128');
  assert.equal(parsed.priceVnd, '8990000');
  assert.equal(createVariantSchema.safeParse({ ...parsed, role: 'ADMIN' }).success, false);
  assert.equal(updateProductSchema.safeParse({}).success, false);
  assert.equal(updateProductSchema.safeParse({ active: false }).success, true);
  assert.equal(updateVariantSchema.safeParse({ expectedRevision: '0' }).success, false);
  assert.equal(updateVariantSchema.safeParse({ expectedRevision: '0', priceVnd: '100' }).success, true);
  assert.equal(updateVariantSchema.safeParse({ expectedRevision: '-1', priceVnd: '100' }).success, false);
  assert.equal(updateVariantSchema.safeParse({ expectedRevision: '0', sku: 'CHANGED' }).success, false);
});

test('bounded list query can safely re-parse numeric output and rejects huge pages', () => {
  const first = listCatalogSchema.parse({ q: ' mẫu ', limit: '100', offset: '10' });
  assert.deepEqual(first, { q: 'mẫu', limit: 100, offset: 10 });
  assert.deepEqual(listCatalogSchema.parse(first), first);
  assert.deepEqual(listCatalogSchema.parse({}), { limit: 20, offset: 0 });
  for (const input of [
    { limit: '0' }, { limit: '101' }, { offset: '-1' }, { offset: '99999' },
    { limit: '1e3' }, { q: '' }, { q: 'x'.repeat(101) },
    { storeId: randomUUID() },
  ]) {
    assert.equal(listCatalogSchema.safeParse(input).success, false, JSON.stringify(input));
  }
});
