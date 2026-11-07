# Session Handoff — SmartPOS

## Current session — BUG-013 Windows SQLite test teardown regression (2026-11-07)
- Repository: https://github.com/dinhkhoiIT15/smartpos
- Verified **main HEAD `77f8f79475fca04de2a2a0b9255a2274a39a56a2`**; POS-013 PR #19 was already merged, and [Issue #18](https://github.com/dinhkhoiIT15/smartpos/issues/18) is still OPEN pending full Windows acceptance.
- [BUG-013 Issue #21](https://github.com/dinhkhoiIT15/smartpos/issues/21) and [draft PR #22](https://github.com/dinhkhoiIT15/smartpos/pull/22) from `fix/BUG-013-windows-sqlite-test-cleanup` → main. Do NOT commit directly to main or edit previously merged PR #19.
- User ran `pnpm install --frozen-lockfile` on Windows; it passed at pnpm 10.20.0. An update banner to newer pnpm can be ignored (repo pins 10.20.0).

## Observed Windows failure (from actual user output)
- `pnpm --filter @smartpos/desktop test:local-db`: 6 tests, **3 Passed / 3 Failed**. The three failures were only in test teardown at `rmSync` in `temporaryDatabase(t)`, with Windows EPERM deleting temp DB directories. SQL assertion failures were NOT reported.
- Root cause: fixture registered directory removal in first `t.after()`, then added `db.close()` in later hooks. Windows refuses removal of in-use SQLite/WAL files, while Linux can unlink open files.
- `pnpm --filter @smartpos/desktop dev`: Electron main/preload compiled and startup was logged; user has **not yet confirmed** GUI and IPC button `SQLite schema v1` after close/reopen.

## Fix on PR #22
- `apps/desktop/tests/local-db.test.mjs` helper now tracks each opened `DatabaseSync` instance (including reopened/backup/legacy files), closes only still-open handles on teardown, **then** removes *only* the OS-generated temp test directory with bounded `EPERM`/`EBUSY` retries.
- Removes later close hooks that formerly ran after temp removal. Adds seventh regression test intentionally leaving WAL handle open for fixture teardown and verifying it was closed and the directory removed.
- `.github/workflows/ci.yml`: `windows-latest` job with Node 24 + pnpm 10.20.0, frozen install with scripts disabled, and SQLite test suite. Existing Ubuntu Electron/API and disposable PostgreSQL jobs unchanged.
- No database schema changes, no change to main-owned Electron `userData`, no Neon access, no real sales.

## Verified CI evidence
- Fix checkpoint `5af7861d827911fc20d9f55bf838add13a8603cf`: [Foundation run 42382398206](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42382398206) completed SUCCESS.
- Windows-latest SQLite suite **7 tests PASS, 0 FAIL**, including intentionally open WAL handle. Ubuntu SQLite suite **7 PASS**; existing Fastify, Electron TypeScript/security/build, PostgreSQL v1 migration/constraints jobs all PASS.
- Any later docs/hand-off commits require latest PR HEAD checks before merge.
- Windows local acceptance and Electron GUI/IPC/reopen still NOT VERIFIED.

## What the developer should run next (from repo root on Windows)
```powershell
git status --short
git fetch origin
git switch fix/BUG-013-windows-sqlite-test-cleanup
git pull --ff-only origin fix/BUG-013-windows-sqlite-test-cleanup
pnpm install --frozen-lockfile
pnpm --filter @smartpos/desktop test:local-db
pnpm --filter @smartpos/desktop dev
```
- Expect Node24 **7/7 SQLite tests PASS** with no `EPERM`.
- In the demo window press **Kiểm tra Electron IPC**; expect `DEMO_ONLY • SQLite schema v1`. Close/reopen and confirm again.
- Never delete real Electron userData `*.sqlite` or WAL, do not run Git force reset, and do not share actual database files/connection strings.

## Completion gates / future
1. Re-read AGENTS, DEVELOPMENT_STATUS, this handoff, PR #22 current HEAD and checks.
2. Review/merge bugfix PR only after local Windows smoke; then close BUG-013 #21.
3. Close POS-013 #18 only after runtime Electron IPC/restart proof and driver ADR review.
4. POS-011 device/staff offline authorization [Issue #20](https://github.com/dinhkhoiIT15/smartpos/issues/20) is next; do not build checkout while offline authorization incomplete.
5. M0 POS-003 board, POS-005 branch protection and POS-006 handoff remain open.
