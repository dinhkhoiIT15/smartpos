# ADR-0003 — Node 24 built-in SQLite for POS-013 local storage

**Status:** PROPOSED / POS-013 implementation choice, owner review required in PR #19
**Date:** 2026-11-07
**Scope:** local database in Electron MAIN only. Does not change the approved business baseline or grant checkout/offline authorization.

## Context
- Approved architecture requires Electron main to own local SQLite, with a single authorized offline cashier device and atomic cash-sale/outbox persistence.
- SmartPOS pins Node 24.x and Electron 44.x. Electron 44 bundles Node 24, including the built-in `node:sqlite` API.
- Node 24 `node:sqlite` is currently **stability 1.2 / release candidate**, not final stable. This creates a version-compatibility risk which must be tested on Windows/macOS.
- The repository owner previously experienced a missing Electron native binary on Windows, making additional ABI-dependent native add-ons undesirable for a small offline learning project.

## Decision for development
Use `node:sqlite` `DatabaseSync` from Electron main, no `better-sqlite3`/native addon. Keep SQL behind a dedicated local-db module, **never** in preload/renderer. Do not require SQLite access from the Fastify server.

- File: `app.getPath('userData')/smartpos-local.sqlite`; no database under Git/source tree or packaged ASAR.
- `PRAGMA foreign_keys=ON`, WAL, `synchronous=FULL`, busy timeout 5s, `trusted_schema=OFF`, `PRAGMA quick_check`.
- Embedded, immutable, versioned SQL migrations; atomic `BEGIN IMMEDIATE` and journal/compatibility checks; reject unknown/future schema instead of deleting existing data.
- Financial rows and outbox payload immutable at database trigger level; future sync status is allowed to change.
- Safe read-only IPC displays **schema version only**, no arbitrary SQL, filesystem path, database handle, local auth token or credentials.
- A SQLite backup helper uses Node's `sqlite.backup` API, not copying the open database file and ignoring its WAL.

## Alternatives considered
- **better-sqlite3:** mature ecosystem, but needs a native add-on compatible with Electron/Node ABI, an additional installation and packaging/rebuild path. Revisit if `node:sqlite` fails actual Windows/macOS launch or performance/packaging tests.
- **SQLite WASM/browser:** avoids native ABI, but extra persistence and crash/transaction semantics are unnecessary complexity for trusted Electron main.
- **Only Neon:** rejected, cannot support offline checkout.

## Unresolved decisions — BLOCK PRODUCTION PILOT
- Encryption at rest, key storage/provisioning, backup frequency, backup retention, restore and RPO/RTO are **not** approved. POS-027/POS-029 must resolve and test them; the current snapshot helper produces an **unencrypted file**.
- Security of the local authorized cashier session, expiry/revocation and cloned device identity is POS-011.
- Node/Electron version upgrades may change the SQLite API; pin and re-run tests plus manual Windows/macOS smoke.
- `DatabaseSync` calls are synchronous; never run slow queries/mass migrations on the Electron UI thread after launch without measuring or moving to a main-owned worker.

## Consequences and acceptance gates
- No additional dependency/lockfile changes in POS-013.
- File-backed SQLite tests must verify WAL, transaction rollback, restart durability, migration journal, bigint correctness and consistent snapshot backup on Node 24.
- Owner must launch Electron on Windows and check `SQLite schema v1` in the existing guarded IPC before considering POS-013 complete.
- Do not treat POS-013 as a working checkout or a backup/recovery guarantee, and never store real sales before POS-019/POS-027/029 gates.

References: [Node.js v24 SQLite API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html), [Electron 44 release](https://www.electronjs.org/blog/electron-44-0), [LOCAL_BACKUP_RECOVERY](LOCAL_BACKUP_RECOVERY.md).
