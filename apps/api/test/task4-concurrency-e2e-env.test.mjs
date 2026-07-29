import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveTask4DisposableDatabaseUrl } from './run-task4-postgres-concurrency.mjs';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('Task 4 PostgreSQL runner hard-fails without an explicit URL', () => {
  assert.throws(
    () => resolveTask4DisposableDatabaseUrl({}),
    /TASK4_E2E_DATABASE_URL is required/,
  );
});

test('Task 4 PostgreSQL runner requires explicit disposable confirmation', () => {
  assert.throws(
    () =>
      resolveTask4DisposableDatabaseUrl({
        TASK4_E2E_DATABASE_URL:
          'postgresql://localhost/rehab_task4_followup_test',
      }),
    /TASK4_E2E_CONFIRM_DISPOSABLE=YES/,
  );
});

test('Task 4 PostgreSQL runner rejects non-PostgreSQL URLs', () => {
  assert.throws(
    () =>
      resolveTask4DisposableDatabaseUrl({
        TASK4_E2E_DATABASE_URL:
          'mysql://localhost/rehab_task4_followup_test',
        TASK4_E2E_CONFIRM_DISPOSABLE: 'YES',
      }),
    /PostgreSQL/,
  );
});

test('Task 4 PostgreSQL runner accepts only an explicit confirmed URL', () => {
  const url = 'postgresql://localhost/rehab_task4_followup_test';
  assert.equal(
    resolveTask4DisposableDatabaseUrl({
      TASK4_E2E_DATABASE_URL: url,
      TASK4_E2E_CONFIRM_DISPOSABLE: 'YES',
    }),
    url,
  );
});

test('Task 4 PostgreSQL runner rejects every database except the dedicated follow-up database', () => {
  for (const databaseName of ['rehab_platform', 'rehab_task4_test']) {
    assert.throws(
      () =>
        resolveTask4DisposableDatabaseUrl({
          TASK4_E2E_DATABASE_URL: `postgresql://localhost/${databaseName}`,
          TASK4_E2E_CONFIRM_DISPOSABLE: 'YES',
        }),
      /rehab_task4_followup_test/,
    );
  }
});

test('API package exposes the explicit Task 4 PostgreSQL runner', async () => {
  const packageJson = JSON.parse(
    await readFile(resolve(apiRoot, 'package.json'), 'utf8'),
  );
  assert.equal(
    packageJson.scripts?.['test:e2e:task4'],
    'node ./test/run-task4-postgres-concurrency.mjs',
  );
});
