import { calculateCartAmounts, calculateCashTotals, MAX_VND } from './index.js';

/**
 * POS-018: pure, in-memory cart PREVIEW, not an authorized sale.
 * Never load prices from a renderer-controlled value in production. POS-019
 * must verify device/cashier grants, stock and catalog revisions in MAIN.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SKU = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const ATTR_KEY = /^[a-z][a-z0-9_]{0,31}$/;
const MAX_LINES = 100;
const MAX_QTY = 2_147_483_647;

export type CartCatalogVariant = Readonly<{
  variantId: string;
  sku: string;
  name: string;
  attributes: Readonly<Record<string, string>>;
  priceVnd: string;
  availableQty: number;
  active: boolean;
}>;
export type CartPreviewLine = Readonly<{
  variantId: string;
  skuSnapshot: string;
  nameSnapshot: string;
  attributesSnapshot: Readonly<Record<string, string>>;
  quantity: number;
  unitPriceVnd: string;
  discountVnd: string;
  availableQty: number;
}>;
export type CashCartPreview = Readonly<{
  subtotalVnd: string;
  discountTotalVnd: string;
  dueVnd: string;
  tenderedVnd: string;
  changeVnd: string;
  shortfallVnd: string;
  sufficient: boolean;
  hasTender: boolean;
  itemCount: number;
}>;

function fail(code: string): never { throw new RangeError('CART_' + code); }
function safeQty(qty: number, label: string): number {
  if (!Number.isSafeInteger(qty) || qty <= 0 || qty > MAX_QTY) fail(label);
  return qty;
}
function amount(value: string, label: string): bigint {
  if (typeof value !== 'string' || value.length > 19 || !DECIMAL.test(value)) fail(label);
  const n = BigInt(value);
  if (n > MAX_VND) fail(label);
  return n;
}
function validateAttributes(attrs: Readonly<Record<string, string>>): Record<string, string> {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs) ||
      Object.keys(attrs).length > 8) fail('ATTRIBUTES');
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    if (!ATTR_KEY.test(key) || typeof value !== 'string' ||
        value.length < 1 || value.length > 64 || value.trim() !== value) fail('ATTRIBUTES');
    result[key] = value;
  }
  return result;
}
function validVariant(variant: CartCatalogVariant): CartCatalogVariant {
  if (!UUID.test(variant.variantId) ||
      typeof variant.sku !== 'string' || !SKU.test(variant.sku) ||
      typeof variant.name !== 'string' || !variant.name.trim() ||
      variant.name.trim() !== variant.name || variant.name.length > 200 ||
      typeof variant.active !== 'boolean' ||
      !Number.isSafeInteger(variant.availableQty) ||
      variant.availableQty < 0 || variant.availableQty > MAX_QTY) fail('CATALOG');
  const attributes = validateAttributes(variant.attributes);
  amount(variant.priceVnd, 'PRICE');
  return { ...variant, variantId: variant.variantId.toLowerCase(), attributes };
}
function domainLines(lines: readonly CartPreviewLine[]) {
  return lines.map((line) => ({
    quantity: line.quantity,
    unitPriceVnd: amount(line.unitPriceVnd, 'PRICE'),
    discountVnd: amount(line.discountVnd, 'DISCOUNT'),
  }));
}
function validateCart(lines: readonly CartPreviewLine[]): void {
  if (lines.length > MAX_LINES) fail('TOO_MANY_LINES');
  const sku = new Set<string>();
  const ids = new Set<string>();
  for (const line of lines) {
    if (!UUID.test(line.variantId) || !SKU.test(line.skuSnapshot) ||
        sku.has(line.skuSnapshot) || ids.has(line.variantId)) fail('DUPLICATE_OR_INVALID_LINE');
    sku.add(line.skuSnapshot);
    ids.add(line.variantId);
    safeQty(line.quantity, 'QUANTITY');
    if (!Number.isSafeInteger(line.availableQty) ||
        line.availableQty < line.quantity || line.availableQty > MAX_QTY) fail('STOCK');
    validateAttributes(line.attributesSnapshot);
    if (!line.nameSnapshot || line.nameSnapshot.trim() !== line.nameSnapshot) fail('NAME');
  }
  if (lines.length) calculateCartAmounts(domainLines(lines));
}
function sameVariant(line: CartPreviewLine, v: CartCatalogVariant): boolean {
  return line.variantId === v.variantId &&
    line.skuSnapshot === v.sku && line.nameSnapshot === v.name &&
    line.unitPriceVnd === v.priceVnd &&
    JSON.stringify(line.attributesSnapshot) === JSON.stringify(v.attributes);
}

/** Adding the same SKU increments its quantity, never reprices its snapshot. */
export function addCartVariant(
  lines: readonly CartPreviewLine[], rawVariant: CartCatalogVariant, quantity = 1,
): CartPreviewLine[] {
  validateCart(lines);
  const variant = validVariant(rawVariant);
  safeQty(quantity, 'QUANTITY');
  if (!variant.active || variant.availableQty === 0) fail('UNAVAILABLE');
  const current = lines.find((line) =>
    line.variantId === variant.variantId || line.skuSnapshot === variant.sku);
  if (current && !sameVariant(current, variant)) fail('STALE_CATALOG');
  const next = current
    ? lines.map((line) => line === current ? {
        ...line, quantity: safeQty(line.quantity + quantity, 'QUANTITY'),
      } : line)
    : [...lines, {
        variantId: variant.variantId,
        skuSnapshot: variant.sku, nameSnapshot: variant.name,
        attributesSnapshot: variant.attributes, quantity,
        unitPriceVnd: variant.priceVnd, discountVnd: '0',
        availableQty: variant.availableQty,
      }];
  validateCart(next);
  return next;
}
export function setCartQuantity(
  lines: readonly CartPreviewLine[], variantId: string, quantity: number,
): CartPreviewLine[] {
  validateCart(lines);
  safeQty(quantity, 'QUANTITY');
  if (!lines.some((line) => line.variantId === variantId)) fail('NOT_FOUND');
  const next = lines.map((line) => line.variantId === variantId ? { ...line, quantity } : line);
  validateCart(next);
  return next;
}
export function removeCartVariant(
  lines: readonly CartPreviewLine[], variantId: string,
): CartPreviewLine[] {
  validateCart(lines);
  if (!lines.some((line) => line.variantId === variantId)) fail('NOT_FOUND');
  return lines.filter((line) => line.variantId !== variantId);
}
/**
 * Cash is supplied as a canonical decimal string, never a floating number.
 * A shortfall is a preview only: no payment is accepted or recorded here.
 */
