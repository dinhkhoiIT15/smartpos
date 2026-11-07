# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-07
verified_commit: e71e41398b912ea91c057e76dc044b38e552c7df
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub collaborator; feature branches and PR allowed, not admin
last_github_synced_at: GITHUB REVIEW 2026-11-07
current_milestone: M1 (M0 management/governance still incomplete)
current_phase: POS-011 OWNER-APPROVED OFFLINE POLICY FOLLOW-UP — PR #24 UNMERGED
ci_status: Latest POS-011 approved-policy PR #24 CI must be verified at final head before code-review completion
production_status: NOT DEPLOYED

## Verified main / accepted prerequisites
- POS-001 PR #5, POS-002/POS-004 PR #3, POS-007 Electron shell PR #8, POS-008 Fastify health PR #10 merged.
- POS-009 Neon development read-only TLS SELECT 1 confirmed; POS-010 Zod and bigint VND helpers merged.
- POS-012 Drizzle 17-table PostgreSQL migration PR #17 merged; developer confirmed 17 tables + one migration journal entry on isolated Neon development, **not production**.
- POS-013 SQLite local schema PR #19 and Windows EPERM bugfix PR #22 merged, developer confirmed tests and runtime acceptance; Issues #18 and #21 closed.
- POS-011 auth/device **DESIGN** [PR #23](https://github.com/dinhkhoiIT15/smartpos/pull/23) merged into verified [main `e71e41398b91`](https://github.com/dinhkhoiIT15/smartpos/commit/e71e41398b912ea91c057e76dc044b38e552c7df). Issue #20 remains OPEN until the approved-policy follow-up is reviewed/merged.
- `verified_commit` reflects actual main SHA, NOT POS-011 follow-up PR branch or deployed auth.

## Owner-approved POS-011 policy (2026-11-07)
- Owner replied **“Duyệt”** explicitly to proposal: **4 hours maximum from server-issued offline grant**, start/switch cashier shift **online only**, **zero grace and no offline renewal**; expired grant prevents NEW checkout but never removes committed sale/outbox data.
- When transferring the one designated offline POS, the old register must verifiably stop or all of its grants expire before new device offline checkout starts. **No emergency overlap exception approved**.
- Owner acknowledges a disconnected device may not learn of revocation until grant expiry, **at most four hours after grant issuance**. Risk R-005 stays HIGH OPEN until cryptographic and end-to-end controls are tested.
- [PR #24](https://github.com/dinhkhoiIT15/smartpos/pull/24) on `feature/POS-011-approved-four-hour-policy` records policy acceptance in ADR-0004 and DECISIONS D-010 and enforces a fixed four-hour ceiling in **design-only** reference tests.
- Unapproved details explicitly remain D-013 OPEN: inactivity/screen-lock timeout, Windows/macOS non-exportable OS key implementation, key rotation, clock rollback strength, proving old device shutdown and restoring lost keys.
- App still has NO login endpoint, signed grant issuer/verifier, real OS key storage, cashier sessions or enabled checkout. Reference tests use synthetic trusted boolean facts in `docs/security` and are not imported by app code. No Neon migrations or data changes in PR #24.

## Next gates
1. Verify latest PR #24 HEAD Windows/Ubuntu SQLite, Fastify, PostgreSQL and POS-011 reference tests; review D-010 against exact owner approval.
2. After green CI, make PR #24 READY for human code review (do not auto-merge). Close POS-011 Issue #20 only after its design follow-up is merged/accepted.
3. Real authentication, signed grant verification, key storage, clock and device revocation require separately reviewed implementation and migrations **before** POS-019 offline sales.
4. Other work: POS-014 catalog, POS-015 inventory, POS-016 sync contract, POS-017 cache; M0 POS-003/005/006 governance still outstanding.
5. D-009 encryption and backup restore policy still OPEN, no production pilot.
