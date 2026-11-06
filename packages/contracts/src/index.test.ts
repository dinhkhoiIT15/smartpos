import test from 'node:test';
import assert from 'node:assert/strict';
import { cashCartEstimateSchema, MAX_VND, parseVndString, vndStringSchema } from './index.js';

const variantId = '123e4567-e89b-42d3-a456-426614174000';
const line = {
  variantId,
  skuSnapshot: 'IPHONE-128-BLK',
  nameSnapshot: 'Điện thoại 128GB',
  quantity: 1,
  unitPriceVnd: '8990000',
  discountVnd: '0',
};

test('canonical decimal VND strings preserve signed bigint precision', () => {
  assert.equal(parseVndString('0'), 0n);
  assert.equal(parseVndString('9007199254740993'), 9_007_199_254_740_993n);
  assert.equal(parseVndString(MAX_VND.toString()), MAX_VND);
  assert.equal(vndStringSchema.parse('8990000'), '8990000');
});

test('reject floats, negative, unsafe, noncanonical or non-string JSON money', () => {
  for (const invalid of ['-1', '1.2', '01', '', ' 1', '+1', '1e3', (MAX_VND + 1n).toString(), 99, 99.1]) {
    assert.equal(vndStringSchema.safeParse(invalid).success, false);
  }
});

test('valid cash cart estimate schema preserves SKU and name snapshots', () => {
  const input = {
    items: [line],
    tenderedVnd: '9000000',
  };
  const parsed = cashCartEstimateSchema.parse(input);
  assert.equal(parsed.items[0]?.skuSnapshot, 'IPHONE-128-BLK');
  assert.equal(parsed.items[0]?.nameSnapshot, 'Điện thoại 128GB');
});

test('reject zero/fraction quantities, missing snapshots and unknown properties', () => {
  for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(cashCartEstimateSchema.safeParse({items:[{...line,quantity}],tenderedVnd:'8990000'}).success, false);
  }
  assert.equal(cashCartEstimateSchema.safeParse({items:[{...line,skuSnapshot:''}],tenderedVnd:'8990000'}).success, false);
  assert.equal(cashCartEstimateSchema.safeParse({items:[{...line,unknown:'not allowed'}],tenderedVnd:'8990000'}).success, false);
  assert.equal(cashCartEstimateSchema.safeParse({items:[],tenderedVnd:'8990000'}).success, false);
});
