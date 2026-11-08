/**
 * POS-014 REAL PostgreSQL integration tests. Only disposable CI test database:
 * 127.0.0.1/smartpos_ci. NEVER connect to Neon or any other DB.
 * Migrations are applied by the existing packages/db test:migrations step first.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { CatalogError, CatalogService, type CatalogPrincipal } from './service.js';

const connectionString = process.env.POS_DB_TEST_URL;
if (!connectionString) throw new Error('POS_DB_TEST_URL is required for disposable PostgreSQL catalog tests');
const url = new URL(connectionString);
if (url.hostname !== '127.0.0.1' || url.pathname !== '/smartpos_ci') {
  throw new Error('Catalog integration tests ONLY run on local disposable smartpos_ci');
}

const storeName = 'POS-014 disposable fixture';
const validError = (code: CatalogError['code']) =>
  (error: unknown): boolean => error instanceof CatalogError && error.code === code;

test('POS-014 catalog CRUD, scopes, SKU uniqueness, audit and revision use disposable PostgreSQL', async (t) => {
  const pool = new pg.Pool({ connectionString, max: 5 });
  t.after(async () => { await pool.end(); });
  const catalog = new CatalogService(pool);

  async function seedStore(): Promise<CatalogPrincipal> {
    const storeId = randomUUID(), userId = randomUUID();
    await pool.query('INSERT INTO stores (id,name) VALUES ($1,$2)', [storeId, storeName]);
    await pool.query('INSERT INTO users (id,email,password_hash,active) VALUES ($1,$2,$3,true)',
      [userId, randomUUID() + '@example.test', 'FAKE_HASH_NON_CREDENTIAL']);
    await pool.query('INSERT INTO store_memberships (store_id,user_id,role,active) VALUES ($1,$2,$3,true)',
      [storeId, userId, 'MANAGER']);
    return { storeId, userId, role: 'MANAGER' };
  }

  const manager = await seedStore();
  const other = await seedStore();
  const cashier: CatalogPrincipal = { ...manager, role: 'CASHIER' };

  let categoryId: string, brandId: string, productId: string, variantId: string;

  const logCount = async (storeId: string): Promise<number> => {
    const { rows } = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM catalog_change_log WHERE store_id=$1',
      [storeId],
    );
    return Number(rows[0]?.count);
  };
  const auditCount = async (storeId: string): Promise<number> => {
    const { rows } = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM audit_logs WHERE store_id=$1',
      [storeId],
    );
    return Number(rows[0]?.count);
  };

  await t.test('create category/brand/product/variant atomically and store VND as bigint', async () => {
    const category = await catalog.createCategory(manager, { name: '  Điện thoại  ' });
    const brand = await catalog.createBrand(manager, { name: '  SmartPOS Test  ' });
    assert.equal(category.name, 'Điện thoại');
    assert.equal(brand.name, 'SmartPOS Test');
    categoryId = category.id; brandId = brand.id;

    const product = await catalog.createProduct(manager, {
      categoryId, brandId, name: 'Phone Demo',
    });
    productId = product.id;
    assert.equal(product.active, true);
    const variant = await catalog.createVariant(manager, {
      productId, sku: ' phone-black-128 ', attributes: { color: 'Black', capacity: '128 GB' },
      priceVnd: '8990000',
    });
    variantId = variant.id;
    assert.equal(variant.sku, 'PHONE-BLACK-128');
    assert.equal(variant.revision, '0');
    assert.equal(variant.priceVnd, '8990000');
    assert.deepEqual(variant.attributes, { capacity: '128 GB', color: 'Black' });

    const database = await pool.query<{ price_vnd: string; attributes_key: string }>(
      'SELECT price_vnd::text,attributes_key FROM product_variants WHERE id=$1',
      [variantId],
    );
    assert.equal(database.rows[0]?.price_vnd, '8990000');
    assert.equal(database.rows[0]?.attributes_key.length, 64);
    assert.equal(await logCount(manager.storeId), 4);
    assert.equal(await auditCount(manager.storeId), 4);

    const logs = await pool.query<{ entity_type: string; op: string; price: string | undefined }>(
      "SELECT entity_type,op,payload->>'priceVnd' AS price FROM catalog_change_log WHERE store_id=$1 ORDER BY seq",
      [manager.storeId],
    );
    assert.equal(logs.rows[3]?.entity_type, 'product_variant');
    assert.equal(logs.rows[3]?.op, 'CREATE');
    assert.equal(logs.rows[3]?.price, '8990000');
  });

  await t.test('same-store foreign keys and per-store SKU and product attribute uniqueness', async () => {
    const before = await logCount(manager.storeId);
    await assert.rejects(
      catalog.createVariant(manager, {
        productId, sku: 'phone-black-128', attributes: { color: 'Blue', capacity: '256 GB' }, priceVnd: '50',
      }),
      validError('DUPLICATE'),
    );
    await assert.rejects(
      catalog.createVariant(manager, {
        productId, sku: 'ANOTHER-SKU',
        attributes: { capacity: '128 GB', color: 'black' }, priceVnd: '50',
      }),
      validError('DUPLICATE'),
    );
    assert.equal(await logCount(manager.storeId), before);
    assert.equal(await auditCount(manager.storeId), before);

    await assert.rejects(
      catalog.createProduct(other, {
        categoryId, brandId, name: 'Cross store is forbidden',
      }),
      validError('NOT_FOUND'),
    );
    await assert.rejects(
      catalog.createVariant(other, {
        productId, sku: 'OTHER-STOCK', attributes: {}, priceVnd: '1',
      }),
      validError('NOT_FOUND'),
    );
    assert.equal(await logCount(other.storeId), 0);

    const otherCategory = await catalog.createCategory(other, { name: 'Phones' });
    const otherBrand = await catalog.createBrand(other, { name: 'Brand' });
    const otherProduct = await catalog.createProduct(other, {
      categoryId: otherCategory.id, brandId: otherBrand.id, name: 'Same SKU different store',
    });
    const sameSku = await catalog.createVariant(other, {
      productId: otherProduct.id, sku: 'phone-black-128', attributes: {}, priceVnd: '123',
    });
    assert.equal(sameSku.sku, 'PHONE-BLACK-128');
  });

  await t.test('store-scoped reads, search, pagination and cashier read-only', async () => {
    assert.equal((await catalog.getProduct(manager, productId)).id, productId);
    assert.equal((await catalog.getVariant(cashier, variantId)).id, variantId);
    assert.equal((await catalog.listVariants(manager, { q: 'phone', limit: '10' })).length, 1);
    assert.equal((await catalog.listProducts(manager, { q: 'demo' })).length, 1);
    assert.equal((await catalog.listVariants(other, { q: 'phone' })).length, 1);
    await assert.rejects(catalog.getProduct(other, productId), validError('NOT_FOUND'));
    await assert.rejects(catalog.getVariant(other, variantId), validError('NOT_FOUND'));
    assert.deepEqual(await catalog.listProducts(manager, { q: 'does-not-exist' }), []);
    assert.deepEqual(await catalog.listProducts(manager, { offset: '100' }), []);

    await assert.rejects(catalog.createBrand(cashier, { name: 'Forbidden' }), validError('FORBIDDEN'));
    await assert.rejects(catalog.updateVariant(cashier, variantId, {
      expectedRevision: '0', priceVnd: '1',
    }), validError('FORBIDDEN'));
    await assert.rejects(catalog.createProduct({
      userId: 'not-a-uuid', storeId: manager.storeId, role: 'ADMIN',
    }, { categoryId, brandId, name: 'Forged' }), validError('UNAUTHORIZED'));
  });

  await t.test('update product/category/brand, deactivate without deleting records', async () => {
    const before = await logCount(manager.storeId);
    const cat = await catalog.updateCategory(manager, categoryId, { name: 'Điện thoại di động' });
    assert.equal(cat.name, 'Điện thoại di động');
    const brand = await catalog.updateBrand(manager, brandId, { name: 'Brand renamed' });
    assert.equal(brand.name, 'Brand renamed');
    const updated = await catalog.updateProduct(manager, productId, {
      name: 'Phone Demo Updated', active: false,
    });
    assert.equal(updated.active, false);
    assert.equal((await catalog.getProduct(manager, productId)).name, 'Phone Demo Updated');
    // POS-023 product rename/deactivation emits one extra variant refresh
    // for each related SKU so SQLite v1 can update denormalized name/active.
    assert.equal(await logCount(manager.storeId), before + 4);
    assert.equal(await auditCount(manager.storeId), before + 3);
    const deactivated = await pool.query<{ op: string }>(
      "SELECT op FROM catalog_change_log WHERE entity_id=$1 AND entity_type='product' ORDER BY seq DESC LIMIT 1",
      [productId],
    );
    assert.equal(deactivated.rows[0]?.op, 'DEACTIVATE');
    assert.equal((await catalog.getVariant(manager, variantId)).active, true);
  });

  await t.test('optimistic variant price revision and concurrent update prevent lost writes', async () => {
    const first = await catalog.updateVariant(manager, variantId, {
      expectedRevision: '0', priceVnd: '9223372036854775807',
    });
    assert.equal(first.priceVnd, '9223372036854775807');
    assert.equal(first.revision, '1');
    await assert.rejects(catalog.updateVariant(manager, variantId, {
      expectedRevision: '0', priceVnd: '999',
    }), validError('STALE_REVISION'));
    const before = await logCount(manager.storeId);
    const auditBefore = await auditCount(manager.storeId);
    const competing = await Promise.allSettled([
      catalog.updateVariant(manager, variantId, { expectedRevision: '1', priceVnd: '9000000' }),
      catalog.updateVariant(manager, variantId, { expectedRevision: '1', priceVnd: '8000000' }),
    ]);
    assert.equal(competing.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(competing.filter(x => x.status === 'rejected').length, 1);
    const rejection = competing.find(x => x.status === 'rejected');
    assert.ok(rejection && rejection.status === 'rejected' && validError('STALE_REVISION')(rejection.reason));
    assert.equal((await catalog.getVariant(manager, variantId)).revision, '2');
    assert.equal(await logCount(manager.storeId), before + 1);
    assert.equal(await auditCount(manager.storeId), auditBefore + 1);
    const inactive = await catalog.updateVariant(manager, variantId, {
      expectedRevision: '2', active: false,
    });
    assert.equal(inactive.active, false);
    assert.equal(inactive.sku, 'PHONE-BLACK-128');
    const last = await pool.query<{ op: string }>(
      "SELECT op FROM catalog_change_log WHERE entity_id=$1 AND entity_type='product_variant' ORDER BY seq DESC LIMIT 1",
      [variantId],
    );
    assert.equal(last.rows[0]?.op, 'DEACTIVATE');
  });

  await t.test('failure AFTER insert rolls back catalog row and delta log together', async () => {
    const before = await logCount(manager.storeId);
    const auditBefore = await auditCount(manager.storeId);
    const countBefore = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM categories WHERE store_id=$1',
      [manager.storeId],
    );
    // Synthetic userId has no matching server-side users row, so the audit
    // insert fails AFTER category insert and delta log insert. Tx must rollback.
    const invalidActor: CatalogPrincipal = { ...manager, userId: randomUUID() };
    await assert.rejects(
      catalog.createCategory(invalidActor, { name: 'ROLLBACK_ME' }),
      validError('NOT_FOUND'),
    );
    assert.equal(await logCount(manager.storeId), before);
    assert.equal(await auditCount(manager.storeId), auditBefore);
    const rows = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM categories WHERE store_id=$1",
      [manager.storeId],
    );
    assert.equal(rows.rows[0]?.count, countBefore.rows[0]?.count);
  });
});
