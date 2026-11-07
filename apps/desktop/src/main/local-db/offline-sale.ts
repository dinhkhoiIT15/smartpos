import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { withLocalTransaction } from './index.ts';

/**
 * POS-019 INTERNAL MAIN-ONLY STORAGE CORE. NOT AN AUTHORIZATION API.
 *
 * IMPORTANT: No Electron IPC, renderer, HTTP or production checkout caller is
 * wired to this function. Before ANY live use, D-013 must verify a signed,
 * short-lived per-store/per-device/per-cashier offline grant (including OS key
 * proof, shift/expiry, clock-rollback, role/revocation) OUTSIDE this module.
 * Device metadata alone is never authorization.
 *
 * IDs/expected SKU/prices below are received only from a future trusted
 * orchestrator. Re-read catalog/stock under BEGIN IMMEDIATE; totals and
 * snapshots are always generated from SQLite, never accepted from UI.
 */
const MAX_INT64 = 9_223_372_036_854_775_807n;
const MAX_QTY = 2_147_483_647;
const MAX_ITEMS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SKU = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const ATTR_KEY = /^[a-z][a-z0-9_]{0,31}$/;
const UTC_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type LocalSaleLineRequest = Readonly<{
  itemId: string;
  variantId: string;
  skuSnapshot: string;
  expectedUnitPriceVnd: string;
  expectedServerRevision: string;
  quantity: number;
}>;
export type LocalCashSaleRequest = Readonly<{
  saleId: string;
  eventId: string;
  paymentId: string;
  storeId: string;
  deviceId: string;
  cashierId: string;
  offlineGrantId: string;
  clientCreatedAt: string;
  catalogRevision: string;
  tenderedVnd: string;
  items: readonly LocalSaleLineRequest[];
}>;
export type LocalSaleCommit = Readonly<{
  saleId: string;
  eventId: string;
  totalVnd: string;
  tenderedVnd: string;
  changeVnd: string;
  syncStatus: 'PENDING_SYNC' | 'SYNCED' | 'NEEDS_REVIEW';
  replay: boolean;
}>;

type VariantRow = {
  variant_id: string; sku: string; name_snapshot: string; attributes_json: string;
  price_vnd: bigint; server_revision: bigint; active: bigint;
};
type StockRow = { server_qty: bigint; pending_delta: bigint };
type SaleRow = {
  sale_id: string; store_id: string; device_id: string; cashier_id: string;
  client_created_at: string; total_vnd: bigint;
  sync_status: 'PENDING_SYNC' | 'SYNCED' | 'NEEDS_REVIEW';
};
type PaymentRow = {
  payment_id: string; due_vnd: bigint; tendered_vnd: bigint; change_vnd: bigint;
};
type OutboxRow = { event_id: string; payload_json: string; payload_hash: string };

function reject(code: string): never { throw new Error('LOCAL_SALE_' + code); }
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject('INVALID_' + label);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, wanted: readonly string[], label: string): void {
  if (Object.keys(value).length !== wanted.length ||
    Object.keys(value).some((key) => !wanted.includes(key))) reject('INVALID_' + label);
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) reject('INVALID_UUID');
  return value;
}
function vnd(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || value.length > 19 || !DECIMAL.test(value)) {
    reject('INVALID_' + label);
  }
  const amount = BigInt(value);
  if (amount > MAX_INT64) reject('INVALID_' + label);
  return amount;
}
function int64(value: bigint): bigint {
  if (value < -MAX_INT64 - 1n || value > MAX_INT64) reject('INTEGER_OVERFLOW');
  return value;
}
function qty(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) ||
    value < 1 || value > MAX_QTY) reject('INVALID_QUANTITY');
  return value;
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !UTC_MS.test(value) || !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value) reject('INVALID_TIMESTAMP');
  return value;
}
function validSku(value: unknown): string {
  if (typeof value !== 'string' || !SKU.test(value)) reject('INVALID_SKU');
  return value;
}
function attributes(value: unknown): Record<string, string> {
  const raw = object(value, 'ATTRIBUTES');
  if (Object.keys(raw).length > 8) reject('INVALID_ATTRIBUTES');
  const attrs: Record<string, string> = {};
  for (const [key, entry] of Object.entries(raw).sort(([a],[b]) => a.localeCompare(b, 'en'))) {
    if (!ATTR_KEY.test(key) || typeof entry !== 'string' ||
        !entry.trim() || entry.length > 64 || entry.trim() !== entry ||
        /[\u0000-\u001f]/.test(entry)) reject('INVALID_ATTRIBUTES');
    attrs[key] = entry;
  }
  return attrs;
}

