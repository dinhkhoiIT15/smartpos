# POS-014 — Catalog services / Windows acceptance checklist

**State:** Review in [POS-014 PR #26](https://github.com/dinhkhoiIT15/smartpos/pull/26), [Issue #25](https://github.com/dinhkhoiIT15/smartpos/issues/25). **NOT production-ready.**
**Prerequisite:** POS-012 PostgreSQL migration v1 merged and separately applied to **Neon development** by the owner. This PR makes **no Neon queries/migrations or writes during CI**.

## What was implemented

Fastify/server-only `apps/api/src/catalog`:
- `schemas.ts`: strict Zod validation, product IDs must be UUIDs, non-empty bounded names, canonical uppercase SKU, up to eight simple string attribute pairs and a stable sorted/case-insensitive SHA-256 attributes key.
- All prices use canonical nonnegative **signed bigint 64-bit VND decimal JSON strings** (e.g. `"8990000"`), never floating-point money. The PostgreSQL `bigint` column is read back as a decimal string.
- `service.ts`: create/update categories and brands; create/update/soft-deactivate products and variants; get/search/paginate products and variants scoped to a server-verified store ID.
- Variant SKU is **immutable** after creation; per-store SKU uniqueness and per-product attribute uniqueness are also enforced by PostgreSQL constraints. Variant changes require an `expectedRevision` to prevent lost concurrent updates. Do not hard-delete referenced records.
- Every successful mutation writes `catalog_change_log` and `audit_logs` in the **same PostgreSQL transaction**; if SQL/FK/audit fails, the entire transaction is rolled back. Later POS-023 will use catalog deltas.
- `routes.ts`: optional Fastify routes requiring a **trusted server principal resolver**. ADMIN/MANAGER may mutate, CASHIER can read only; role/store cannot be supplied by client headers/body.

### Critical security boundary

There is **no real staff login, credential/session verifier or OS key storage implemented** yet (D-013, R-005). Therefore `apps/api/src/main.ts` does **NOT** register catalog routes at runtime. Normal `/v1/catalog/*` HTTP requests return **404 by design**, even if clients supply `x-role: ADMIN`. This is **not a bug**. Tests use a synthetic trusted principal only in a Fastify `inject()` instance; do not copy this into a deployed entrypoint. The catalog service is foundation code, **not a publicly usable authenticated admin interface**.

## Windows owner verification (safe, no database credentials)

From the repository root in VS Code PowerShell:

```powershell
cd C:\Users\dinhk\Desktop\smartpos
git status --short
git fetch origin
git switch feature/POS-014-catalog-variants-api
git pull --ff-only origin feature/POS-014-catalog-variants-api
pnpm install --frozen-lockfile
pnpm --filter @smartpos/api typecheck
pnpm --filter @smartpos/api test:catalog
pnpm --filter @smartpos/api test
pnpm --filter @smartpos/db schema:check
```

**Expected:** TypeScript exits without errors; both catalog schema and mock-HTTP test suites show `fail 0`, complete API suite has `fail 0`; Drizzle reports `Everything's fine`. All these local commands are **offline-safe with respect to Neon** and never write real shop data. If `git switch` reports uncommitted changes, **do not** force-reset/delete files.

To verify the API still runs and catalog is fail-closed, in one terminal:

```powershell
pnpm --filter @smartpos/api dev
```

In another PowerShell terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/v1/health
```

Expect `{"status":"ok","service":"smartpos-api"}`. Then:

```powershell
try {
  Invoke-WebRequest http://127.0.0.1:3001/v1/catalog/products -ErrorAction Stop
} catch {
  $_.Exception.Response.StatusCode
}
```

Expect **404 Not Found** — intentionally unavailable until real staff authentication and RBAC. Stop with `Ctrl+C`. Do not use `migrate:dev`, `drizzle-kit push` or any `UPDATE/INSERT` in Neon as a POS-014 acceptance step.

## PostgreSQL integration verified only by CI

The [Foundation CI](https://github.com/dinhkhoiIT15/smartpos/actions) uses a **disposable PostgreSQL 16 on 127.0.0.1**, database `smartpos_ci` (fake CI-only credentials), then:
1. `pnpm --filter @smartpos/db schema:check`.
2. `pnpm --filter @smartpos/db test:migrations` — applies 17-table migration to the disposable DB.
3. `pnpm --filter @smartpos/api test:catalog:pg` — tests create/update, rollback, duplicate SKU, attribute collision, no cross-store writes, string VND, concurrent optimistic revision, audit delta logs and soft-deactivate.

**Do not run `test:catalog:pg` with a Neon URL**; the test itself rejects everything other than `127.0.0.1/smartpos_ci`. Local developer can rely on GitHub's fully isolated DB CI for real integration evidence, while running typecheck/mock-HTTP tests on Windows.

## End-to-end status and later work

- POS-014 adds no production schema migration, desktop catalog UI, seed data, auth issuance, stock updates or offline sync worker.
- POS-025 real server RBAC and separate approved authentication implementation are required before exposing catalog mutation routes to users.
- POS-017 caches the catalog on SQLite once the authorized API can serve it; POS-016/POS-023 will formalize versioned sync cursors and deltas.
- For any local failure, share command and sanitized error text only — never `.env`, Neon URL, SQLite database or customer data.
