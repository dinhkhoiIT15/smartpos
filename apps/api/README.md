# SmartPOS API — Fastify, catalog and POS-015 inventory foundations

**Status:** POS-008 health, POS-009 Neon development read-only probe, POS-014 catalog and POS-015 inventory services **merged and owner accepted**; POS-012 PostgreSQL 17-table schema was applied only to **Neon development** by owner. [POS-016 versioned sync wire PR #30](https://github.com/dinhkhoiIT15/smartpos/pull/30) defines **contracts only**. Catalog/inventory mutation routes and all sync endpoints remain **disabled** in normal Fastify startup pending real authenticated staff/device sessions. No deployed stock/catalog writes, live cash checkout or cloud sync.

## Requirements / run health API

Node.js **24.x** and pnpm **10.20.0**. From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @smartpos/api dev
```

In a second Windows PowerShell terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/v1/health
```

Expected JSON: `{"status":"ok","service":"smartpos-api"}`. This only verifies Fastify liveness, **not** Neon readiness or a POS checkout.

The server binds `127.0.0.1:3001`. To explicitly choose another port set `$env:API_PORT="3101"` before starting. Stop with `Ctrl+C`.

## POS-014 catalog service — what's available in code

- `src/catalog/schemas.ts`: Zod validation; normalized uppercase SKU; deterministic variant attributes; nonnegative canonical VND bigint-decimal strings (never JSON numbers).
- `src/catalog/service.ts`: store-scoped PostgreSQL create/update/soft-deactivate for categories/brands/products/variants, get/list/search, SKU and attribute uniqueness, optimistic variant revisions, audit + catalog delta transaction.
- `src/catalog/routes.ts`: Fastify HTTP route definitions **only** if injected with an externally **trusted** authenticated principal resolver. ADMIN/MANAGER write, CASHIER read only. No `x-role` or untrusted `storeId` header can grant privileges.
- `src/main.ts`: still starts `buildServer({logger:true})` **without registering the catalog routes**. This fail-closed default is intentional while D-013 real authentication/OS keys and POS-025 RBAC remain unimplemented.

### Catalog route surface (not exposed by main.ts yet)

| Method | Path | Operation |
|---|---|---|
| POST / PATCH | `/v1/catalog/categories`, `/v1/catalog/categories/:id` | Add / rename category |
| POST / PATCH | `/v1/catalog/brands`, `/v1/catalog/brands/:id` | Add / rename brand |
| POST / PATCH | `/v1/catalog/products`, `/v1/catalog/products/:id` | Add / update or deactivate product |
| GET | `/v1/catalog/products`, `/v1/catalog/products/:id` | Search/list / get product |
| POST / PATCH | `/v1/catalog/variants`, `/v1/catalog/variants/:id` | Add / price/attributes/active update with expectedRevision |
| GET | `/v1/catalog/variants`, `/v1/catalog/variants/:id` | Search/list / get variant |

**Intentional 404:** normal `GET /v1/catalog/products` returns 404, because no verified server session resolver exists. Do not enable open admin CRUD routes as a workaround. The test harness uses Fastify `inject()` and explicitly supplied synthetic principals without listening on the network.

## Run tests and Windows acceptance

```powershell
pnpm --filter @smartpos/api typecheck
pnpm --filter @smartpos/api test:catalog
pnpm --filter @smartpos/api test
pnpm --filter @smartpos/db schema:check
```

Expected `fail 0` for Node test suites, no TypeScript errors, Drizzle `Everything's fine`. See [POS-014 acceptance checklist](../../docs/POS-014_CATALOG_ACCEPTANCE.md) for exact commands and expected results. These Windows tests **do not write to Neon** or create real shop products.

GitHub CI separately runs `pnpm --filter @smartpos/api test:catalog:pg` on a **disposable PostgreSQL 16 database**, after Drizzle migrations, to verify store FK isolation, duplicate SKU/attributes, price bigint, audit rollback, price revision conflict and soft deactivation. That test is guarded to `127.0.0.1/smartpos_ci`; **never** point it at Neon or production.

## POS-015 inventory balances and movement service (not public yet)

- `src/inventory/schemas.ts`: Zod validates signed PostgreSQL BIGINT quantity decimal strings, nonzero manual stock deltas, positive receipts, negative issues, correction kind, stable UUID movement ID and audit reason.
- `src/inventory/service.ts`: store-scoped and active membership-verified balance/history reads, manual adjustments for ADMIN/MANAGER only, atomic append-only stock movements + balance update/revision + audit. Same UUID on retry returns `REPLAYED`; mismatching reuse is rejected, preventing duplicate stock movements.
- `src/inventory/routes.ts`: optional HTTP routes for `GET /v1/inventory/variants/:variantId/balance`, `GET /v1/inventory/variants/:variantId/movements`, `POST /v1/inventory/adjustments`. **Not registered by main.ts**: real auth and RBAC are still missing. This intentional 404 is part of security acceptance.
- Ordinary manager adjustments cannot cause negative stock; BR-009 exceptions for already-paid offline sale conflicts remain reserved for POS-021.

```powershell
pnpm --filter @smartpos/api typecheck
pnpm --filter @smartpos/api test:inventory
pnpm --filter @smartpos/api test
pnpm --filter @smartpos/db schema:check
```

No Neon credentials are needed. Disposable PostgreSQL CI alone runs `pnpm --filter @smartpos/api test:inventory:pg` after installing the POS-012 migration. See the [Windows acceptance guide](../../docs/POS-015_INVENTORY_ACCEPTANCE.md).

## POS-016 future sync API (contract only; HTTP endpoints not registered)

The [shared Zod v1 push/pull contract](../../docs/sync/POS-016_SYNC_CONTRACT.md) and [OpenAPI 3.1](../../docs/sync/openapi-v1.yaml) describe future `POST /v1/sync/push` and `GET /v1/sync/pull` with canonical money/hash, receipt ID matching and monotone cursors. **Neither route is live** in `src/main.ts`: both intentionally return HTTP **404**. This is a security gate while login/device grant verification, sale receipt transactions, outbox retry and SQLite cursor application remain unimplemented (POS-021–023).

```powershell
pnpm --filter @smartpos/contracts typecheck
pnpm --filter @smartpos/contracts test
```

No Postgres/Neon environment variable, migration or live transaction data is required for POS-016 contract acceptance.

## Build and optional Neon diagnostic

```powershell
pnpm --filter @smartpos/api build
pnpm --filter @smartpos/api start
```

`build` compiles strict TypeScript; `start` serves loopback health. If a developer needs the **read-only** Neon development `SELECT 1` diagnostic, follow [Neon checklist](../../docs/NEON_SETUP.md) and run `pnpm --filter @smartpos/api db:check`. Connection string must remain in locally ignored `apps/api/.env`; do not paste or share it. This CLI does not migrate or write data.

## Next milestones

POS-015 audited stock adjustments, POS-016 versioned sync contracts, POS-017 SQLite catalog cache, real staff authentication/RBAC, POS-019 checkout and POS-021 push synchronization are separate work. No customer payment data or production deployment is permitted as part of POS-014.
