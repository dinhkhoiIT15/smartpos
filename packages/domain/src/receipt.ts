import { calculateCashTotals, calculateCartAmounts, MAX_VND } from './index.js';
import type { CartPreviewLine } from './cart.js';

/**
 * POS-020: pure internal receipt presentation. This validates money and
 * renders a bounded view; it does NOT authenticate or certify a sale.
 * Persisted evidence must be retrieved/verified inside Electron MAIN and
 * cannot be exposed via IPC before D-013 cashier/device grants.
 *
 * Demo receipts are ALWAYS marked SAMPLE_NOT_SALE (including when printed).
 */
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const SKU = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const ATTR_KEY = /^[a-z][a-z0-9_]{0,31}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_QTY = 2_147_483_647;
export const DEMO_RECEIPT_WATERMARK = 'MẪU — KHÔNG CÓ GIAO DỊCH' as const;
export const INTERNAL_RECEIPT_NOTICE = 'PHIẾU NỘI BỘ — KHÔNG PHẢI HÓA ĐƠN THUẾ' as const;

export type ReceiptLine = Readonly<{
  sku: string;
  name: string;
  attributes: Readonly<Record<string, string>>;
  quantity: number;
  unitPriceVnd: string;
  discountVnd: string;
  lineTotalVnd: string;
}>;
export type PersistedReceiptState = 'PENDING_SYNC' | 'SYNCED' | 'NEEDS_REVIEW';
export type ReceiptInput = Readonly<{
  saleId: string;
  cashierId: string;
  clientCreatedAt: string;
  syncStatus: PersistedReceiptState;
  items: readonly ReceiptLine[];
  dueVnd: string;
  tenderedVnd: string;
  changeVnd: string;
}>;
export type InternalReceipt = Readonly<{
  kind: 'DEMO' | 'PERSISTED';
  saleCode: string;
  cashierLabel: string;
  createdAtLocal: string;
  syncLabel: string;
  watermark: typeof DEMO_RECEIPT_WATERMARK | null;
  notice: typeof INTERNAL_RECEIPT_NOTICE;
  items: readonly ReceiptLine[];
  subtotalVnd: string;
  discountTotalVnd: string;
  dueVnd: string;
  tenderedVnd: string;
  changeVnd: string;
}>;

