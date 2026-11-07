# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-07
verified_commit: 9be30b9f6a1a865fae79a3e8a321fe839b6d529a
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — linked GitHub collaborator; feature branches/PRs allowed, not admin
last_github_synced_at: GITHUB VERIFIED 2026-11-07
current_milestone: M2 (catalog services; M0 governance still incomplete)
current_phase: POS-014 CATALOG AND VARIANT SERVICE — DRAFT PR #26, UNMERGED
ci_status: POS-014 disposable PostgreSQL 16 integration tests 7/7 PASSED on feature checkpoint ac5ca5022fcf147e835b8a9b03f120cfd5391fda; latest docs PR head CI must be checked
production_status: NOT DEPLOYED — NO CUSTOMER SALE/INVENTORY DATA

## Verified main and user-approved milestones
- POS-001 Node/pnpm monorepo (PR #5), POS-002/004 docs/CI (PR #3), POS-007 Electron demo (PR #8) merged.
- POS-008 Fastify health (PR #10), POS-009 server-only Neon DEV read-only probe (PRs #12/#13), POS-010 Zod/bigint VND (PR #15) merged.
- POS-012 17-table PostgreSQL migration PR #17 merged; developer reported 17 tables + one Drizzle migration-history row on **Neon development**, never production.
- POS-013 SQLite local migration PR #19 + Windows `EPERM` cleanup PR #22 merged; developer reported real Windows test and GUI/reopen acceptance, Issues #18/#21 closed.
- POS-011 design [PR #23](https://github.com/dinhkhoiIT15/smartpos/pull/23) + owner-approved four-hour signed-offline-grant policy [PR #24](https://github.com/dinhkhoiIT15/smartpos/pull/24) **MERGED** at [verified main `9be30b9f6a1a`](https://github.com/dinhkhoiIT15/smartpos/commit/9be30b9f6a1a865fae79a3e8a321fe839b6d529a). Issue #20 CLOSED design only. D-010 ACCEPTED, D-013 OS-key/clock/login implementation details remain OPEN, risk R-005 HIGH OPEN.
- `verified_commit` above is the latest reviewed `main` SHA, **not** POS-014 feature/CI SHA.

## POS-014 service in review — NO PUBLIC CATALOG MUTATIONS
- [Issue #25](https://github.com/dinhkhoiIT15/smartpos/issues/25), [draft PR #26](https://github.com/dinhkhoiIT15/smartpos/pull/26), branch `feature/POS-014-catalog-variants-api`.
- `apps/api/src/catalog/schemas.ts`: strict Zod payloads, uppercase canonical SKU, normalized attributes and stable key digest, JSON money canonical nonnegative signed 64-bit decimal string.
- `apps/api/src/catalog/service.ts`: store-scoped PostgreSQL CRUD-like create/update/get/list for categories, brands, products and variants; soft deactivate instead of deleting; optimistic `revision` to avoid concurrent lost price updates; every mutation creates `catalog_change_log` plus `audit_logs` within the SAME transaction; sanitizes PostgreSQL error codes.
- `apps/api/src/catalog/routes.ts`: explicitly registered only with **trusted** principal resolver. ADMIN/MANAGER may mutate, CASHIER read only, client-supplied roles/store ignored. **Normal `buildServer({logger:true})` exposes health only**; catalog routes deliberately 404 without real auth.
- SQLite demo, POS-013 schema, PostgreSQL migration v1, Neon URL/secret management unchanged. No API catalog writes enabled for developer/production; no Neon activity by catalog CI.
- `apps/api/src/catalog/{schemas.test.ts,routes.test.ts,catalog.pg.test.ts}`: strict validation/role/default deny and disposable PostgreSQL integration, negative unique SKU/variant, cross-store FK, rollback and concurrent updates.
- CI on POS-014 branch has dedicated PostgreSQL 16 ephemeral service: apply existing migration first, then catalog integration test. Developer Windows acceptance uses API typecheck, `test:catalog`, full API `test`, Drizzle schema:check and health/intentional catalog-404 smoke.
- [Acceptance checklist](../docs/POS-014_CATALOG_ACCEPTANCE.md). Do not point `test:catalog:pg` at Neon: code checks `127.0.0.1/smartpos_ci`.
- POS-014 NOT DONE until latest CI, owner Windows smoke, review and merge.

## Future gates
1. Verify latest PR #26 head/CI and ensure no .env, secrets, migrations or locked policy modifications.
2. Owner tests local Windows commands from feature branch, reports pass and healthy API. Keep PR unmerged until reviewed/accepted.
3. After acceptance, merge PR #26 then close Issue #25; no changes on Neon required for this service-only issue.
4. POS-015 inventory movements/audit, POS-016 sync contract, POS-017 SQLite catalog cache follow. Real staff login and D-013 security implementation MUST precede any real checkout or deployment of catalog write routes.
5. M0 POS-003 GitHub backlog board, POS-005 branch protection, POS-006 handoff drill remain outstanding. D-009 local backup encryption/restore policy still OPEN.
