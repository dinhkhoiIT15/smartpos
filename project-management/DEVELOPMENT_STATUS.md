# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-07
verified_commit: beb760097e35ee5a7d39ed1c96f0b2f4f7e7c23b
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub collaborator may create branches/Issues/PRs; no admin rights
last_github_synced_at: MANUAL GITHUB REVIEW 2026-11-07
current_milestone: M2 — local catalog cache
current_phase: POS-017 initial trusted catalog snapshot + SQLite local SKU lookup — feature branch pending CI/owner acceptance
ci_status: POS-017 code checkpoint 5f8231d Foundation CI 42394398241 SUCCESS (Linux/Windows local SQLite 7+6, API/Electron/PostgreSQL), Docs CI 42394398264 SUCCESS; recheck latest HEAD after documentation-only updates
production_status: NOT DEPLOYED — no live auth, checkout, sync route, worker or Neon writes

## Verified accepted milestones and main source of truth

- POS-001/002/004, POS-007/008/009/010 foundation/health/contracts; M0 management board/branch rules remain partially unfinished.
- POS-012 PostgreSQL 17-table v1: migration committed and verified separately on isolated Neon **development** by owner, not production.
- POS-013 SQLite v1 and Windows teardown fix: PRs #19/#22 merged; Node 24 + Electron demo owner-accepted. Existing schema has nine STRICT tables, including local_catalog_variants and sync_cursors.
- POS-011 offline grant/device policy DESIGN merged, with four-hour max grant; **real auth/keys/revocation enforcement not implemented**.
- POS-014 catalog service PR #26 and POS-015 stock transaction PR #28 owner-accepted/merged. Mutating endpoints intentionally not exposed without real authentication.
- POS-016 versioned push/pull Zod contract PR #30 **merged** to main at [`beb760097e35`](https://github.com/dinhkhoiIT15/smartpos/commit/beb760097e35ee5a7d39ed1c96f0b2f4f7e7c23b), confirmed from GitHub commit on 2026-11-07. Only wire schemas/OpenAPI/example fixtures, not real HTTP routes.
- No real sale processing, desktop worker, server sync transaction or production rollout.

## Current POS-017 scope (draft code, not yet accepted)

- [Issue #31](https://github.com/dinhkhoiIT15/smartpos/issues/31), branch `feature/POS-017-local-catalog-cache`, based on merged POS-016 main.
- MAIN-only `apps/desktop/src/main/local-db/catalog-cache.ts` accepts a strictly validated trusted initial snapshot (store UUID, variant IDs, uppercase SKU, attributes, signed-int64 VND string price, revision/cursor, active). Duplicates, overflows and mixed stores reject before writing.
- `applyInitialCatalogSnapshot`: atomic initial catalog rows + `sync_cursors` write via existing SQLite transaction. Identical retry is read-only; divergent/reversed snapshots are denied. Existing sale/payment/outbox and stock pending delta are never overwritten. No SQLite migration.
- `lookupLocalCatalogBySku`: local bounded store-scoped prefix search, exact first, no inactive rows, bigint-safe string output, with initialized cursor prerequisite.
- New disposable Node 24 tests for persistence/reopen, fault rollback, collisions, cross-store, invalid money/cursor, replay, pending evidence preservation. Both Linux and Windows CI configured to run suite.
- No runtime API, network importer, renderer IPC or authentication bypass; real source verification and incremental pull belong to POS-023/D-013.
- Acceptance guide: [POS-017_CATALOG_CACHE_ACCEPTANCE](../docs/POS-017_CATALOG_CACHE_ACCEPTANCE.md).
- **GitHub CI verification:** [Foundation run 42394398241](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42394398241) succeeded on code checkpoint 5f8231d, including cache 6/6 and baseline 7/7 on Linux + Windows, full API/Electron/PostgreSQL. [Docs run 42394398264](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42394398264) succeeded. Owner local Windows acceptance remains pending; verify CI on any subsequent docs-only HEAD before merge. Do not mark Issue/PR Done or merge automatically.

## Next

1. CI passed on 5f8231d; recheck GitHub Actions after documentation-only updates on the final POS-017 PR HEAD.
2. Developer Windows: `pnpm install --frozen-lockfile`, `pnpm --filter @smartpos/desktop typecheck`, `pnpm --filter @smartpos/desktop test:local-db`, `pnpm --filter @smartpos/desktop test:catalog-cache`, `pnpm --filter @smartpos/desktop security:check`, `pnpm --filter @smartpos/desktop build`, `pnpm run check`; optional existing demo window.
3. Owner reviews and merges feature PR only after all acceptance evidence; then close Issue #31.
4. POS-018 next (cash cart UX/calculator), POS-019 offline sale/outbox; POS-021/022/023 real authenticated sync + reconcile. D-013 and D-009 security/backups remain OPEN. No Neon/production writes for POS-017.