export function previewCashCart(lines: readonly CartPreviewLine[], tenderedRaw: string): CashCartPreview {
  validateCart(lines);
  const hasTender = tenderedRaw !== '';
  const tendered = hasTender ? amount(tenderedRaw, 'TENDERED') : 0n;
  const amounts = lines.length ? calculateCartAmounts(domainLines(lines)) :
    { subtotalVnd: 0n, discountTotalVnd: 0n, dueVnd: 0n };
  const due = amounts.dueVnd;
  const sufficient = lines.length > 0 && hasTender && tendered >= due;
  // Recheck against the existing cash totals primitive when sufficient.
  const change = sufficient ? calculateCashTotals(domainLines(lines), tendered).changeVnd : 0n;
  const qty = lines.reduce((sum, line) => sum + line.quantity, 0);
  return {
    subtotalVnd: String(amounts.subtotalVnd),
    discountTotalVnd: String(amounts.discountTotalVnd),
    dueVnd: String(due),
    tenderedVnd: String(tendered),
    changeVnd: String(change),
    shortfallVnd: String(tendered < due ? due - tendered : 0n),
    sufficient, hasTender, itemCount: qty,
  };
}
/** Format canonical decimal VND without converting to a JS number. */
export function formatVnd(value: string): string {
  amount(value, 'FORMAT');
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' ₫';
}
