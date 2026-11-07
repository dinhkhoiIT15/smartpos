# POS-017 — SQLite Catalog Cache Acceptance (M2/P0)

**State:** draft [PR #32](https://github.com/dinhkhoiIT15/smartpos/pull/32), Issue [#31](https://github.com/dinhkhoiIT15/smartpos/issues/31). GitHub [Foundation CI #42394398241](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42394398241) and [Docs CI #42394398264](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42394398264) **PASS** on 5f8231d code checkpoint; owner local Windows acceptance pending. Based on merged POS-013 SQLite v1, POS-014 PostgreSQL catalog service, POS-016 sync v1 wire contracts.

## Delivered scope

- `apps/desktop/src/main/local-db/catalog-cache.ts`: **Electron MAIN / Node only** validated initial catalog projection into existing `local_catalog_variants` and `sync_cursors`; no schema/migration edits.
- Strict `protocolVersion:1` initial snapshot shape `{ protocolVersion,storeId,catalogSeq,variants }` with each variant `{variantId,storeId,sku,name,attributes,priceVnd,revision,active}`. All store/variant IDs are canonical UUIDs; SKU is already normalized uppercase, attributes keys/values bounded and normalized by the future trusted server adapter; price/cursor/revision are canonical **nonnegative signed-int64 decimal strings**, never JS floats.
- `applyInitialCatalogSnapshot(db, snapshot)` checks store consistency, duplicate IDs/SKUs, payload shape/limits, then writes variants **and** initial cursor in one SQLite `BEGIN IMMEDIATE` transaction. Failure, SQLite constraint or injected trigger abort rolls back BOTH. Replaying an identical snapshot at the same cursor is a no-op; an attempt to rewind/overwrite or import into an unversioned populated cache is refused.
- `lookupLocalCatalogBySku(db,storeId,sku,limit?)` is a bounded, read-only store-scoped prefix lookup, preferring exact SKU and hiding inactive rows; money/revision are returned as decimal strings. It requires an initialized cursor and survives close/reopen without network.
- Never deletes/overwrites financial records, `outbox_events`, or `local_inventory_balances.pending_delta`. No checkout, network calls, credentials or real device authorization are implemented.

## Security and design boundary

**Critical:** this is a **local persistence primitive, not an authenticated sync client**. POS-014 does not expose live catalog endpoints without real staff RBAC, and POS-016 only documents pull DTOs. Accordingly there is **no demo/renderer IPC importer**, no fake API token/header, no link to Neon, and no hidden auto-seed in actual Electron userData. Until POS-023 and D-013/POS-025 provide authenticated source verification and an entity-specific mapping, an external JSON object must not be treated as an authorized catalog change.

`catalogSeq` belongs to the future authenticated source's high-watermark, not the count of imported variants. The first snapshot is one atomic baseline. **Incremental pages/deltas, stock-rebase, re-bootstrap recovery and cursor advancement for later pages are POS-023**, and must preserve pending local sales and stock deltas. Replay of the initial baseline is allowed only while the whole current cache matches it.

An active in-use SQLite `userData` file is never deleted or exported by these tests. The Windows test creates an OS temporary directory, closes all SQLite handles, then deletes only that directory.

## Windows PowerShell review

On a clean worktree from `C:\Users\dinhk\Desktop\smartpos`:

```powershell
git status --short
git fetch origin
git switch feature/POS-017-local-catalog-cache
git pull --ff-only origin feature/POS-017-local-catalog-cache
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop test:local-db
pnpm --filter @smartpos/desktop test:catalog-cache
pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop build
pnpm run check
```

**Expected**: Node 24.x, pnpm 10.20.0, all commands exit 0; POS-013's **7 legacy local SQLite tests** and POS-017's **6 new file-backed cache tests** all pass (`fail 0`). Verify merged schema remains v1 (9 tables), no new dependency or migrations.

The new tests cover: offline search (case-insensitive canonicalization; underscore escaping; inactive exclusion), bigint-safe VND and cursor beyond JS safe integer, restart persistence, strict duplicate/other-store/overflow validation, SQLite trigger fault rollback of catalog + cursor, idempotent replay, divergent snapshot/rewind rejection, unversioned-cache refusal and preservation of sale/payment/outbox/pending stock. Linux + Windows Node24 CI also runs these tests.

Optional manual desktop smoke:

```powershell
pnpm --filter @smartpos/desktop dev
```

Expected the existing `DEMO — CHƯA THỂ BÁN HÀNG` warning and `Kiểm tra Electron IPC` showing SQLite schema **v1**. There is no product import UI yet: it would violate the security boundary without actual staff auth. Close/reopen demo; no app crash, no fabricated sale and no automatic catalog network request.

## Review gates

1. CI full Desktop/Electron, Node24 Windows, API/contracts/PostgreSQL jobs and docs validation passed on code checkpoint `5f8231d`; reconfirm final PR HEAD after documentation changes.
2. Owner runs commands above on Windows and reports test counts, missing Electron warnings if any, and launcher smoke.
3. Review PR diff for whitelist/sanitized errors, no secrets, no schema edits and no unapproved paths; merge only after acceptance. Keep Issue #31 open until merge + owner confirmation.
4. Subsequent POS-018 uses the MAIN-only lookup only after secure read exposure/session gating is designed; POS-023 owns live authenticated pull/delta.

**Never** run `migrate:dev`, `test:catalog:pg` against Neon, or write a production database for POS-017.
