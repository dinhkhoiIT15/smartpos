import { existsSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { LOCAL_MIGRATIONS, SQLITE_SCHEMA_VERSION } from './migrations.ts';

export { SQLITE_SCHEMA_VERSION } from './migrations.ts';

type VersionRow = { user_version: number };
type MigrationRow = { name: string };
type DatabaseFileRow = { name: string; file: string };

/**
 * All local DB access belongs to Electron MAIN, never preload/renderer.
 * The SQLite version is embedded in the app, no unreviewed runtime SQL file.
 */
export function openLocalDatabase(filePath: string): DatabaseSync {
  if (filePath !== ':memory:' && !isAbsolute(filePath)) {
    throw new Error('Local SQLite file path must be absolute');
  }
  if (filePath !== ':memory:') {
    // No app files are written under the source tree or packaged ASAR.
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
  }
  const database = new DatabaseSync(filePath, {
    timeout: 5_000,
    enableForeignKeyConstraints: true,
  });
  try {
    database.exec('PRAGMA foreign_keys = ON');
    database.exec('PRAGMA busy_timeout = 5000');
    database.exec('PRAGMA trusted_schema = OFF');
    database.exec('PRAGMA synchronous = FULL');
    if (filePath !== ':memory:') {
      database.exec('PRAGMA journal_mode = WAL');
      const row = database.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
      if (row.journal_mode.toLowerCase() !== 'wal') throw new Error('SQLite WAL mode unavailable');
    }

    if (getPragmaNumber(database, 'foreign_keys') !== 1) {
      throw new Error('SQLite foreign keys must be enabled');
    }
    const check = database.prepare('PRAGMA quick_check').get() as { quick_check: string };
    if (check.quick_check !== 'ok') throw new Error('SQLite database integrity check failed');

    applyLocalMigrations(database);
    return database;
  } catch {
    database.close();
    // Never delete an existing SQLite/WAL file after an error.
    throw new Error('Cannot open or migrate SmartPOS local database. Existing data was preserved.');
  }
}

function getPragmaNumber(db: DatabaseSync, name: 'foreign_keys' | 'user_version'): number {
  const row = db.prepare('PRAGMA ' + name).get() as Record<string, number> | undefined;
  const value = row?.[name];
  if (typeof value !== 'number') throw new Error('Invalid SQLite pragma: ' + name);
  return value;
}

export function getLocalSchemaVersion(db: DatabaseSync): number {
  return getPragmaNumber(db, 'user_version');
}

/** Execute all statements as one IMMEDIATE SQLite transaction; never silently reset data. */
export function withLocalTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    // Synchronous callbacks only: async work would commit before its promises resolve.
    if (result instanceof Promise) throw new Error('Local transaction callback must be synchronous');
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Preserve the actual error. Never retry or delete committed financial evidence.
    }
    throw error;
  }
}

function applyLocalMigrations(db: DatabaseSync): void {
  const installed = getLocalSchemaVersion(db);
  if (installed > SQLITE_SCHEMA_VERSION) {
    throw new Error('SQLite database version is newer than the installed app');
  }
  if (installed === 0) {
    // Refuse a pre-existing unversioned database: a migration must never take over
    // arbitrary local data merely because the SQLite user_version defaults to 0.
    const oldTable = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
    ).get();
    if (oldTable) throw new Error('Unmanaged SQLite schema: refusing automatic migration');
  }

  for (const migration of LOCAL_MIGRATIONS) {
    if (migration.version <= installed) continue;
    if (migration.version > SQLITE_SCHEMA_VERSION) break;
    withLocalTransaction(db, () => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO local_schema_migrations (version, name) VALUES (?, ?)').run(
        migration.version, migration.name,
      );
      db.exec('PRAGMA user_version = ' + migration.version);
    });
  }

  const version = getLocalSchemaVersion(db);
  if (version !== SQLITE_SCHEMA_VERSION) throw new Error('Local SQLite schema version mismatch');
  for (const migration of LOCAL_MIGRATIONS) {
    const row = db.prepare('SELECT name FROM local_schema_migrations WHERE version = ?')
      .get(migration.version) as MigrationRow | undefined;
    if (row?.name !== migration.name) throw new Error('SQLite migration journal mismatch');
  }
  const count = db.prepare(
    "SELECT count(*) AS value FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  ).get() as { value: number };
  if (count.value !== 9) throw new Error('SQLite table count mismatch; manual recovery required');
}

/**
 * WAL-consistent snapshot via SQLite backup API.
 * Backups are NOT encrypted by this helper: caller must secure/retain them,
 * and POS-027/029 will specify tested recovery and encryption policy.
 */
export async function backupLocalDatabase(db: DatabaseSync, destination: string): Promise<void> {
  if (!isAbsolute(destination)) throw new Error('Backup destination must be absolute');
  if (existsSync(destination)) throw new Error('Refusing to overwrite an existing SQLite backup');
  const list = db.prepare('PRAGMA database_list').all() as DatabaseFileRow[];
  const current = list.find((row) => row.name === 'main');
  if (current?.file && resolve(current.file) === resolve(destination)) {
    throw new Error('Backup destination must differ from active database');
  }
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  await backup(db, destination);
  chmodSync(destination, 0o600);
}
