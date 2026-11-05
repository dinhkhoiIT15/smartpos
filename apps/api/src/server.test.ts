import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from './server.js';
import { API_DEFAULT_HOST, API_DEFAULT_PORT, parseApiPort } from './config.js';

test('GET /v1/health returns HTTP 200 with safe liveness response', async (t) => {
  const app = buildServer();
  t.after(async () => { await app.close(); });

  const response = await app.inject({ method: 'GET', url: '/v1/health' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok', service: 'smartpos-api' });
  assert.match(String(response.headers['content-type'] ?? ''), /application\/json/);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.doesNotMatch(response.body, /DATABASE_URL|postgres|password|token/i);
});

test('unknown route is not falsely reported as healthy', async (t) => {
  const app = buildServer();
  t.after(async () => { await app.close(); });

  const response = await app.inject({ method: 'GET', url: '/v1/does-not-exist' });
  assert.equal(response.statusCode, 404);
});

test('API default port is validated and loopback-bound by configuration', () => {
  assert.equal(API_DEFAULT_HOST, '127.0.0.1');
  assert.equal(parseApiPort(undefined), API_DEFAULT_PORT);
  assert.equal(parseApiPort('3002'), 3002);
  assert.equal(parseApiPort('65535'), 65535);
  for (const invalid of ['', '0', '65536', '-1', '3.1', 'abc', ' 3001', '3001 ', '1e3']) {
    assert.throws(() => parseApiPort(invalid), /API_PORT/);
  }
});
