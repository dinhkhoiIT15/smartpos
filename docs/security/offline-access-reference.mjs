/**
 * POS-011 DESIGN REFERENCE ONLY. NOT authentication or authorization.
 *
 * This deliberately unshipped, dependency-free reference checks a NEGATIVE
 * acceptance matrix with SYNTHETIC already-verified facts. It does NOT verify
 * a signature, OS key or server state. Do not import into Electron/API/checkout.
 * Production authorization must use a separate reviewed cryptographic trust
 * boundary, OS secure key storage and server revocation logic.
 */

const DENIED = (reason) => Object.freeze({ allowed: false, reason });
const ALLOWED = Object.freeze({ allowed: true, reason: 'ALLOWED' });

// Owner-approved D-010 upper bound: every offline authorization expires within
// four hours of its server-issued timestamp, even if callers pass a larger value.
// DESIGN REFERENCE ONLY: this is not a secure runtime authorization gate.
export const APPROVED_MAX_OFFLINE_GRANT_MS = 4 * 60 * 60 * 1000;

const ROLE_ACTIONS = Object.freeze({
  ADMIN: Object.freeze(['users:manage', 'devices:provision', 'devices:revoke', 'reports:read']),
  MANAGER: Object.freeze(['catalog:write', 'inventory:adjust', 'reports:read', 'conflicts:review']),
  CASHIER: Object.freeze(['catalog:read', 'cash:checkout', 'sales:read-own']),
});

/** Illustrative server role/action ACL. Server must resolve roles from DB. */
export function canPerformServerRoleOperation(role, operation) {
  return Array.isArray(ROLE_ACTIONS[role]) &&
    typeof operation === 'string' &&
    ROLE_ACTIONS[role].includes(operation);
}

const validId = (value) => typeof value === 'string' && value.length > 0 && value.trim() === value;
const validMs = (value) => Number.isSafeInteger(value) && value >= 0;

/**
 * Returns a narrow decision, no tokens. The values in 'facts' must be trusted
 * server/key proofs in a REAL implementation; client-supplied booleans are unsafe.
 *
 * The owner approved an absolute four-hour ceiling, without grace. The
 * injected maxGrantLifetimeMs is an additional (shorter-or-equal) test-policy
 * input; it must never override the owner-approved ceiling.
 */
export function assessOfflineCheckout(facts) {
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) return DENIED('INVALID_CONTEXT');

  const {
    operation, activeStoreId, grantedStoreId,
    activeDeviceId, grantedDeviceId,
    activeCashierId, grantedCashierId,
    cashierRoleAtIssue, signedGrantVerified, deviceKeyProofVerified,
    designatedOfflineDevice, cashierActiveAtIssue, authenticatedOnline,
    knownDeviceRevoked, knownCashierRevoked, localDeviceKeyAvailable,
    antiRollbackStateAvailable, nowMs, lastObservedMs,
    grantIssuedMs, grantExpiresMs, cashierSessionExpiresMs,
    maxGrantLifetimeMs,
  } = facts;

  if (![
    activeStoreId, grantedStoreId, activeDeviceId, grantedDeviceId,
    activeCashierId, grantedCashierId,
  ].every(validId)) return DENIED('INVALID_CONTEXT');

  if (![
    nowMs, lastObservedMs, grantIssuedMs, grantExpiresMs,
    cashierSessionExpiresMs, maxGrantLifetimeMs,
  ].every(validMs) || maxGrantLifetimeMs <= 0 ||
    grantExpiresMs <= grantIssuedMs || cashierSessionExpiresMs <= grantIssuedMs) {
    return DENIED('INVALID_TIME_POLICY');
  }

  const flags = [
    signedGrantVerified, deviceKeyProofVerified, designatedOfflineDevice,
    cashierActiveAtIssue, authenticatedOnline, knownDeviceRevoked,
    knownCashierRevoked, localDeviceKeyAvailable, antiRollbackStateAvailable,
  ];
  if (!flags.every(x => typeof x === 'boolean')) return DENIED('INVALID_CONTEXT');

  if (operation !== 'offline:cash_checkout') return DENIED('OPERATION_NOT_GRANTED');
  if (!signedGrantVerified || !deviceKeyProofVerified || !localDeviceKeyAvailable) {
    return DENIED('UNVERIFIED_DEVICE_GRANT');
  }
  if (activeStoreId !== grantedStoreId || activeDeviceId !== grantedDeviceId) {
    return DENIED('DEVICE_OR_STORE_MISMATCH');
  }
  if (!designatedOfflineDevice) return DENIED('NOT_DESIGNATED_OFFLINE_POS');
  if (!authenticatedOnline || !cashierActiveAtIssue || cashierRoleAtIssue !== 'CASHIER' ||
    activeCashierId !== grantedCashierId) {
    return DENIED('CASHIER_NOT_AUTHORIZED');
  }
  if (knownDeviceRevoked || knownCashierRevoked) return DENIED('KNOWN_REVOKED');
  if (!antiRollbackStateAvailable || nowMs < lastObservedMs || grantIssuedMs > nowMs) {
    return DENIED('CLOCK_OR_STATE_UNTRUSTED');
  }
  if (maxGrantLifetimeMs > APPROVED_MAX_OFFLINE_GRANT_MS ||
    grantExpiresMs - grantIssuedMs > APPROVED_MAX_OFFLINE_GRANT_MS ||
    grantExpiresMs - grantIssuedMs > maxGrantLifetimeMs) {
    return DENIED('GRANT_DURATION_EXCEEDS_POLICY');
  }
  if (nowMs >= grantExpiresMs || nowMs >= cashierSessionExpiresMs) {
    return DENIED('GRANT_OR_SHIFT_EXPIRED');
  }
  return ALLOWED;
}
