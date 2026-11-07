# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-07
verified_commit: 55659902b89e62a542cb5bb6b62a2c61ad3215e0
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub collaborator can create branches/PRs, not repository admin
last_github_synced_at: GITHUB REVIEW 2026-11-07
current_milestone: M2 — inventory services (M0 governance incomplete)
current_phase: POS-015 TRANSACTIONAL STOCK MOVEMENTS — DRAFT PR #28, UNMERGED
ci_status: Early POS-015 CI failed one erroneous role-test expectation; corrected. Latest PR HEAD CI must be rechecked after documentation commits.
production_status: NOT DEPLOYED — no inventory/customer stock writes to Neon

## Verified main and earlier milestone completion
- POS-001 Node/pnpm monorepo PR #5, POS-002/004 docs & CI PR #3, POS-007 Electron PR #8, POS-008 Fastify health PR #10, POS-009 Neon read-only diagnostics PRs #12/#13, POS-010 Zod/bigint VND PR #15: merged.
- POS-012 PostgreSQL 17-table Drizzle migration PR #17 merged; owner confirmed 17 tables plus Drizzle migration journal on **Neon development**; no production migration.
- POS-013 SQLite local schema PR #19 and Windows temporary-file cleanup fix PR #22 merged and user-accepted, Issues #18/#21 closed.
- POS-011 design PR #23 and four-hour offline authorization policy PR #24 merged; owner approved D-010. Issue #20 closed for DESIGN only. D-013 actual login/OS-key/clock implementation and risk R-005 remain OPEN.
- [POS-014 PR #26](https://github.com/dinhkhoiIT15/smartpos/pull/26) merged; owner confirmed Windows unit/schema/health/intentional catalog-404 tests pass, [Issue #25](https://github.com/dinhkhoiIT15/smartpos/issues/25) closed. Verified [main SHA `55659902b89e`](https://github.com/dinhkhoiIT15/smartpos/commit/55659902b89e62a542cb5bb6b62a2c61ad3215e0).
- The `verified_commit` above is **main**, not the POS-015 feature branch HEAD.

## POS-015 implementation in [draft PR #28](https://github.com/dinhkhoiIT15/smartpos/pull/28)
- Tracking [Issue #27](https://github.com/dinhkhoiIT15/smartpos/issues/27); branch `feature/POS-015-inventory-transactions`.
- `apps/api/src/inventory/schemas.ts`: strict Zod manual receipt/issue/correction, canonical signed BIGINT quantity as decimal string, nonzero delta, reason and stable movement UUID idempotency key. Store/role cannot be passed as HTTP input.
- `apps/api/src/inventory/service.ts`: only ADMIN/MANAGER may write, CASHIER read; active store membership and matching role verified in PostgreSQL, membership locked for adjustment transaction. Store+variant balance reads are zero for absent rows, without mutating database.
- One PostgreSQL transaction: validate variant active and store-scoped, insert **append-only** movement with unique ID / idempotent replay check, create missing balance, atomic additive UPDATE with nonnegative and 64-bit bounds, increase revision, append actor/reason audit. Any failed quantity/permission/audit step rolls back all three. Distinct parallel adjustments cannot lose increments; duplicate IDs never apply twice. Ordinary manual changes cannot cause negative stock.
- **BR-009 exception**: negative stock only under future auditable offline-sale reconciliation POS-021, not POS-015.
- `apps/api/src/inventory/routes.ts`: optional, trusted-session-injected Fastify routes for stock reads/mutations. Normal `main.ts` still starts **health only**, so `/v1/inventory/*` must return **404**, even with a forged x-role header. No real login implemented.
- `apps/api/src/inventory/{schemas.test.ts,routes.test.ts,inventory.pg.test.ts}`: Zod, HTTP default deny, PostgreSQL 16 concurrency/oversell/replay/revision overflow/audit rollback/immutable history tests.
- Existing schema + Drizzle migration unchanged; no Neon migration, no SQLite schema changes, no data/credentials touched by CI. All PostgreSQL tests are bound to `127.0.0.1/smartpos_ci`.

## User acceptance / next gates
1. Verify **latest PR #28 HEAD** CI: Node 24 TypeScript, API tests, Electron/security, Windows SQLite, PostgreSQL v1 migrations and **POS-015 inventory integration**, docs validation.
2. Owner checks out POS-015 feature branch on Windows and runs `pnpm --filter @smartpos/api typecheck`, `test:inventory`, `test`, `pnpm --filter @smartpos/db schema:check`; then Fastify health 200 and intentional inventory 404.
3. [Windows acceptance guide](../docs/POS-015_INVENTORY_ACCEPTANCE.md); do not run `test:inventory:pg` on Neon. Do not merge PR or close Issue #27 until owner accepts.
4. Next dependency tasks: POS-016 versioned sync contract, POS-017 SQLite catalog cache, POS-021 reconciliation, real login/RBAC before exposing any mutation routes, POS-019 cash checkout and POS-027/029 encrypted backup/recovery.
5. M0 POS-003 GitHub board, POS-005 branch protection and POS-006 fresh-session handoff remain incomplete. D-009 local encrypted backup policy and D-013 real offline authorization implementation remain OPEN.
