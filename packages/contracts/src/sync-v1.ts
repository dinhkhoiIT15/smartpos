import { createHash } from 'node:crypto';
import { z } from 'zod';
import { MAX_VND, vndStringSchema } from './vnd.js';

/**
 * POS-016: CONTRACTS ONLY. This file does not make HTTP requests, authenticate
 * devices, save a sale, process an outbox or access Neon/PostgreSQL/SQLite.
 * Use only in Node/Electron MAIN and backend, never expose token/key material.
 */
export const SYNC_PROTOCOL_VERSION = 1 as const;
export const MAX_PUSH_EVENTS = 25;
export const MAX_SALE_ITEMS = 100;
export const MAX_PUSH_JSON_BYTES = 512 * 1024;
export const MAX_PULL_CHANGES = 100;
const MAX_BIGINT = 9_223_372_036_854_775_807n;

const uuid = z.uuid();
const safeShortText = (max: number) => z.string().min(1).max(max)
  .refine((s) => s.trim() === s, 'text cannot have surrounding whitespace');
const utcTimestampSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'must be UTC ISO milliseconds')
  .refine((s) => {
    const t = Date.parse(s);
    return Number.isFinite(t) && new Date(t).toISOString() === s;
  }, 'invalid UTC timestamp');

const canonicalUnsigned = z.string()
  .regex(/^(0|[1-9][0-9]*)$/, 'must be canonical decimal')
  .max(19)
  .refine((s) => /^(0|[1-9][0-9]*)$/.test(s) &&
    s.length <= 19 && BigInt(s) <= MAX_BIGINT, 'out of 64-bit unsigned-domain bounds');
export const syncCursorSchema = canonicalUnsigned;
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'lowercase SHA-256 hex required');
const stringAttributes = z.record(
  z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
  z.string().min(1).max(64),
).refine((v) => Object.keys(v).length <= 8, 'too many attributes');

export const syncSaleItemSchema = z.strictObject({
  itemId: uuid,
  variantId: uuid,
  skuSnapshot: safeShortText(64),
  nameSnapshot: safeShortText(200),
  attributesSnapshot: stringAttributes,
  quantity: z.int().min(1).max(2_147_483_647),
  unitPriceVnd: vndStringSchema,
  discountVnd: vndStringSchema,
  lineTotalVnd: vndStringSchema,
});
export const syncCashPaymentSchema = z.strictObject({
  method: z.literal('CASH'),
  dueVnd: vndStringSchema,
  tenderedVnd: vndStringSchema,
  changeVnd: vndStringSchema,
});
const saleSnapshotSchema = z.strictObject({
  status: z.literal('POSTED'),
  totalVnd: vndStringSchema,
  items: z.array(syncSaleItemSchema).min(1).max(MAX_SALE_ITEMS),
  payment: syncCashPaymentSchema,
});
const eventFields = {
  schemaVersion: z.literal(SYNC_PROTOCOL_VERSION),
  eventType: z.literal('SALE_COMPLETED'),
  eventId: uuid,
  saleId: uuid,
  storeId: uuid,
  deviceId: uuid,
  cashierId: uuid,
  offlineGrantId: uuid, // server must verify its own issued grant record/signature
  clientCreatedAt: utcTimestampSchema,
  catalogRevision: syncCursorSchema,
  sale: saleSnapshotSchema,
} as const;

