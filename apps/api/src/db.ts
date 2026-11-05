import pg from 'pg';

export interface DatabaseProbeClient {
  connect(): Promise<void>;
  query(sql: string): Promise<{ rows: Array<{ ok: number }> }>;
  end(): Promise<void>;
}

/**
 * Permit only a development Neon PostgreSQL connection with TLS.
 * Do not log or include the connection string in error messages.
 */
export function validateNeonDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error('DATABASE_URL is missing');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  const validProtocol = url.protocol === 'postgresql:' || url.protocol === 'postgres:';
  const validCredentials = Boolean(url.username && url.password);
  const validHostname = url.hostname.toLowerCase().endsWith('.neon.tech');
  const validTls = url.searchParams.get('sslmode') === 'require'
    || url.searchParams.get('sslmode') === 'verify-full';
  if (!validProtocol || !validCredentials || !validHostname || !validTls) {
    throw new Error('DATABASE_URL must be a credentialed Neon PostgreSQL URL with sslmode=require');
  }
  return value;
}

/** Read-only connectivity probe; no schema creation, writes, migrations or credentials in output. */
export async function checkNeonConnection(
  connectionString: string,
  createClient: (url: string) => DatabaseProbeClient = (url) =>
    new pg.Client({
      connectionString: url,
      connectionTimeoutMillis: 7000,
      query_timeout: 7000,
    }),
): Promise<void> {
  const client = createClient(connectionString);
  try {
    await client.connect();
    const response = await client.query('SELECT 1 AS ok');
    if (response.rows[0]?.ok !== 1) throw new Error('Unexpected database probe result');
  } finally {
    // Preserve the original failure if cleanup also fails.
    try {
      await client.end();
    } catch {
      // No credential-bearing exception text is logged by the CLI.
    }
  }
}