/** Input validation does not authorize an offline payment. */
export function parseLocalCashSaleRequest(raw: unknown): LocalCashSaleRequest {
  const input = object(raw, 'REQUEST');
  keys(input, [
    'saleId','eventId','paymentId','storeId','deviceId','cashierId',
    'offlineGrantId','clientCreatedAt','catalogRevision','tenderedVnd','items',
  ], 'REQUEST');
  if (!Array.isArray(input.items) || input.items.length === 0 ||
      input.items.length > MAX_ITEMS) reject('INVALID_ITEMS');
  const seenItems = new Set<string>();
  const seenVariants = new Set<string>();
  const items = input.items.map((line: unknown) => {
    const rawLine = object(line, 'ITEM');
    keys(rawLine, ['itemId','variantId','skuSnapshot','expectedUnitPriceVnd',
      'expectedServerRevision','quantity'], 'ITEM');
    const itemId = uuid(rawLine.itemId), variantId = uuid(rawLine.variantId);
    if (seenItems.has(itemId) || seenVariants.has(variantId)) reject('DUPLICATE_ITEM');
    seenItems.add(itemId); seenVariants.add(variantId);
    vnd(rawLine.expectedUnitPriceVnd, 'PRICE');
    vnd(rawLine.expectedServerRevision, 'REVISION');
    return {
      itemId, variantId, skuSnapshot: validSku(rawLine.skuSnapshot),
      expectedUnitPriceVnd: rawLine.expectedUnitPriceVnd as string,
      expectedServerRevision: rawLine.expectedServerRevision as string,
      quantity: qty(rawLine.quantity),
    };
  });
  vnd(input.catalogRevision, 'CURSOR');
  vnd(input.tenderedVnd, 'TENDERED');
  return {
    saleId: uuid(input.saleId), eventId: uuid(input.eventId),
    paymentId: uuid(input.paymentId), storeId: uuid(input.storeId),
    deviceId: uuid(input.deviceId), cashierId: uuid(input.cashierId),
    offlineGrantId: uuid(input.offlineGrantId), clientCreatedAt: timestamp(input.clientCreatedAt),
    catalogRevision: input.catalogRevision as string,
    tenderedVnd: input.tenderedVnd as string, items,
  };
}

function canonicalSyncJson(value: unknown): string {
  // Equivalent to POS-016 canonicalSyncJson; check with contract interoperability
  // tests before any sync worker is enabled. Never hash ordinary JSON.stringify.
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) reject('INVALID_EVENT_NUMBER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalSyncJson).join(',') + ']';
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0);
    return '{' + entries.map(([k,v]) => JSON.stringify(k) + ':' + canonicalSyncJson(v)).join(',') + '}';
  }
  return reject('INVALID_EVENT_VALUE');
}
function eventHash(value: object): string {
  return createHash('sha256').update(canonicalSyncJson(value), 'utf8').digest('hex');
}

function parseStoredEvent(row: OutboxRow): Record<string, unknown> {
  let raw: unknown;
  try { raw = JSON.parse(row.payload_json); } catch { reject('REPLAY_INVALID_EVENT'); }
  const event = object(raw, 'STORED_EVENT');
  if (typeof event.payloadHash !== 'string' || event.payloadHash !== row.payload_hash) {
    reject('REPLAY_INVALID_EVENT');
  }
  const { payloadHash, ...body } = event;
  if (eventHash(body) !== payloadHash) reject('REPLAY_INVALID_EVENT');
  return event;
}

