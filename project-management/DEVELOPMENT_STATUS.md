# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-07
verified_commit: 77f8f79475fca04de2a2a0b9255a2274a39a56a2
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — linked collaborator, feature branches and PR access; not admin
last_github_synced_at: MANUAL GITHUB REVIEW 2026-11-07
current_milestone: M1 (M0 governance tasks still outstanding)
current_phase: POS-013 MERGED BUT WINDOWS SMOKE EXPOSED TEMP CLEANUP BUG — FIX PR #22 DRAFT, UNMERGED
ci_status: BUG-013 Windows+Ubuntu+PostgreSQL CI PASSED at fix branch checkpoint 5af7861d827911fc20d9f55bf838add13a8603cf; recheck after docs commits
production_status: NOT DEPLOYED

## Locked scope
- One electronics store, one authorized offline cashier device, cash-only internal receipts, no IMEI; bigint VND.
- Immutable paid sales, atomic local SQLite cash sale/stock/outbox future requirement, Neon API-only DB credentials; never renderer direct SQL.
- Approved PRD, rules, architecture, logical schema and offline sync design unchanged.

## Verified main
- POS-001 (PR #5), POS-002/004 (PR #3), POS-007 Electron demo (PR #8), POS-008 Fastify health (PR #10) merged.
- POS-009 Neon dev SELECT 1 TLS verified by user; PR #12/#13 merged.
- POS-010 Zod contracts/bigint domain PR #15 merged.
- POS-012 PostgreSQL schema PR #17 merged; developer confirmed 17 SmartPOS tables + migration journal in **Neon development**, not production.
- [POS-013 PR #19](https://github.com/dinhkhoiIT15/smartpos/pull/19) **MERGED** as [main `77f8f79475fc`](https://github.com/dinhkhoiIT15/smartpos/commit/77f8f79475fca04de2a2a0b9255a2274a39a56a2), but [POS-013 Issue #18](https://github.com/dinhkhoiIT15/smartpos/issues/18) still OPEN pending Windows GUI IPC/reopen verification and bug fix.
- `verified_commit` is last verified main SHA, not fix PR head.

## Windows regression and fix
- User's Windows `pnpm install --frozen-lockfile` PASSED with pnpm 10.20.0.
- User's `pnpm --filter @smartpos/desktop test:local-db`: **3/6 Passed; 3/6 Failed solely with `EPERM Permission denied` at `rmSync` of OS-generated temp DB directories**, because test registered directory cleanup before later SQLite connection-close hooks. No assertion establishing data corruption failed.
- User's `pnpm --filter @smartpos/desktop dev` built Electron main/preload and started Vite/electron processes; actual window + IPC result still **NOT REPORTED**.
- [BUG-013 Issue #21](https://github.com/dinhkhoiIT15/smartpos/issues/21), [draft PR #22](https://github.com/dinhkhoiIT15/smartpos/pull/22), branch `fix/BUG-013-windows-sqlite-test-cleanup`: tracks all Node `DatabaseSync` handles, closes open handles before removing temporary folders, bounded retry for Windows filesystem races, a regression test leaving one WAL handle open, plus Windows-latest Node 24 CI job.
- GitHub [Foundation CI run 42382398206](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42382398206) SUCCEEDED: **Windows SQLite tests 7/7 Passed**, Ubuntu SQLite tests 7/7 Passed, existing Electron/Fastify/TypeScript checks and disposable PostgreSQL migration tests successful.
- New documentation commits need latest HEAD CI verification; bugfix remains unmerged pending owner's Windows rerun.
- No approved SQLite production backup encryption/restore process; Node `node:sqlite` release candidate driver remains development use pending owner ADR review.

## Immediate acceptance
1. Confirm latest [PR #22](https://github.com/dinhkhoiIT15/smartpos/pull/22) HEAD CI and review changes; no SQLite schema/Neon changes.
2. Developer checks out fix branch, runs `pnpm --filter @smartpos/desktop test:local-db` on Windows; expect 7/7 Passed, 0 Failed.
3. Developer opens Electron demo, checks `DEMO_ONLY • SQLite schema v1` via IPC, closes/reopens and verifies again. No real sales or credentials.
4. After review, merge bugfix PR #22, close Issue #21. Only close POS-013 Issue #18 after real Windows GUI acceptance.
5. Then continue POS-011 device/staff offline authorization [Issue #20](https://github.com/dinhkhoiIT15/smartpos/issues/20). M0 governance POS-003/POS-005/POS-006 still not complete.
