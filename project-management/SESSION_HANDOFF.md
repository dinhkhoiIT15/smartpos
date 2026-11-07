# Session Handoff — SmartPOS

## POS-015 Inventory movements and balances (2026-11-07)
- Repo: https://github.com/dinhkhoiIT15/smartpos
- Verified main: `55659902b89e62a542cb5bb6b62a2c61ad3215e0` — POS-014 [PR #26](https://github.com/dinhkhoiIT15/smartpos/pull/26) was MERGED, developer reported Windows full PASS; [Issue #25](https://github.com/dinhkhoiIT15/smartpos/issues/25) CLOSED. POS-011 policy approved but real staff authorization remains unimplemented.
- Current [POS-015 Issue #27](https://github.com/dinhkhoiIT15/smartpos/issues/27), [draft PR #28](https://github.com/dinhkhoiIT15/smartpos/pull/28), branch `feature/POS-015-inventory-transactions`; UNMERGED, owner acceptance PENDING. `verified_commit` in status is main SHA, not PR head.
- POS-012 PostgreSQL 17 tables were applied manually by owner to **Neon development** only. POS-015 made NO schema migrations, Neon queries or writes. DO NOT run any Neon migration for this issue.

## Implementation on PR #28
- `apps/api/src/inventory/schemas.ts`: strict UUID movement idempotency key/variant ID, signed BIGINT qty delta as canonical JSON string, required reason, `RECEIPT` (+), `ISSUE` (-), `CORRECTION` (signed nonzero), safe invalid input.
- `apps/api/src/inventory/service.ts`: `getBalance`, `listMovements`, `adjust`. Requires valid server-trusted principal and **active PostgreSQL store membership with exactly matching role**. MANAGER/ADMIN only adjust; CASHIER read only. Adjustment transaction takes membership share lock (prevents concurrent revoke racing with completed write); no untrusted request role/store.
- Mutation transaction: 1) verify current DB membership, 2) detect previous event id, 3) verify active variant belongs to store, 4) insert movement with unique `movementId`, 5) bootstrap missing zero balance, 6) additive conditional balance+revision update, 7) append reason/actor `audit_logs`. Entire transaction rollback on any failure. Replay of exact same UUID/payload/actor/reason returns `REPLAYED`; divergent reuse rejects. Both movement and audit tables use existing POS-012 append-only triggers.
- Manual adjustments forbid final negative qty or signed bigint overflow; POS-021 exceptional negative stock from paid offline-sale conflict remains OUT OF SCOPE.
- `apps/api/src/inventory/routes.ts` opt-in only with externally authenticated principal. Normal Fastify main.ts **does not register** catalog or inventory routes; intentional inventory 404 until real auth, no public writes. DB never accessed from React renderer.
- `apps/api/src/inventory/schemas.test.ts`, `routes.test.ts`, `inventory.pg.test.ts` test strict input, default-deny HTTP, 0/negative/overflow, wrong store, revoked membership, idempotent retry/race, concurrent first balance creation, concurrent distinct receipts, simultaneous oversell, revision overflow, audit failure atomic rollback and append-only history.
- CI uses existing disposable PostgreSQL 16 `127.0.0.1/smartpos_ci` after POS-012 migration and POS-014 catalog CI. SQLite Windows CI still separate.
- `docs/POS-015_INVENTORY_ACCEPTANCE.md` has safe Windows commands; READMEs/status/traceability/TODO updated.

## CI evidence and regression
- First POS-015 CI run [42390365155](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42390365155) failed ONLY one incorrect test expectation: forged CASHIER principal attempted a read while actual database membership was MANAGER, service correctly denied FORBIDDEN, test expected NOT_FOUND. Fixed test to assert forged role is denied and genuine DB-assigned CASHIER can read own store but not adjust.
- Corrected integration tests succeeded in later [Foundation CI 42390505336](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42390505336), including PostgreSQL mutation/concurrency/audit, existing Fastify/TypeScript/Electron/Windows SQLite jobs. Additional new tests/README/status commits require verifying **latest PR HEAD CI** before final report.
- No changes to locked docs/PRD, Drizzle SQL/schema, real .env or production Neon.

## Windows manual acceptance (no local PostgreSQL required)
```powershell
cd C:\Users\dinhk\Desktop\smartpos
git status --short
git fetch origin
git switch feature/POS-015-inventory-transactions
git pull --ff-only origin feature/POS-015-inventory-transactions
pnpm install --frozen-lockfile
pnpm --filter @smartpos/api typecheck
pnpm --filter @smartpos/api test:inventory
pnpm --filter @smartpos/api test
pnpm --filter @smartpos/db schema:check
```
Expect all exit 0, Node test suites `fail 0`, Drizzle `Everything's fine`. In another terminal run `pnpm --filter @smartpos/api dev`; `Invoke-RestMethod http://127.0.0.1:3001/v1/health` returns `status=ok`, inventory GET returns 404 intentionally. Read [acceptance guide](../docs/POS-015_INVENTORY_ACCEPTANCE.md).
- Do not run `migrate:dev`, `test:inventory:pg` pointing at Neon, direct SQL inserts/updates or seed real business inventory. PostgreSQL tests are proven only through isolated CI service.
- Never delete local SQLite database or share credentials/connection strings in chat.

## Next
1. Re-fetch PR #28 HEAD and CI all jobs, inspect diff/changes and no secrets, then document pass.
2. Developer runs Windows smoke and reports pass; only then human reviews/merges PR and closes Issue #27.
3. Backlog next POS-016 versioned sync contract and POS-017 local catalog cache; real staff authentication/RBAC and key storage (D-013/R-005) required before enabling catalog/inventory routes or cash checkout.
4. M0 POS-003, POS-005, POS-006 still pending. D-009 encrypted backup/restore unresolved.
