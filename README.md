# SmartPOS Retail — Desktop + API Foundation

**Status:** M2 sync-contract development. Catalog POS-014 and inventory POS-015 services are **merged and owner-accepted**, after PostgreSQL v1/SQLite v1 foundations; Neon contains only the owner-verified **development** 17-table migration. POS-011 four-hour offline auth **policy/design** is accepted, real login remains unimplemented. [POS-016 sync wire contract PR #30](https://github.com/dinhkhoiIT15/smartpos/pull/30) is **under review**; no sync endpoints, worker, live checkout, or production rollout are enabled.

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

GitHub CI separately validates real CRUD and audit/rollback against **disposable PostgreSQL 16**; never point `test:catalog:pg` at Neon. POS-015 stock and POS-017 local catalog UI/cache remain later tasks.

## POS-015 Stock and inventory movement services (draft PR #28)

The server-only [POS-015 inventory service](apps/api/src/inventory/service.ts) creates immutable stock movement events, adjusts PostgreSQL store+variant balances with atomic additive updates, increments revision, and appends manager/actor audit with a mandatory reason in one transaction. Each manual operation uses a stable movement UUID as an idempotency key; repeating it cannot double-count stock. Concurrent stock issues cannot silently make manual stock negative.

Manual stock changes are ADMIN/MANAGER only and the server verifies active role/membership. **Normal Fastify startup still returns 404 for inventory routes** because real staff authentication has not been implemented; only isolated tests inject a fake trusted principal. POS-021 exceptional negative stock from paid offline-sale reconciliation remains out of scope.

On Windows run `pnpm --filter @smartpos/api test:inventory` and `pnpm --filter @smartpos/api test`, plus the [full POS-015 acceptance guide](docs/POS-015_INVENTORY_ACCEPTANCE.md). Real PostgreSQL stock concurrency/rollback is tested only in a disposable database by GitHub CI; **do not run stock tests on Neon**.

## POS-016 versioned offline synchronization contract (draft PR #30)

The shared `@smartpos/contracts` package defines version-locked Zod v1 `SALE_COMPLETED` events, canonical signed-BIGINT VND cash payment snapshots, deterministic sorted-key SHA-256 event hashes, bounded `POST /v1/sync/push` requests and receipt/ACK/review/retry responses. It also defines `GET /v1/sync/pull` cursor/watermark pages and negative-case checks. These are **schemas and examples only**, not working HTTP routes.

- [Versioned sync specification, JSON examples and Windows acceptance](docs/sync/POS-016_SYNC_CONTRACT.md)
- [OpenAPI 3.1 contract](docs/sync/openapi-v1.yaml)
- Unit/fixture tests: `pnpm --filter @smartpos/contracts typecheck` then `pnpm --filter @smartpos/contracts test`
- Normal Fastify runtime still returns **404** on `/v1/sync/*`. Real auth, idempotent server transaction, desktop retry and SQLite cursor application are later issues POS-021/022/023. **No Neon access/migration required for POS-016.**

## Monorepo layout

| Workspace | What exists |
|---|---|
| `apps/desktop` | Electron + React/Vite demo, local SQLite v1 merged and Windows test accepted |
| `apps/api` | Fastify health, Neon development diagnostics and auth-gated catalog service in PR #26 (not runtime enabled) |
| `packages/contracts` | Zod cart estimate DTOs, signed-bigint-safe VND strings, POS-010 merged |
| `packages/domain` | Pure bigint cash calculation helpers, POS-010 merged |
| `packages/db` | Drizzle PostgreSQL schema v1, merged, applied only to Neon development |
| `packages/config` | Shared TypeScript tooling boundary |

See [Desktop README](apps/desktop/README.md), [API README](apps/api/README.md), [Development Setup](docs/DEVELOPMENT_SETUP.md), [Development Status](project-management/DEVELOPMENT_STATUS.md), [Session Handoff](project-management/SESSION_HANDOFF.md) and [Backlog](project-management/BACKLOG.csv).

## Boundaries

- Neon development SELECT 1 and 17-table PostgreSQL v1 migration were verified separately by owner; SQLite v1 local schema runs in Electron main. There is still **no login implementation, real sale, inventory service or sync API**.
- All business values in VND are integer/bigint when those modules are implemented; no float money calculations.
- Do not commit `.env`, local SQLite files, tokens, private data or real customer sales.
- Keep secrets server-side in future issues; Electron renderer must never access Neon directly.
- GitHub commit, CI and issue/PR state are authoritative; documentation may lag merge events.
