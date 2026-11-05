import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/**
 * For this explicitly local CLI, apps/api/.env takes precedence over an inherited
 * DATABASE_URL. Node's loadEnvFile intentionally does not override existing env vars.
 * Do not log the value returned by this function.
 */
export function readLocalDatabaseUrl(
  file = '.env',
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (existsSync(file)) {
    const parsed = parseEnv(readFileSync(file, 'utf8'));
    if (parsed.DATABASE_URL !== undefined) return parsed.DATABASE_URL.trim();
  }
  return environment.DATABASE_URL;
}
