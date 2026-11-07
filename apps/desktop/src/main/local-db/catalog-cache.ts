import type { DatabaseSync } from 'node:sqlite';
import { withLocalTransaction } from './index.ts';

/**
 * POS-017: trusted, MAIN-only catalog projection into the existing SQLite v1 cache.
 * This is NOT a sync HTTP client or an authentication boundary. POS-023 must
 * build an authenticated, validated server snapshot before calling this module.
 * No entry point for importing a snapshot is exposed to preload/renderer.
 */
const MAX_INT64 = 9_223_372_036_854_775_807n;
const MAX_VARIANTS = 5_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SKU = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const ATTR_KEY = /^[a-z][a-z0-9_]{0,31}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

type Variant = Readonly<{
  variantId: string;
  storeId: string;
  sku: string;
  name: string;
  attributes: Readonly<Record<string, string>>;
  priceVnd: string;
  revision: string;
  active: boolean;
}>;
export type InitialCatalogSnapshot = Readonly<{
  protocolVersion: 1;
  storeId: string;
  catalogSeq: string;
  variants: readonly Variant[];
}>;
export type CachedCatalogVariant = Omit<Variant, 'storeId' | 'revision'> & {
  serverRevision: string;
};
type CachedRow = {
  variant_id: string; store_id: string; sku: string; name_snapshot: string;
  attributes_json: string; price_vnd: bigint; server_revision: bigint; active: bigint;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('CATALOG_INVALID_' + label);
  }
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (Object.keys(value).length !== expected.length ||
      Object.keys(value).some((key) => !expected.includes(key))) {
    throw new Error('CATALOG_INVALID_' + label);
  }
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('CATALOG_INVALID_UUID');
  return value.toLowerCase();
}
function decimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > 19 || !DECIMAL.test(value) ||
      BigInt(value) > MAX_INT64) throw new Error('CATALOG_INVALID_' + label);
  return value;
}
function text(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max ||
      value.trim() !== value || /[\u0000-\u001f]/.test(value)) {
    throw new Error('CATALOG_INVALID_' + label);
  }
  return value;
}
function parseAttributes(raw: unknown): Record<string, string> {
  const obj = record(raw, 'ATTRIBUTES');
  if (Object.keys(obj).length > 8) throw new Error('CATALOG_INVALID_ATTRIBUTES');
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    if (!ATTR_KEY.test(key)) throw new Error('CATALOG_INVALID_ATTRIBUTES');
    result[key] = text(value, 64, 'ATTRIBUTE_VALUE');
  }
  return result;
}
/** Fail closed on untrusted data BEFORE a transaction can change local rows. */
export function parseInitialCatalogSnapshot(raw: unknown): InitialCatalogSnapshot {
  const input = record(raw, 'SNAPSHOT');
  exactKeys(input, ['protocolVersion', 'storeId', 'catalogSeq', 'variants'], 'SNAPSHOT');
  if (input.protocolVersion !== 1) throw new Error('CATALOG_UNSUPPORTED_VERSION');
  const storeId = uuid(input.storeId);
  const catalogSeq = decimal(input.catalogSeq, 'CURSOR');
  if (!Array.isArray(input.variants) || input.variants.length > MAX_VARIANTS) {
    throw new Error('CATALOG_INVALID_VARIANTS');
  }
  const ids = new Set<string>();
  const skus = new Set<string>();
  const variants = input.variants.map((value: unknown) => {
    const item = record(value, 'VARIANT');
    exactKeys(item, ['variantId', 'storeId', 'sku', 'name', 'attributes',
      'priceVnd', 'revision', 'active'], 'VARIANT');
    const variantId = uuid(item.variantId);
    const variantStoreId = uuid(item.storeId);
    if (variantStoreId !== storeId) throw new Error('CATALOG_WRONG_STORE');
    const sku = text(item.sku, 64, 'SKU');
    if (!SKU.test(sku)) throw new Error('CATALOG_INVALID_SKU');
    if (ids.has(variantId) || skus.has(sku)) throw new Error('CATALOG_DUPLICATE_VARIANT');
    ids.add(variantId);
    skus.add(sku);
    if (typeof item.active !== 'boolean') throw new Error('CATALOG_INVALID_ACTIVE');
    return {
      variantId, storeId, sku, name: text(item.name, 200, 'NAME'),
      attributes: parseAttributes(item.attributes),
      priceVnd: decimal(item.priceVnd, 'PRICE'), revision: decimal(item.revision, 'REVISION'),
      active: item.active,
    };
  });
  return { protocolVersion: 1, storeId, catalogSeq, variants };
}
function currentCursor(db: DatabaseSync, storeId: string): string | null {
  const stmt = db.prepare('SELECT catalog_seq FROM sync_cursors WHERE store_id = ?');
  stmt.setReadBigInts(true);
  const row = stmt.get(storeId) as { catalog_seq: bigint } | undefined;
  return row ? String(row.catalog_seq) : null;
}
export function getLocalCatalogCursor(db: DatabaseSync, storeId: string): string | null {
  return currentCursor(db, uuid(storeId));
}
function cachedSnapshotMatches(db: DatabaseSync, snapshot: InitialCatalogSnapshot): boolean {
  const stmt = db.prepare(`SELECT variant_id,store_id,sku,name_snapshot,attributes_json,
    price_vnd,server_revision,active FROM local_catalog_variants
    WHERE store_id = ? ORDER BY variant_id`);
  stmt.setReadBigInts(true);
  const rows = stmt.all(snapshot.storeId) as CachedRow[];
  const variants = [...snapshot.variants].sort((a, b) => a.variantId.localeCompare(b.variantId, 'en'));
  return rows.length === variants.length && rows.every((row, index) => {
    const v = variants[index]!;
    return row.variant_id === v.variantId && row.store_id === v.storeId &&
      row.sku === v.sku && row.name_snapshot === v.name &&
      row.attributes_json === JSON.stringify(v.attributes) &&
      row.price_vnd === BigInt(v.priceVnd) &&
      row.server_revision === BigInt(v.revision) &&
      row.active === BigInt(Number(v.active));
  });
}
/**
 * Atomic INITIAL bootstrap, not incremental pull. Refuses to replace an
 * initialized cache with any divergent snapshot, even at the same cursor.
 * Never deletes a variant referenced by immutable sale evidence.
 */
