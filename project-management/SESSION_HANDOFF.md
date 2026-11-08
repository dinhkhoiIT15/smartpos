# Session Handoff — SmartPOS POS-021

## Verified GitHub baseline / PR

- Verified `main` = `cab478722068560a1f104bd2d36a9af300866967`: owner Windows-accepted and merged [POS-020 PR #38](https://github.com/dinhkhoiIT15/smartpos/pull/38). Owner reported PASS/merge, GitHub confirmed; Issue #37 closed. POS-019 #36 and earlier already merged. `DEVELOPMENT_STATUS.verified_commit` refers to main, not feature head.
- Current [Issue #39](https://github.com/dinhkhoiIT15/smartpos/issues/39), [Draft PR #40](https://github.com/dinhkhoiIT15/smartpos/pull/40) branch `feature/POS-021-idempotent-sync-push` based on verified main. **Not merged/owner POS-021 pending.**

## Changed

- `apps/api/src/sync/schema.ts`: strict v1 SALE_COMPLETED schema mirror, signed 64-bit decimal money, canonical SHA256 hash, 25 events/100 items/512 KiB batch. `apps/api/tests/sync-parity.test.ts` validates actual POS-016 shared Zod v1 schema/hash parity (outside API TypeScript build root). No new runtime dependencies.
- `apps/api/src/sync/service.ts`: internal `SyncPushService` with PG transaction and per-store advisory lock; verifies active store-scoped registered device and active staff membership in DB; stores POSTED sale, sale_items snapshots, CASH payment, stock decrement/movements and negative-stock/stale-price conflict records plus append-only original ACK receipt last. Retry same device/event/sale/hash returns stored exact ACK, mismatched identities become NEEDS_REVIEW. No automatic cancellation/overwrite of paid offline sale.
- `apps/api/src/sync/routes.ts` and `apps/api/src/server.ts`: **opt-in** Fastify route solely with injected test-only trusted principal. Normal `main.ts` still has no sync route and HTTP 404. D-013 signed offline grant + device key/clock/cashier shift not implemented. Event's `offlineGrantId` is NOT a verified grant; do not publicly mount a resolver.
- `apps/api/src/sync/routes.test.ts`: default 404, fake headers denied, payload errors and accepted synthetic injected ack. `apps/api/src/sync/sync.pg.test.ts`: disposable PostgreSQL 16 rollback/retry/lost ACK/concurrency, cloud negative stock conflict and stale price, revocation and other-store, exact >2^53 VND. `apps/api/tests/sync-parity.test.ts`: exact POS-016 contract cross-check.
- API package scripts `test:sync`, `test:sync:pg`, `test:sync:parity`; GitHub CI Linux+Windows runs parity, disposable PostgreSQL CI additionally runs PG integration. No SQLite/Neon changes and 17-table PG schema migration v1 remains unchanged.
- [Full POS-021 Windows and CI acceptance](../docs/POS-021_SYNC_PUSH_ACCEPTANCE.md), API/root READMEs, traceability, this handoff.

## CI

- POS-021 full code checkpoint `ca5ec6096428882681649d007283e7af7335ac57` **verified SUCCESS**: [Foundation CI #42434713950](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42434713950) Linux/API, Windows Node24, disposable PostgreSQL 16; [Docs CI #42434713907](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42434713907) SUCCESS. Actual POS-016 Zod/hash parity **3/3 on Linux and Windows**; PostgreSQL POS-021 **11/11** including 8 concurrent duplicates, late ACK insert fault rollback, two distinct negative-stock sales and **fresh PostgreSQL pool restart/lost ACK exact replay**. API 39/39 unit suite, SQLite and existing PostgreSQL migrations/catalog/inventory checks also PASS.
- Earlier parity test `.mjs` TSX file and a missing fixture brace failed before correction; both fixed in the green code checkpoint. Recheck GitHub CI at latest docs-only PR HEAD. Owner Windows POS-021 acceptance remains pending.

## Owner Windows safe commands

```powershell
git status --short
git fetch origin
git switch feature/POS-021-idempotent-sync-push
git pull --ff-only origin feature/POS-021-idempotent-sync-push
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm --filter @smartpos/api typecheck
pnpm --filter @smartpos/api build
pnpm --filter @smartpos/api test
pnpm --filter @smartpos/api test:sync
pnpm --filter @smartpos/api test:sync:parity
pnpm --filter @smartpos/contracts test
pnpm run check
```

Expected Node24/pnpm10.20.0, all unit/parity/TypeScript checks PASS; **no PostgreSQL tests on Neon**. Real DB tests only run GitHub CI ephemeral PostgreSQL 16 at `127.0.0.1:5432/smartpos_ci`. Optionally `pnpm --filter @smartpos/api dev`, expect GET health HTTP200 and POST /v1/sync/push HTTP404 even with forged headers. No real sales/requests processed.

## Production blockers and next backlog

POS-011 D-010 4h offline grant policy is design-only. **D-013** real server signed grants/OS device proof/store/shift/clock/revocation must be reviewed before HTTP sync routes can be enabled. Do not add `sync` resolver in `main.ts` or claim actual staff authentication. POS-022 desktop outbox retry, POS-023 catalog pull, POS-024 manager conflict UI and POS-029 backup/recovery pending. After owner PASS and manual merge, close Issue #39 and continue POS-022; no public deployment/Neon writes.
