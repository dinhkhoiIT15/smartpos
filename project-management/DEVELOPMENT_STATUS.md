# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-08
verified_commit: fef16b3083a7e6f1fc691bae122820bdd81c8597
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub connected, can create Issues/branches/PRs; no admin
last_github_synced_at: MANUAL GITHUB REVIEW 2026-11-08
current_milestone: M3 — offline cash sale persistence foundation
current_phase: POS-019 atomic MAIN-only SQLite sale/outbox core; draft PR #36, owner Windows pending
ci_status: POS-019 final code checkpoint 85854a33 [Foundation CI 42398260631](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42398260631) SUCCESS Linux+Windows (offline sale 16/16, shared wire 1/1, SQLite 7+6, TS/desktop/API/PG); [Docs CI 42398260696](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42398260696) SUCCESS; recheck final docs-only PR HEAD before Windows acceptance
production_status: NOT DEPLOYED — no real auth/offline grant, paid-sale UI/IPC, HTTP sync, worker, receipts or Neon sale writes

## Verified merged main

- POS-001/002/004/007/008/009/010/011, POS-012 PostgreSQL 17-table v1, POS-013 SQLite 9-table v1, POS-014 catalog and POS-015 inventory services, POS-016 v1 Zod sync wire contracts and POS-017 atomic initial local catalog cache. POS-011's four-hour signed offline grant policy is **design-only**; real D-013 identity/device/keys/revocation remain OPEN.
- POS-017 [PR #32](https://github.com/dinhkhoiIT15/smartpos/pull/32) merged at `28d38555d358`, owner PASS, Issue #31 closed.
- POS-018 demo cart/cash preview [PR #34](https://github.com/dinhkhoiIT15/smartpos/pull/34) **merged**, owner Windows PASS; verified GitHub [main SHA `fef16b3083a7e6f1fc691bae122820bdd81c8597`](https://github.com/dinhkhoiIT15/smartpos/commit/fef16b3083a7e6f1fc691bae122820bdd81c8597). Issue #33 closed. POS-018 is still demo-only (synthetic SKU, in-memory calculations, no completed sale).
- PostgreSQL migrations only verified by owner on Neon **development**; no production rollout.

## POS-019 feature pending owner approval

- [Issue #35](https://github.com/dinhkhoiIT15/smartpos/issues/35), [draft PR #36](https://github.com/dinhkhoiIT15/smartpos/pull/36), branch `feature/POS-019-atomic-offline-sale` based on verified merged main.
- `apps/desktop/src/main/local-db/offline-sale.ts`: STRICT UUID/decimal/qty/UTC input and immutable expected SKU/price/revision. Transaction `BEGIN IMMEDIATE`: check metadata (scope ONLY, NOT auth), initial catalog cursor, active SKU/price/revision, local balance and available stock; bigint cash total; apply `pending_delta` only; insert local sales, items, CASH payment and deterministic hashed `SALE_COMPLETED` v1 outbox `PENDING` in one commit. Exact sale ID request retry replays read-only, other conflicts fail. SQLite v1 schema unchanged, no migration.
- `apps/desktop/tests/offline-sale.test.mjs`: **16** Node24 tests on disposable file-backed SQLite, including BR-002 total 9,340,000/tender 9,500,000/change 160,000, close/reopen, retry/collision, missing/insufficient stock, inactive/stale SKU, price/revision mismatches, malformed cash and overflow, SQLite immutable evidence, injected late outbox/payment triggers aborting all rows and pending stock, reused IDs on a new sale, and a **real Node child-process kill after outbox INSERT but before COMMIT**, followed by WAL reopen/rollback and safe retry.
- `apps/desktop/tests/offline-sale-wire.test.ts`: **1** interoperability test with real POS-016 Zod event/push schemas and hash algorithm; runs via existing `@smartpos/contracts` TSX test tool; no new production dependency. CI on Linux and Windows runs both suites.
- **CI evidence:** Final code checkpoint `85854a33` [Foundation #42398260631](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42398260631) **SUCCESS** on Linux and Windows, including **16/16** POS-019 tests (real Node child process kill before COMMIT, crash recovery) and **1/1** actual POS-016 hash/Zod wire test, SQLite local 7/7, catalog cache 6/6, domain 12/12, TypeScript/Electron/API, disposable PostgreSQL 16. [Docs #42398260696](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42398260696) **SUCCESS**. Review final docs-only PR HEAD run before merge.
- [POS-019 Windows acceptance](../docs/POS-019_OFFLINE_SALE_ACCEPTANCE.md) covers commands, constraints and AUTH GATE.
- **CRITICAL:** `commitLocalCashSale` is not invoked from `apps/desktop/src/main/index.ts`, IPC, preload, renderer, Fastify or a worker. No live payment authorization. SQLite `local_device_metadata` and arbitrary `offlineGrantId` string DO NOT prove D-010 signed grant. D-013 signed staff/shift/device grant + OS key binding + 4-hour expiry, revocation, clock tamper and privileged orchestrator are needed **before enabling UI**. POS-019 internal DB transaction must never be exposed directly over IPC.
- No real API/Neon writes and no demo catalog data persisted into userData.

## Next

1. Recheck Foundation + Documentation GitHub Actions for **latest PR #36 HEAD**. If failure, fix before owner testing; no false PASS.
2. Windows: `pnpm install --frozen-lockfile`, `pnpm --filter @smartpos/desktop typecheck`, `test:offline-sale`, `test:offline-sale:wire`, legacy `test:local-db`, `test:catalog-cache`, `security:check`, `build`, `pnpm run check`; optional `pnpm --filter @smartpos/desktop dev` must STILL show DEMO_ONLY and no payment completion.
3. Owner security/code review and Windows test PASS → merge manually, close Issue #35. Do not merge automatically.
4. D-013 real offline authorization must gate any paid-sale UI; POS-020 internal receipt design, POS-021 API idempotent sale push, POS-022 retry, POS-023 authenticated catalog pull, POS-027/029 backup/security all remain open. No false claim of production readiness.
