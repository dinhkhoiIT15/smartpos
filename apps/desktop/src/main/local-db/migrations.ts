/**
 * POS-013 local SQLite v1. Migration SQL is intentionally embedded in the main
 * process bundle: packaged Electron must not depend on filesystem access to
 * source files inside a read-only ASAR.
 *
 * Future migration versions must be APPENDED (never edit the SQL of an applied version).
 * This schema stores NO credentials and is NOT a working checkout implementation.
 */
export const SQLITE_SCHEMA_VERSION = 2;

export const LOCAL_MIGRATIONS: ReadonlyArray<Readonly<{ version: number; name: string; sql: string }>> = [
  {
    version: 1,
    name: 'initial_offline_v1',
    sql: `
CREATE TABLE local_schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

-- Identity metadata only: POS-011 will define signatures/expiry/revocation.
CREATE TABLE local_device_metadata (
  store_id TEXT PRIMARY KEY CHECK (length(trim(store_id)) > 0),
  device_id TEXT NOT NULL UNIQUE CHECK (length(trim(device_id)) > 0),
  provisioned_at TEXT NOT NULL,
  last_verified_at TEXT
) STRICT;

-- Read-only catalog snapshot; POS-017 owns sync/cache refresh.
CREATE TABLE local_catalog_variants (
  variant_id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  sku TEXT NOT NULL CHECK (length(trim(sku)) > 0),
  name_snapshot TEXT NOT NULL CHECK (length(trim(name_snapshot)) > 0),
  attributes_json TEXT NOT NULL CHECK (json_valid(attributes_json)),
  price_vnd INTEGER NOT NULL CHECK (price_vnd >= 0),
  server_revision INTEGER NOT NULL DEFAULT 0 CHECK (server_revision >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (store_id, variant_id),
  UNIQUE (store_id, sku)
) STRICT;

-- Store server snapshot and unsynced local deltas separately. Never overwrite
-- pending deltas with server snapshots; reconciliation is POS-023.
CREATE TABLE local_inventory_balances (
  store_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  server_qty INTEGER NOT NULL,
  pending_delta INTEGER NOT NULL DEFAULT 0 CHECK (pending_delta <= 0),
  server_revision INTEGER NOT NULL DEFAULT 0 CHECK (server_revision >= 0),
  PRIMARY KEY (store_id, variant_id),
  FOREIGN KEY (store_id, variant_id) REFERENCES local_catalog_variants (store_id, variant_id) ON DELETE RESTRICT
) STRICT;

-- Financial data is immutable. Only the sync status may change.
CREATE TABLE local_sales (
  sale_id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  cashier_id TEXT NOT NULL,
  client_created_at TEXT NOT NULL,
  total_vnd INTEGER NOT NULL CHECK (total_vnd >= 0),
  sync_status TEXT NOT NULL DEFAULT 'PENDING_SYNC'
    CHECK (sync_status IN ('PENDING_SYNC', 'SYNCED', 'NEEDS_REVIEW')),
  UNIQUE (store_id, sale_id)
) STRICT;

CREATE TABLE local_sale_items (
  item_id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  sku_snapshot TEXT NOT NULL CHECK (length(trim(sku_snapshot)) > 0),
  name_snapshot TEXT NOT NULL CHECK (length(trim(name_snapshot)) > 0),
  attributes_snapshot_json TEXT NOT NULL CHECK (json_valid(attributes_snapshot_json)),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_vnd INTEGER NOT NULL CHECK (unit_price_vnd >= 0),
  discount_vnd INTEGER NOT NULL CHECK (discount_vnd >= 0),
  line_total_vnd INTEGER NOT NULL CHECK (
    line_total_vnd >= 0 AND
    line_total_vnd = quantity * unit_price_vnd - discount_vnd
  ),
  FOREIGN KEY (store_id, sale_id) REFERENCES local_sales (store_id, sale_id) ON DELETE RESTRICT,
  FOREIGN KEY (store_id, variant_id) REFERENCES local_catalog_variants (store_id, variant_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX local_sale_items_sale_idx ON local_sale_items (sale_id);

CREATE TABLE local_payments (
  payment_id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL UNIQUE REFERENCES local_sales (sale_id) ON DELETE RESTRICT,
  method TEXT NOT NULL DEFAULT 'CASH' CHECK (method = 'CASH'),
  due_vnd INTEGER NOT NULL CHECK (due_vnd >= 0),
  tendered_vnd INTEGER NOT NULL CHECK (tendered_vnd >= due_vnd),
  change_vnd INTEGER NOT NULL CHECK (change_vnd = tendered_vnd - due_vnd AND change_vnd >= 0)
) STRICT;

-- One outbox event per sale for MVP; event is never deleted, even after ACK.
CREATE TABLE outbox_events (
  event_id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL UNIQUE,
  store_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64 AND payload_hash NOT GLOB '*[^0-9a-f]*'),
  state TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (state IN ('PENDING', 'SYNCING', 'RETRY', 'SYNCED', 'NEEDS_REVIEW')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_retry_at TEXT,
  ack_json TEXT CHECK (ack_json IS NULL OR json_valid(ack_json)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (store_id, sale_id) REFERENCES local_sales (store_id, sale_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX outbox_dispatch_idx ON outbox_events (state, next_retry_at, created_at, event_id);

CREATE TABLE sync_cursors (
  store_id TEXT PRIMARY KEY,
  catalog_seq INTEGER NOT NULL DEFAULT 0 CHECK (catalog_seq >= 0),
  updated_at TEXT NOT NULL
) STRICT;

-- Never modify/delete locally committed financial evidence.
CREATE TRIGGER local_sales_financial_immutable
BEFORE UPDATE OF sale_id, store_id, device_id, cashier_id, client_created_at, total_vnd ON local_sales
BEGIN SELECT RAISE(ABORT, 'local sale financial data immutable'); END;
CREATE TRIGGER local_sales_no_delete BEFORE DELETE ON local_sales
BEGIN SELECT RAISE(ABORT, 'local sale cannot be deleted'); END;
CREATE TRIGGER local_items_no_update BEFORE UPDATE ON local_sale_items
BEGIN SELECT RAISE(ABORT, 'local sale item immutable'); END;
CREATE TRIGGER local_items_no_delete BEFORE DELETE ON local_sale_items
BEGIN SELECT RAISE(ABORT, 'local sale item cannot be deleted'); END;
CREATE TRIGGER local_payments_no_update BEFORE UPDATE ON local_payments
BEGIN SELECT RAISE(ABORT, 'local cash payment immutable'); END;
CREATE TRIGGER local_payments_no_delete BEFORE DELETE ON local_payments
BEGIN SELECT RAISE(ABORT, 'local cash payment cannot be deleted'); END;
CREATE TRIGGER outbox_payload_immutable
BEFORE UPDATE OF event_id, sale_id, store_id, device_id, schema_version, payload_json, payload_hash, created_at ON outbox_events
BEGIN SELECT RAISE(ABORT, 'outbox event identity/payload immutable'); END;
CREATE TRIGGER outbox_no_delete BEFORE DELETE ON outbox_events
BEGIN SELECT RAISE(ABORT, 'outbox event cannot be deleted'); END;
`,
  },
  {
    version: 2,
    name: 'late_ack_stock_coverage_v2',
    sql: `
-- Forward-only coverage evidence. Do not infer or clear pre-migration pending sales.
CREATE TABLE local_stock_pull_coverage (
 store_id TEXT NOT NULL,
 variant_id TEXT NOT NULL,
 sale_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 covered_seq INTEGER NOT NULL CHECK (covered_seq > 0),
 covered_qty INTEGER NOT NULL CHECK (covered_qty > 0),
 released INTEGER NOT NULL DEFAULT 0 CHECK (released IN (0,1)),
 PRIMARY KEY (store_id,sale_id,variant_id),
 FOREIGN KEY (store_id,variant_id) REFERENCES local_inventory_balances (store_id,variant_id) ON DELETE RESTRICT,
 FOREIGN KEY (store_id,sale_id) REFERENCES local_sales (store_id,sale_id) ON DELETE RESTRICT,
 FOREIGN KEY (event_id) REFERENCES outbox_events (event_id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX local_stock_coverage_unreleased ON local_stock_pull_coverage (store_id,sale_id,released);
CREATE TRIGGER local_stock_coverage_identity_immutable
BEFORE UPDATE OF store_id,variant_id,sale_id,event_id,covered_seq,covered_qty ON local_stock_pull_coverage
BEGIN SELECT RAISE(ABORT,'stock coverage evidence immutable'); END;
CREATE TRIGGER local_stock_coverage_no_delete BEFORE DELETE ON local_stock_pull_coverage
BEGIN SELECT RAISE(ABORT,'stock coverage evidence cannot be deleted'); END;
CREATE TRIGGER local_stock_coverage_release_once
BEFORE UPDATE OF released ON local_stock_pull_coverage
WHEN OLD.released != 0 OR NEW.released != 1
BEGIN SELECT RAISE(ABORT,'stock coverage release is one-way'); END;
`,
  },
];