function checkReplay(db: DatabaseSync, request: LocalCashSaleRequest): LocalSaleCommit | null {
  const saleStmt = db.prepare(`SELECT sale_id,store_id,device_id,cashier_id,client_created_at,total_vnd,sync_status
    FROM local_sales WHERE sale_id = ?`);
  saleStmt.setReadBigInts(true);
  const sale = saleStmt.get(request.saleId) as SaleRow | undefined;
  if (!sale) return null;
  const payStmt = db.prepare(`SELECT payment_id,due_vnd,tendered_vnd,change_vnd
    FROM local_payments WHERE sale_id = ?`);
  payStmt.setReadBigInts(true);
  const payment = payStmt.get(request.saleId) as PaymentRow | undefined;
  const outbox = db.prepare(`SELECT event_id,payload_json,payload_hash FROM outbox_events
    WHERE sale_id = ?`).get(request.saleId) as OutboxRow | undefined;
  const lineStmt = db.prepare(`SELECT item_id,variant_id,sku_snapshot,quantity,unit_price_vnd,
    discount_vnd,line_total_vnd FROM local_sale_items WHERE sale_id = ? ORDER BY item_id`);
  lineStmt.setReadBigInts(true);
  const savedItems = lineStmt.all(request.saleId) as Array<{
    item_id: string; variant_id: string; sku_snapshot: string;
    quantity: bigint; unit_price_vnd: bigint; discount_vnd: bigint; line_total_vnd: bigint;
  }>;
  if (!payment || !outbox || savedItems.length !== request.items.length ||
      sale.store_id !== request.storeId || sale.device_id !== request.deviceId ||
      sale.cashier_id !== request.cashierId || sale.client_created_at !== request.clientCreatedAt ||
      payment.payment_id !== request.paymentId || payment.due_vnd !== sale.total_vnd ||
      payment.tendered_vnd !== BigInt(request.tenderedVnd) ||
      payment.change_vnd !== payment.tendered_vnd - payment.due_vnd ||
      outbox.event_id !== request.eventId) reject('REPLAY_COLLISION');
  const event = parseStoredEvent(outbox);
  const storedSale = object(event.sale, 'STORED_SALE');
  const eventPayment = object(storedSale.payment, 'STORED_PAYMENT');
  const originalItems = storedSale.items;
  if (event.schemaVersion !== 1 || event.eventType !== 'SALE_COMPLETED' ||
      event.eventId !== request.eventId || event.saleId !== request.saleId ||
      event.storeId !== request.storeId || event.deviceId !== request.deviceId ||
      event.cashierId !== request.cashierId || event.offlineGrantId !== request.offlineGrantId ||
      event.clientCreatedAt !== request.clientCreatedAt ||
      event.catalogRevision !== request.catalogRevision ||
      storedSale.status !== 'POSTED' || storedSale.totalVnd !== String(sale.total_vnd) ||
      eventPayment.method !== 'CASH' || eventPayment.dueVnd !== String(payment.due_vnd) ||
      eventPayment.tenderedVnd !== String(payment.tendered_vnd) ||
      eventPayment.changeVnd !== String(payment.change_vnd) ||
      !Array.isArray(originalItems) || originalItems.length !== savedItems.length) {
    reject('REPLAY_COLLISION');
  }
  const storedById = new Map(savedItems.map((item) => [item.item_id, item]));
  for (const line of request.items) {
    const item = storedById.get(line.itemId);
    if (!item || item.variant_id !== line.variantId ||
        item.sku_snapshot !== line.skuSnapshot ||
        item.quantity !== BigInt(line.quantity) ||
        item.unit_price_vnd !== BigInt(line.expectedUnitPriceVnd) ||
        item.discount_vnd !== 0n ||
        item.line_total_vnd !== BigInt(line.quantity) * item.unit_price_vnd) {
      reject('REPLAY_COLLISION');
    }
  }
  return {
    saleId: sale.sale_id, eventId: outbox.event_id,
    totalVnd: String(sale.total_vnd), tenderedVnd: String(payment.tendered_vnd),
    changeVnd: String(payment.change_vnd), syncStatus: sale.sync_status, replay: true,
  };
}

