# Session Handoff — SmartPOS

## Session: owner approves POS-011 offline authorization operating policy (2026-11-07)

- Verified GitHub main SHA: `e71e41398b912ea91c057e76dc044b38e552c7df`; [POS-011 design PR #23](https://github.com/dinhkhoiIT15/smartpos/pull/23) had **already merged** before the owner replied to its proposed D-010 policy. Do NOT reopen or rewrite PR #23.
- Existing [POS-011 Issue #20](https://github.com/dinhkhoiIT15/smartpos/issues/20) is open until final design/policy acceptance. Follow-up branch `feature/POS-011-approved-four-hour-policy`, [PR #24](https://github.com/dinhkhoiIT15/smartpos/pull/24), is the **separate**, reviewable change with the owner's subsequent approval. Do not automatically merge.
- Owner said **“Duyệt”** in direct response to assistant's four-hour expiry/offline cashier switch/no-grace/single-machine transfer and delayed revocation policy. This is approval of **operational policy, not of deployed cryptography or checkout**.
- POS-013 local SQLite + Windows bugfix already merged and user-accepted; GitHub Issues #18/#21 closed. 17-table PostgreSQL schema applied to separate Neon DEV by user; no production database changes.

## Approved D-010 decisions
- Server-issued, purpose-scoped grant for designated offline POS/cashier: **maximum 4 hours (14,400 seconds) from issuance**, expire earlier if the user's authorized shift ends. No offline renewals, no grace at exact expiry. Shorter grants allowed.
- Begin/switch cashier shift or renew offline authorization only after fresh **online** authentication. No new offline cashier login, switch or grant issuance.
- During prolonged outage or expiry stop **new** transactions; do not remove/rewrite completed cash sale/outbox data.
- For a replacement offline POS: first **verifiably disable** the old register, or wait until **all grants issued to it expire**. No unapproved emergency overlap of two offline cashier devices.
- Revocation of a disconnected device/cashier cannot be instant. Residual window no later than existing grant expiration (<= four hours after issuance), owner acknowledged. R-005 stays HIGH OPEN until actual grant/device security is implemented and E2E tested.

## Code/doc changes on follow-up PR #24
- ADR-0004 and POS-011 threat model record approved operating policy and residual exposure. Decision register D-010 marked ACCEPTED; **D-013 OPEN** for actual idle/screen-lock timeout, OS-backed hardware keys on Windows/macOS, anti-clock rollback, key loss, verifiable old-device shutdown/restore; D-009 backup encryption remains open.
- `docs/security/offline-access-reference.mjs` adds a **hard-coded 4h upper bound** in a **design-only synthetic reference**, independent of an injected max duration. Tests assert exactly-at-expiry denied, one millisecond before expiry permitted and oversized policy override denied.
- No Fastify login endpoint, grant signing/verifier, Electron runtime authorization, passwords/key material, SQLite schema change, Neon migration or production sale data were added.
- Latest PR #24 HEAD/CI should be fetched after docs edits; do not claim completion solely from old PR #23 CI.

## What next
1. Confirm latest PR #24 CI (Foundation and Docs), including `node --test docs/security/offline-access-reference.test.mjs`, Windows SQLite and disposable PostgreSQL checks.
2. Review accepted owner decisions vs ADR-0004/D-010, confirm no secrets or runtime auth code in diff, then mark ready for human review; **do not self-merge**.
3. After owner merges PR #24, verify merge SHA and CI, then close POS-011 design Issue #20.
4. **Before POS-019 real checkout:** create separately approved real authentication implementation with Fastify membership/role checks, signed grants, device key storage, expiry/revocation tests and versioned schema migrations if necessary.
5. Future backlog remains POS-014 catalog/variants, POS-015 inventory, POS-016 sync contracts, POS-017 catalog cache and M0 governance POS-003/005/006. Production pilot not authorized.

## Verification and privacy
- GitHub main SHA is authoritative; feature SHA/PR merge may change outside the session, always recheck.
- Never copy/token/paste `.env`, Neon passwords, OS private keys, local customer SQLite files or live sale data.
- Offline clock anti-rollback and non-exportability assumptions require platform verification, not merely reference tests.