function fail(label: string): never { throw new RangeError('RECEIPT_' + label); }
function amount(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || value.length > 19 || !DECIMAL.test(value)) fail(label);
  const n = BigInt(value);
  if (n > MAX_VND) fail(label);
  return n;
}
function cleanText(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value || value.length > max ||
      value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) fail(label);
  return value;
}
function validUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) fail('UUID');
  return value.toLowerCase();
}
export function formatReceiptTimeInVietnam(value: string): string {
  if (typeof value !== 'string' || !UTC_MS.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail('TIMESTAMP');
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23',
    day: '2-digit',month: '2-digit',year: 'numeric',
    hour: '2-digit',minute: '2-digit',second: '2-digit',
  }).formatToParts(new Date(value));
  const part = (name: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === name)?.value ?? fail('TIMESTAMP');
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}:${part('second')} (VN)`;
}
function attributes(raw: Readonly<Record<string, string>>): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).length > 8) fail('ATTRIBUTES');
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw).sort(([a],[b]) => a.localeCompare(b,'en'))) {
    if (!ATTR_KEY.test(key)) fail('ATTRIBUTES');
    result[key] = cleanText(value, 64, 'ATTRIBUTES');
  }
  return result;
}
function validateLines(items: readonly ReceiptLine[]) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) fail('ITEMS');
  const normalized: ReceiptLine[] = [];
  const seen = new Set<string>();
  for (const line of items) {
    if (!line || typeof line !== 'object' || !SKU.test(line.sku) ||
        seen.has(line.sku) ||
        !Number.isSafeInteger(line.quantity) || line.quantity < 1 ||
        line.quantity > MAX_QTY) fail('LINE');
    seen.add(line.sku);
    const name = cleanText(line.name, 200, 'NAME');
    const attrs = attributes(line.attributes);
    const unit = amount(line.unitPriceVnd, 'UNIT');
    const discount = amount(line.discountVnd, 'DISCOUNT');
    const lineTotal = amount(line.lineTotalVnd, 'LINE_TOTAL');
    const extended = BigInt(line.quantity) * unit;
    if (extended > MAX_VND || discount > extended ||
        extended - discount !== lineTotal) fail('LINE_TOTAL');
    normalized.push({
      sku: line.sku,name,attributes:attrs,quantity:line.quantity,
      unitPriceVnd:String(unit),discountVnd:String(discount),
      lineTotalVnd:String(lineTotal),
    });
  }
  const cashLines = normalized.map(line => ({
    quantity: line.quantity,
    unitPriceVnd: BigInt(line.unitPriceVnd),
    discountVnd: BigInt(line.discountVnd),
  }));
  return { normalized, amounts: calculateCartAmounts(cashLines), cashLines };
}
function build(input: ReceiptInput, kind: 'DEMO' | 'PERSISTED'): InternalReceipt {
  const {normalized,amounts,cashLines} = validateLines(input.items);
  const due = amount(input.dueVnd, 'DUE');
  const tendered = amount(input.tenderedVnd, 'TENDERED');
  const change = amount(input.changeVnd, 'CHANGE');
  if (due !== amounts.dueVnd || tendered < due ||
      tendered - due !== change) fail('CASH_MISMATCH');
  const checked = calculateCashTotals(cashLines, tendered);
  if (checked.changeVnd !== change) fail('CASH_MISMATCH');
  const at = formatReceiptTimeInVietnam(input.clientCreatedAt);
  if (kind === 'PERSISTED') {
    const saleId = validUuid(input.saleId);
    const cashierId = validUuid(input.cashierId);
    if (!['PENDING_SYNC','SYNCED','NEEDS_REVIEW'].includes(input.syncStatus)) fail('SYNC_STATE');
    const syncLabel = {
      PENDING_SYNC: 'ĐÃ LƯU TẠI MÁY • CHƯA ĐỒNG BỘ',
      SYNCED: 'ĐÃ ĐỒNG BỘ (THEO TRẠNG THÁI LOCAL)',
      NEEDS_REVIEW: 'CẦN ĐỐI SOÁT • CHƯA XÁC NHẬN ĐỒNG BỘ',
    }[input.syncStatus];
    return {
      kind, saleCode: saleId, cashierLabel: cashierId,
      createdAtLocal:at,syncLabel,watermark:null,notice:INTERNAL_RECEIPT_NOTICE,
      items:normalized,subtotalVnd:String(amounts.subtotalVnd),
      discountTotalVnd:String(amounts.discountTotalVnd),dueVnd:String(due),
      tenderedVnd:String(tendered),changeVnd:String(change),
    };
  }
  return {
    kind, saleCode:'KHÔNG CÓ MÃ ĐƠN',cashierLabel:'THU NGÂN MẪU',
    createdAtLocal:at,syncLabel:'CHƯA LƯU • CHƯA THU TIỀN',
    watermark:DEMO_RECEIPT_WATERMARK,notice:INTERNAL_RECEIPT_NOTICE,
    items:normalized,subtotalVnd:String(amounts.subtotalVnd),
    discountTotalVnd:String(amounts.discountTotalVnd),dueVnd:String(due),
    tenderedVnd:String(tendered),changeVnd:String(change),
  };
}

/** ONLY for a future authorized MAIN-only read path from committed SQLite evidence. */
export function buildPersistedInternalReceipt(input: ReceiptInput): InternalReceipt {
  return build(input, 'PERSISTED');
}
/**
 * POS-020 UX-only synthetic receipt preview, not a sale snapshot.
 * The receipt can never acquire an authentic sale ID or paid state.
 */
export function createDemoInternalReceipt(
  cart: readonly CartPreviewLine[],tenderedVnd:string,at:string,
): InternalReceipt {
  const items: ReceiptLine[] = cart.map(line => ({
    sku:line.skuSnapshot,name:line.nameSnapshot,
    attributes:line.attributesSnapshot,quantity:line.quantity,
    unitPriceVnd:line.unitPriceVnd,discountVnd:line.discountVnd,
    lineTotalVnd:String(BigInt(line.quantity)*BigInt(line.unitPriceVnd)-BigInt(line.discountVnd)),
  }));
  const { amounts } = validateLines(items);
  const tendered = amount(tenderedVnd, 'TENDERED');
  if (tendered < amounts.dueVnd) fail('INSUFFICIENT_CASH');
  return build({
    saleId:'',cashierId:'',clientCreatedAt:at,syncStatus:'PENDING_SYNC',
    items,dueVnd:String(amounts.dueVnd),tenderedVnd:String(tendered),
    changeVnd:String(tendered-amounts.dueVnd),
  },'DEMO');
}
