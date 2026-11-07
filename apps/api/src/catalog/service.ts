import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { z } from 'zod';
import {
  createCategorySchema, createBrandSchema, createProductSchema, createVariantSchema,
  updateCategorySchema, updateBrandSchema, updateProductSchema, updateVariantSchema,
  listCatalogSchema, uuidSchema, variantAttributesKey,
  type ListCatalogInput, type VariantAttributes,
} from './schemas.js';

/**
 * POS-014: server-owned, single-store-scoped catalog service.
 * Auth is NOT implemented: the caller MUST supply a server-verified principal.
 * No API route is registered by the normal Fastify entrypoint until real
 * authentication exists. No Neon connection is created inside this module.
 */
export type CatalogRole = 'ADMIN' | 'MANAGER' | 'CASHIER';
export type CatalogPrincipal = Readonly<{ userId: string; storeId: string; role: CatalogRole }>;

export type NameView = Readonly<{ id: string; storeId: string; name: string }>;
export type ProductView = Readonly<{
  id: string; storeId: string; categoryId: string; brandId: string; name: string; active: boolean;
}>;
export type VariantView = Readonly<{
  id: string; storeId: string; productId: string; sku: string;
  attributes: VariantAttributes; priceVnd: string; revision: string; active: boolean;
}>;

export type CatalogErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' |
  'DUPLICATE' | 'STALE_REVISION' | 'INVALID_DATA' | 'DATABASE_UNAVAILABLE';

export class CatalogError extends Error {
  constructor(readonly code: CatalogErrorCode, readonly httpStatus: number) {
    super(code);
    this.name = 'CatalogError';
  }
}

function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}
function sanitized(error: unknown): Error {
  if (error instanceof CatalogError || error instanceof z.ZodError) return error;
  switch (pgCode(error)) {
    case '23505': return new CatalogError('DUPLICATE', 409);
    case '23503': return new CatalogError('NOT_FOUND', 404); // foreign key points to absent or other-store object
    case '23514':
    case '23502':
    case '22003':
    case '22P02': return new CatalogError('INVALID_DATA', 422);
    default: return new CatalogError('DATABASE_UNAVAILABLE', 503);
  }
}

export function assertCatalogRole(principal: CatalogPrincipal | null | undefined, write: boolean): asserts principal is CatalogPrincipal {
  if (!principal || !uuidSchema.safeParse(principal.userId).success ||
    !uuidSchema.safeParse(principal.storeId).success) throw new CatalogError('UNAUTHORIZED', 401);
  if (!['ADMIN', 'MANAGER', 'CASHIER'].includes(principal.role)) {
    throw new CatalogError('FORBIDDEN', 403);
  }
  if (write && principal.role === 'CASHIER') throw new CatalogError('FORBIDDEN', 403);
}

type NameRow = QueryResultRow & { id: string; store_id: string; name: string };
type ProductRow = QueryResultRow & {
  id: string; store_id: string; category_id: string; brand_id: string; name: string; active: boolean;
};
type VariantRow = QueryResultRow & {
  id: string; store_id: string; product_id: string; sku: string;
  attributes: VariantAttributes; price_vnd: string; revision: string; active: boolean;
};

const asName = (r: NameRow): NameView => ({ id: r.id, storeId: r.store_id, name: r.name });
const asProduct = (r: ProductRow): ProductView => ({
  id: r.id, storeId: r.store_id, categoryId: r.category_id, brandId: r.brand_id,
  name: r.name, active: r.active,
});
const asVariant = (r: VariantRow): VariantView => ({
  id: r.id, storeId: r.store_id, productId: r.product_id, sku: r.sku,
  attributes: r.attributes, priceVnd: String(r.price_vnd),
  revision: String(r.revision), active: r.active,
});

async function recordCatalogChange(
  c: PoolClient, actor: CatalogPrincipal, entityType: string, entityId: string,
  op: 'CREATE' | 'UPDATE' | 'DEACTIVATE', payload: Record<string, unknown>,
): Promise<void> {
  await c.query(
    'INSERT INTO catalog_change_log (store_id,entity_type,entity_id,op,payload) VALUES ($1,$2,$3,$4,$5::jsonb)',
    [actor.storeId, entityType, entityId, op, JSON.stringify(payload)],
  );
  await c.query(
    'INSERT INTO audit_logs (id,store_id,actor_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)',
    [randomUUID(), actor.storeId, actor.userId, 'CATALOG_' + op, entityType, entityId,
      JSON.stringify({ operation: op })],
  );
}

export class CatalogService {
  constructor(private readonly pool: Pool) {}

  private async transact<T>(perform: (c: PoolClient) => Promise<T>): Promise<T> {
    let c: PoolClient;
    try { c = await this.pool.connect(); } catch (error) { throw sanitized(error); }
    try {
      await c.query('BEGIN');
      const result = await perform(c);
      await c.query('COMMIT');
      return result;
    } catch (error) {
      // No partial catalog mutation / delta event should be committed.
      try { await c.query('ROLLBACK'); } catch { /* no raw DB errors in HTTP response */ }
      throw sanitized(error);
    } finally { c.release(); }
  }