function addSaleConsistencyIssues(
  event: { sale: z.infer<typeof saleSnapshotSchema> },
  ctx: z.RefinementCtx,
): void {
  const { sale } = event;
  // Zod superRefine may still run when nested money strings failed validation.
  // Do not let BigInt('1.1') throw: return ordinary Zod parse issues instead.
  const amounts: unknown[] = [
    sale.totalVnd, sale.payment?.dueVnd, sale.payment?.tenderedVnd, sale.payment?.changeVnd,
    ...sale.items.flatMap((line) =>
      [line.unitPriceVnd, line.discountVnd, line.lineTotalVnd]),
  ];
  if (!amounts.every((v) => vndStringSchema.safeParse(v).success) ||
    !sale.items.every((line) => Number.isSafeInteger(line.quantity) && line.quantity > 0)) return;
  const ids = new Set<string>();
  let sum = 0n;
  for (const [i, line] of sale.items.entries()) {
    if (ids.has(line.itemId)) {
      ctx.addIssue({ code: 'custom', path: ['sale','items',i,'itemId'], message: 'duplicate sale line ID' });
    }
    ids.add(line.itemId);
    const expected = BigInt(line.unitPriceVnd) * BigInt(line.quantity) - BigInt(line.discountVnd);
    if (expected < 0n || expected > MAX_VND || expected !== BigInt(line.lineTotalVnd)) {
      ctx.addIssue({ code: 'custom', path: ['sale','items',i,'lineTotalVnd'], message: 'line total inconsistent or overflow' });
    }
    sum += BigInt(line.lineTotalVnd);
  }
  if (sum > MAX_VND || sum !== BigInt(sale.totalVnd)) {
    ctx.addIssue({ code: 'custom', path: ['sale','totalVnd'], message: 'sale total inconsistent or overflow' });
  }
  if (sale.payment.dueVnd !== sale.totalVnd) {
    ctx.addIssue({ code: 'custom', path: ['sale','payment','dueVnd'], message: 'due must equal sale total' });
  }
  const due = BigInt(sale.payment.dueVnd);
  const tendered = BigInt(sale.payment.tenderedVnd);
  if (tendered < due || tendered - due !== BigInt(sale.payment.changeVnd)) {
    ctx.addIssue({ code: 'custom', path: ['sale','payment','changeVnd'], message: 'invalid cash/change' });
  }
}

// Money was already checked by Zod before this refinement runs. Keep all
// integer operations BigInt: no lossy floating-point money calculations.
export const syncSaleWithoutHashSchema = z.strictObject(eventFields)
  .superRefine(addSaleConsistencyIssues);
export type SyncSaleWithoutHash = z.infer<typeof syncSaleWithoutHashSchema>;

/** RFC-like deterministic sorted-key JSON with UTF-8, no floats in money. */
export function canonicalSyncJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new TypeError('noninteger or unsafe JSON number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalSyncJson).join(',') + ']';
  if (typeof value === 'object') {
    const props = Object.entries(value as Record<string, unknown>)
      .sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0);
    return '{' + props.map(([k,v]) => JSON.stringify(k) + ':' + canonicalSyncJson(v)).join(',') + '}';
  }
  throw new TypeError('non-JSON payload type');
}

export function computeSyncPayloadHash(input: SyncSaleWithoutHash): string {
  const valid = syncSaleWithoutHashSchema.parse(input);
  return createHash('sha256').update(canonicalSyncJson(valid), 'utf8').digest('hex');
}

export const syncSaleCompletedEventSchema = z.strictObject({
  ...eventFields,
  payloadHash: sha256Schema,
}).superRefine((input, ctx) => {
  addSaleConsistencyIssues(input, ctx);
  const { payloadHash, ...body } = input;
  // Compute directly rather than parsing again: an invalid arithmetic payload
  // must return ordinary Zod issues, not throw from a nested validation.
  try {
    const actualHash = createHash('sha256').update(canonicalSyncJson(body), 'utf8').digest('hex');
    if (actualHash !== payloadHash) {
      ctx.addIssue({ code: 'custom', path: ['payloadHash'], message: 'hash mismatch' });
    }
  } catch {
    ctx.addIssue({ code: 'custom', path: ['payloadHash'], message: 'non-JSON event content' });
  }
});
export type SyncSaleCompletedEvent = z.infer<typeof syncSaleCompletedEventSchema>;

export const syncPushRequestSchema = z.strictObject({
  protocolVersion: z.literal(SYNC_PROTOCOL_VERSION),
  deviceId: uuid,
  events: z.array(syncSaleCompletedEventSchema).min(1).max(MAX_PUSH_EVENTS),
}).superRefine((input, ctx) => {
  const eventIds = new Set<string>(), saleIds = new Set<string>();
  const storeId = input.events[0]?.storeId;
  for (const [i,event] of input.events.entries()) {
    if (event.deviceId !== input.deviceId || event.storeId !== storeId) {
      ctx.addIssue({ code: 'custom', path: ['events',i], message: 'mixed device or store in one batch' });
    }
    if (eventIds.has(event.eventId) || saleIds.has(event.saleId)) {
      ctx.addIssue({ code: 'custom', path: ['events',i], message: 'duplicate event or sale ID in batch' });
    }
    eventIds.add(event.eventId);
    saleIds.add(event.saleId);
  }
  try {
    if (Buffer.byteLength(JSON.stringify(input), 'utf8') > MAX_PUSH_JSON_BYTES) {
      ctx.addIssue({ code: 'custom', message: 'push batch exceeds byte limit' });
    }
  } catch {
    ctx.addIssue({ code: 'custom', message: 'invalid non-JSON push batch' });
  }
});
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;

