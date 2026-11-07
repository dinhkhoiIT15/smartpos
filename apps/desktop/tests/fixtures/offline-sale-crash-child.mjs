import { writeSync } from 'node:fs';
import { openLocalDatabase } from '../../src/main/local-db/index.ts';
import { commitLocalCashSale } from '../../src/main/local-db/offline-sale.ts';

/**
 * POS-019 disposable child process ONLY. Never uses Electron userData.
 * Block after ALL SQLite writes but immediately before COMMIT so the parent
 * can abruptly terminate this process. SQLite must roll the transaction back
 * when the process dies, even if it had already appended a pending outbox.
 */
const [path, json] = process.argv.slice(2);
if (!path || !json) throw new Error('Test fixture needs temp database and synthetic request');
const db = openLocalDatabase(path);
const exec = db.exec.bind(db);
const intercept = new Proxy(db, {
  get(target, key) {
    if (key === 'exec') {
      return (sql) => {
        if (sql === 'COMMIT') {
          writeSync(1, 'POS019_BEFORE_COMMIT\n');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60_000);
          throw new Error('Child was not killed before COMMIT');
        }
        return exec(sql);
      };
    }
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
commitLocalCashSale(intercept, JSON.parse(json));
throw new Error('Crash fixture must never reach successful commit');
