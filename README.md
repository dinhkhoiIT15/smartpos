# SmartPOS Retail — Desktop + API Foundation

**Status:** M1 development. Electron demo, Fastify health, bigint VND domain and PostgreSQL v1 schema are merged. The owner confirmed the 17-table PostgreSQL migration on **Neon development only**. POS-013 SQLite and Windows cleanup PRs #19/#22 are merged and accepted by the owner. POS-011 [auth/device design PR #23](https://github.com/dinhkhoiIT15/smartpos/pull/23) **merged**; owner approved the **four-hour offline grant operating policy**, documented in [follow-up PR #24](https://github.com/dinhkhoiIT15/smartpos/pull/24). **No real auth has been implemented.** **No real checkout, live login, catalog sync or production pilot yet.**

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

## Monorepo layout

| Workspace | What exists |
|---|---|
| `apps/desktop` | Electron + React/Vite demo, local SQLite v1 merged and Windows test accepted |
| `apps/api` | Fastify health and server-only optional Neon dev connectivity (POS-008/009) |
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
