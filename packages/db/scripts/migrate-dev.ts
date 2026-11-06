/**
 * Explicit HUMAN-INITIATED Neon DEVELOPMENT migration only.
 * This command has no production or default CI migration pathway.
 * It reads only the local API .env file, with no fallback to inherited DATABASE_URL.
 */
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const envPath = fileURLToPath(new URL('../../../apps/api/.env', import.meta.url));
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const confirmed = process.argv.includes('--confirm-neon-development');

async function main(): Promise<void> {
  if (!confirmed) {
    throw new Error('CONFIRMATION_REQUIRED: review Neon development branch and pass --confirm-neon-development explicitly');
  }
  if (!existsSync(envPath)) throw new Error('LOCAL_ENV_MISSING: apps/api/.env is required');
  const value = parseEnv(readFileSync(envPath, 'utf8')).DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL_MISSING');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('INVALID_NEON_DEV_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !url.username || !url.password || !url.hostname.endsWith('.neon.tech')
    || !['verify-full', 'require'].includes(url.searchParams.get('sslmode') ?? '')) {
    throw new Error('INVALID_NEON_DEV_URL: expected Neon TLS PostgreSQL URL');
  }
  if (url.username.startsWith('YOUR_') || url.password.startsWith('YOUR_')) {
    throw new Error('LOCAL_ENV_TEMPLATE_NOT_REPLACED');
  }

  const pool = new Pool({
    connectionString: value,
    connectionTimeoutMillis: 8000,
    query_timeout: 15000,
    max: 1,
  });
  try {
    // Prevent accidental adoption of an unrelated database containing SmartPOS-looking tables
    // but lacking a known Drizzle migration history.
    const existing = await pool.query<{ has_tables: boolean; has_journal: boolean }>(`
      SELECT
        EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name IN ('stores','sales','payments')) AS has_tables,
        EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema='drizzle' AND table_name='__drizzle_migrations') AS has_journal
    `);
    if (existing.rows[0]?.has_tables && !existing.rows[0]?.has_journal) {
      throw new Error('UNMANAGED_TABLES_PRESENT: stop and inspect Neon development database');
    }
    await migrate(drizzle(pool), { migrationsFolder });
    console.log('SmartPOS Neon DEVELOPMENT migrations applied successfully; migration history recorded.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Never print pg error text/stack or connection URL: they might reveal credentials.
  const code = error instanceof Error && /^(?:CONFIRMATION_REQUIRED|LOCAL_ENV_MISSING|DATABASE_URL_MISSING|INVALID_NEON_DEV_URL|LOCAL_ENV_TEMPLATE_NOT_REPLACED|UNMANAGED_TABLES_PRESENT)/.test(error.message)
    ? error.message.split(':')[0]
    : 'MIGRATION_FAILED';
  console.error('SmartPOS development migration did not complete [' + code + ']. Do not retry on production. Review locally.');
  process.exitCode = 1;
});
