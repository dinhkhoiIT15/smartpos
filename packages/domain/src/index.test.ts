import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCashTotals, calculateLineTotalVnd, MAX_VND } from './index.js';

test('business rules: cash example returns exactly 160000 VND change', () => {
  const result = calculateCashTotals([
    {quantity:1,unitPriceVnd:8_990_000n,discountVnd:0n},
    {quantity:1,unitPriceVnd:350_000n,discountVnd:0n},
  ],9_500_000n);
  assert.deepEqual(result,{
    subtotalVnd:9_340_000n,
    discountTotalVnd:0n,
    dueVnd:9_340_000n,
    tenderedVnd:9_500_000n,
    changeVnd:160_000n,
  });
});

test('discount is applied per line without floating point or negative amounts', () => {
  assert.equal(calculateLineTotalVnd({quantity:3,unitPriceVnd:33_333n,discountVnd:10_000n}),89_999n);
  const x=calculateCashTotals([{quantity:3,unitPriceVnd:33_333n,discountVnd:10_000n}],100_000n);
  assert.equal(x.dueVnd,89_999n);
  assert.equal(x.changeVnd,10_001n);
});

test('reject zero/fraction/unsafe quantity, invalid discount and insufficient tender', () => {
  const line={quantity:1,unitPriceVnd:2_000n,discountVnd:0n};
  for(const quantity of [0,-2,1.5,Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>calculateLineTotalVnd({...line,quantity}),/quantity/);
  }
  assert.throws(()=>calculateLineTotalVnd({...line,discountVnd:2_001n}),/discount/);
  assert.throws(()=>calculateLineTotalVnd({...line,discountVnd:-1n}),/discount/);
  assert.throws(()=>calculateCashTotals([line],1_999n),/cash tendered/);
  assert.throws(()=>calculateCashTotals([],2_000n),/cart/);
});

test('preserves values above JS safe number range with bigint', () => {
  const price=9_007_199_254_740_993n;
  assert.equal(calculateLineTotalVnd({quantity:1,unitPriceVnd:price,discountVnd:0n}),price);
  const result=calculateCashTotals([{quantity:1,unitPriceVnd:price,discountVnd:0n}],price);
  assert.equal(result.changeVnd,0n);
});

test('reject overflows above signed PostgreSQL 64-bit range', () => {
  assert.throws(()=>calculateLineTotalVnd({quantity:2,unitPriceVnd:MAX_VND,discountVnd:0n}),/64-bit/);
  assert.throws(()=>calculateCashTotals([
    {quantity:1,unitPriceVnd:MAX_VND,discountVnd:0n},
    {quantity:1,unitPriceVnd:1n,discountVnd:0n},
  ],MAX_VND),/64-bit/);
  assert.throws(()=>calculateCashTotals([{quantity:1,unitPriceVnd:0n,discountVnd:0n}],MAX_VND+1n),/64-bit/);
});
