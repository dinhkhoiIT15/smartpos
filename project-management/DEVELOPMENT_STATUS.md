# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-07
verified_commit: 857446310b0b1ba61bb27374fac3c13f3dc94050
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — linked GitHub collaborator may create feature branches/PR, no admin
last_github_synced_at: MANUAL GITHUB REVIEW 2026-11-07
current_milestone: M1 (M0 management/governance tasks remain open)
current_phase: POS-013 ELECTRON LOCAL SQLITE V1 — DRAFT PR #19 — NOT MERGED
ci_status: POS-013 SQLite 6/6 test suite and existing TypeScript/Electron/Fastify checks PASSED at feature checkpoint 9568cc888beaa1788c0452282b01cf5d7a8fe717; CI on latest PR HEAD must be rechecked
production_status: NOT DEPLOYED

## Locked business baseline
- One electronics store, one authorized offline cashier device, cash only, no IMEI; internal receipt is NOT a VAT/tax invoice.
- Integer/bigint VND, immutable paid sale, atomic SQLite sale/items/CASH payment/local stock/outbox event, server idempotency and audit-preserving conflict handling.
- Electron main owns local filesystem/SQLite, renderer only receives narrow validated IPC; Neon connection credentials belong on API only.
- Approved PRD, BUSINESS_RULES, SYSTEM_ARCHITECTURE, DATABASE_SCHEMA and OFFLINE_SYNC_DESIGN unchanged in POS-013.

## Verified main and developer acceptance
- POS-001 PR #5, POS-002/POS-004 PR #3 merged.
- POS-007 Electron demo PR #8 merged; developer confirmed Windows window launched; [Issue #7](https://github.com/dinhkhoiIT15/smartpos/issues/7) remains open pending explicit IPC smoke closure.
- POS-008 Fastify /v1/health PR #10 merged and Windows health response confirmed; Issue #9 closed.
- POS-009 Neon development read-only probe PR #12/#13 merged and user confirmed SELECT 1 succeeded via TLS; Issue #11 closed.
- POS-010 shared contracts and bigint VND PR #15 merged; Issue #14 closed.
- POS-012 PostgreSQL migration PR #17 merged to verified [main SHA `85744631`](https://github.com/dinhkhoiIT15/smartpos/commit/857446310b0b1ba61bb27374fac3c13f3dc94050); Issue #16 closed. Developer reported **17 public tables + one Drizzle history entry** after manually applying migration to a separate Neon development branch, not production. CI PostgreSQL 16 migration 4/4 tests also passed.
- `verified_commit` is the GitHub main SHA observed at session start; feature branch commits have different SHAs.

## POS-013 current implementation (PR #19, not done)
- [Issue #18](https://github.com/dinhkhoiIT15/smartpos/issues/18), [draft PR #19](https://github.com/dinhkhoiIT15/smartpos/pull/19), branch `feature/POS-013-local-sqlite-v1`.
- Uses Node 24 built-in `node:sqlite` in Electron main; **release candidate** stability 1.2. No additional native addon/lockfile update; owner must approve [ADR-0003](../docs/ADR-0003-local-sqlite-driver.md) with real Windows/macOS smoke evidence.
- Embedded versioned migration creates nine SQLite tables (journal, device metadata, SKU cache, inventory server+pending state, sales/items/CASH payments, outbox, cursor) with FK/CHECK, signed INTEGER VND and immutable financial/outbox triggers.
- Local file stored only under Electron `userData`; database is initialized on launch, no query path or DB handle is bridged to React. Existing guarded getAppInfo IPC exposes only `localSchemaVersion`.
- WAL + FULL synchronous, quick_check, schema compatibility guard, transaction helper and WAL-safe snapshot helper. Snapshot backups remain **unencrypted**; encryption/backup policy unresolved before pilot.
- Node24 CI test suite 6/6 passed at checkpoint `9568cc888beaa1788c0452282b01cf5d7a8fe717` (rollback, reopen, money/FK, future/unknown schema, WAL backup). Existing API/Electron checks passed; latest PR HEAD must be rechecked after subsequent docs.
- **NOT verified:** Windows/macOS real Electron runtime after SQLite integration, IPC `SQLite schema v1` button and second launch, production backup encryption/recovery.
- No real sales, auth, sync, SQLite customer data, production Neon changes or deployment.

## Next actions and governance
1. Verify latest PR #19 CI, including file-backed tests and all prior PostgreSQL/Fastify/Electron checks.
2. Developer checks out feature branch; tests Windows Electron startup, IPC schema version, close/reopen persistence without entering real sale data.
3. Review PR and ADR; after CI and human smoke, merge and close POS-013 Issue #18.
4. Then plan POS-011 offline staff/device authorization, POS-014/015 services, POS-017 catalog cache, POS-019 atomic sale path.
5. M0 outstanding: POS-003 GitHub backlog+Project board; POS-005 owner/admin branch protection; POS-006 fresh-session handoff drill. Do not treat stale Markdown snapshots as live GitHub state.
