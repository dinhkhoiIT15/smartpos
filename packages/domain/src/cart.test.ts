import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_VND, calculateCartAmounts } from './index.js';
import {
  addCartVariant, removeCartVariant, setCartQuantity, previewCashCart, formatVnd,
  type CartCatalogVariant,
} from './cart.js';

const A: CartCatalogVariant = {
  variantId: 'f82563fe-8545-495e-98d1-ebcbf747b166',
  sku: 'PHONE-128', name: 'Điện thoại 128GB', attributes: { storage: '128GB' },
  priceVnd: '8990000', availableQty: 5, active: true,
};
const B: CartCatalogVariant = {
  variantId: '3b565a61-1a19-4662-b488-ae6916fe75c9',
  sku: 'CASE-01', name: 'Ốp lưng', attributes: { color: 'Đen' },
  priceVnd: '350000', availableQty: 20, active: true,
};
test('POS-018 BR-002 example: due 9,340,000, tendered 9,500,000, change 160,000', () => {
  const lines = addCartVariant(addCartVariant([], A), B);
  assert.deepEqual(previewCashCart(lines, '9500000'), {
    subtotalVnd: '9340000', discountTotalVnd: '0',
    dueVnd: '9340000', tenderedVnd: '9500000', changeVnd: '160000',
    shortfallVnd: '0', sufficient: true, hasTender: true, itemCount: 2,
  });
  assert.equal(formatVnd('9340000'), '9.340.000 ₫');
  assert.equal(formatVnd('9007199254740993'), '9.007.199.254.740.993 ₫');
});
test('add same SKU merges quantity; remove, change quantity, snapshots not re-priced', () => {
  const first = addCartVariant([], A);
  const updated = addCartVariant(first, A, 2);
  assert.equal(updated.length, 1);
  assert.equal(updated[0]?.quantity, 3);
  assert.equal(updated[0]?.unitPriceVnd, A.priceVnd);
  assert.equal(first[0]?.quantity, 1);
  assert.equal(setCartQuantity(updated, A.variantId, 5)[0]?.quantity, 5);
  assert.deepEqual(removeCartVariant(updated, A.variantId), []);
  assert.throws(() => setCartQuantity(first, B.variantId, 1), /CART_NOT_FOUND/);
  assert.throws(() => removeCartVariant([], A.variantId), /CART_NOT_FOUND/);
  assert.throws(() => addCartVariant(first, { ...A, priceVnd: '1' }), /CART_STALE_CATALOG/);
  assert.throws(() => addCartVariant(first, { ...A, sku: B.sku }), /CART_STALE_CATALOG/);
});
test('protect stock limits and quantity restrictions', () => {
  const lines = addCartVariant([], A, 5);
  assert.throws(() => addCartVariant(lines, A), /CART_STOCK/);
  assert.throws(() => setCartQuantity(lines, A.variantId, 6), /CART_STOCK/);
  assert.throws(() => setCartQuantity(lines, A.variantId, 0), /CART_QUANTITY/);
  assert.throws(() => addCartVariant([], A, -1), /CART_QUANTITY/);
  assert.throws(() => addCartVariant([], A, 1.5), /CART_QUANTITY/);
  assert.throws(() => addCartVariant([], A, Number.MAX_SAFE_INTEGER), /CART_QUANTITY/);
  assert.throws(() => addCartVariant([], { ...A, availableQty: 0 }), /CART_UNAVAILABLE/);
  assert.throws(() => addCartVariant([], { ...A, active: false }), /CART_UNAVAILABLE/);
});
test('reject malformed catalog and non-canonical/overflow VND', () => {
  for (const value of ['01','-1','1.5','1e3','9223372036854775808',' 10','', 'NaN']) {
    assert.throws(() => addCartVariant([], { ...A, priceVnd: value }), /CART_PRICE/);
  }
  assert.throws(() => addCartVariant([], { ...A, sku: 'lowercase' }), /CART_CATALOG/);
  assert.throws(() => addCartVariant([], { ...A, variantId: 'invalid' }), /CART_CATALOG/);
  assert.throws(() => addCartVariant([], { ...A, attributes: { INVALID: '1' } }), /CART_ATTRIBUTES/);
  assert.throws(() => addCartVariant([], { ...A, availableQty: Number.NaN }), /CART_CATALOG/);
  assert.throws(() => formatVnd('9223372036854775808'), /CART_FORMAT/);
});
test('insufficient, empty and invalid tender never imply paid', () => {
  const lines = addCartVariant([], A);
  assert.deepEqual(previewCashCart(lines, '8990000').changeVnd, '0');
  const short = previewCashCart(lines, '8989999');
  assert.equal(short.sufficient, false);
  assert.equal(short.shortfallVnd, '1');
  assert.equal(short.changeVnd, '0');
  const empty = previewCashCart(lines, '');
  assert.equal(empty.sufficient, false);
  assert.equal(empty.hasTender, false);
  assert.equal(previewCashCart([], '100').sufficient, false);
  for (const value of ['-1','1.2','1,000',' 100','099','9223372036854775808']) {
    assert.throws(() => previewCashCart(lines, value), /CART_TENDERED/);
  }
});
test('large VND > JS safe range and 64-bit arithmetic overflow are exact', () => {
  const huge = { ...A, priceVnd: '9007199254740993', availableQty: 2 };
  const one = addCartVariant([], huge);
  assert.equal(previewCashCart(one, huge.priceVnd).dueVnd, huge.priceVnd);
  assert.equal(previewCashCart(one, huge.priceVnd).changeVnd, '0');
  assert.throws(() => addCartVariant(one, huge), /64-bit/);
  assert.throws(() => addCartVariant([], { ...A, priceVnd: String(MAX_VND), availableQty: 2 }, 2), /64-bit/);
  assert.deepEqual(calculateCartAmounts([{quantity: 1, unitPriceVnd: 200n, discountVnd: 100n}]),
    {subtotalVnd: 200n, discountTotalVnd: 100n, dueVnd: 100n});
});
test('read-only preview does not mutate cart or invent sale/event identity', () => {
  const lines = addCartVariant([], A);
  const original = JSON.stringify(lines);
  const preview = previewCashCart(lines, '9500000');
  assert.equal(preview.changeVnd, '510000');
  assert.equal(JSON.stringify(lines), original);
  assert.equal('saleId' in preview, false);
  assert.equal('status' in preview, false);
});
