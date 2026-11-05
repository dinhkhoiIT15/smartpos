/**
 * Safe, finite error categories for the Neon DEVELOPMENT CLI.
 * Raw Error.message / Error.stack / PostgreSQL diagnostics can contain SQL, host,
 * username or other sensitive information, so NEVER print them or interpolate them.
 */
export type NeonCheckCode =
  | 'CONFIG_MISSING'
  | 'CONFIG_INVALID'
  | 'TEMPLATE_NOT_REPLACED'
  | 'AUTH_FAILED'
  | 'DATABASE_NOT_FOUND'
  | 'DNS_FAILED'
  | 'NETWORK_UNREACHABLE'
  | 'CONNECTION_TIMEOUT'
  | 'TLS_CERTIFICATE_FAILED'
  | 'CONNECTION_FAILED';

export function categorizeNeonCheckError(error: unknown): NeonCheckCode {
  const message = error instanceof Error ? error.message : '';
  const record = typeof error === 'object' && error !== null
    ? error as { code?: unknown } : undefined;
  const code = typeof record?.code === 'string' ? record.code : '';

  if (message === 'DATABASE_URL is missing') return 'CONFIG_MISSING';
  if (message === 'DATABASE_URL contains template placeholders') return 'TEMPLATE_NOT_REPLACED';
  if (message.startsWith('DATABASE_URL')) return 'CONFIG_INVALID';

  if (code === '28P01' || code === '28000') return 'AUTH_FAILED';
  if (code === '3D000') return 'DATABASE_NOT_FOUND';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DNS_FAILED';
  if (code === 'ETIMEDOUT') return 'CONNECTION_TIMEOUT';
  if (['ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ECONNRESET', 'EPIPE'].includes(code)) {
    return 'NETWORK_UNREACHABLE';
  }
  if ([
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'CERT_HAS_EXPIRED',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
  ].includes(code)) return 'TLS_CERTIFICATE_FAILED';

  // pg sometimes reports a timeout without a Node error code; only categorize,
  // never echo potentially sensitive error.message.
  if (/timeout exceeded|connection terminated due to connection timeout/i.test(message)) {
    return 'CONNECTION_TIMEOUT';
  }
  return 'CONNECTION_FAILED';
}

export function formatSafeNeonFailure(error: unknown): string {
  const code = categorizeNeonCheckError(error);
  return 'Neon development database check failed [' + code + ']. '
    + 'Inspect apps/api/.env and Neon Console privately; no credentials printed.';
}
