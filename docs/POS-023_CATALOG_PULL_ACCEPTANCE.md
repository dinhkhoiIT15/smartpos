# POS-023 — Cursor-based catalog + inventory PULL (M4/P0) Windows acceptance

**Status:** [Issue #43](https://github.com/dinhkhoiIT15/smartpos/issues/43) / [Draft PR #44](https://github.com/dinhkhoiIT15/smartpos/pull/44), branch `feature/POS-023-catalog-delta-pull`. Owner confirmed POS-022 PASS and GitHub verified main merge `a01fcf5fec9595d97f155f62c7d82ee7916caeb5`. **POS-023 owner Windows acceptance and merge NOT YET confirmed.**

## What is implemented (INTERNAL ONLY)

- PostgreSQL `CatalogPullService.pull(principal,{cursor,limit})`: store-scoped immutable `catalog_change_log` rows, `seq > cursor`, max 100 rows/page, signed int64 string cursor, monotonic `nextCursor`, `highWatermark`, `hasMore`. Locks the per-store stream under a transaction to ensure a committed writer cannot allocate a lower sequence and commit after a page watermark. Other stores can generate gaps in the global sequence; page ordering remains stable.
- Existing POS-014 catalog CRUD now serializes with PULL and writes product-variant name/price/SKU/active snapshot on each variant change. Product rename/deactivation emits explicit related variant changes (SQLite v1 caches variants and names but not parent product relations). Pre-POS-023 legacy variant log payloads without `name` are enriched on first read from current product for upgrade compatibility; a fully trusted initial snapshot is still recommended. Categories/brands/products are represented in protocol but the SQLite v1 projection only consumes SKU variants and inventory.
- Existing POS-015 manual stock adjustment and POS-021 offline sale PUSH write `inventory_balance` change rows in their original PostgreSQL transaction. Offline-sale stock changes include saleId/eventId so desktop can safely reconcile once an ACK is locally present; duplicate PUSH ACK replay appends no second delta. No new PostgreSQL migration/Neon write.
- `CatalogPullWorker` (Electron MAIN ONLY, not activated) uses an **injected fake/test transport** and requests the currently persisted local cursor. `applyCatalogPullPage` validates actual POS-016 v1 response structure, store, cursor ordering, strictly validated SKU/name/price/signed qty and stock revision, then updates local catalog+server balance+cursor atomically in `BEGIN IMMEDIATE`. Any failure rolls back all page changes including cursor.
- **Pending delta policy:** cloud `server_qty` changes never reset unsynced local stock. A server stock change referencing a locally exact `ACKED` sale may release **only that sale's already-server-applied quantity**, once under the advancing cursor, preserving every other PENDING/RETRY cash sale quantity. If the server stock delta arrives **before** the corresponding local ACK (response lost), the worker errs conservatively and leaves the negative pending delta intact. Because SQLite v1 has no durable per-sale rebase marker, a later ACK after that cursor was consumed may temporarily **understate available stock** until a separately designed trusted reconciliation/bootstrap. It will not falsely increase stock or delete a cash sale. Live PULL activation is blocked pending D-013 and this recovery policy must be revisited before pilot.
- No real checkout, HTTP pull worker, preload/renderer IPC, auth grants, or production sync. The normal Fastify entrypoint still returns **404** on `GET /v1/sync/pull` (and PUSH), even with forged headers. The opt-in Fastify handler is used only in isolated trusted principal tests. Normal Electron remains `DEMO_ONLY`.
- SQLite schema remains **v1 (nine tables)**. No SQLite/PG migration changed. No new external npm dependencies.

## Windows PowerShell tests — NO Neon

From `C:\Users\dinhk\Desktop\smartpos`:

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
pnpm --filter @smartpos/desktop test:offline-sale:wire
pnpm --filter @smartpos/desktop test:outbox-worker
pnpm --filter @smartpos/desktop test:outbox-boundary
pnpm --filter @smartpos/desktop test:receipt-db
pnpm --filter @smartpos/desktop test:local-db

pnpm --filter @smartpos/api typecheck
pnpm --filter @smartpos/api test
pnpm --filter @smartpos/api test:pull

pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop build
pnpm run check
```

Expect Node **24.x**, pnpm **10.20.0**, tests `fail 0`. POS-023 tests use disposable **temporary file-backed SQLite** and an injected fake response; no API, Neon, internet, app userData or production files. Real PostgreSQL integration `pnpm --filter @smartpos/api test:pull:pg` runs ONLY in GitHub Actions disposable PostgreSQL 16 after migration and must NEVER run against Neon. Guard refuses anything other than 127.0.0.1:5432/smartpos_ci.

## Specific acceptance scenarios

- Cursor advances through server pages in strict `seq` order, including gaps from other stores and signed 64-bit cursor values; it advances only **after** the entire SQLite page commits, not after a partial write.
- Product name, SKU price, attribute/active status applied via variant delta, with original historical sale/item/payment prices and outbox untouched.
- A PENDING offline sale leaves `pending_delta=-1` even after an inventory PULL; a second PENDING sale remains pending when first sale has a verified ACK and only first one is covered by the stock delta.
- Page replay after a committed cursor is no-op. Close/reopen retains cursor and server inventory snapshot. Wrong store/cursor, duplicate/out-of-order seq, invalid signed stock or regressing revision fails closed.
- Injected cursor UPDATE failure after partially applying variant/stock changes rolls back **both those rows and cursor**.
- A cloud stock delta for a sale with lost ACK does not erase the pending sale; after ACK received **before** its delta page, only the included acknowledged quantity is released.
- Optional Electron demo: `pnpm --filter @smartpos/desktop dev` -> still `DEMO_ONLY • SQLite schema v1`. No live pull UI/HTTP progress. Browser localhost Vite tab lacks preload by design.
- HTTP smoke, optional: `pnpm --filter @smartpos/api dev`, then `Invoke-WebRequest http://127.0.0.1:3001/v1/sync/pull?cursor=0` should produce **404**. No query should write into Neon.

## Security and release blockers

D-013 authentic OS-backed device key, signed short-lived offline grant, cashier session/role/shift and revocation enforcement **not implemented**. UUID `offlineGrantId` and a `local_device_metadata` row are NOT credentials. No sync transport is allowed to run in the real app until that authorization is complete. Initial catalog bootstrap for a pre-existing store with missing historical balance changes must use a separately trusted snapshot; POS-017 currently offers only an internal bootstrap primitive, not an authenticated loader.

- [ ] Verify final PR HEAD CI Linux/Windows Node24, PostgreSQL 16 disposable + Docs.
- [ ] Owner Windows safe tests and security/rebase caveat review PASS.
- [ ] Owner manually merges PR #44 only after explicit acceptance; leave issue #43 open until merge.
