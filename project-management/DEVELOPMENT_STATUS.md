# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-05
verified_commit: 644dab2e1f4556f9a1fb02b8875908e5b310ca11
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub linked collaborator can create branches/PRs; no admin authority
last_github_synced_at: MANUAL GITHUB REVIEW 2026-11-05 (not automatic)
current_milestone: M1 (M0 governance remains open)
current_phase: POS-009 NEON DEV CONNECTIVITY IN DRAFT PR #12 — NOT MERGED, REAL DB NOT VERIFIED
ci_status: POS-009 CI PENDING; check PR #12 latest HEAD before merge
production_status: NOT DEPLOYED

## Locked business and technical baseline
- One store, 4–20 staff, one authorized offline cashier; no IMEI in MVP; SKU variant inventory.
- Cash-only, internal receipts; integer VND; immutable paid sales.
- Electron + SQLite local outbox, Fastify API, Neon PostgreSQL server-only and idempotent synchronization.
- PRD, accepted ADRs, architecture, logical database schema and offline sync design unchanged in POS-009.

## Confirmed GitHub main
- [PR #3](https://github.com/dinhkhoiIT15/smartpos/pull/3) merged POS-002/POS-004.
- [PR #5](https://github.com/dinhkhoiIT15/smartpos/pull/5) merged POS-001.
- [PR #8](https://github.com/dinhkhoiIT15/smartpos/pull/8) merged POS-007 desktop demo; user confirmed Windows window opens.
- [PR #10](https://github.com/dinhkhoiIT15/smartpos/pull/10) merged POS-008 Fastify health API as [main commit `644dab2e`](https://github.com/dinhkhoiIT15/smartpos/commit/644dab2e1f4556f9a1fb02b8875908e5b310ca11).
- [POS-008 Issue #9](https://github.com/dinhkhoiIT15/smartpos/issues/9) closed after user confirmed `/v1/health` displays `status: ok` on Windows and CI passed.
- `verified_commit` is last verified **main** SHA, not the POS-009 PR branch HEAD.

## POS-009 proposal (not done)
- [Issue #11](https://github.com/dinhkhoiIT15/smartpos/issues/11), [draft PR #12](https://github.com/dinhkhoiIT15/smartpos/pull/12), branch `feature/POS-009-neon-dev-connectivity`.
- Server-only read-only `db:check` uses `pg`, requires a credentialed Neon PostgreSQL URL with TLS, `SELECT 1 AS ok`, closes client, sanitizes failures.
- Added fake-client tests and local-only `apps/api/.env.example` / [Neon setup guide](../docs/NEON_SETUP.md).
- No Neon credential, project or real remote query has been verified. GitHub Actions must use mocked tests with no secrets.
- No public DB route or direct Electron renderer connection; `/v1/health` stays DB-independent.
- Actual Neon connection requires user to configure a **development** project and run the local command. No production project, data, migration or deployment authorized.

## Remaining M0 governance
- [ ] POS-003 GitHub Issues/Project board import.
- [ ] POS-005 main branch protection reviewed by owner.
- [ ] POS-006 fresh-session handoff exercise against real GitHub HEAD and CI.

## Next steps
1. Generate pinned pnpm 10.20.0 lockfile via GitHub Actions, remove temporary helper workflow, verify latest PR #12 CI and tests.
2. User creates Neon development database and keeps `DATABASE_URL` privately in ignored `apps/api/.env` (do not share URL).
3. User runs `pnpm --filter @smartpos/api db:check`; records success/failure **without credentials**.
4. Only after real dev connectivity evidence and review, merge PR #12 and update main snapshot. Schema migrations belong to POS-012.
