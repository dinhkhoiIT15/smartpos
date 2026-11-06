# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-06
verified_commit: c16382008b17eb18fdeaa2d2eb90b1eec1a8b595
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — linked collaborator with branch/PR access, not admin
last_github_synced_at: MANUAL REVIEW 2026-11-06
current_milestone: M1 (M0 governance items remain open)
current_phase: POS-012 POSTGRESQL V1 SCHEMA + MIGRATION IN DRAFT PR #17 — NOT MERGED
ci_status: POS-012 PostgreSQL 16 migration job successful on branch checkpoint 00a985cfddea6ad61630a85762d68fb0a5d59c26; recheck all CI against latest PR head
production_status: NOT DEPLOYED

## Verified main
- POS-001 (PR #5), POS-002/POS-004 (PR #3) merged.
- POS-007 Electron (PR #8) merged; Windows application window launched per developer.
- POS-008 Fastify health (PR #10) merged; Windows /v1/health returned status ok.
- POS-009 Neon dev-only read probe (PR #12 + fix PR #13) merged; developer confirmed `SELECT 1 succeeded (TLS connection)`, issue #11 closed. **No schema migration was run on Neon.**
- [POS-010 PR #15](https://github.com/dinhkhoiIT15/smartpos/pull/15) merged into main SHA [`c16382008b17`](https://github.com/dinhkhoiIT15/smartpos/commit/c16382008b17eb18fdeaa2d2eb90b1eec1a8b595); Issue #14 closed. Zod decimal-string money and bigint domain tests passed.
- `verified_commit` is the inspected main commit, **not** the POS-012 branch head.

## Current POS-012 feature (not Done)
- [POS-012 Issue #16](https://github.com/dinhkhoiIT15/smartpos/issues/16); [draft PR #17](https://github.com/dinhkhoiIT15/smartpos/pull/17) on `feature/POS-012-postgres-migration-v1`, not merged.
- Drizzle ORM v0.45.4 / Kit v0.31.11, code-first 17 PostgreSQL tables matching the locked schema baseline, checked-in initial SQL, migration snapshot + journal.
- Enforced PK/FK, same-store constraints, partial unique index on active offline device, unique SKU, nonnegative VND, line-level amount consistency, cash-only payment/change consistency. Immutable/append-only triggers protect posted sale history and financial audit rows.
- Script `migrate:dev` requires explicit confirmation and reads only ignored local API `.env`; **not executed on Neon**. No production credentials, migrations, or data used.
- CI on branch checkpoint `00a985cfddea6ad61630a85762d68fb0a5d59c26`: disposable PostgreSQL 16 successfully created 17 tables, reapplied migration idempotently, enforced main constraints; 4/4 Node tests successful. Additional test/doc commits require fresh CI evidence.
- Manual Neon development migration remains pending explicit human review and approval. No real sale or inventory data created.

## Open boundaries and work
- PostgreSQL is central database only; SQLite local migration (POS-013), domain services, receipt posting and sync remain future issues.
- Matching sum of all sale items to sale total, current cashier authorization and negative-stock reconciliation still require transactional API services; bare schema does not guarantee those application invariants.
- M0 governance remains: POS-003 GitHub board/backlog, POS-005 branch protection by owner/admin, POS-006 handoff drill.

## Next actions
1. Re-fetch latest PR #17 HEAD and verify frozen pnpm CI + PostgreSQL migration tests and docs checks.
2. Review generated SQL, its custom history guards and the [forward-fix plan](../packages/db/README.md); get peer/owner approval.
3. Only after explicit user approval and selection of disposable Neon development branch, developer may run guarded migration CLI locally, then verify table list and migration log.
4. Do **not** run production migration or infer Neon DDL was executed from CI. Update main SHA/handoff after merge.
