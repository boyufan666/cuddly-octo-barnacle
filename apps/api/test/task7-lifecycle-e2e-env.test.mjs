import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTask7DisposableDatabaseUrl } from './run-task7-postgres-lifecycle.mjs';

const disposableUrl =
  'postgresql://rehab:secret@127.0.0.1:55432/rehab_task7_api_test?schema=public';

test('accepts only the explicitly confirmed Task 7 disposable database', () => {
  assert.equal(
    resolveTask7DisposableDatabaseUrl({
      TASK7_API_E2E_DATABASE_URL: disposableUrl,
      TASK7_API_E2E_CONFIRM_DISPOSABLE: 'YES',
    }),
    disposableUrl,
  );
});

test('rejects missing disposable confirmation', () => {
  assert.throws(
    () =>
      resolveTask7DisposableDatabaseUrl({
        TASK7_API_E2E_DATABASE_URL: disposableUrl,
      }),
    /TASK7_API_E2E_CONFIRM_DISPOSABLE=YES/,
  );
});

test('hard-rejects rehab_platform and every non-Task7 database name', () => {
  for (const databaseName of [
    'rehab_platform',
    'rehab_task4_followup_test',
    'rehab_task7_api_test_copy',
  ]) {
    assert.throws(
      () =>
        resolveTask7DisposableDatabaseUrl({
          TASK7_API_E2E_DATABASE_URL: disposableUrl.replace(
            'rehab_task7_api_test',
            databaseName,
          ),
          TASK7_API_E2E_CONFIRM_DISPOSABLE: 'YES',
        }),
      /dedicated rehab_task7_api_test database/,
    );
  }
});

test('rejects non-PostgreSQL URLs and URLs without a database name', () => {
  for (const databaseUrl of [
    'mysql://rehab:secret@127.0.0.1/rehab_task7_api_test',
    'postgresql://rehab:secret@127.0.0.1/',
  ]) {
    assert.throws(
      () =>
        resolveTask7DisposableDatabaseUrl({
          TASK7_API_E2E_DATABASE_URL: databaseUrl,
          TASK7_API_E2E_CONFIRM_DISPOSABLE: 'YES',
        }),
      /PostgreSQL|database name/,
    );
  }
});
