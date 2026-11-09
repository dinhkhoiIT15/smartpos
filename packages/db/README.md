# SmartPOS PostgreSQL v1 — POS-012

**Status:** Feature PR under review. These are migration artifacts only: no schema has been applied to the developer's Neon instance or any production database.

## Why this package exists

The source-of-truth is [DATABASE_SCHEMA.md](../../docs/DATABASE_SCHEMA.md) v1.0 and accepted [offline sync policy](../../docs/OFFLINE_SYNC_DESIGN.md). `src/schema.ts` defines **17 PostgreSQL tables**:

- Organization: `stores`, `users`, `store_memberships`, `devices`.
- Catalog: `categories`, `brands`, `products`, `product_variants`.
- Inventory: `inventory_balances`, `inventory_movements`.
- Transactions: `sales`, `sale_items`, `payments`.
- Sync/audit: `sync_receipts`, `sync_conflicts`, `audit_logs`, `catalog_change_log`.

All VND amounts are signed 64-bit `bigint`; timestamps are `timestamptz`; client-generated event/sale UUIDs are preserved. The migration enforces primary/foreign keys, same-store constraints where both entity IDs and store IDs are present, per-store unique SKU, per-product attribute keys, positive quantities, line totals and cash-only payment consistency.

The partial unique index `devices_one_active_offline_pos_per_store` ensures no more than one **non-revoked** device per store has offline checkout enabled. Negative server stock is intentionally allowed only for exceptional reconciliation by the future service policy; a naive `qty >= 0` CHECK would violate approved BR-009.

No `ON DELETE CASCADE` relationship is used for sales/payment/history.

## Tools and workflow

- `drizzle.config.ts` configures **offline, code-first** migration generation. It contains no database URL or credentials.
- `drizzle/` contains reviewed SQL, schema snapshots and Drizzle's migration journal; commit the whole folder.
- `src/migration.test.ts` applies the migration **only** against disposable local PostgreSQL named `smartpos_ci` on `127.0.0.1`. GitHub Actions provides a fresh PostgreSQL 16 service with fake test credentials.
- The package must never issue `drizzle-kit push` against Neon. Pushing schema without reviewed migration history is not supported by this project.

From repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @smartpos/db typecheck
pnpm --filter @smartpos/db schema:check
```

`test:migrations` is run in CI with `POS_DB_TEST_URL` from its **ephemeral test database**. Do not run it against your Neon database.

## Human-only migration to isolated Neon development (NOT EXECUTED YET)

**Preconditions:**
1. PR reviewed, SQL/snapshot/CI tests passed and approved.
2. Neon Console: verify you selected a disposable **development branch** and development role, never production.
3. Confirm your development branch is fresh or make a Neon restore point/backup; review any existing schema.
4. Locally keep `DATABASE_URL` only in the ignored `apps/api/.env`. Never paste the URL into GitHub, chat, logs or Electron.

After explicit owner approval, the developer may run:

```powershell
pnpm --filter @smartpos/db migrate:dev --confirm-neon-development
```

This CLI **does nothing without** the confirmation argument, reads only the local `apps/api/.env`, requires a TLS Neon URL, checks for unmanaged `stores/sales/payments` tables, applies the committed Drizzle SQL and writes migration history. It cannot determine production vs development purely from the hostname — the human must check the Neon Console first.

Afterwards, verify the migration journal and all tables through read-only Neon SQL. Do not seed real customers, prices or paid sales until the relevant POS-014/018/021 services are reviewed.

## Forward-fix and rollback plan

There is **no automatic DOWN migration** in this iteration; dropping sale tables would irreversibly lose audit evidence. If SQL fails before migration commit, review the transaction state and logs and fix the migration on a new feature branch. If a reviewed migration already applied, write a new forward-only, versioned migration and test on an isolated branch. For a fully disposable, empty Neon development branch only, an owner may delete/recreate/restore the **development branch** after verifying no actual sales data exist. Do not execute destructive SQL against production or populated databases.

## Migration is not a functioning POS

Database-level constraints protect many invariants, but cross-line sums, variant-to-sale store matching, staff session validity, movement authorization, advanced idempotent sync semantics and stock reconciliation still require future transactional services (POS-014/015/016/021). SQLite offline schema is separate (POS-013). This package does not store secrets and never exposes SQL access to the Electron renderer.

## POS-025 additive staff session migration 0001 (Draft PR #48)

This adds `staff_sessions` after the existing 17-table v1 baseline without altering old tables or migrations. It stores **only** SHA-256 token digests of 256-bit random server-issued access credentials, not plaintext. DB constraints enforce a maximum 15-minute online session, FK to current store/user membership, and audit-linked revocation. The online session is **not** D-010's signed four-hour offline cashier grant. No password login/Argon2id or OS keychain has been introduced.

`pnpm --filter @smartpos/db schema:check` validates Drizzle metadata without touching Neon. GitHub disposable CI `test:migrations` applies both migrations on `127.0.0.1:5432/smartpos_ci` and asserts exactly 18 public SmartPOS tables and 2 Drizzle history records, plus invalid token/TTL/FK tests. **Do not run `migrate:dev` against Neon without separate owner approval, staged backup/review and rollback/forward-fix plan.** No production migrations are approved.
