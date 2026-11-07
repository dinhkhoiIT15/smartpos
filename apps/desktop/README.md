# SmartPOS Desktop — Secure Electron shell + SQLite v1 (POS-013)

**Status:** Development-only demo with a real **empty** SQLite database in the Electron main process. **No actual sales, staff authorization, catalog sync, receipts or checkout**.

## Run on Windows / macOS

Node 24.x and pnpm 10.20.0. From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop test:local-db
pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop build
pnpm --filter @smartpos/desktop dev
```

Expected: an Electron window with the **DEMO — CHƯA THỂ BÁN HÀNG** banner, plus a status card **SQLite v1**. Click **Kiểm tra Electron IPC**. The read-only result should contain `DEMO_ONLY • SQLite schema v1`. No SQL queries, file paths, user/customer data or secrets are sent to the React renderer.

Close the window and re-run `pnpm --filter @smartpos/desktop dev`. The app should reopen using the existing local DB schema. Reopening a DB must not create a second migration journal entry or delete old data.

If a real app window does not open, stop and share sanitized logs. On Windows, a previously encountered missing Electron binary can often be resolved with `pnpm --filter @smartpos/desktop rebuild electron`; do not disable Electron sandbox or context isolation.

## Windows test EPERM fix (BUG-013)

On the original POS-013 merged PR #19, Windows could report **3/6 SQLite tests passing** and three `EPERM: Permission denied` failures at `rmSync` during test teardown. This was caused by deleting temporary SQLite/WAL files before calling `DatabaseSync.close()`, **not** by failing SQL assertions or a production database.

[Bugfix PR #22](https://github.com/dinhkhoiIT15/smartpos/pull/22) tracks temporary DB connections and closes them first. It adds a seventh teardown regression test and a **Windows Node 24 CI** job. To verify locally after switching to that branch:

```powershell
pnpm --filter @smartpos/desktop test:local-db
```

Expected: `tests 7`, `pass 7`, `fail 0`. If Windows still reports `EPERM`, share only sanitized test output; do not delete the Electron userData database or run an Administrator shell as a workaround.

The root workspace pins `pnpm@10.20.0`. Ignore a normal `pnpm self-update` announcement while testing this branch; do not change package manager major versions for the bugfix.

## Where SQLite lives

In Electron main, `app.getPath('userData')/smartpos-local.sqlite` (per-user OS application data). The directory location is owned by Electron; it is **not** `apps/desktop` and **not** the working Git directory. Do not paste a database backup or real customer data into GitHub/chat. Do not rename/delete this file, and **never** manually copy an actively open WAL database while omitting its `-wal` and `-shm` files.

For a fully consistent snapshot when the database is open, use the main-only `backupLocalDatabase()` helper in code (Node `sqlite.backup`). Its output is **NOT encrypted** and must not be treated as approved production backup; encryption, retention, off-machine copies and recovery tests are pending POS-027/POS-029.

## Design and tests

- `src/main/local-db/migrations.ts`: embedded, versioned SQLite v1 SQL; nine STRICT tables including the schema journal, device identity metadata, cached SKU variants, inventory server snapshot + pending delta, immutable local sale/items/CASH payment, outbox events and sync cursor. The SQL is bundled into Electron main; no runtime file path inside an ASAR.
- `src/main/local-db/index.ts`: absolute-path opener, WAL + FULL synchronous + FK + trusted-schema off, integrity check, fail-closed migrations, `BEGIN IMMEDIATE` transaction wrapper and WAL-consistent backup API.
- `src/main/index.ts`: owns the database file/handle in Electron MAIN. A failure to open it prevents the demo window from opening; it never deletes/copies the old database as a repair shortcut.
- `src/preload/index.ts`: existing single `getAppInfo()` IPC method returns only the numeric `localSchemaVersion`, never SQLite handles or paths. The renderer cannot execute SQL.
- `tests/local-db.test.mjs`: real Node 24 file-backed tests for migration repeatability, unknown/future-schema refusal, rollback/fault injection, persisted sale/items/payment/stock/outbox, constraints and backup.

```powershell
pnpm --filter @smartpos/desktop test:local-db
```

Expected after CI verification: all tests pass with 0 failures. The tests use temporary OS directories; they **never** point at Neon or the developer's Electron `userData`. Any example checkout rows exist only in temporary test databases.

## Scope / security boundaries

The schema and transaction primitive lay groundwork for POS-017/POS-019. They do **not** validate a cashier session (POS-011), implement real checkout/stock deduction (POS-018/019), network sync (POS-021/022/023) or completed backup/recovery (POS-027/029). Business policy remains one authorized offline cashier, cash only, money in signed 64-bit integer VND, no IMEI, paid sale snapshots immutable.

`node:sqlite` in Node 24 is stability **1.2 / release candidate**. Re-test on pinned Electron/Node, and require a Windows/macOS manual launch before merging. See [ADR-0003](../../docs/ADR-0003-local-sqlite-driver.md) for alternatives and risks.
