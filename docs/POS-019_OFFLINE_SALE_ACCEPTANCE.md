# POS-019 — Atomic offline sale/CASH/outbox SQLite core (M3/P0)

**Status:** [Issue #35](https://github.com/dinhkhoiIT15/smartpos/issues/35), [draft PR #36](https://github.com/dinhkhoiIT15/smartpos/pull/36), branch `feature/POS-019-atomic-offline-sale`. POS-018 was owner Windows accepted and [PR #34](https://github.com/dinhkhoiIT15/smartpos/pull/34) merged on main SHA `fef16b3083a7e6f1fc691bae122820bdd81c8597`. **Human Windows POS-019 acceptance pending.**

## Implemented — MAIN-only storage core

File `apps/desktop/src/main/local-db/offline-sale.ts` exports `parseLocalCashSaleRequest` and `commitLocalCashSale(db, raw)` for future *trusted MAIN-only* authorization orchestrator. **The method is not registered with Electron IPC/preload/renderer.** The current POS-018 demo UI is unchanged and cannot sell or call this helper.

Inputs contain strictly validated canonical UUIDs for `saleId, eventId, paymentId, storeId, deviceId, cashierId, offlineGrantId`, UTC ISO-ms timestamp, initialized `catalogRevision`, canonical signed-int64 VND `tenderedVnd`, and 1–100 immutable item IDs / variant IDs / expected SKU, price, revision and integer quantity. Duplicates, forbidden fields, invalid money and overflow fail. There is **no discount entry** or cashier-controlled price override; this P0 version always persists `discountVnd='0'`.

Under `BEGIN IMMEDIATE`, the core:
1. Handles exact previously committed `saleId` retry as a read-only idempotent result; denies changed request IDs/cash or incomplete evidence.
2. Checks **device metadata for store consistency only (NOT authorization)** and initialized catalog cursor. Rechecks each line against active cached catalog SKU, server revision, stored price/name/attributes and `local_inventory_balances`.
3. Computes exact signed-64-bit line/due/change in `bigint`, rejects insufficient tender, missing stock, stock below requested quantity, and any signed-64-bit overflow.
4. Inserts one immutable `local_sales(PENDING_SYNC)`, 1–100 `local_sale_items` snapshots, exactly one `local_payments(CASH)`. Decrements **only** `local_inventory_balances.pending_delta`, never `server_qty`.
5. Appends one `outbox_events(PENDING)` containing full `SALE_COMPLETED` schemaVersion 1 and lowercase canonical SHA-256 `payloadHash` per POS-016. Then commits all changes at once. Never calls Neon or Fastify.

Any error from BEGIN until COMMIT causes rollback: no orphan payments/items/outbox, and `pending_delta` is unchanged. POS-013 immutable triggers prevent update/delete of committed financial records; outbox is never deleted after ACK. Exact retries do not debit stock twice. No schema migration (SQLite stays **v1, nine STRICT tables**).

**POS-016 interoperability regression:** `tests/offline-sale-wire.test.ts` imports the actual `syncSaleCompletedEventSchema`, `syncPushRequestSchema` and `computeSyncPayloadHash` from `packages/contracts/src/sync-v1.ts` to verify the persisted event, not merely a copied hash implementation. Only test tooling uses the contracts package; no new runtime external dependency was introduced.

## Critical security gap — do not activate checkout

POS-011/D-010 approved a **maximum 4-hour signed offline grant** and one offline POS, but D-013 still needs real server-issued **cryptographically verified staff/device grant**, OS-backed key proof, cashier/store/session authorization, expiry, clock rollback defense, known revocation and device transfer. An arbitrary `offlineGrantId` string in this storage DTO is **not** proof that a grant exists or is valid. Current `local_device_metadata` is not a trust root. A compromised renderer could invent arbitrary identifiers/prices, so **do not expose** this storage API to `window.smartpos` or wire it to demo checkout before auth review and human approval. There is intentionally no public success response for paid checkout.

Only after the real authorization boundary validates the device/cashier/grant and supplies trusted snapshot IDs and values may this persistence primitive be integrated. Event's `POSTED` is a stored *protocol snapshot*, not a statement that the production POS is enabled; `PENDING_SYNC` is **not** a server ACK. Offline sale sync/reconciliation belongs to POS-021/022/023/024, receipts to POS-020, production backup/security to POS-027/029. Do not pretend tested local metadata equals signed grant enforcement.

## Windows PowerShell acceptance (Node 24, no production DB)

From `C:\Users\dinhk\Desktop\smartpos`:

```powershell
git status --short
git fetch origin
git switch feature/POS-019-atomic-offline-sale
git pull --ff-only origin feature/POS-019-atomic-offline-sale
node --version
pnpm --version
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

Expected Node **24.x** and pnpm **10.20.0**. `test:local-db` is **7/7**; `test:catalog-cache` is **6/6**; POS-019 `test:offline-sale` contains **15** file-backed tests and `test:offline-sale:wire` contains **1** shared-wire test; all must PASS with zero failed. Existing TypeScript/security/build/API and GitHub disposable PostgreSQL CI stay green. The offline-sale tests only create OS-generated temporary databases, close all handles before cleanup on Windows, and never touch Electron `userData`, Neon, customer orders or cloud credentials.

### Things the owner should verify

- **Happy path:** built-in synthetic test: PHONE-128 8.990.000 ₫ + CASE-01 350.000 ₫, due 9.340.000 ₫, CASH tender 9.500.000 ₫, change 160.000 ₫. In a single SQLite transaction produces one sale, two immutable items, one CASH payment, both pending stock deltas -1, exactly one outbox event `PENDING` and sale `PENDING_SYNC`. Reopen database preserves all rows.
- **Failure path:** injected outbox trigger after sale/items/payment/stock updates aborts the entire transaction; counts 0/0/0/0 and stock pending deltas unchanged. Payment failure and missing second SKU stock also roll back. No real process kill/power loss is claimed by these tests; WAL restart is verified separately.
- **Idempotency:** identical `saleId` + full input replays without double-debit. Reused `eventId`, `paymentId`, `itemId` for a new sale, or changed tender/cashier/line/snapshot for same sale, is rejected.
- **Boundaries:** stale SKU/price/revision, missing/mismatched device metadata, missing cursor, insufficient cash/stock, inactive SKU, malformed money, floating/overflow quantities and >64-bit totals fail without changing financial evidence.
- **Wire:** test parses saved event using actual POS-016 Zod schema, independently recalculates canonical SHA-256 hash, accepts the event in a v1 `syncPushRequestSchema`, and rejects a tampered hash.
- **GUI smoke:** Electron still has only the existing demo cart, clear **DEMO — CHƯA THỂ BÁN HÀNG** warning, `getAppInfo` shows `DEMO_ONLY • SQLite schema v1`. No new paid-sale button, authenticated catalog/sync or production transaction UI appears.

If any test fails, copy the **sanitized** terminal summary and failing test names; do not delete a developer's SQLite `userData` or copy real sales into the repository.

## Merge gate and next tasks

- [ ] Final draft PR HEAD CI pass on Linux and Windows, frozen lock, SQLite core+POS-016 wire, Electron build/security, API, disposable PostgreSQL 16, docs.
- [ ] Owner Windows tests PASS and security reviewer confirms storage core remains disconnected from public checkout/IPC; no fake grant authorization.
- [ ] Owner reviews and merges PR, then close Issue #35; **do not auto-merge**.
- [ ] D-013 real cryptographic offline grant + secure device/session enforcement before any real checkout release. POS-020 receipts, POS-021 server idempotent apply, POS-022 outbox worker, POS-023 catalog pull and POS-029 backup/recovery remain separate.

**No new SQLite migration. No Neon writes. Not production ready.**
