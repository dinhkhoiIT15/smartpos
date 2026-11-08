# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-08
verified_commit: a01fcf5fec9595d97f155f62c7d82ee7916caeb5
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub branch/Issue/PR connected; no admin
last_github_synced_at: MANUAL GITHUB REVIEW 2026-11-08
current_milestone: M4 — internal store-scoped catalog/inventory delta PULL
current_phase: POS-023 [Issue #43](https://github.com/dinhkhoiIT15/smartpos/issues/43), [Draft PR #44](https://github.com/dinhkhoiIT15/smartpos/pull/44), owner Windows acceptance pending; NOT merged
ci_status: POS-023 code checkpoint fe63a34d [Foundation CI #42439380658](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42439380658) SUCCESS all Linux/API, Windows Node24, disposable PostgreSQL 16; [Docs #42439380695](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42439380695) SUCCESS. Subsequent documentation-only changes require final HEAD CI verification before owner review.
production_status: NOT DEPLOYED — D-013 signed device/cashier grant, authenticated actual PUSH/PULL transport and paid checkout still missing; normal API GET /v1/sync/pull and POST /v1/sync/push 404; normal Electron demo workers not activated; no Neon sale writes

## Owner-verified merged main

- POS-001–POS-021 (foundation, catalogs, inventory, POS-016 wire contract, SQLite cache, demo cash/receipt, internal offline sale, idempotent PostgreSQL PUSH) accepted/merged.
- POS-022 [PR #42](https://github.com/dinhkhoiIT15/smartpos/pull/42) owner Windows PASS and GitHub verified merged at [main `a01fcf5fec9595d97f155f62c7d82ee7916caeb5`](https://github.com/dinhkhoiIT15/smartpos/commit/a01fcf5fec9595d97f155f62c7d82ee7916caeb5). Issue #41 closed. Worker remains MAIN-only opt-in fake transport with strict ACK and crash/retry recovery, no runtime startup.
- **D-013** signed offline device/cashier grant, OS key proof, role/shift/session, revocation and clock enforcement still OPEN, so no actual authorized sync. Neon development schema only.

## POS-023 Draft PR #44

- `apps/api/src/sync/pull-service.ts`: PostgreSQL cursor/highWatermark page reader with limit 1..100, signed-int64 decimal, per-store transactional advisory lock and active device/membership check. `apps/api/src/sync/pull-routes.ts` is **opt-in Fastify.inject-only**. Normal API `main.ts` no PULL route.
- `apps/api/src/catalog/service.ts`: stream lock with catalog CRUD, variant price/SKU/name/active full payload and fanout of product rename/disable to associated SKU deltas. Legacy variant logs lacking name use read-time fallback, so separately trusted bootstrap is still recommended for old shops.
- `apps/api/src/inventory/service.ts` and `apps/api/src/sync/service.ts`: append atomic stock balance snapshots to catalog_change_log on manual adjustment and already-paid offline-sale PUSH; sale-linked stock includes saleId/eventId, once per committed new PUSH, no duplicate on receipt replay.
- `apps/desktop/src/main/local-db/catalog-pull.ts`: MAIN-only SQLite v1 9-table atomic page apply, exact POS-016 schema, store/cursor validation and variant/stock revision checks. Preserves unsynced pending_delta and immutable financial evidence. If server delta includes an exact locally ACKed sale, only that sale's quantity is released at most once per advancing cursor; late ACK after an already-consumed stock page conservatively retains extra negative pending until future trusted rebase. **Before real pilot this corner case needs a durable reconciliation marker / upgraded policy** (no false stock oversell, but inventory may be understated).
- `apps/desktop/tests/catalog-pull.test.ts`: file-backed SQLite paginated, signed stock/price, pending delta, ACKed vs lost-ACK conservative rebasing, cursor replay/reopen, rollback on injected failure, wrong store/cursor. `apps/desktop/tests/catalog-pull-boundary.test.mjs`: no main/IPC/renderer/HTTP activation. `apps/api/src/sync/pull.pg.test.ts`: disposable PG cursor, global gaps/store isolation, product rename, manual stock/PUSH stock event and writer lock/authorization. Prior POS-014 inventory and POS-021 regression CI updated.
- SQLite migrations and Postgres schema **unchanged**; no production data or Neon writes, no extra external packages. [POS-023 full Windows guide](../docs/POS-023_CATALOG_PULL_ACCEPTANCE.md).
- After iterative CI fixes to TypeScript validation, audit-log counts, SQLite null-prototype assertions and static test regex, code checkpoint `fe63a34d` [Foundation #42439380658](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42439380658) **SUCCESS** all Linux/Windows/disposable PG; [Docs #42439380695](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42439380695) **SUCCESS**. Verify final docs-only HEAD again.

## Next

1. Confirm final PR #44 SHA with Github Foundation CI Linux/Windows/PG + Docs CI ALL SUCCESS.
2. Owner Windows: `pnpm install --frozen-lockfile`, `pnpm --filter @smartpos/desktop typecheck`, `test:catalog-pull`, `test:catalog-pull:boundary`, `test:offline-sale`, `test:outbox-worker`, `security:check`, `build`, `pnpm --filter @smartpos/api typecheck`, `test:pull`, `pnpm run check`. Real PG tests run GitHub ephemeral only.
3. Optional Electron demo should remain `DEMO_ONLY • SQLite schema v1`, normal HTTP GET /v1/sync/pull returns 404; no live transport or cashier auth.
4. Owner security review including late-ACK conservative stock caveat, then Windows PASS + manual PR merge. Close issue #43 only after verified merge. Next POS-024 conflict review; D-013 remains blocker before actual commercial operations.
