/** Pure, deterministic cash/VND calculations. No DB/network/float arithmetic. */
export const MAX_VND = 9_223_372_036_854_775_807n;

export type CashLine = Readonly<{
  quantity: number;
  unitPriceVnd: bigint;
  discountVnd: bigint;
}>;

export type CashTotals = Readonly<{
  subtotalVnd: bigint;
  discountTotalVnd: bigint;
  dueVnd: bigint;
  tenderedVnd: bigint;
  changeVnd: bigint;
}>;

function assertVnd(value: bigint, label: string): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > MAX_VND) {
    throw new RangeError(label + ' must be a non-negative VND bigint within signed 64-bit range');
  }
  return value;
}

function addVnd(left: bigint, right: bigint): bigint {
  return assertVnd(left + right, 'VND amount');
}

/**
 * The discount is a total discount for the line (not per-unit).
 * Final price = quantity × unit price − discount, all using bigint.
 */
export function calculateLineTotalVnd(line: CashLine): bigint {
  if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
    throw new RangeError('quantity must be a positive safe integer');
  }
  const unit = assertVnd(line.unitPriceVnd, 'unitPriceVnd');
  const discount = assertVnd(line.discountVnd, 'discountVnd');
  const subtotal = assertVnd(BigInt(line.quantity) * unit, 'line subtotal');
  if (discount > subtotal) throw new RangeError('discountVnd cannot exceed line subtotal');
  return subtotal - discount;
}

/** Returns totals for a cash cart; doesn't create or post a sale. */
export function calculateCashTotals(lines: readonly CashLine[], tenderedVnd: bigint): CashTotals {
  if (lines.length === 0) throw new RangeError('cart must contain at least one line');
  const tendered = assertVnd(tenderedVnd, 'tenderedVnd');
  let subtotalVnd = 0n;
  let discountTotalVnd = 0n;
  for (const line of lines) {
    // Reuse all amount/quantity invariants from line calculation.
    calculateLineTotalVnd(line);
    subtotalVnd = addVnd(subtotalVnd, BigInt(line.quantity) * line.unitPriceVnd);
    discountTotalVnd = addVnd(discountTotalVnd, line.discountVnd);
  }
  const dueVnd = subtotalVnd - discountTotalVnd;
  if (tendered < dueVnd) throw new RangeError('cash tendered cannot be lower than amount due');
  return {
    subtotalVnd,
    discountTotalVnd,
    dueVnd,
    tenderedVnd: tendered,
    changeVnd: tendered - dueVnd,
  };
}
