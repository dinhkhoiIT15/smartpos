# SmartPOS Retail — Desktop + API Foundation

**Status:** M4 POS-024 internal manager conflict review development. Owner accepted POS-023 and [PR #44](https://github.com/dinhkhoiIT15/smartpos/pull/44) merged into `main` at `f102091` (Foundation CI green). [Issue #45](https://github.com/dinhkhoiIT15/smartpos/issues/45) / [Draft PR #46](https://github.com/dinhkhoiIT15/smartpos/pull/46) add store-scoped manager conflict list/review audit and a React DEMO-only preview. **No real staff login, public conflict/sync routes, signed offline grants, live checkout or production rollout**; D-013 and POS-025 still block real use.

SmartPOS is a planned offline-first, cash-only POS for a single electronics store. The accepted baseline (one authorized offline cashier, immutable sales, integer VND, SKU inventory) is recorded in [AGENTS.md](AGENTS.md), [PRD](docs/PRODUCT_REQUIREMENTS.md), [Business Rules](docs/BUSINESS_RULES.md) and [Architecture](docs/SYSTEM_ARCHITECTURE.md).

## Prerequisites and install

- Git, **Node.js 24.x** (`.node-version`), **pnpm 10.20.0** (`packageManager`).
- Windows or macOS for the desktop window.

```bash
pnpm install --frozen-lockfile
pnpm run check
```

## Terminal 1 — Launch desktop development demo

```bash
pnpm --filter @smartpos/desktop dev
```

The SmartPOS window shows **DEMO ONLY** and has a small `getAppInfo()` preload IPC test. It does not process sales. On Windows, if Electron reports its binary is missing, try `pnpm --filter @smartpos/desktop rebuild electron` then start again.

## Terminal 2 — Start Fastify health API (POS-008 merged)

```bash
pnpm --filter @smartpos/api dev
```

In a browser, open <http://127.0.0.1:3001/v1/health>. Expected HTTP 200 JSON:

```json
{"status":"ok","service":"smartpos-api"}
```

On Windows PowerShell use `Invoke-RestMethod http://127.0.0.1:3001/v1/health`. For compiled server, run:

```bash
pnpm --filter @smartpos/api build
pnpm --filter @smartpos/api test
pnpm --filter @smartpos/api start
```

This health probe confirms the API process only; it does **not** check Neon, SQLite or synchronization. The server listens on loopback `127.0.0.1` and defaults to port 3001.

## Shared cart contracts and bigint money (POS-010 merged)

```bash
pnpm --filter @smartpos/contracts typecheck
pnpm --filter @smartpos/contracts test
pnpm --filter @smartpos/domain typecheck
pnpm --filter @smartpos/domain test
```

Contracts carry VND as **decimal JSON strings** to avoid loss of precision, validated with Zod. Domain uses `bigint` for quantity × unit price − line discounts and cash change. This is calculation/validation groundwork, **not a cash checkout or posted sale**. See [Contracts README](packages/contracts/README.md) and [Domain README](packages/domain/README.md).

## POS-013 SQLite local demo (PRs #19/#22 merged)

From `main`, `pnpm --filter @smartpos/desktop dev` creates an **empty** SQLite v1 schema under Electron `userData` and retains it after restarting. The demo window's **Kiểm tra Electron IPC** button reports a read-only `SQLite schema v1` after successful startup. It does NOT create a real sale.

```bash
pnpm --filter @smartpos/desktop test:local-db
pnpm --filter @smartpos/desktop dev
```

The SQLite test suite uses isolated temp databases and verifies WAL, full-sync, rollback, restart and backup consistency. Node 24 `node:sqlite` is stability 1.2 (release candidate); review [ADR-0003](docs/ADR-0003-local-sqlite-driver.md) and [Desktop README](apps/desktop/README.md) before use. Backups are not yet encrypted/automated.

## PostgreSQL schema v1 — POS-012 merged

PostgreSQL migration v1 contains 17 retail tables, PK/FK/UNIQUE/CHECK constraints and immutability guards. CI applies it to disposable PostgreSQL 16; the owner separately confirmed application and table count on **Neon development**, not production.

```bash
pnpm --filter @smartpos/db typecheck
pnpm --filter @smartpos/db schema:check
```

See [DB migration instructions and forward-fix plan](packages/db/README.md). Do **not** run migrations on production; the Neon development schema is already applied.

## POS-011 offline staff/device authorization (DESIGN ONLY, PR #23)

The [ADR-0004](docs/ADR-0004-offline-auth-device-provisioning.md) and [threat model](docs/security/POS-011_THREAT_MODEL.md) define server-side staff RBAC, one-device offline pairing, signed/time-bound grants and revocation/clock-tamper restrictions. **D-010 was approved**: up to four hours per grant, online-only cashier start/switch, no offline renewal or grace, and transfer only after the old POS stops or all old grants expire. This is policy only; **real cryptographic verification, OS-backed device keys, login and checkout remain unimplemented** (D-013 OPEN).

The Node24 synthetic **reference model only** is checked in CI:

```bash
node --test docs/security/offline-access-reference.test.mjs
```

The test never signs/verifies a real token and must not be imported by the API/Electron app. The production implementation will require OS-backed keys, cryptographic proof, strict server checks and a separate reviewed scope.

## POS-014 Catalog and SKU variants (feature PR #26)

POS-014 implements a **server-side only** catalog service with strict Zod validation, store-scoped categories/brands/products/variants, uppercase unique SKU, deterministic variant attribute keys, `BIGINT` VND decimal strings, optimistic price revision and transactionally recorded catalog change/audit events.

**Security:** normal `apps/api/src/main.ts` does not register catalog mutation endpoints because real login/RBAC has not been implemented. `/v1/catalog/*` deliberately returns **404** in normal Fastify startup. Synthetic test sessions exist only in `Fastify.inject()`, not as an exposed admin bypass.

For Windows acceptance, see [POS-014 checklist](docs/POS-014_CATALOG_ACCEPTANCE.md). Safe local tests:

```bash
pnpm --filter @smartpos/api typecheck
pnpm --filter @smartpos/api test:catalog
pnpm --filter @smartpos/api test
```

GitHub CI separately validates real CRUD and audit/rollback against **disposable PostgreSQL 16**; never point `test:catalog:pg` at Neon. POS-015 stock is merged; POS-017 local catalog cache is merged; authenticated import/real catalog UI remain deferred.

## POS-015 Stock and inventory movement services (draft PR #28)

The server-only [POS-015 inventory service](apps/api/src/inventory/service.ts) creates immutable stock movement events, adjusts PostgreSQL store+variant balances with atomic additive updates, increments revision, and appends manager/actor audit with a mandatory reason in one transaction. Each manual operation uses a stable movement UUID as an idempotency key; repeating it cannot double-count stock. Concurrent stock issues cannot silently make manual stock negative.

Manual stock changes are ADMIN/MANAGER only and the server verifies active role/membership. **Normal Fastify startup still returns 404 for inventory routes** because real staff authentication has not been implemented; only isolated tests inject a fake trusted principal. POS-021 exceptional negative stock from paid offline-sale reconciliation remains out of scope.

On Windows run `pnpm --filter @smartpos/api test:inventory` and `pnpm --filter @smartpos/api test`, plus the [full POS-015 acceptance guide](docs/POS-015_INVENTORY_ACCEPTANCE.md). Real PostgreSQL stock concurrency/rollback is tested only in a disposable database by GitHub CI; **do not run stock tests on Neon**.

## POS-016 versioned offline synchronization contract (merged PR #30)

The shared `@smartpos/contracts` package defines version-locked Zod v1 `SALE_COMPLETED` events, canonical signed-BIGINT VND cash payment snapshots, deterministic sorted-key SHA-256 event hashes, bounded `POST /v1/sync/push` requests and receipt/ACK/review/retry responses. It also defines `GET /v1/sync/pull` cursor/watermark pages and negative-case checks. These are **schemas and examples only**, not working HTTP routes.

- [Versioned sync specification, JSON examples and Windows acceptance](docs/sync/POS-016_SYNC_CONTRACT.md)
- [OpenAPI 3.1 contract](docs/sync/openapi-v1.yaml)
- Unit/fixture tests: `pnpm --filter @smartpos/contracts typecheck` then `pnpm --filter @smartpos/contracts test`
- Normal Fastify runtime still returns **404** on `/v1/sync/*`. Real auth, idempotent server transaction, desktop retry and SQLite cursor application are later issues POS-021/022/023. **No Neon access/migration required for POS-016.**

## POS-017 local catalog cache (feature branch, Issue #31)

An Electron MAIN-only importer validates a trusted initial catalog snapshot (strict UUID/store/SKU, attributes, int64 VND and cursor), then writes `local_catalog_variants` and the initial `sync_cursors` row atomically using existing SQLite v1. Local SKU prefix lookup returns decimal string prices and excludes inactive variants. Identical import replays are safe; invalid, divergent or failed writes never advance the cursor. Both Linux and Windows CI test file-backed database restart/rollback/data preservation.

```powershell
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop test:catalog-cache
```

See [POS-017 Windows acceptance and security boundary](docs/POS-017_CATALOG_CACHE_ACCEPTANCE.md). There is **no runtime network importer, renderer SQL interface or real catalog provisioning** without authenticated backend/device support (D-013/POS-023).

## POS-018 interactive demo cash cart (merged PR #34)

The Electron React UI has a **clearly marked demo cart**: search fixed synthetic SKUs, add/update/remove lines, and preview cash tendered, shortfall and change without recording any sale. It imports the existing `@smartpos/domain` bigint calculations; no product or cash demo data is inserted into SQLite/Neon. Prices are immutable SKU snapshots within the demo cart. This is **not checkout**; POS-019 adds the **MAIN-only internal storage core** while real authorized checkout remains blocked by D-013.

```powershell
pnpm --filter @smartpos/domain typecheck
pnpm --filter @smartpos/domain test
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop build
pnpm --filter @smartpos/desktop dev
```

See [POS-018 full Windows acceptance guide](docs/POS-018_CASH_CART_ACCEPTANCE.md). The cart tab is a preview only; never use it to charge customers.

## POS-019 atomic offline sale/outbox storage core (draft PR #36)

[POS-019 Issue #35](https://github.com/dinhkhoiIT15/smartpos/issues/35) adds a **MAIN-only, not IPC-exposed** SQLite storage method that rechecks cached SKU/revision/price and available `server_qty + pending_delta`, performs exact signed-int64 VND CASH arithmetic and commits `local_sales + local_sale_items + local_payments + pending_delta + outbox_events` in one transaction. The outbox stores a POS-016 v1 `SALE_COMPLETED` event with the shared-contract-compatible canonical SHA-256 hash; exact retries never double-debit stock. It is tested with disposable SQLite files and cross-contract Zod tests on Linux/Windows.

```powershell
pnpm --filter @smartpos/desktop test:offline-sale
pnpm --filter @smartpos/desktop test:offline-sale:wire
```

**Not live sales:** `commitLocalCashSale` is intentionally **unreachable from renderer/preload and normal Electron app flow** because D-013 signed grant, cashier/device authorization and OS key/clock protections are not implemented. `offlineGrantId` in an input payload is not proof of a valid grant. The demo UI still never saves or acknowledges actual payments. Do not use fixtures with real customer information. Read the [full POS-019 Windows acceptance/security guide](docs/POS-019_OFFLINE_SALE_ACCEPTANCE.md).

## POS-020 internal cash receipt preview and SQLite read-only projection (merged PR #38)

The demo cart can now **preview and print a distinctly watermarked sample internal receipt** after entering a sufficient synthetic cash amount. The paper includes SKU, attributes, quantity, subtotal, discount, due, tendered cash, change and Vietnam date/time; it always says **MẪU — KHÔNG CÓ GIAO DỊCH** and **KHÔNG PHẢI HÓA ĐƠN THUẾ**, even in print. No real payment or receipt is created.

Separately, `apps/desktop/src/main/local-db/receipt.ts` is a **read-only MAIN-only** projection of already committed SQLite sale/items/CASH/outbox evidence, validating item snapshots and the canonical event hash. It is intentionally **NOT exposed over IPC**, because D-013 real signed cashier and offline-device grants are still missing. No new DB schema, Neon/API write, or dependency.

```powershell
pnpm --filter @smartpos/domain test
pnpm --filter @smartpos/desktop test:receipt-db
pnpm --filter @smartpos/desktop dev
```

See [POS-020 Windows acceptance + print safety guide](docs/POS-020_RECEIPT_ACCEPTANCE.md).

## POS-021 internal PostgreSQL idempotent sync PUSH (merged PR #40)

`apps/api/src/sync/service.ts` applies POS-016-compatible `SALE_COMPLETED` cash-sale events into PostgreSQL v1 in **one transaction per event**: immutable `sales + sale_items + payments(CASH) + inventory_movements + balances + sync_conflicts + sync_receipts`. Exact duplicate delivery returns the previously stored ACK without a second stock debit. The server may retain signed negative stock with explicit reconciliation conflict when an already-paid offline sale arrives after online inventory changed. The `/v1/sync/push` route is **not registered by normal `main.ts`**: only isolated Fastify.inject/CI tests can provide a synthetic resolver. D-013 signed offline grant and real cashier/device auth are **required before opening network traffic**.

```powershell
pnpm --filter @smartpos/api test:sync
pnpm --filter @smartpos/api test:sync:parity
```

The live PostgreSQL tests run **only** on CI disposable `127.0.0.1:5432/smartpos_ci`, never Neon. See [POS-021 Windows/CI acceptance and signed-grant security gate](docs/POS-021_SYNC_PUSH_ACCEPTANCE.md).

## POS-022 recoverable SQLite outbox retry worker (merged PR #42)

`apps/desktop/src/main/local-db/outbox-worker.ts` contains a **MAIN-only** opt-in worker for dispatching immutable SQLite v1 `SALE_COMPLETED` events over an **injected fake/test transport**. It claims PENDING/RETRY by `created_at,event_id` under an IMMEDIATE transaction, verifies the real POS-016 Zod event/hash and exact matching response, and commits `SYNCED`/RETRY/NEEDS_REVIEW updates atomically to `outbox_events` + `local_sales`. Retry uses bounded exponential backoff + jitter, manual reconnect and SYNCING crash recovery. It never re-debits local stock or deletes sale evidence. An ACK with stock/price conflict stores outbox SYNCED but leaves local sale NEEDS_REVIEW.

```powershell
pnpm --filter @smartpos/desktop test:outbox-worker
pnpm --filter @smartpos/desktop test:outbox-boundary
```

**Not a deployed sync worker:** normal Electron MAIN startup never instantiates it; no HTTP client or real signed-grant credentials. D-013 remains a hard security prerequisite for live API transport. See [POS-022 Windows and crash/reconnect acceptance](docs/POS-022_OUTBOX_ACCEPTANCE.md).

## POS-023 server catalog delta PULL and SQLite stock rebase (merged PR #44)

`apps/api/src/sync/pull-service.ts` reads bounded signed-64-bit cursor pages from store-scoped PostgreSQL `catalog_change_log` with a stable high watermark and per-store writer/read lock. POS-014 product-name/variant updates, POS-015 manual inventory changes and POS-021 offline sale stock changes produce transactionally committed delta rows. `GET /v1/sync/pull` remains **404 in normal Fastify startup**; the opt-in route is only used by tests until D-013.

`apps/desktop/src/main/local-db/catalog-pull.ts` applies authenticated-in-the-future change pages as **one SQLite transaction** to local SKU cache, server inventory snapshot and durable cursor. It preserves unsynced `pending_delta` and immutable paid sale/items/CASH/outbox. If a local sale is already ACKed, a cursor-covered server stock change can rebase **only that sale's** pending quantity. If a stock page precedes a lost local ACK, the remaining negative pending may conservatively understate availability until a trusted follow-up reconciliation; this must be resolved before any production rollout. SQLite v1 nine-table schema unchanged.

```powershell
pnpm --filter @smartpos/desktop test:catalog-pull
pnpm --filter @smartpos/desktop test:catalog-pull:boundary
pnpm --filter @smartpos/api test:pull
```

Tests use file-backed temporary SQLite and synthetic principals, not Neon or real HTTP. PostgreSQL delta integration runs on GitHub's disposable PostgreSQL 16 only. See [POS-023 Windows acceptance and caveat](docs/POS-023_CATALOG_PULL_ACCEPTANCE.md).

## Monorepo layout

| Workspace | What exists |
|---|---|
| `apps/desktop` | Electron + React/Vite demo; SQLite v1, POS-019 sale and POS-022 unmounted retry worker |
| `apps/api` | Fastify health, Neon development diagnostics, unmounted catalog/inventory and POS-021 server-only sync transaction service |
| `packages/contracts` | Zod cart estimate DTOs, signed-bigint-safe VND strings, POS-010 merged |
| `packages/domain` | Pure bigint cash calculation helpers, POS-010 merged |
| `packages/db` | Drizzle PostgreSQL schema v1, merged, applied only to Neon development |
| `packages/config` | Shared TypeScript tooling boundary |

See [Desktop README](apps/desktop/README.md), [API README](apps/api/README.md), [Development Setup](docs/DEVELOPMENT_SETUP.md), [Development Status](project-management/DEVELOPMENT_STATUS.md), [Session Handoff](project-management/SESSION_HANDOFF.md) and [Backlog](project-management/BACKLOG.csv).

## Boundaries

- Neon development SELECT 1 and 17-table PostgreSQL v1 migration were verified separately by owner; SQLite v1 local schema runs in Electron main. There is still **no login implementation, real paid-sale checkout or publicly enabled sync API**.
- All business values in VND are integer/bigint when those modules are implemented; no float money calculations.
- Do not commit `.env`, local SQLite files, tokens, private data or real customer sales.
- Keep secrets server-side in future issues; Electron renderer must never access Neon directly.
- GitHub commit, CI and issue/PR state are authoritative; documentation may lag merge events.

## POS-024 manager conflict review (Draft PR #46 — INTERNAL/DEMO ONLY)

`apps/api/src/sync/conflict-review.ts` offers a store-scoped manager/admin list/detail and one-time, idempotent conflict review for POS-021 `STOCK_SHORTAGE` and `STALE_PRICE`. Under a PostgreSQL row lock it writes `sync_conflicts.RESOLVED` plus one append-only `audit_logs` actor/note/idempotency record in the same transaction; conflicting retries return 409 and an audit failure rolls the status back. A review note does **not** adjust stock, refund cash, change prices or alter immutable sales/ACKs. The Fastify routes are opt-in **test-only**; normal HTTP `/v1/sync/conflicts` remains 404 even with forged role headers.

The Electron **Đối soát xung đột (demo)** tab has two explicitly synthetic examples and in-memory note/status interaction only. It reads no PostgreSQL or SQLite and cannot create a real audit or manager action. D-013 signed authorization and POS-025 authentic staff RBAC are prerequisites before any live conflict workflow.

```powershell
pnpm --filter @smartpos/api test:conflicts
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop build
pnpm --filter @smartpos/desktop dev
```

Actual PostgreSQL scenario tests are limited to disposable CI (`pnpm --filter @smartpos/api test:conflicts:pg`), **never Neon**. See [POS-024 Windows acceptance guide](docs/POS-024_CONFLICT_REVIEW_ACCEPTANCE.md).
