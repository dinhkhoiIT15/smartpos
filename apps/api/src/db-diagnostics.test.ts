import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLocalDatabaseUrl } from './db-config.js';
import { categorizeNeonCheckError, formatSafeNeonFailure } from './db-diagnostics.js';
import { validateNeonDatabaseUrl } from './db.js';

test('local .env is preferred over an inherited DATABASE_URL', () => {
  const dir = mkdtempSync(join(tmpdir(), 'smartpos-neon-test-'));
  const file = join(dir, '.env');
  const localUrl = 'postgresql://dev:local@ep-local.us-east-2.aws.neon.tech/db?sslmode=verify-full';
  try {
    writeFileSync(file, 'DATABASE_URL="' + localUrl + '"\n', 'utf8');
    const value = readLocalDatabaseUrl(file, {
      DATABASE_URL: 'postgresql://dev:stale@ep-old.us-east-2.aws.neon.tech/db?sslmode=verify-full',
    });
    assert.equal(value, localUrl);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('environment fallback works when local .env is absent', () => {
  assert.equal(readLocalDatabaseUrl('/nonexistent-smartpos-file', { DATABASE_URL: 'fallback-secret' }), 'fallback-secret');
});

test('template placeholders are rejected before opening a network connection', () => {
  const example = 'postgresql://YOUR_DEV_ROLE:YOUR_DEV_PASSWORD@ep-YOUR-DEV-ENDPOINT.us-east-2.aws.neon.tech/YOUR_DEV_DB?sslmode=require';
  assert.throws(() => validateNeonDatabaseUrl(example), /template placeholders/);
});

test('categorizes connection failures without exposing credentials or raw error message', () => {
  const privateText = 'postgresql://username:SUPER_SECRET@ep-private.neon.tech/db';
  const cases: Array<[string, string]> = [
    ['28P01', 'AUTH_FAILED'],
    ['3D000', 'DATABASE_NOT_FOUND'],
    ['ENOTFOUND', 'DNS_FAILED'],
    ['EAI_AGAIN', 'DNS_FAILED'],
    ['ETIMEDOUT', 'CONNECTION_TIMEOUT'],
    ['ECONNREFUSED', 'NETWORK_UNREACHABLE'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'TLS_CERTIFICATE_FAILED'],
  ];
  for (const [code, category] of cases) {
    const error = Object.assign(new Error('Driver failure: ' + privateText), { code });
    assert.equal(categorizeNeonCheckError(error), category);
    const result = formatSafeNeonFailure(error);
    assert.match(result, new RegExp('\\[' + category + '\\]'));
    assert.doesNotMatch(result, /SUPER_SECRET|ep-private|username|postgresql:/);
  }
});

test('unclassified failures are sanitized, not printed', () => {
  const raw = 'Critical unexpected error DATABASE_URL=postgresql://root:LEAK@example.net/db';
  const response = formatSafeNeonFailure(new Error(raw));
  assert.match(response, /CONNECTION_FAILED/);
  assert.doesNotMatch(response, /LEAK|postgresql:|example\.net|root/);
  assert.equal(categorizeNeonCheckError(new Error('DATABASE_URL is missing')), 'CONFIG_MISSING');
  assert.equal(categorizeNeonCheckError(new Error('DATABASE_URL contains template placeholders')), 'TEMPLATE_NOT_REPLACED');
  assert.equal(categorizeNeonCheckError(new Error('DATABASE_URL must be a valid PostgreSQL URL')), 'CONFIG_INVALID');
});
