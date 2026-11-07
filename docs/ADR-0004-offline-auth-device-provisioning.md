# ADR-0004 — Staff authentication and one-device offline authorization

**Status:** ACCEPTED POLICY (D-010; owner approved 2026-11-07). Implementation, key storage and idle-lock details remain pending. **No login/authorization code deployed**.
**Issue:** [POS-011 #20](https://github.com/dinhkhoiIT15/smartpos/issues/20) · **Date:** 2026-11-07
**Risk:** R-005 (offline access after revocation), R-004 (credential exposure)
**Baseline:** PRD FR-01/07, BR-005/006/007, SYSTEM_ARCHITECTURE and OFFLINE_SYNC_DESIGN. Do not change the locked one-store, one-offline-device, cash-only requirements.

## Decision boundary / non-goals

POS-011 defines an **auditable design and executable acceptance model only**. There are no deployed login endpoints, actual signed grants, password hashes, secure key stores or checkout permissions in this PR. The fixture under `docs/security/` is **NOT** authentication code and must never be imported into the API or Electron main. The existing Electron demo must remain `DEMO_ONLY`.

The server (Fastify + Neon) owns identity, role authorization, provisioning, revocation and issuance. Electron **main** verifies and maintains the locally cached capability; preload/React never get bearer tokens, private keys, password hashes, or arbitrary SQL. The server MUST independently reauthorize every online request and each sync event; local offline checks do not replace server checks.

## Approved role policy / proposed technical implementation

| Role | Online capabilities (server checks on every request) | Offline cash checkout |
|---|---|---|
| ADMIN | staff/device provisioning/revocation, store configuration, reports | only if separately assigned a cashier grant (default **deny**) |
| MANAGER | catalog/price/inventory changes with reason + audit, reports, conflict review | only if separately assigned a cashier grant (default **deny**) |
| CASHIER | search catalog, perform cash sale, own history | yes, but **only** on the designated device with a valid offline cashier grant |
| Any inactive/revoked user or membership | no action until reinstated | reject on known revocation; previously signed unexpired grants have a bounded offline uncertainty window |

The roles are server facts, not fields supplied by Electron renderer. Changing price/stock while offline is always denied in MVP. Unknown role or operation is denied. Audit changes to membership, device status, grant issuance/revocation, price and stock.

## Online login and session design

1. Staff logs in over **HTTPS to Fastify**, using an active user and active `store_memberships` record. Email/password checked server-side using a slow salted **Argon2id** password hash (parameters selected and benchmarked before implementation; no plaintext or unsalted hash). Add rate limits, generic failure messages and account-risk protections.
2. Successful online login creates a server-side revocable session with short-lived access credential and bounded refresh, scoped to `store_id`, `user_id`, `session_id` and roles. Never use a frontend-supplied role or store ID as authority. Require reauthentication for device/credential changes.
3. Electron main owns session storage through an approved **OS-backed credential storage** mechanism (Windows/macOS) still to be selected; do not write passwords, private keys or bearer tokens into the general SQLite catalog/renderer.
4. **OWNER-APPROVED D-010:** Employee must login online to begin or switch a cashier shift. When offline, **new staff login or cashier switching is refused**. An already online-authenticated cashier may continue only within the bounded signed offline grant and shift expiry.
5. Logout/login-user change clears the active offline authorization (not sale/outbox history). On reconnect, refresh role/device status before permitting any new checkout.

**No real login or offline credential caching has been added by this design issue.**

## Provision one offline checkout device

1. Authorized ADMIN, after fresh online reauthentication, pairs an Electron MAIN-generated asymmetric keypair with the API. **Design preference:** non-exportable per-install private key in a supported OS key store; server stores public key thumbprint and `device_id` (never a Neon credential).
2. API validates store membership and provisioning approval, and updates `devices` in one PostgreSQL transaction. Existing partial unique index `devices_one_active_offline_pos_per_store` rejects more than one unrevoked `offline_checkout_enabled` device per store.
3. Device proves possession of the private key at issuance/renewal; API issues a **signed, short-lived, purpose-scoped offline grant**, containing issuer/audience/version/key ID, store/device IDs, device public-key thumbprint, cashier user ID, originating server session ID, grant ID, authorized operation `offline:cash_checkout`, server-issued time, not-before, expiration, device/grant revision and a random nonce. No passwords or bearer refresh tokens in that grant.
4. Electron MAIN validates the signature using pinned/rotatable server verification keys, known issuer/audience/schema, all ID/permission bindings, clock/expiration and device key proof before every offline sale transaction. The **real cryptographic verification and secure key lifecycle are not in POS-011**; they need implementation and security tests before POS-019 can use this design.
5. **APPROVED:** A new device cannot be granted offline privileges while the previous device holds a still-usable grant: require verifiable acknowledgement that the old grant/device is disabled **or wait until all grants issued to the old device expire (at most 4 hours from latest issuance)**. No emergency overlap exception has been approved. Simply changing the server `devices.revoked_at` or the unique index does not invalidate a disconnected device's cached signed authorization.

### Offline expiry, clock and revocation — OWNER-APPROVED D-010 policy

- **Approved maximum: 4 hours (14,400 seconds)** from server `grant_issued_at`, inclusive cutoff: `grant_expires_at <= grant_issued_at + 4 hours`. Checkout is blocked at `now >= min(grant_expires_at, shift_expires_at)` with **zero grace period**. Issuing a new grant or extending a cashier shift requires successful online reauthentication and fresh server authorization; an offline computer may not renew it. A server may issue shorter grants, but never longer. The expiry applies to starting **new** cash checkout transactions; it must not erase a previously committed sale/outbox.
- Clock: require plausibly monotonic wall-clock progress persisted in protected state. Detect `now < previous_observed_time`, future grant `issued_at > now`, invalid date/overflow, or loss of persisted anti-rollback state; **fail closed**. A privileged attacker can roll back both OS clock and mutable local state; this is not a hardware-trusted clock guarantee. Non-exportable key and signed server time lower but cannot eliminate that risk.
- Known revocation: when online revoke/logout/inactive membership observed, stop new checkout immediately. If offline, an *unknown* revocation cannot be observed; a valid pre-existing grant may remain usable until its expiry. **This is an unavoidable bounded residual risk** requiring owner acceptance and operational process.
- Device theft/clone/reinstall/restore: require online reprovision if the private key is missing or the device-binding/restore lineage is inconsistent. Merely copying SQLite must never provision another device. If an OS image with key material can be cloned, do not claim cryptographic clone prevention.
- An offline outage past grant/shift expiry stops **new checkouts**. It must NOT erase or rewrite already locally committed sales/outbox events; pending events are quarantined or reauthenticated according to OFFLINE_SYNC_DESIGN and audited.

**Owner decision on 2026-11-07 (D-010):** 4-hour absolute maximum per server-issued grant; cashier login or switch **online only**; no renewal/grace when offline; if outage exceeds the grant expiry, stop new sales but preserve previous sale/outbox evidence; transfer the single offline POS only after the old machine **verifiably stops** offline checkout or all its grants expire. There is **no approved emergency overlap exception**. The owner acknowledges that a revoked employee/device disconnected from the server may keep using an already issued unexpired grant, bounded by at most four hours from issue time.

**Still open for implementation/security approval:** the distinct idle-lock duration and unlock behavior, OS-backed private-key storage on Windows/macOS, hardware/clock anti-rollback assurance, how to prove old device shutdown, recovery of lost device keys and actual cryptographic grant/server session implementation. These are NOT silently set by the four-hour grant decision and must be reviewed before active offline checkout.

## Integration / state flow (future implementation)

```
ONLINE SETUP
ADMIN reauth -> API verifies role/store/device slot -> pairs OS-backed public key
-> signs scoped device+cashier offline grant -> Electron MAIN verifies/caches safely

OFFLINE CHECKOUT ATTEMPT (POS-019 future)
renderer requests whitelisted checkout -> Electron MAIN validates sender/inputs
-> verifies signed offline grant, device key proof, cashier/shift expiry, clock monotonicity
-> pure money/stock checks -> atomic SQLite sale/items/CASH payment/stock/outbox transaction
-> only AFTER commit show LOCAL_SAVED / PENDING_SYNC

RECONNECT
main authenticates API -> fetches current employee/device authorization
-> stops new checkouts if revoked -> uploads existing pending sale events for audit
-> server validates per-event provenance/device/grant version and handles conflicts
-> never discard paid sale evidence merely because a grant was revoked after sale time
```

The last step needs a policy for distinguishing *authorized-at-sale-time* offline grant from *currently revoked* device without accepting forged history; use a server-verifiable grant ID, signature, issuance/revocation timestamps, sale/client creation timestamp and event receipts. Server reconciliation is POS-021/POS-024. Do not equate client timestamps with authoritative proof.

## Data/compatibility implications

Current PostgreSQL `users`, `store_memberships`, `devices` and partial unique index are a foundation, **not** complete auth. Implementing sessions, public keys, offline grants and revocation sequence will require **versioned reviewed migrations** in a later approved PR; do not insert unreviewed columns/DDL into Neon. Current POS-013 `local_device_metadata` is intentionally not a secure credential store; use a separate main-only secured OS facility for keys.

## Why not long-lived offline bearer tokens?

Copyable bearer tokens or a locally trusted boolean `offline_checkout_enabled` cannot establish machine possession or revocation. Network disconnect makes immediate remote revocation impossible. Scoped signatures + device proof + short expiry bound the risk, while the server revalidates sync; they do not magically guarantee that a stolen fully compromised machine cannot transact until expiry.

## Traceability and acceptance

- Policy reference/negative-case tests: [offline-access-reference.test.mjs](security/offline-access-reference.test.mjs). This reference is intentionally **outside application code** and takes assertions from a simulated trusted boundary. It cannot verify signatures or protect a local key.
- Risk matrix: [POS-011 threat model](security/POS-011_THREAT_MODEL.md). Owner approved the D-010 operational policy on 2026-11-07; R-005 remains HIGH OPEN until cryptographic verification, revocation/reconciliation and device failover are implemented and tested.
- Controls: role checks server-side, bounded grant, no offline issuance, second device deny, revocation, clock rollback, restore/clone, app restart and clock manipulation.
- No production readiness claim until real auth implementation, secure storage review, concurrency tests, Windows/macOS E2E and recovery drill.

## References

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
