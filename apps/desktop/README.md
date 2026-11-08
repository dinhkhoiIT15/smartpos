# SmartPOS Desktop — Secure Electron shell + SQLite v1 (POS-013)

**Status:** Development-only Electron demo with SQLite v1 and merged POS-017 cache/POS-018 cart/POS-019 MAIN-only atomic cash sale core. POS-020 adds a **sample watermarked internal receipt print preview** and a separately verified **MAIN-only persisted receipt read model**. No authenticated catalog sync, real paid checkout, staff authorization, genuine receipt issuance or production sale.

## Run on Windows / macOS

Node 24.x and pnpm 10.20.0. From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop test:local-db
pnpm --filter @smartpos/desktop test:catalog-cache
pnpm --filter @smartpos/desktop test:offline-sale
pnpm --filter @smartpos/desktop test:offline-sale:wire
pnpm --filter @smartpos/desktop test:receipt-db
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

## POS-017 local catalog cache — not a live sync endpoint

The new `src/main/local-db/catalog-cache.ts` validates an externally authenticated **future** initial snapshot and atomically persists `local_catalog_variants` plus `sync_cursors` using the existing v1 tables. It provides MAIN-only local SKU lookup, cursor read and idempotent initial import. No network endpoint, fake token, IPC mutation, production userData fixture or new migration is added. POS-023/D-013 will need to provide authorized catalog projection and incremental delta application. Run `pnpm --filter @smartpos/desktop test:catalog-cache` on Windows to verify six disposable file-backed tests. See [POS-017 acceptance](../../docs/POS-017_CATALOG_CACHE_ACCEPTANCE.md).

## POS-018 demo cart (no sale writes)

Use the new sidebar item **Giỏ hàng & tiền mặt (demo)** to test adding a fixed sample SKU, quantity, remove, cash entry and change. The UI uses `@smartpos/domain/cart` pure bigint operations; sample prices and stocks are **not read from real catalog or written into SQLite**. No real payment completion/receipt is implemented. Demo state resets when app is closed. See [POS-018 Windows acceptance guide](../../docs/POS-018_CASH_CART_ACCEPTANCE.md), including 9.340.000 VND total and 160.000 VND change tests.

## POS-019 internal atomic sale/outbox — no live checkout

`src/main/local-db/offline-sale.ts` provides `commitLocalCashSale` only for a **future trusted MAIN-only orchestrator**, not `window.smartpos`. It revalidates catalog snapshot and stock inside `BEGIN IMMEDIATE`, persists sale/items/CASH/payment/pending stock delta/outbox v1 event atomically, and returns idempotent replay results for exact requests; outbox payload hash matches the POS-016 shared contract. Tests use OS temporary database files only, never the actual `userData` database.

```powershell
pnpm --filter @smartpos/desktop test:offline-sale
pnpm --filter @smartpos/desktop test:offline-sale:wire
```

A SQLite device ID row is not a signed grant; **D-013 real offline authorization remains unimplemented**. Do not expose the internal function as a new renderer IPC, add a chốt đơn button or claim payment success before identity+device+cashier grant verification and owner approval. See [POS-019 Windows acceptance and security boundary](../../docs/POS-019_OFFLINE_SALE_ACCEPTANCE.md).

## POS-020 internal receipt, demo print and saved evidence isolation

`src/main/local-db/receipt.ts` reads (no writes) an authorized-in-the-future sale's immutable local sale/items/CASH payment/outbox by store and sale ID, verifying all snapshots, exact bigint amounts and POS-016 canonical SHA-256 outbox integrity; then a pure `@smartpos/domain/receipt` formatter can render its model with Vietnam time and honest local sync status. **No current Electron runtime IPC or UI exposes this persisted read path**, since D-013 real offline grant and cashier/device authorization are unimplemented.

The only UI receipt is made from the explicitly synthetic POS-018 in-memory demo cart, and has a mandatory **MẪU — KHÔNG CÓ GIAO DỊCH** watermark (including in print) plus **KHÔNG PHẢI HÓA ĐƠN THUẾ**. Press **Xem / in phiếu MẪU** only after entering sufficient demo cash. `window.print()` opens the Windows OS print dialog; cancel after checking the printed sample watermark. The app does not create a new sale, issue an official tax invoice, modify SQLite, or acknowledge Neon sync.

```powershell
pnpm --filter @smartpos/domain test
pnpm --filter @smartpos/desktop test:receipt-db
```

See [POS-020 Windows acceptance](../../docs/POS-020_RECEIPT_ACCEPTANCE.md). Synthetic receipt examples and corruption fixtures run only against OS-generated temporary files (Windows-safe handle close); do not delete actual Electron `userData` or modify live SQLite.

## Scope / security boundaries

The schema and transaction primitive lay groundwork for POS-017/POS-019. They do **not** validate a cashier session (POS-011), enable real checkout/stock deduction to a cashier (D-013/POS-019 integration), network sync (POS-021/022/023) or completed backup/recovery (POS-027/029). Business policy remains one authorized offline cashier, cash only, money in signed 64-bit integer VND, no IMEI, paid sale snapshots immutable.

`node:sqlite` in Node 24 is stability **1.2 / release candidate**. Re-test on pinned Electron/Node, and require a Windows/macOS manual launch before merging. See [ADR-0003](../../docs/ADR-0003-local-sqlite-driver.md) for alternatives and risks.
