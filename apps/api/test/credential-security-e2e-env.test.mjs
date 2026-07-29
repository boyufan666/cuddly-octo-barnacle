import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDisposableDatabaseUrl } from './run-credential-security-postgres-e2e.mjs';

test('credential security PostgreSQL e2e hard-fails without an explicit URL', () => {
  assert.throws(
    () => resolveDisposableDatabaseUrl({}),
    /TASK2_E2E_DATABASE_URL is required/,
  );
});

test('credential security PostgreSQL e2e requires an explicit disposable confirmation', () => {
  assert.throws(
    () =>
      resolveDisposableDatabaseUrl({
        TASK2_E2E_DATABASE_URL:
          'postgresql://localhost/rehab_task2_credential_test',
      }),
    /TASK2_E2E_CONFIRM_DISPOSABLE=YES/,
  );
});

test('credential security PostgreSQL e2e accepts only a confirmed PostgreSQL database', () => {
  const databaseUrl = 'postgresql://localhost/rehab_task2_credential_test';
  assert.equal(
    resolveDisposableDatabaseUrl({
      TASK2_E2E_DATABASE_URL: databaseUrl,
      TASK2_E2E_CONFIRM_DISPOSABLE: 'YES',
    }),
    databaseUrl,
  );
  assert.throws(
    () =>
      resolveDisposableDatabaseUrl({
        TASK2_E2E_DATABASE_URL: 'mysql://localhost/rehab_task2_credential_test',
        TASK2_E2E_CONFIRM_DISPOSABLE: 'YES',
      }),
    /PostgreSQL/,
  );
});

test('credential security PostgreSQL e2e rejects every non-dedicated database and schema', () => {
  for (const databaseName of [
    'rehab_regression',
    'rehab_task2_test',
    'rehab_task2_credential_test_copy',
  ]) {
    assert.throws(
      () =>
        resolveDisposableDatabaseUrl({
          TASK2_E2E_DATABASE_URL: `postgresql://localhost/${databaseName}`,
          TASK2_E2E_CONFIRM_DISPOSABLE: 'YES',
        }),
      /dedicated rehab_task2_credential_test database/,
    );
  }

  assert.throws(
    () =>
      resolveDisposableDatabaseUrl({
        TASK2_E2E_DATABASE_URL:
          'postgresql://localhost/rehab_task2_credential_test?schema=public',
        TASK2_E2E_CONFIRM_DISPOSABLE: 'YES',
      }),
    /must not select a schema/,
  );
});
