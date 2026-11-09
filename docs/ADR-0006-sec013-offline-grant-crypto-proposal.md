# ADR-0006 — Proposed SEC-013 offline signed-grant cryptographic protocol

**Status: PROPOSED — NOT ACCEPTED.** D-010's four-hour rule is approved, while D-013 implementation details remain OPEN. Tracks [SEC-013 #60](https://github.com/dinhkhoiIT15/smartpos/issues/60). Do not deploy or wire payment permissions from this design.

## Context and trust boundaries

The current Electron app is DEMO_ONLY and Fastify main starts without privileged routes. POS-025 exposes internal 15-minute staff session primitives only, not Argon2id login. POS-011 provides a synthetic role/time policy test, not a real signature or device authorization. An online-admin-issued, per-cashier, per-device grant must never be treated as a bearer token that any copied SQLite or renderer can replay.

## Proposed narrow signed-envelope format (prototype for review)

- Signing algorithm candidate: Ed25519 (EdDSA), compact three-part base64url envelope of canonical JSON header, canonical JSON claims and 64-byte Ed25519 signature. Server signs; desktop checks a separately provisioned/pinned server PUBLIC key by key ID. Unknown key ID or algorithm fails closed. **No secret/private key is committed**.
- Strict header: `alg=EdDSA`, `typ=smartpos-offline-grant-v1`, and an allowlisted `kid`. Strict claim keys: `version`, `issuer`, `audience`, `grantId`, `storeId`, `deviceId`, `deviceKeySha256`, `cashierId`, `serverSessionId`, `shiftId`, `role`, `operation`, `issuedAt`, `notBefore`, `expiresAt`, `shiftExpiresAt`, `nonce`. All IDs must be canonical UUID; only `role=CASHIER`, `operation=offline:cash_checkout` in this first candidate.
- The signer must reject claims with invalid issue/not-before/expiry order or `expiresAt-issuedAt > 14400 seconds`. Expiration and shift cutoff must be enforced against a trusted, rollback-resistant local clock before checkout (NOT implemented by the signature prototype). A signature that verifies can still be expired, copied, revoked or issued to a different device.
- The serialized canonical JSON form, key IDs, public key distribution and rotations are *proposed protocol choices*, not an accepted stable public interoperability contract. Before shipping, the owner must approve this format or mandate standard JOSE/COSE with reviewed libraries and cross-language vectors.

## Remaining decisions before implementation approval

1. **Windows signing key:** Windows CNG/KSP with TPM-backed non-exportable key where available, including Windows/macOS supported editions and fallback policy. `Electron.safeStorage` does NOT by itself prove a hardware/non-exportable private signing key. No software-exportable fallback for live offline checkout without explicit owner security exception.
2. **macOS signing key:** Keychain/Secure Enclave support and device attestation limitations, binding to application identity. Review notarization and key re-provision workflow on reinstall or key loss.
3. **Clock/rollback:** protected last-server-time and last-observed-time persistence and tampering detection; if the state is missing/corrupt, fail closed and require online reauthorization. OS administrators can still roll back machine snapshots; document residual risk.
4. **Credential and server auth:** Argon2id login, online MFA/re-auth as applicable, brute-force rate limits, 15-minute staff sessions and revocation, server-side exact role + store + shift checks.
5. **Device possession:** server nonce challenge signed by OS device private key before grant issuance; after delivery, verify that the same hardware/key can prove possession during offline checkout (not just the signed public-key fingerprint). No key or bearer in renderer/SQLite/log.
6. **One-device transfer/revocation:** enforce Neon unique designated POS constraint PLUS grant-overlap avoidance: authenticated old-device stop proof or wait until all its grants expire; never assume an offline device receives revoke.
7. **Online sync/recovery:** protect all push/pull requests with server-verified session/device/grant scopes, quarantine suspicious offline events without erasing locally paid sales; D-009 encrypted backup and device recovery remain unresolved.

## Explicit scope of this Draft PR

`docs/security/offline-grant-signature-prototype.mjs` is an **unwired, docs-only demonstration** of key pinning, Ed25519 signature verification, canonical payload and 4-hour upper bound. Tests use transient fake signing keys in Node memory. It does **not** generate keys for a device, issue a grant, use a trusted clock, check live revocation, authenticate a cashier, or authorize/enable checkout. No Electron/API production module imports it. Current normal API privileged routes remain 404.

## Release gates

- [ ] Owner approves (or modifies) cryptographic format, OS key APIs and non-exportable/fallback rules above.
- [ ] Independent threat model review for key theft/cloning, clock rollback, revoked/expired grant, role/shift switch, replay and server key rotation.
- [ ] Argon2id and signed grant issuance integrated with PostgreSQL on disposable test DB and authenticated Fastify test adapters, then approved staging deployment.
- [ ] Windows/macOS real OS key generation/proof + shift/grant/revocation/restart and logout E2E, including hardware unavailable and backup restore.
- [ ] Only AFTER all gates, separately review protected Electron checkout and sync transport. **No auto-merge, no Neon production writes.**

**Decision record:** D-013 stays OPEN; this ADR is a proposal, not an approval of a live authentication design.
