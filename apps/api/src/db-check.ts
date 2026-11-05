import { checkNeonConnection, validateNeonDatabaseUrl } from './db.js';
import { readLocalDatabaseUrl } from './db-config.js';
import { formatSafeNeonFailure } from './db-diagnostics.js';

/**
 * Local-only CLI. For this command, apps/api/.env takes precedence over inherited
 * DATABASE_URL. Never print the URL, its components or raw driver exceptions.
 */
async function run(): Promise<void> {
  try {
    const connectionString = validateNeonDatabaseUrl(readLocalDatabaseUrl());
    await checkNeonConnection(connectionString);
    console.log('Neon development database: SELECT 1 succeeded (TLS connection).');
  } catch (error: unknown) {
    console.error(formatSafeNeonFailure(error));
    process.exitCode = 1;
  }
}

void run();
