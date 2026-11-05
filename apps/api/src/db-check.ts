import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { checkNeonConnection, validateNeonDatabaseUrl } from './db.js';

/**
 * Local-only CLI. Reads apps/api/.env when present; never creates a remote Fastify DB route.
 * Keep .env outside Git and do not paste the URL or its console logs into chat.
 */
async function run(): Promise<void> {
  try {
    if (existsSync('.env')) loadEnvFile('.env');
    const connectionString = validateNeonDatabaseUrl(process.env.DATABASE_URL);
    await checkNeonConnection(connectionString);
    console.log('Neon development database: SELECT 1 succeeded (TLS connection).');
  } catch {
    console.error('Neon development database check failed. Verify local DATABASE_URL, TLS, network access and credentials. Details intentionally hidden.');
    process.exitCode = 1;
  }
}

void run();
