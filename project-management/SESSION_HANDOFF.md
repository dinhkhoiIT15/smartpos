# Session Handoff — SmartPOS

## POS-013 local SQLite v1 — 2026-11-07
- Repo: https://github.com/dinhkhoiIT15/smartpos
- Inspected main HEAD: `857446310b0b1ba61bb27374fac3c13f3dc94050` (POS-012 [PR #17](https://github.com/dinhkhoiIT15/smartpos/pull/17) merged, Issue #16 closed).
- Developer reported manual Neon **development** migration created the expected 17 public tables and one Drizzle migration history entry. **Do not** rerun initial migration automatically and never use the production branch.
- Current [POS-013 Issue #18](https://github.com/dinhkhoiIT15/smartpos/issues/18); feature branch `feature/POS-013-local-sqlite-v1`; [draft PR #19](https://github.com/dinhkhoiIT15/smartpos/pull/19) UNMERGED.
- `verified_commit` in status is main SHA, not current feature SHA. Re-fetch PR HEAD and CI.

## Changes on feature branch
- `apps/desktop/src/main/local-db/migrations.ts`: embedded SQLite version 1 SQL with 9 STRICT tables and cash/outbox immutability triggers.
- `apps/desktop/src/main/local-db/index.ts`: Node24 `node:sqlite` DatabaseSync; WAL + FULL synchronous + foreign keys + quick_check; absolute-path userData opener, atomic/repeatable migration guard, `BEGIN IMMEDIATE` helper, WAL-consistent `backup()`. Never deletes files on migration failure.
- `apps/desktop/src/main/local-db/package.json`: nested ESM scope for Node24 native TypeScript tests; outer desktop is still CJS for Electron.
- `apps/desktop/src/main/index.ts`: creates DB in Electron `app.getPath('userData')` on app startup; fail-closed if cannot open; closes on quit; guarded IPC returns schema number only.
- `apps/desktop/src/preload/index.ts`, renderer bridge types/UI: read-only SQLite schema v1 displayed on IPC button; no raw SQL/database files/credentials in React.
- `apps/desktop/tests/local-db.test.mjs`: six file-backed Node24 tests: atomic migration+reopen, rollback/fault injection, durable local sale/items/CASH+outbox rows, FK/UNIQUE/large VND checks, corrupt/legacy/future schema rejection, online backup+reopen.
- `.github/workflows/ci.yml`: invokes `pnpm --filter @smartpos/desktop test:local-db` after desktop build; keeps API/Postgres tests.
- `docs/ADR-0003-local-sqlite-driver.md`: PROPOSED Node24 built-in SQLite decision (stability 1.2 release candidate, no ABI add-on), pending owner review; encryption/retention/restore are not approved.
- `docs/LOCAL_BACKUP_RECOVERY.md`, Desktop README, root README, decisions/status/TODO/handoff updated.

## Verified evidence
- GitHub [run 42267248980](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42267248980) on checkpoint `9568cc888beaa1788c0452282b01cf5d7a8fe717`: Node24 **6/6 SQLite tests PASS**, TypeScript, Electron security/build, Fastify API tests and Zod VND domain tests PASS; PostgreSQL job was in progress when first checked. Check aggregate completion and latest PR #19 HEAD after doc commits.
- Local Mac/Windows actual Electron launch after POS-013 change **not yet tested**. Owner should validate schema v1 IPC and close/reopen with same DB; no test sale data from UI.

## Windows owner smoke instructions (from repo root)
```powershell
git fetch origin
git switch feature/POS-013-local-sqlite-v1
git pull --ff-only origin feature/POS-013-local-sqlite-v1
pnpm install --frozen-lockfile
pnpm --filter @smartpos/desktop test:local-db
pnpm --filter @smartpos/desktop dev
```
Click `Kiểm tra Electron IPC`. Expect `DEMO_ONLY • SQLite schema v1`. Close and restart Electron and verify result again. If Electron binary missing, use `pnpm --filter @smartpos/desktop rebuild electron` (no sandbox disabling). Never remove/copy the active userData SQLite/WAL file or post it to chat.

## Next steps
1. Read AGENTS, DEVELOP_STATUS, this handoff and ADR-0003; confirm actual main SHA, PR #19 HEAD, CI jobs and no secrets.
2. Address PR CI failures on feature branch; do not claim full PASS from stale run.
3. Request Windows GUI IPC smoke, then review/merge PR and close Issue #18. A PR merge alone is not proof the local DB worked on Windows.
4. Prepare POS-011 security/device grant design before any real POS offline sale; POS-017 catalog cache and POS-019 atomic checkout depend on POS-013.
5. Governance M0 backlog+board, branch protection, handoff still open; issue #7 POS-007 also open despite merged PR #8, review its IPC acceptance before closing.
6. Never apply Neon migrations/deploy production as part of POS-013.

## Handoff review fields
- Main SHA and PR HEAD:
- CI URL / Node24 SQLite tests / Windows GUI:
- SQLite userData schema migration and backup risk:
- Next issue and blockers:
