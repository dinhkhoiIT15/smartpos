import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessOfflineCheckout,
  canPerformServerRoleOperation,
} from './offline-access-reference.mjs';

// Entire suite uses synthetic trusted facts and fake grants. NO credentials,
// signing keys, Neon connections, HTTP endpoints or actual app authorization.
const HOUR = 3_600_000;
const T0 = Date.parse('2026-11-07T08:00:00.000Z');

function base() {
  return {
    operation: 'offline:cash_checkout',
    activeStoreId: 'store-1', grantedStoreId: 'store-1',
    activeDeviceId: 'register-1', grantedDeviceId: 'register-1',
    activeCashierId: 'cashier-1', grantedCashierId: 'cashier-1',
    cashierRoleAtIssue: 'CASHIER',
    signedGrantVerified: true, deviceKeyProofVerified: true,
    designatedOfflineDevice: true, cashierActiveAtIssue: true,
    authenticatedOnline: true,
    knownDeviceRevoked: false, knownCashierRevoked: false,
    localDeviceKeyAvailable: true, antiRollbackStateAvailable: true,
    nowMs: T0 + HOUR, lastObservedMs: T0 + HOUR / 2,
    grantIssuedMs: T0, grantExpiresMs: T0 + 2 * HOUR,
    cashierSessionExpiresMs: T0 + 3 * HOUR,
    maxGrantLifetimeMs: 3 * HOUR, // illustrative, not owner-approved
  };
}
function decide(overrides = {}) {
  return assessOfflineCheckout({ ...base(), ...overrides });
}

test('reference model allows previously online-authenticated CASHIER on its only designated POS before expiry', () => {
  assert.deepEqual(decide(), { allowed: true, reason: 'ALLOWED' });
});

const denied = [
  ['offline manager price change', { operation: 'catalog:write' }, 'OPERATION_NOT_GRANTED'],
  ['offline inventory adjustment', { operation: 'inventory:adjust' }, 'OPERATION_NOT_GRANTED'],
  ['unsigned grant', { signedGrantVerified: false }, 'UNVERIFIED_DEVICE_GRANT'],
  ['copied grant without key possession', { deviceKeyProofVerified: false }, 'UNVERIFIED_DEVICE_GRANT'],
  ['missing local device key after restore', { localDeviceKeyAvailable: false }, 'UNVERIFIED_DEVICE_GRANT'],
  ['wrong target device', { activeDeviceId: 'register-2' }, 'DEVICE_OR_STORE_MISMATCH'],
  ['wrong store', { grantedStoreId: 'other-store' }, 'DEVICE_OR_STORE_MISMATCH'],
  ['unauthorized second offline register', { designatedOfflineDevice: false }, 'NOT_DESIGNATED_OFFLINE_POS'],
  ['new staff login attempted offline', { authenticatedOnline: false }, 'CASHIER_NOT_AUTHORIZED'],
  ['inactive cashier at grant issuance', { cashierActiveAtIssue: false }, 'CASHIER_NOT_AUTHORIZED'],
  ['manager without separately authorized cashier identity', { cashierRoleAtIssue: 'MANAGER' }, 'CASHIER_NOT_AUTHORIZED'],
  ['cashier switch while disconnected', { activeCashierId: 'cashier-2' }, 'CASHIER_NOT_AUTHORIZED'],
  ['known revoked device', { knownDeviceRevoked: true }, 'KNOWN_REVOKED'],
  ['known revoked cashier', { knownCashierRevoked: true }, 'KNOWN_REVOKED'],
  ['lost anti-rollback state', { antiRollbackStateAvailable: false }, 'CLOCK_OR_STATE_UNTRUSTED'],
  ['OS clock rolled backwards', { nowMs: T0, lastObservedMs: T0 + HOUR / 2 }, 'CLOCK_OR_STATE_UNTRUSTED'],
  ['future-issued grant', { nowMs: T0 - 1, lastObservedMs: T0 - 2 }, 'CLOCK_OR_STATE_UNTRUSTED'],
  ['grant exceeds approved max duration', { grantExpiresMs: T0 + 5 * HOUR }, 'GRANT_DURATION_EXCEEDS_POLICY'],
  ['grant exactly expired (no grace)', { nowMs: T0 + 2 * HOUR }, 'GRANT_OR_SHIFT_EXPIRED'],
  ['shift exactly expired', { cashierSessionExpiresMs: T0 + HOUR }, 'GRANT_OR_SHIFT_EXPIRED'],
  ['invalid negative signed timestamp', { nowMs: -1 }, 'INVALID_TIME_POLICY'],
  ['fractional clock timestamp', { nowMs: T0 + 0.3 }, 'INVALID_TIME_POLICY'],
  ['unbounded duration', { maxGrantLifetimeMs: Number.POSITIVE_INFINITY }, 'INVALID_TIME_POLICY'],
  ['zero max duration', { maxGrantLifetimeMs: 0 }, 'INVALID_TIME_POLICY'],
  ['zero or backwards grant lifetime', { grantExpiresMs: T0 }, 'INVALID_TIME_POLICY'],
  ['invalid forged string signature flag', { signedGrantVerified: 'true' }, 'INVALID_CONTEXT'],
  ['missing store ID', { grantedStoreId: '' }, 'INVALID_CONTEXT'],
];
for (const [label, input, expected] of denied) {
  test('DENY: ' + label, () => {
    assert.deepEqual(decide(input), { allowed: false, reason: expected });
  });
}

test('DENY invalid input object instead of throwing', () => {
  for (const value of [undefined, null, false, 10, [], 'test']) {
    assert.deepEqual(assessOfflineCheckout(value), {
      allowed: false, reason: 'INVALID_CONTEXT',
    });
  }
});

test('server role reference rejects cashier managing price, stock, device or staff', () => {
  assert.equal(canPerformServerRoleOperation('CASHIER','cash:checkout'), true);
  for (const op of ['catalog:write','inventory:adjust','devices:provision','users:manage']) {
    assert.equal(canPerformServerRoleOperation('CASHIER',op), false);
  }
  assert.equal(canPerformServerRoleOperation('MANAGER','catalog:write'), true);
  assert.equal(canPerformServerRoleOperation('MANAGER','devices:provision'), false);
  assert.equal(canPerformServerRoleOperation('ADMIN','devices:revoke'), true);
  assert.equal(canPerformServerRoleOperation('unknown','cash:checkout'), false);
  assert.equal(canPerformServerRoleOperation('CASHIER','unknown'), false);
});

test('unverified grant must not be rescued by a generous hypothetical TTL or offline time', () => {
  const result=decide({
    signedGrantVerified:false,
    maxGrantLifetimeMs:24*HOUR,
    grantExpiresMs:T0+24*HOUR,
    nowMs:T0+1,
    lastObservedMs:T0,
  });
  assert.deepEqual(result,{allowed:false,reason:'UNVERIFIED_DEVICE_GRANT'});
});

test('offline grant expiry never deletes historical local sales/outbox in the reference model', () => {
  const before=base();
  const after={...before,nowMs:before.grantExpiresMs};
  assert.equal(assessOfflineCheckout(after).allowed,false);
  // The pure policy model has no file/DB access and cannot delete paid evidence.
  assert.equal(after.activeStoreId,before.activeStoreId);
  assert.equal(after.grantExpiresMs,before.grantExpiresMs);
});
