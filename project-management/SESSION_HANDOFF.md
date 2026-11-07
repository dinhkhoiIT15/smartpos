# Session Handoff — SmartPOS

## 2026-11-08: POS-019 atomic offline cash sale storage core

**Verified GitHub main:** `fef16b3083a7e6f1fc691bae122820bdd81c8597`, merged owner-accepted [POS-018 PR #34](https://github.com/dinhkhoiIT15/smartpos/pull/34). POS-017 merged #32; POS-018 Issue #33 now closed. Development status's `verified_commit` tracks **main**, not the POS-019 branch.

**Current branch:** `feature/POS-019-atomic-offline-sale`, [Issue #35](https://github.com/dinhkhoiIT15/smartpos/issues/35), [draft PR #36](https://github.com/dinhkhoiIT15/smartpos/pull/36); **NOT MERGED** until owner accepts Windows.

## Code changed

- New MAIN-only `apps/desktop/src/main/local-db/offline-sale.ts`: pure internal storage with no runtime UI/IPC entry point. Strict sale request parser; catalog SKU/name/attributes/price/revision + cursor and device metadata scoped checks; read stock as bigint; exact cash totals; update only `pending_delta`; insert immutable sale, items, CASH payment, POS-016-compatible `SALE_COMPLETED` canonical hash outbox event `PENDING` atomically via existing `withLocalTransaction`. Exact sale retry checks original payment+sale+event and does not double debit stock; changed IDs/data denied. Zero new migrations/dependencies.
- New `apps/desktop/tests/offline-sale.test.mjs` **16** file-backed tests with temp cleanup (Windows-safe), late outbox/payment failure injection and rollback, reopen, idempotency/collisions, wrong store/device, insufficient/stale catalog/stock/cash, bigint > 2^53 and overflow, immutable financial evidence.
- New `apps/desktop/tests/offline-sale-wire.test.ts` **1** exact POS-016 `syncSaleCompletedEventSchema` / PUSH validation + `computeSyncPayloadHash`. Uses `@smartpos/contracts`'s existing `tsx` via desktop script; not linked into runtime.
- Updated `apps/desktop/package.json` scripts `test:offline-sale`, `test:offline-sale:wire`. Linux + Windows CI execute both, existing M0/DB/API/PostgreSQL tests unchanged.
- [Windows acceptance + security](../docs/POS-019_OFFLINE_SALE_ACCEPTANCE.md), README, docs traceability, status and handoff.

## CI checkpoints

- [Foundation #42397754048](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42397754048) **SUCCESS**: Linux/Windows Node24 offline sale **13/13**, wire **1/1**, existing SQLite 7+6, API/Electron/TS/ephemeral PostgreSQL.
- Final code `85854a33` **SUCCESS**: [Foundation CI 42398260631](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42398260631) verifies offline-sale **16/16** (including real SIGKILL/Windows TerminateProcess before COMMIT), wire **1/1** with actual sync contract on Linux/Windows, SQLite baseline 7/7, catalog 6/6, domain 12/12, TypeScript/Electron/API and disposable PostgreSQL 16. [Docs CI 42398260696](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42398260696) **SUCCESS**. Later docs-only commits require final-HEAD CI confirmation. Do not claim local Windows owner PASS yet.

## Windows command checklist

```powershell
git status --short
git fetch origin
git switch feature/POS-019-atomic-offline-sale
git pull --ff-only origin feature/POS-019-atomic-offline-sale
node --version
pnpm install --frozen-lockfile
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop test:local-db
pnpm --filter @smartpos/desktop test:catalog-cache
pnpm --filter @smartpos/desktop test:offline-sale
pnpm --filter @smartpos/desktop test:offline-sale:wire
pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop build
pnpm --filter @smartpos/contracts test
pnpm --filter @smartpos/domain test
pnpm run check
pnpm --filter @smartpos/desktop dev
```

Expected Node24 + pnpm10.20.0; SQLite baseline 7/7, catalog 6/6, new sale 16/16, wire 1/1, other checks all green; Electron **still DEMO_ONLY**, cannot complete payment. Only synthetic OS-temp DB transactions in tests, no calls to Neon or real userData.

## Critical blocking dependency

D-010 four-hour offline grant policy is signed-off **as design only**. D-013 must implement real staff role/shift authorization, server-issued signed offline grant and OS-bound device key proof, known revocation and clock anti-rollback before live payment can be enabled. `local_device_metadata` and `offlineGrantId` are not credentials. Do not wire `commitLocalCashSale` to renderer IPC or demo cart until verified authenticated MAIN orchestrator; do not claim sale receipt/live sync or production-ready payments.

## Next after owner approval

Owner reviews draft PR and CI, passes Windows CLI+demo smoke, merges manually, closes Issue #35. POS-020 internal receipt UI must not falsely claim posted payment without signed authorization; POS-021/022/023 sync and D-013 remain unresolved. Data restore/encryption POS-027/029 pending.