type PreparedItem = {
  itemId: string; variantId: string; skuSnapshot: string;
  nameSnapshot: string; attributesSnapshot: Record<string, string>;
  quantity: number; unitPriceVnd: string; discountVnd: '0'; lineTotalVnd: string;
};

function loadItemsAndReserveStock(
  db: DatabaseSync, request: LocalCashSaleRequest,
): { items: PreparedItem[]; totalVnd: bigint } {
  const variantStmt = db.prepare(`SELECT variant_id,sku,name_snapshot,attributes_json,
    price_vnd,server_revision,active FROM local_catalog_variants
    WHERE store_id = ? AND variant_id = ?`);
  variantStmt.setReadBigInts(true);
  const stockStmt = db.prepare(`SELECT server_qty,pending_delta FROM local_inventory_balances
    WHERE store_id = ? AND variant_id = ?`);
  stockStmt.setReadBigInts(true);
  const updateStock = db.prepare(`UPDATE local_inventory_balances SET pending_delta = ?
    WHERE store_id = ? AND variant_id = ? AND server_qty = ? AND pending_delta = ?`);
  const items: PreparedItem[] = [];
  let totalVnd = 0n;
  for (const line of request.items) {
    const variant = variantStmt.get(request.storeId, line.variantId) as VariantRow | undefined;
    if (!variant || variant.active !== 1n ||
        variant.sku !== line.skuSnapshot ||
        variant.price_vnd !== BigInt(line.expectedUnitPriceVnd) ||
        variant.server_revision !== BigInt(line.expectedServerRevision)) reject('STALE_CATALOG');
    if (typeof variant.name_snapshot !== 'string' ||
        !variant.name_snapshot.trim() || variant.name_snapshot.length > 200 ||
        variant.name_snapshot.trim() !== variant.name_snapshot) reject('INVALID_CATALOG_NAME');
    let rawAttributes: unknown;
    try { rawAttributes = JSON.parse(variant.attributes_json); }
    catch { reject('INVALID_CATALOG_ATTRIBUTES'); }
    const attrs = attributes(rawAttributes);
    const stock = stockStmt.get(request.storeId, line.variantId) as StockRow | undefined;
    if (!stock || stock.pending_delta > 0n ||
        stock.server_qty < 0n || stock.server_qty + stock.pending_delta < BigInt(line.quantity)) {
      reject('INSUFFICIENT_STOCK');
    }
    const newPending = int64(stock.pending_delta - BigInt(line.quantity));
    const lineTotal = int64(variant.price_vnd * BigInt(line.quantity));
    totalVnd = int64(totalVnd + lineTotal);
    if (updateStock.run(newPending, request.storeId, line.variantId,
      stock.server_qty, stock.pending_delta).changes !== 1) reject('STOCK_CHANGED');
    items.push({
      itemId: line.itemId, variantId: line.variantId, skuSnapshot: variant.sku,
      nameSnapshot: variant.name_snapshot, attributesSnapshot: attrs,
      quantity: line.quantity, unitPriceVnd: String(variant.price_vnd),
      discountVnd: '0', lineTotalVnd: String(lineTotal),
    });
  }
  return { items, totalVnd };
}

/**
 * MUST be called only AFTER a future cryptographically verified, MAIN-only
 * offline authorization gate. Merely invoking this internal helper does NOT
 * establish that authorization. Not exported to preload or IPC.
 */
