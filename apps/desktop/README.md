# SmartPOS Desktop — Secure Electron shell + SQLite v1 (POS-013)

**Status:** Development-only Electron demo with SQLite v1 and merged POS-017 cache/POS-018 cart/POS-019 MAIN-only atomic cash sale core. POS-020 merged a **sample watermarked internal receipt preview** and **MAIN-only persisted receipt read model**. POS-022 merged PR #42 a separately unmounted **MAIN-only outbox retry worker** with injectable fake/test transport. No authenticated catalog sync, real paid checkout, staff authorization, genuine receipt issuance or production sale.

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
pnpm --filter @smartpos/desktop test:outbox-worker
pnpm --filter @smartpos/desktop test:outbox-boundary
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

## POS-022 internal outbox retry (NOT started by normal Electron)

`src/main/local-db/outbox-worker.ts` implements `OutboxRetryWorker` and standalone `recoverOrphanedOutbox` / `retryOutboxNow`. It claims earliest due outbox event in SQLite v1 with one IMMEDIATE transaction and increments attempts; validates the exact persisted POS-016 v1 SHA256 event with shared Zod before an injected transport callback; requires the original complete matching v1 ACK to mark SYNCED. A bogus reply without matching event/sale/device/fields becomes NEEDS_REVIEW, not a false cloud success. Timeout/network failure or explicit RETRY schedules exponential backoff and jitter; restart resets orphan SYNCING to RETRY using identical original event IDs, avoiding lost cash evidence. Both event state and local sale status update transactionally, while immutable price/item/payment and local stock pending delta never change on delivery.

`test:outbox-worker` exercises SQLite files and synthetic callbacks only; `test:outbox-boundary` proves no renderer, preload, IPC or normal main startup exposes or instantiates the worker. No SQLite migration; schema v1 still **9 tables**. `@smartpos/contracts` is a pre-existing shared package, now a desktop workspace dependency. A signed grant is NOT established by stored offlineGrantId/device metadata, and production API PUSH remains default 404. **Real HTTP transport MUST NOT be connected before D-013 authorization security review**.

```powershell
pnpm --filter @smartpos/desktop test:outbox-worker
pnpm --filter @smartpos/desktop test:outbox-boundary
```

Read the [POS-022 Windows acceptance and D-013 boundary](../../docs/POS-022_OUTBOX_ACCEPTANCE.md).

## POS-023 atomic catalog delta PULL (internal; NOT network active)

`src/main/local-db/catalog-pull.ts`: uses POS-016 cursor/page contract validation and `BEGIN IMMEDIATE` to update server SKU/name/price/activation, inventory `server_qty/server_revision` and `sync_cursors` in a single transaction; failed pages roll back fully. Unsynced cash pending deltas remain protected; a stock delta linked to a locally ACKed sale can release only that already-applied sale's quantity on the same durable cursor transition. Financial sale/items/payment/outbox are never rewritten. The worker takes an injected test callback; no HTTP, renderer, preload/IPC, Neon or D-013 auth exists in the normal runtime. Schema stays SQLite v1 with nine tables. See [POS-023 Windows/CI acceptance](../../docs/POS-023_CATALOG_PULL_ACCEPTANCE.md), especially the conservative stock understatement when an ACK arrives **after** its delta page.

```powershell
pnpm --filter @smartpos/desktop test:catalog-pull
pnpm --filter @smartpos/desktop test:catalog-pull:boundary
```

## Scope / security boundaries

The schema and transaction primitive lay groundwork for POS-017/POS-019. They do **not** validate a cashier session (POS-011), enable real checkout/stock deduction to a cashier (D-013/POS-019 integration), live authenticated network sync (D-013/POS-023) or completed backup/recovery (POS-027/029). Business policy remains one authorized offline cashier, cash only, money in signed 64-bit integer VND, no IMEI, paid sale snapshots immutable.

`node:sqlite` in Node 24 is stability **1.2 / release candidate**. Re-test on pinned Electron/Node, and require a Windows/macOS manual launch before merging. See [ADR-0003](../../docs/ADR-0003-local-sqlite-driver.md) for alternatives and risks.

## POS-028 Windows/macOS unsigned DEMO installer build (Draft)

For the first time the desktop app can be staged from its **compiled-only** output and installed as a Windows NSIS x64 or macOS DMG/ZIP (Intel and Apple Silicon). No real payment, login, stock sync or signed offline cashier grant is activated. The packaged app ignores `ELECTRON_RENDERER_URL` even if the environment supplies one. No secrets/SQLite/backup/WAL/SHM or unreviewed raw sources are packaged.

```powershell
pnpm --filter @smartpos/desktop test:package-demo
pnpm --filter @smartpos/desktop package:demo:win
```

On macOS, use `package:demo:mac:x64` or `package:demo:mac:arm64`; each creates its own versioned `.dmg`/`.zip` plus SHA-256 and provenance. Generated outputs under `.demo-package/` and `demo-artifacts/` are gitignored; do not rename/move the actual Electron `userData` SQLite files. Build script pins `electron-builder@26.18.1` via `pnpm dlx` and passes `--publish never`. CI uploads these **unsigned** results temporarily, never to public Releases. **Windows SmartScreen and macOS Gatekeeper may correctly block them**; do not bypass OS protections just to confirm a GUI test.

See [POS-028 packaging acceptance](../../docs/POS-028_PACKAGING_ACCEPTANCE.md) and [ADR-0005](../../docs/ADR-0005-unsigned-demo-packaging.md). Windows/macOS signing, notarization and OS minimum versions are D-011 OPEN; SQLite encryption, password login/OS key store/offline grant, backup/restore and production pilot still blocked.
