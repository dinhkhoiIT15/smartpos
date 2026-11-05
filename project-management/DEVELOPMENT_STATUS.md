# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-05
verified_commit: 3e8a366ee1687687dc96f165ff5a5ea829139ad9
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub linked collaborator, branch/PR access; not admin
last_github_synced_at: MANUAL REVIEW 2026-11-05 (not automatic)
current_milestone: M1 (M0 governance tasks still outstanding)
current_phase: POS-008 FASTIFY HEALTH API IN DRAFT PR #10 — NOT MERGED
ci_status: POS-008 PR CI PASSED on reviewed feature checkpoint be5c2ae31e606915dc6770e0ac1045bddd0388f6; check latest HEAD after handoff edits
production_status: NOT DEPLOYED

## Baseline (unchanged)
- 1 electronics/phone store, 4–20 employees, one authorized offline cashier.
- SKU/variant inventory without IMEI in MVP; VND integer money; cash-only internal receipts.
- Electron + SQLite local sales/outbox; Fastify backend, Neon PostgreSQL cloud; idempotent synchronization and preservation of paid sales.
- Approved PRD, ADRs, architecture, database model and offline sync policy have not changed.

## Verified GitHub main
- [PR #3](https://github.com/dinhkhoiIT15/smartpos/pull/3) merged (POS-002/POS-004).
- [PR #5](https://github.com/dinhkhoiIT15/smartpos/pull/5) merged (POS-001).
- [PR #8](https://github.com/dinhkhoiIT15/smartpos/pull/8) merged at [main `3e8a366ee168`](https://github.com/dinhkhoiIT15/smartpos/commit/3e8a366ee1687687dc96f165ff5a5ea829139ad9), adding Electron/React demo.
- User reported the Electron window opened on Windows after repairing local Electron binary installation; **IPC button response not independently reported**.
- `verified_commit` refers to inspected `main`, not the unmerged POS-008 feature head.

## POS-008 feature proposal — under review
- [Issue #9](https://github.com/dinhkhoiIT15/smartpos/issues/9) — Fastify API with health endpoint.
- [Draft PR #10](https://github.com/dinhkhoiIT15/smartpos/pull/10), branch `feature/POS-008-fastify-health` → `main` (**not merged**).
- API factory and `GET /v1/health` return only `{status:"ok",service:"smartpos-api"}` with no-store; no credentials or DB claim.
- Node/tsx development entrypoint listens on `127.0.0.1:3001` by default; port validation prevents unsafe values.
- Node test runner + Fastify.inject tests; TypeScript build, dev/start scripts and GitHub CI checks proposed.
- Pinned dependency lockfile regeneration through temporary CI workflow; must be reviewed and the temporary workflow removed before merge.
- GitHub CI [run 42061832917](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42061832917) succeeded at feature checkpoint `be5c2ae31e606915dc6770e0ac1045bddd0388f6`: frozen pnpm install, workspace/TypeScript checks, desktop security/build, Fastify TypeScript build and **3/3 API tests**.
- Docs validation [run 42061832890](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42061832890) also succeeded at the same checkpoint.
- Subsequent handoff commits need latest CI recheck. Do NOT mark POS-008 done until Windows health smoke is confirmed, review and merge complete.

## M0 remaining
- [ ] POS-003 GitHub backlog import and Project board.
- [ ] POS-005 owner reviews main branch rules/protection.
- [ ] POS-006 verifies issue/CI/handoff consistency in a fresh session.

## Out-of-scope and safety
- No Neon project connection or Drizzle/PostgreSQL migrations (POS-009/POS-012).
- No SQLite local database, auth, real catalog, stock, cash checkout or sync.
- Fastify health measures API liveness only; never imply cloud readiness.
- No production deployment, fiscal invoice or actual sales.

## Next
1. Lockfile regenerated with pinned pnpm 10.20.0 on GitHub Actions and temporary workflow removed (completed).
2. Recheck passing CI against latest PR #10 HEAD after documentation updates.
3. Ask user to run PowerShell `Invoke-RestMethod http://127.0.0.1:3001/v1/health` from Windows.
4. Review/merge #10 after evidence; re-read main HEAD and update status/handoff.
