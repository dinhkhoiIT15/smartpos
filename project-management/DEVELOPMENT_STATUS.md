# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-07
verified_commit: 36e73cd4bf97d1fe76a0001ed8cc1565bd58d06e
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — linked GitHub collaborator; feature branches and PR allowed, no admin role
last_github_synced_at: MANUAL GITHUB REVIEW 2026-11-07
current_milestone: M1 (M0 management/governance still incomplete)
current_phase: POS-011 STAFF AUTH + SINGLE OFFLINE DEVICE DESIGN — DRAFT PR #23; OWNER D-010 DECISIONS OPEN
ci_status: POS-011 reference offline auth model 32/32 and existing CI passed on checkpoint c86e6541df5bdef9dade8c1d6a4c47008484d74f; recheck latest PR head
production_status: NOT DEPLOYED

## Verified main / actual user acceptance
- POS-001 PR #5, POS-002/POS-004 PR #3, POS-007 Electron shell PR #8, POS-008 Fastify health PR #10 merged.
- POS-009 Neon DEV SELECT 1 over TLS verified by user, PR #12/#13 merged.
- POS-010 Zod contracts and bigint money PR #15 merged.
- POS-012 PostgreSQL 17-table schema PR #17 merged; user confirmed 17 SmartPOS public tables + one Drizzle migration history entry on isolated Neon **development** branch only.
- POS-013 SQLite local schema PR #19 merged, follow-up [Windows bugfix PR #22](https://github.com/dinhkhoiIT15/smartpos/pull/22) merged into **verified main `36e73cd4bf97`**. User confirmed all Windows SQLite tests and runtime acceptance passed.
- [POS-013 Issue #18](https://github.com/dinhkhoiIT15/smartpos/issues/18) and [BUG-013 Issue #21](https://github.com/dinhkhoiIT15/smartpos/issues/21) closed as completed with owner-reported acceptance. CI Windows 7/7 and Ubuntu SQLite tests passed.
- `verified_commit` refers to inspected main SHA, **not** to the POS-011 feature branch or a database deployment.

## Current POS-011 design only (not Done)
- [POS-011 Issue #20](https://github.com/dinhkhoiIT15/smartpos/issues/20), [draft PR #23](https://github.com/dinhkhoiIT15/smartpos/pull/23), branch `feature/POS-011-offline-auth-device-design`.
- [ADR-0004](../docs/ADR-0004-offline-auth-device-provisioning.md) proposes Fastify server-authenticated staff roles, single offline register pairing, signed short-lived device/cashier-bound grant and fail-closed expiry/clock/revoke policy. Marked PROPOSED; **no grant duration/OS key choice approved**.
- [Threat model](../docs/security/POS-011_THREAT_MODEL.md) includes revoked staff/device, second register, clone/restore, wall-clock rollback, token exposure, server uncertainty during outage and manual device handover risk.
- [Executable reference](../docs/security/offline-access-reference.mjs) lives ONLY in docs, takes synthetic trusted facts, has NO signature verification, login endpoint, private keys or app runtime integration. [Test matrix](../docs/security/offline-access-reference.test.mjs) **32/32 passed** on [CI run 42383728487](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42383728487) at checkpoint `c86e6541df5bdef9dade8c1d6a4c47008484d74f`. Latest feature HEAD CI must be checked after documentation changes.
- D-010 in [DECISIONS](DECISIONS.md) remains OPEN pending owner: max lifetime, shift expiry/idle lock, no new cashier login while offline, recovery after prolonged outage, device replacement/revoke overlap and secure key storage. R-005 remains HIGH OPEN.
- Approved PRD/BUSINESS_RULES/SYSTEM_ARCHITECTURE/DATABASE_SCHEMA/OFFLINE_SYNC_DESIGN unchanged.
- No real login/register/signature issuer/verifier, OS-backed key storage, migration to Neon, live cashier or checkout has been implemented or authorized.

## Boundaries and next gate
1. Re-fetch latest PR #23 HEAD and full CI, review ADR/threat matrix/test scope.
2. Owner must approve D-010 policy and acknowledge that disconnect prevents instant revocation, subject to bounded signed-grant expiry; do not silently replace proposed rules with production assumptions.
3. After design approval, merge PR and close POS-011 design issue; **separate follow-up implementation** for actual API auth/device verification and versioned schema changes before real offline checkout POS-019.
4. POS-014/015 catalog/inventory, POS-016 sync contracts, POS-017 SQLite catalog remain dependencies for checkout; POS-027/029 encrypted backup/recovery remain mandatory before pilot.
5. M0 POS-003 GitHub backlog board, POS-005 owner-admin branch rules and POS-006 handoff drill remain outstanding. No production pilot/readiness claim.
