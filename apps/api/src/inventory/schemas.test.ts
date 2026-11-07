import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adjustInventorySchema, quantityDeltaSchema, inventoryHistoryQuerySchema, MAX_QTY, MIN_QTY } from './schemas.js';

const input = (patch: Record<string, unknown> = {}) => ({
  movementId: randomUUID(), variantId: randomUUID(), deltaQty: '10',
  kind: 'RECEIPT', reason: 'Initial demo stock arrival', ...patch,
});

test('POS-015 accepts exact signed 64-bit quantities as decimal strings only', () => {
  for (const n of ['1', '-1', MAX_QTY.toString(), MIN_QTY.toString(), '999']) {
    assert.equal(quantityDeltaSchema.parse(n), n);
  }
  for (const n of [0, 1, 1.2, '', '0', '-0', '+1', '01', '-01', '1.1',
    '1e5', ' 1', '9223372036854775808', '-9223372036854775809', null]) {
    assert.equal(quantityDeltaSchema.safeParse(n).success, false, String(n));
  }
});

test('receipt requires +, issue requires -, correction accepts either sign', () => {
  assert.equal(adjustInventorySchema.safeParse(input()).success, true);
  assert.equal(adjustInventorySchema.safeParse(input({ kind: 'ISSUE', deltaQty: '-2' })).success, true);
  assert.equal(adjustInventorySchema.safeParse(input({ kind: 'CORRECTION', deltaQty: '-2' })).success, true);
  assert.equal(adjustInventorySchema.safeParse(input({ kind: 'CORRECTION', deltaQty: '2' })).success, true);
  assert.equal(adjustInventorySchema.safeParse(input({ kind: 'RECEIPT', deltaQty: '-1' })).success, false);
  assert.equal(adjustInventorySchema.safeParse(input({ kind: 'ISSUE', deltaQty: '3' })).success, false);
});

test('strict request requires stable idempotency UUID and nonempty bounded reason', () => {
  for (const patch of [
    { movementId: 'oops' }, { variantId: 'wrong' }, { reason: 'no' },
    { reason: '  ' }, { reason: 'x'.repeat(241) }, { kind: 'SALE' },
    { actorId: randomUUID() }, { storeId: randomUUID() }, { role: 'ADMIN' },
  ]) {
    assert.equal(adjustInventorySchema.safeParse(input(patch)).success, false, JSON.stringify(patch));
  }
  assert.equal(adjustInventorySchema.parse(input({ reason: '  stock count verified  ' })).reason,
    'stock count verified');
});

test('history query limits and revalidation are strictly bounded', () => {
  assert.deepEqual(inventoryHistoryQuerySchema.parse({}), { limit: 20 });
  assert.deepEqual(inventoryHistoryQuerySchema.parse({ limit: '100' }), { limit: 100 });
  assert.deepEqual(inventoryHistoryQuerySchema.parse({ limit: 10 }), { limit: 10 });
  for (const bad of [{ limit: '0' }, { limit: '101' }, { limit: '-2' },
    { limit: '1e3' }, { limit: 2.2 }, { storeId: randomUUID() }]) {
    assert.equal(inventoryHistoryQuerySchema.safeParse(bad).success, false);
  }
});