export function applyInitialCatalogSnapshot(
  db: DatabaseSync, raw: unknown,
): { cursor: string; count: number; replay: boolean } {
  const snapshot = parseInitialCatalogSnapshot(raw);
  return withLocalTransaction(db, () => {
    const wrongStore = db.prepare(`
      SELECT 1 FROM local_device_metadata WHERE store_id <> ?
      UNION SELECT 1 FROM sync_cursors WHERE store_id <> ?
      UNION SELECT 1 FROM local_catalog_variants WHERE store_id <> ?
      LIMIT 1`).get(snapshot.storeId, snapshot.storeId, snapshot.storeId);
    if (wrongStore) throw new Error('CATALOG_WRONG_STORE');
    const cursor = currentCursor(db, snapshot.storeId);
    if (cursor !== null) {
      if (cursor !== snapshot.catalogSeq || !cachedSnapshotMatches(db, snapshot)) {
        throw new Error('CATALOG_ALREADY_INITIALIZED');
      }
      return { cursor, count: snapshot.variants.length, replay: true };
    }
    const hasOldRows = db.prepare('SELECT 1 FROM local_catalog_variants LIMIT 1').get();
    if (hasOldRows) throw new Error('CATALOG_UNVERSIONED_CACHE');
    const insert = db.prepare(`INSERT INTO local_catalog_variants
      (variant_id,store_id,sku,name_snapshot,attributes_json,price_vnd,server_revision,active)
      VALUES (?,?,?,?,?,?,?,?)`);
    for (const item of snapshot.variants) {
      insert.run(item.variantId, item.storeId, item.sku, item.name,
        JSON.stringify(item.attributes), BigInt(item.priceVnd),
        BigInt(item.revision), Number(item.active));
    }
    db.prepare(`INSERT INTO sync_cursors (store_id,catalog_seq,updated_at)
      VALUES (?,?,?)`).run(snapshot.storeId, BigInt(snapshot.catalogSeq), new Date().toISOString());
    return { cursor: snapshot.catalogSeq, count: snapshot.variants.length, replay: false };
  });
}
/**
 * Only usable after a store has initialized its snapshot. Safe prefix search;
 * underscore is escaped, not treated as a SQL LIKE wildcard. No raw SQL or
 * user-selected table/column name. Never returns DB handles or money as Number.
 */
export function lookupLocalCatalogBySku(
  db: DatabaseSync, storeIdInput: string, skuInput: string, limit = 20,
): CachedCatalogVariant[] {
  const storeId = uuid(storeIdInput);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('CATALOG_INVALID_LIMIT');
  const sku = text(skuInput, 64, 'SKU').toUpperCase();
  if (!SKU.test(sku)) throw new Error('CATALOG_INVALID_SKU');
  if (currentCursor(db, storeId) === null) return [];
  const escaped = sku.replace(/[_%\\]/g, '\\$&');
  const stmt = db.prepare(`SELECT variant_id,store_id,sku,name_snapshot,attributes_json,
    price_vnd,server_revision,active FROM local_catalog_variants
    WHERE store_id = ? AND active = 1 AND sku LIKE ? ESCAPE '\\'
    ORDER BY CASE WHEN sku = ? THEN 0 ELSE 1 END, sku, variant_id LIMIT ?`);
  stmt.setReadBigInts(true);
  const rows = stmt.all(storeId, escaped + '%', sku, limit) as CachedRow[];
  return rows.map((row) => ({
    variantId: row.variant_id, sku: row.sku, name: row.name_snapshot,
    attributes: JSON.parse(row.attributes_json) as Record<string, string>,
    priceVnd: String(row.price_vnd), serverRevision: String(row.server_revision),
    active: row.active === 1n,
  }));
}
