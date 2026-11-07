# Session Handoff — SmartPOS

## Session focus: POS-014 catalog and SKU variants service (2026-11-07)

- Repository: https://github.com/dinhkhoiIT15/smartpos
- Verified main SHA at start: `9be30b9f6a1a865fae79a3e8a321fe839b6d529a`, after [POS-011 policy PR #24](https://github.com/dinhkhoiIT15/smartpos/pull/24) merged. [POS-011 Issue #20](https://github.com/dinhkhoiIT15/smartpos/issues/20) was closed as **design-only**, with 35/35 policy reference tests and D-010 max 4h offline grant ACCEPTED. **Real server login/OS key issuer/verifier have not been implemented** (D-013/R-005).
- POS-012 17-table Drizzle schema already applied to **Neon development only** by owner, not production. POS-013 SQLite/Windows regression merged and owner-accepted. None of those databases changed by POS-014.
- Current [POS-014 Issue #25](https://github.com/dinhkhoiIT15/smartpos/issues/25), [draft PR #26](https://github.com/dinhkhoiIT15/smartpos/pull/26), branch `feature/POS-014-catalog-variants-api`, **not merged**. `verified_commit` in status is main SHA, NOT branch head.

## Implemented on POS-014 branch

- `apps/api/src/catalog/schemas.ts`: Zod strict payloads, canonical uppercase SKU and deterministic sorted variant attributes key, canonical signed 64-bit bigint VND represented as JSON decimal strings; bounded search/pagination.
- `apps/api/src/catalog/service.ts`: parameterized PostgreSQL store-scoped create/update/get/list for categories, brands, products and SKU variants. Soft deactivate rather than delete; variant SKU immutable and price/attrs/active update uses optimistic revision. On successful mutation, append `catalog_change_log` plus `audit_logs` **in the same transaction**; sanitize DB errors, rollback all writes on failure.
- `apps/api/src/catalog/routes.ts`: explicit opt-in Fastify routes requiring an injected **server-verified principal resolver**. Role checks deny cashier mutations, store scope never trusted from HTTP; **normal main.ts has no resolver and does NOT register these routes**. `/v1/catalog/*` 404 is expected for local API until real auth is ready.
- Unit/HTTP tests validate fake-session access, role separation, unknown/untrusted headers, SKU/attributes/VND and errors; PostgreSQL integration test exercises real DB constraints, audit rollback, concurrency, variant revision.
- `apps/api/package.json` and pinned `pnpm-lock.yaml` reuse existing Zod 4.6.7, no new runtime package versions/native modules.
- `.github/workflows/ci.yml`: existing disposable PostgreSQL 16 job runs the existing POS-012 migration test first, then `pnpm --filter @smartpos/api test:catalog:pg`. **No Neon URL or direct access used.**
- Docs: API README, [Windows acceptance checklist](../docs/POS-014_CATALOG_ACCEPTANCE.md), FR-02 traceability, root README, status/TODO/handoff.
- No real checkout/cart/inventory, SQLite catalog cache, production deployment, secret exposure, new migrations or changes to locked requirement documents.

## CI and tests

- Early Foundation CI failed because Zod refinement called `BigInt('1.1')` on malformed price; fixed with a canonical-regex guard before `BigInt`.
- [Foundation checkpoint run 42388296031](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42388296031) at head `ac5ca5022fcf147e835b8a9b03f120cfd5391fda`: all jobs SUCCESS: TypeScript/Fastify & local tests, Windows SQLite regression and PostgreSQL migration. PostgreSQL catalog integration suite **7/7 Passed**, including unique SKU, attributes, same-store FK, audited transaction rollback and concurrent revision.
- **IMPORTANT:** Later documentation commits changed PR head; re-fetch actual latest PR #26 head and both CI workflows. Do not claim latest checks pass from the earlier checkpoint.

## Windows owner manual acceptance — NO NEON OPERATIONS

In VS Code PowerShell from repository root:

```powershell
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

Expected: all commands exit 0, API/catalog Node test reports `fail 0`, Drizzle Kit `Everything's fine`. Never force-reset an uncommitted worktree or post `.env`.

Start API separately: `pnpm --filter @smartpos/api dev`, check `Invoke-RestMethod http://127.0.0.1:3001/v1/health` returns `status:ok`. `GET /v1/catalog/products` must return **404 intentional** until real server login/RBAC. No Neon migration or writing real products is needed. Follow exact [acceptance doc](../docs/POS-014_CATALOG_ACCEPTANCE.md).

## Next

1. Verify GitHub PR #26 newest HEAD/CI, diff no secret/lock design violations, then ready for human review (do not auto-merge).
2. Developer reports Windows local tests and health/catalog-404 results. On acceptance merge PR #26; then close POS-014 Issue #25.
3. Continue POS-015 audited stock/inventory, POS-016 sync contract, POS-017 local SQLite catalog; secure real staff auth before enabling API mutation routes and offline POS checkout.
4. POS-003/005/006 M0 governance still outstanding; D-009 local backup encryption, D-013 real auth/keys remain open.

Never connect catalog tests to production or Neon. Never send connection URLs/passwords, customer SQLite files or actual sales in chat/PR.
