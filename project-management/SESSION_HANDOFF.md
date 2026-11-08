# Session Handoff — POS-023 SmartPOS

## Verified main and current branch

- User confirmed POS-022 Windows PASS and merged. GitHub verified [PR #42](https://github.com/dinhkhoiIT15/smartpos/pull/42) merged into `main` at `a01fcf5fec9595d97f155f62c7d82ee7916caeb5`; Issue #41 closed, D-013 unsigned-grant blocker remains.
- Current [Issue #43](https://github.com/dinhkhoiIT15/smartpos/issues/43) and [Draft PR #44](https://github.com/dinhkhoiIT15/smartpos/pull/44), branch `feature/POS-023-catalog-delta-pull`, based on verified main. **POS-023 NOT merged / owner Windows PASS pending**.

## Implemented / security

- `apps/api/src/sync/pull-service.ts`: store-scoped catalog_change_log high-water pagination, 64-bit decimal seq cursor, max100, same transaction-level advisory lock all new catalog/inventory/PUSH stream writers use to avoid global identity/commit reorder. Reads active device/cashier DB membership but **not real D-013 signed grant**. Product rename/deactivation fans out SKU updates; variant events materialize name; manual and offline-sale inventory server balance snapshots appended in original PG transaction with event/sale linkage. Legacy variant log name fallback for old rows; missing legacy stock deltas require separately verified initial bootstrap.
- `apps/api/src/sync/pull-routes.ts` and `src/server.ts` opt-in GET `/v1/sync/pull` with injected synthetic principal in Fastify.inject only. `src/main.ts` leaves it HTTP404, also PUSH404. No real signed grant, login, Neon write, or public live transport.
- `apps/desktop/src/main/local-db/catalog-pull.ts`: opt-in MAIN-only fake transport, POS-016 Zod page validation, transactional SQLite v1 apply variant/stock/cursor with rollback, cross-store/overflow/revision validation. Protects real sales/items/payment/outbox, preserves all unsynced pending_delta. Release only ACKed local sale portion when sale-linked server stock seq is covered and cursor advances. Late ACK after stock page causes **conservative stock understatement** pending a durable rebase marker or trusted resnapshot in later approved scope; do NOT falsely claim production-ready precise stock.
- Tests: `apps/desktop/tests/catalog-pull.test.ts` file-backed Linux/Windows; `catalog-pull-boundary.test.mjs` no runtime/IPC/HTTP; `apps/api/src/sync/pull-routes.test.ts` default 404/test principal; `pull.pg.test.ts` real disposable PostgreSQL 16 cursor, gap isolation, reader/writer locking, product rename, manual stock and POS-021 source delta replay.
- No new migration in PG/SQLite. SQLite remains v1 with 9 tables. No new external npm packages, no Neon/test-prodn data.

## Verified CI checkpoints

- Early foundation CI failed strict TS, old POS-014 catalog audit-count expectations, test null-prototype SQLite object comparison and an overescaped static regex. All addressed, code checkpoint `fe63a34d40a924b91669fcda2667fecfeadf1e83` [Foundation #42439380658](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42439380658) **SUCCESS** all Linux/API, Windows Node24, disposable PostgreSQL 16; [Docs #42439380695](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42439380695) **SUCCESS**.
- Later README, traceability, status and handoff updates are docs-only; MUST recheck final PR SHA GitHub Foundation and Docs before owner review. PR stays Draft until owner Windows PASS.

## Owner Windows (safe, NO Neon)

```powershell
git status --short
git fetch origin
git switch feature/POS-023-catalog-delta-pull
git pull --ff-only origin feature/POS-023-catalog-delta-pull
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop test:catalog-pull
pnpm --filter @smartpos/desktop test:catalog-pull:boundary
pnpm --filter @smartpos/desktop test:catalog-cache
pnpm --filter @smartpos/desktop test:offline-sale
pnpm --filter @smartpos/desktop test:outbox-worker
pnpm --filter @smartpos/desktop test:receipt-db
pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop build
pnpm --filter @smartpos/api typecheck
pnpm --filter @smartpos/api test:pull
pnpm run check
```

Expected Node24/pnpm10.20.0, zero test failures. Actual PG `test:pull:pg` only disposable CI `127.0.0.1:5432/smartpos_ci` (guard rejects Neon). Optional `pnpm --filter @smartpos/desktop dev` still DEMO_ONLY/SQLite v1. [Detailed scenarios](../docs/POS-023_CATALOG_PULL_ACCEPTANCE.md).

## Next

Verify final PR #44 CI and status, note verified HEAD + Windows acceptance. Do NOT merge; owner must confirm PASS and manually merge. Afterwards close #43, continue POS-024 conflict review, then address D-013 signed auth and late-ACK stock rebase marker before commercial rollout.