  private async read<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) { throw sanitized(error); }
  }

  async createCategory(actor: CatalogPrincipal, input: unknown): Promise<NameView> {
    assertCatalogRole(actor, true);
    const { name } = createCategorySchema.parse(input);
    return this.transact(async (c) => {
      const { rows } = await c.query<NameRow>(
        'INSERT INTO categories (id,store_id,name) VALUES ($1,$2,$3) RETURNING id,store_id,name',
        [randomUUID(), actor.storeId, name],
      );
      const row = rows[0]!;
      const view = asName(row);
      await recordCatalogChange(c, actor, 'category', row.id, 'CREATE', view);
      return view;
    });
  }

  async updateCategory(actor: CatalogPrincipal, id: string, input: unknown): Promise<NameView> {
    assertCatalogRole(actor, true);
    uuidSchema.parse(id);
    const { name } = updateCategorySchema.parse(input);
    return this.transact(async (c) => {
      const { rows } = await c.query<NameRow>(
        'UPDATE categories SET name=$3 WHERE store_id=$1 AND id=$2 RETURNING id,store_id,name',
        [actor.storeId, id, name],
      );
      if (!rows[0]) throw new CatalogError('NOT_FOUND', 404);
      const view = asName(rows[0]);
      await recordCatalogChange(c, actor, 'category', id, 'UPDATE', view);
      return view;
    });
  }

  async createBrand(actor: CatalogPrincipal, input: unknown): Promise<NameView> {
    assertCatalogRole(actor, true);
    const { name } = createBrandSchema.parse(input);
    return this.transact(async (c) => {
      const { rows } = await c.query<NameRow>(
        'INSERT INTO brands (id,store_id,name) VALUES ($1,$2,$3) RETURNING id,store_id,name',
        [randomUUID(), actor.storeId, name],
      );
      const view = asName(rows[0]!);
      await recordCatalogChange(c, actor, 'brand', view.id, 'CREATE', view);
      return view;
    });
  }

  async updateBrand(actor: CatalogPrincipal, id: string, input: unknown): Promise<NameView> {
    assertCatalogRole(actor, true);
    uuidSchema.parse(id);
    const { name } = updateBrandSchema.parse(input);
    return this.transact(async (c) => {
      const { rows } = await c.query<NameRow>(
        'UPDATE brands SET name=$3 WHERE store_id=$1 AND id=$2 RETURNING id,store_id,name',
        [actor.storeId, id, name],
      );
      if (!rows[0]) throw new CatalogError('NOT_FOUND', 404);
      const view = asName(rows[0]);
      await recordCatalogChange(c, actor, 'brand', id, 'UPDATE', view);
      return view;
    });
  }

  async createProduct(actor: CatalogPrincipal, input: unknown): Promise<ProductView> {
    assertCatalogRole(actor, true);
    const { categoryId, brandId, name } = createProductSchema.parse(input);
    return this.transact(async (c) => {
      // Store-scoped FK constraints also forbid cross-store category/brand references.
      const { rows } = await c.query<ProductRow>(
        'INSERT INTO products (id,store_id,category_id,brand_id,name) VALUES ($1,$2,$3,$4,$5) RETURNING id,store_id,category_id,brand_id,name,active',
        [randomUUID(), actor.storeId, categoryId, brandId, name],
      );
      const view = asProduct(rows[0]!);
      await recordCatalogChange(c, actor, 'product', view.id, 'CREATE', view);
      return view;
    });
  }

  async updateProduct(actor: CatalogPrincipal, id: string, input: unknown): Promise<ProductView> {
    assertCatalogRole(actor, true);
    uuidSchema.parse(id);
    const patch = updateProductSchema.parse(input);
    return this.transact(async (c) => {
      const { rows } = await c.query<ProductRow>(
        'UPDATE products SET name=COALESCE($3::text,name), active=COALESCE($4::boolean,active) WHERE store_id=$1 AND id=$2 RETURNING id,store_id,category_id,brand_id,name,active',
        [actor.storeId, id, patch.name ?? null, patch.active ?? null],
      );
      if (!rows[0]) throw new CatalogError('NOT_FOUND', 404);
      const view = asProduct(rows[0]);
      await recordCatalogChange(c, actor, 'product', view.id, !view.active ? 'DEACTIVATE' : 'UPDATE', view);
      return view;
    });
  }

  async createVariant(actor: CatalogPrincipal, input: unknown): Promise<VariantView> {
    assertCatalogRole(actor, true);
    const { productId, sku, attributes, priceVnd } = createVariantSchema.parse(input);
    return this.transact(async (c) => {
      const { rows } = await c.query<VariantRow>(
        `INSERT INTO product_variants
          (id,store_id,product_id,sku,attributes,attributes_key,price_vnd)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::bigint)
         RETURNING id,store_id,product_id,sku,attributes,price_vnd,revision,active`,
        [randomUUID(), actor.storeId, productId, sku, JSON.stringify(attributes),
          variantAttributesKey(attributes), priceVnd],
      );
      const view = asVariant(rows[0]!);
      await recordCatalogChange(c, actor, 'product_variant', view.id, 'CREATE', view);
      return view;
    });
  }

  async updateVariant(actor: CatalogPrincipal, id: string, input: unknown): Promise<VariantView> {
    assertCatalogRole(actor, true);
    uuidSchema.parse(id);
    const patch = updateVariantSchema.parse(input);
    return this.transact(async (c) => {
      // Optimistic revision check ensures two managers cannot silently overwrite
      // each other's price/attribute changes. SKU and product binding stay immutable.
      const { rows } = await c.query<VariantRow>(
        `UPDATE product_variants SET
          price_vnd=COALESCE($4::bigint,price_vnd),
          attributes=COALESCE($5::jsonb,attributes),
          attributes_key=COALESCE($6::text,attributes_key),
          active=COALESCE($7::boolean,active),
          revision=revision+1
         WHERE store_id=$1 AND id=$2 AND revision=$3::bigint
           AND revision < 9223372036854775807
         RETURNING id,store_id,product_id,sku,attributes,price_vnd,revision,active`,
        [actor.storeId, id, patch.expectedRevision, patch.priceVnd ?? null,
          patch.attributes === undefined ? null : JSON.stringify(patch.attributes),
          patch.attributes === undefined ? null : variantAttributesKey(patch.attributes),
          patch.active ?? null],
      );
      if (!rows[0]) {
        const existing = await c.query(
          'SELECT 1 FROM product_variants WHERE store_id=$1 AND id=$2',
          [actor.storeId, id],
        );
        throw existing.rows.length
          ? new CatalogError('STALE_REVISION', 409)
          : new CatalogError('NOT_FOUND', 404);
      }
      const view = asVariant(rows[0]);
      await recordCatalogChange(c, actor, 'product_variant', view.id, !view.active ? 'DEACTIVATE' : 'UPDATE', view);
      return view;
    });
  }

  async getProduct(actor: CatalogPrincipal, id: string): Promise<ProductView> {
    assertCatalogRole(actor, false);
    uuidSchema.parse(id);
    return this.read(async () => {
      const { rows } = await this.pool.query<ProductRow>(
        'SELECT id,store_id,category_id,brand_id,name,active FROM products WHERE store_id=$1 AND id=$2',
        [actor.storeId, id],
      );
      if (!rows[0]) throw new CatalogError('NOT_FOUND', 404);
      return asProduct(rows[0]);
    });
  }

  async getVariant(actor: CatalogPrincipal, id: string): Promise<VariantView> {
    assertCatalogRole(actor, false);
    uuidSchema.parse(id);
    return this.read(async () => {
      const { rows } = await this.pool.query<VariantRow>(
        'SELECT id,store_id,product_id,sku,attributes,price_vnd,revision,active FROM product_variants WHERE store_id=$1 AND id=$2',
        [actor.storeId, id],
      );
      if (!rows[0]) throw new CatalogError('NOT_FOUND', 404);
      return asVariant(rows[0]);
    });
  }

  async listProducts(actor: CatalogPrincipal, query: unknown): Promise<ProductView[]> {
    assertCatalogRole(actor, false);
    const filter: ListCatalogInput = listCatalogSchema.parse(query);
    return this.read(async () => {
      const { rows } = await this.pool.query<ProductRow>(
        `SELECT id,store_id,category_id,brand_id,name,active
         FROM products WHERE store_id=$1 AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%')
         ORDER BY name,id LIMIT $3 OFFSET $4`,
        [actor.storeId, filter.q ?? null, filter.limit, filter.offset],
      );
      return rows.map(asProduct);
    });
  }

  async listVariants(actor: CatalogPrincipal, query: unknown): Promise<VariantView[]> {
    assertCatalogRole(actor, false);
    const filter: ListCatalogInput = listCatalogSchema.parse(query);
    return this.read(async () => {
      const { rows } = await this.pool.query<VariantRow>(
        `SELECT v.id,v.store_id,v.product_id,v.sku,v.attributes,v.price_vnd,v.revision,v.active
         FROM product_variants v JOIN products p ON p.store_id=v.store_id AND p.id=v.product_id
         WHERE v.store_id=$1 AND ($2::text IS NULL OR v.sku ILIKE '%' || $2 || '%' OR p.name ILIKE '%' || $2 || '%')
         ORDER BY v.sku,v.id LIMIT $3 OFFSET $4`,
        [actor.storeId, filter.q ?? null, filter.limit, filter.offset],
      );
      return rows.map(asVariant);
    });
  }
}
