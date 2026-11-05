import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNeonConnection, validateNeonDatabaseUrl, type DatabaseProbeClient } from './db.js';

const fakeUrl = 'postgresql://dev_user:placeholder@ep-fake-example.us-east-2.aws.neon.tech/devdb?sslmode=require&channel_binding=require';

test('accepts Neon development URL with TLS, without displaying credentials', () => {
  assert.equal(validateNeonDatabaseUrl(fakeUrl), fakeUrl);
  assert.equal(validateNeonDatabaseUrl(fakeUrl.replace('sslmode=require', 'sslmode=verify-full')), fakeUrl.replace('sslmode=require', 'sslmode=verify-full'));
});

test('rejects missing, insecure and non-Neon connection URLs', () => {
  const invalid = [
    undefined, '', 'not-a-url', 'postgresql://localhost/devdb?sslmode=require',
    'postgresql://dev_user:password@ep-fake-example.us-east-2.aws.neon.tech/devdb',
    'postgresql://dev_user:password@ep-fake-example.us-east-2.aws.neon.tech/devdb?sslmode=disable',
    'http://dev_user:password@ep-fake-example.us-east-2.aws.neon.tech/devdb?sslmode=require',
    'postgresql://dev_user@ep-fake-example.us-east-2.aws.neon.tech/devdb?sslmode=require',
  ];
  for (const value of invalid) {
    assert.throws(() => validateNeonDatabaseUrl(value), /DATABASE_URL/);
  }
});

test('SELECT 1 probe succeeds and always closes fake client', async () => {
  const calls: string[] = [];
  const stub: DatabaseProbeClient = {
    connect: async () => { calls.push('connect'); },
    query: async (sql) => {
      calls.push(sql);
      return { rows: [{ ok: 1 }] };
    },
    end: async () => { calls.push('end'); },
  };
  await checkNeonConnection(fakeUrl, (url) => {
    assert.equal(url, fakeUrl);
    return stub;
  });
  assert.deepEqual(calls, ['connect', 'SELECT 1 AS ok', 'end']);
});

test('failed database query closes client without real network', async () => {
  let closed = false;
  const client: DatabaseProbeClient = {
    connect: async () => {},
    query: async () => { throw new Error('simulated failure'); },
    end: async () => { closed = true; },
  };
  await assert.rejects(() => checkNeonConnection(fakeUrl, () => client), /simulated failure/);
  assert.equal(closed, true);
});

test('unexpected SQL reply is rejected', async () => {
  let closed = false;
  const client: DatabaseProbeClient = {
    connect: async () => {},
    query: async () => ({ rows: [{ ok: 0 }] }),
    end: async () => { closed = true; },
  };
  await assert.rejects(() => checkNeonConnection(fakeUrl, () => client), /Unexpected database probe result/);
  assert.equal(closed, true);
});