/** Common error envelope for future HTTP-level sync validation/auth failures. */
export const syncHttpErrorSchema = z.strictObject({
  error: z.enum(['VALIDATION_ERROR', 'UNSUPPORTED_VERSION', 'UNAUTHORIZED',
    'FORBIDDEN', 'PAYLOAD_TOO_LARGE', 'RATE_LIMITED', 'SYNC_UNAVAILABLE']),
  supportedProtocolVersions: z.tuple([z.literal(SYNC_PROTOCOL_VERSION)]).optional(),
}).superRefine((value, ctx) => {
  if (value.error === 'UNSUPPORTED_VERSION' && !value.supportedProtocolVersions) {
    ctx.addIssue({ code: 'custom', path: ['supportedProtocolVersions'],
      message: 'unsupported version must advertise supported version 1' });
  } else if (value.error !== 'UNSUPPORTED_VERSION' && value.supportedProtocolVersions) {
    ctx.addIssue({ code: 'custom', path: ['supportedProtocolVersions'],
      message: 'supported versions are only returned for unsupported version' });
  }
});
export type SyncHttpError = z.infer<typeof syncHttpErrorSchema>;

const ackFields = { eventId: uuid, saleId: uuid } as const;
export const syncPushResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    ...ackFields,
    status: z.literal('ACKED'),
    resultCode: z.enum(['APPLIED', 'STOCK_SHORTAGE_RECONCILIATION', 'STALE_PRICE_REVIEW']),
    serverReceivedAt: utcTimestampSchema,
    conflictIds: z.array(uuid).max(20),
  }),
  z.strictObject({
    ...ackFields,
    status: z.literal('NEEDS_REVIEW'),
    resultCode: z.enum(['PAYLOAD_HASH_MISMATCH', 'INVALID_EVENT', 'AUTH_EXPIRED',
      'REVOKED_DEVICE', 'DUPLICATE_SALE', 'UNAUTHORIZED_DEVICE', 'UNSUPPORTED_VERSION']),
    conflictIds: z.array(uuid).max(20),
  }),
  z.strictObject({
    ...ackFields,
    status: z.literal('RETRY'),
    resultCode: z.literal('TEMPORARY_UNAVAILABLE'),
    retryAfterSeconds: z.int().min(1).max(3600),
  }),
]);
export const syncPushResponseSchema = z.strictObject({
  protocolVersion: z.literal(SYNC_PROTOCOL_VERSION),
  deviceId: uuid,
  results: z.array(syncPushResultSchema).min(1).max(MAX_PUSH_EVENTS),
}).superRefine((response, ctx) => {
  const ids = new Set<string>();
  for (const [i,v] of response.results.entries()) {
    if (ids.has(v.eventId)) ctx.addIssue({
      code: 'custom', path: ['results',i,'eventId'], message: 'duplicate result eventId',
    });
    ids.add(v.eventId);
  }
});
export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;

/**
 * Call before any outbox ACK state update; rejects missing/extra/reordered
 * results. A response alone cannot prove a network operation was authorized.
 */
export function assertPushResponseMatchesRequest(request: unknown, response: unknown): SyncPushResponse {
  const pushed = syncPushRequestSchema.parse(request);
  const received = syncPushResponseSchema.parse(response);
  if (received.deviceId !== pushed.deviceId || received.results.length !== pushed.events.length ||
    received.results.some((v,i) => v.eventId !== pushed.events[i]?.eventId ||
      v.saleId !== pushed.events[i]?.saleId)) {
    throw new Error('SYNC_PUSH_RESPONSE_MISMATCH');
  }
  return received;
}

/**
 * Pure receipt-identity decision (no database access). POS-021 must SELECT
 * under a unique/transactional constraint; this helper is NOT idempotent
 * persistence and does not authorize any sale.
 */