export function commitLocalCashSale(db: DatabaseSync, raw: unknown): LocalSaleCommit {
  const request = parseLocalCashSaleRequest(raw);
  return withLocalTransaction(db, () => {
    // Replay must be checked before stock (a previously successful sale has
    // already consumed it), but ALL matching immutable evidence is required.
    const replay = checkReplay(db, request);
    if (replay) return replay;

    const device = db.prepare('SELECT store_id,device_id FROM local_device_metadata LIMIT 2')
      .all() as Array<{ store_id: string; device_id: string }>;
    if (device.length !== 1 || device[0]?.store_id !== request.storeId ||
        device[0]?.device_id !== request.deviceId) reject('DEVICE_MISMATCH');
    const cursorStmt = db.prepare('SELECT catalog_seq FROM sync_cursors WHERE store_id = ?');
    cursorStmt.setReadBigInts(true);
    const cursor = cursorStmt.get(request.storeId) as { catalog_seq: bigint } | undefined;
    if (!cursor || cursor.catalog_seq !== BigInt(request.catalogRevision)) reject('STALE_CATALOG');
    const { items, totalVnd } = loadItemsAndReserveStock(db, request);
    const tendered = vnd(request.tenderedVnd, 'TENDERED');
    if (tendered < totalVnd) reject('INSUFFICIENT_CASH');
    const change = tendered - totalVnd;

    const body = {
      schemaVersion: 1 as const, eventType: 'SALE_COMPLETED' as const,
      eventId: request.eventId, saleId: request.saleId, storeId: request.storeId,
      deviceId: request.deviceId, cashierId: request.cashierId,
      offlineGrantId: request.offlineGrantId, clientCreatedAt: request.clientCreatedAt,
      catalogRevision: request.catalogRevision,
      sale: {
        status: 'POSTED' as const, totalVnd: String(totalVnd),
        items, payment: {
          method: 'CASH' as const, dueVnd: String(totalVnd),
          tenderedVnd: String(tendered), changeVnd: String(change),
        },
      },
    };
    const payloadHash = eventHash(body);
    const event = { ...body, payloadHash };

    db.prepare(`INSERT INTO local_sales
      (sale_id,store_id,device_id,cashier_id,client_created_at,total_vnd,sync_status)
      VALUES (?,?,?,?,?,?,'PENDING_SYNC')`).run(
      request.saleId,request.storeId,request.deviceId,request.cashierId,
      request.clientCreatedAt,totalVnd,
    );
    const insertItem = db.prepare(`INSERT INTO local_sale_items
      (item_id,store_id,sale_id,variant_id,sku_snapshot,name_snapshot,
        attributes_snapshot_json,quantity,unit_price_vnd,discount_vnd,line_total_vnd)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    for (const item of items) {
      insertItem.run(item.itemId,request.storeId,request.saleId,item.variantId,
        item.skuSnapshot,item.nameSnapshot,JSON.stringify(item.attributesSnapshot),
        item.quantity,BigInt(item.unitPriceVnd),0n,BigInt(item.lineTotalVnd));
    }
    db.prepare(`INSERT INTO local_payments
      (payment_id,sale_id,method,due_vnd,tendered_vnd,change_vnd)
      VALUES (?,?,'CASH',?,?,?)`).run(
      request.paymentId,request.saleId,totalVnd,tendered,change,
    );
    db.prepare(`INSERT INTO outbox_events
      (event_id,sale_id,store_id,device_id,schema_version,payload_json,
        payload_hash,state,created_at)
      VALUES (?,?,?,?,1,?,?,'PENDING',?)`).run(
      request.eventId,request.saleId,request.storeId,request.deviceId,
      JSON.stringify(event),payloadHash,request.clientCreatedAt,
    );
    return {
      saleId: request.saleId, eventId: request.eventId,
      totalVnd: String(totalVnd), tenderedVnd: String(tendered),
      changeVnd: String(change), syncStatus: 'PENDING_SYNC', replay: false,
    };
  });
}