export const syncReceiptIdentitySchema = z.strictObject({
  deviceId: uuid,
  eventId: uuid,
  saleId: uuid,
  payloadHash: sha256Schema,
});
export type SyncReceiptIdentity = z.infer<typeof syncReceiptIdentitySchema>;
export type ReceiptReplayDecision = 'NEW' | 'REPLAY_ORIGINAL_ACK' | 'REJECT_CONFLICT';

export function classifySyncReceiptReplay(
  existing: SyncReceiptIdentity | null,
  incoming: SyncReceiptIdentity,
): ReceiptReplayDecision {
  const input = syncReceiptIdentitySchema.parse(incoming);
  if (!existing) return 'NEW';
  const stored = syncReceiptIdentitySchema.parse(existing);
  if (stored.saleId === input.saleId) {
    if (stored.deviceId !== input.deviceId || stored.eventId !== input.eventId) return 'REJECT_CONFLICT';
  } else if (stored.deviceId !== input.deviceId || stored.eventId !== input.eventId) {
    return 'NEW';
  }
  return stored.payloadHash === input.payloadHash && stored.saleId === input.saleId
    ? 'REPLAY_ORIGINAL_ACK' : 'REJECT_CONFLICT';
}

const pageLimit = z.union([
  z.string().regex(/^[1-9][0-9]{0,2}$/).transform(Number),
  z.number().int(),
]).pipe(z.number().int().min(1).max(MAX_PULL_CHANGES));

export const syncPullQuerySchema = z.strictObject({
  cursor: syncCursorSchema.optional().default('0'),
  limit: pageLimit.optional().default(MAX_PULL_CHANGES),
});
export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>;

/** Entity-specific payload shape remains POS-023 scope; never trust it as SQL. */
export const syncPullChangeSchema = z.strictObject({
  seq: syncCursorSchema.refine((v) => v !== '0', 'change sequence starts at 1'),
  entityType: z.enum(['category', 'brand', 'product', 'product_variant', 'inventory_balance']),
  entityId: uuid,
  op: z.enum(['CREATE', 'UPDATE', 'DEACTIVATE', 'UPSERT']),
  payload: z.json(),
  createdAt: utcTimestampSchema,
});
export const syncPullResponseSchema = z.strictObject({
  protocolVersion: z.literal(SYNC_PROTOCOL_VERSION),
  storeId: uuid,
  fromCursor: syncCursorSchema,
  nextCursor: syncCursorSchema,
  highWatermark: syncCursorSchema,
  hasMore: z.boolean(),
  changes: z.array(syncPullChangeSchema).max(MAX_PULL_CHANGES),
}).superRefine((page, ctx) => {
  // As with money, Zod may still invoke superRefine on a malformed string.
  // Never throw on untrusted cursor strings: let Zod report validation issues.
  if (![page.fromCursor, page.nextCursor, page.highWatermark,
    ...page.changes.map((row) => row.seq)].every(
      (s) => syncCursorSchema.safeParse(s).success,
    )) return;
  const from = BigInt(page.fromCursor), next = BigInt(page.nextCursor),
    watermark = BigInt(page.highWatermark);
  if (from > next || next > watermark) {
    ctx.addIssue({ code: 'custom', path: ['nextCursor'], message: 'invalid cursor order' });
  }
  let previous = from;
  for (const [i,row] of page.changes.entries()) {
    const seq = BigInt(row.seq);
    if (seq <= previous || seq > next) {
      ctx.addIssue({ code: 'custom', path: ['changes',i,'seq'], message: 'page sequence not increasing/bounded' });
    }
    previous = seq;
  }
  if (page.hasMore && (page.changes.length === 0 || previous !== next)) {
    ctx.addIssue({ code: 'custom', path: ['hasMore'], message: 'partial page must end at its last change' });
  }
  if (!page.hasMore && next !== watermark) {
    ctx.addIssue({ code: 'custom', path: ['nextCursor'], message: 'completed page must advance to watermark' });
  }
});
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;

/** Verify requested cursor matches page before applying changes locally. */
export function assertPullResponseMatchesQuery(query: unknown, response: unknown): SyncPullResponse {
  const input = syncPullQuerySchema.parse(query);
  const page = syncPullResponseSchema.parse(response);
  if (page.fromCursor !== input.cursor || page.changes.length > input.limit) {
    throw new Error('SYNC_PULL_RESPONSE_MISMATCH');
  }
  return page;
}
