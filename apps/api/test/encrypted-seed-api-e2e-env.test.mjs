import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveEncryptedSeedApiPostgresEnvironment } from './run-encrypted-seed-api-postgres-e2e.mjs';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const validEnvironment = {
  TASK6_SEED_API_E2E_DATABASE_URL:
    'postgresql://rehab:secret@127.0.0.1:32768/rehab_regression?schema=ignored',
  TASK6_SEED_API_E2E_CONFIRM_ISOLATED_SCHEMA: 'YES',
  TASK6_SEED_API_E2E_SENSITIVE_DATA_KEY_REF:
    'secret-manager://rehab/task6-seed-api-test',
  TASK6_SEED_API_E2E_SENSITIVE_DATA_KEY: Buffer.alloc(32, 41).toString(
    'base64',
  ),
  TASK6_SEED_API_E2E_SEED_PASSWORD: 'Task6-Seed-Api-253913!',
  TASK6_SEED_API_E2E_JWT_SECRET: 'task6-seed-api-jwt-secret-253913-explicit',
};

test('accepts complete explicit inputs and removes caller schema selection', () => {
  const result = resolveEncryptedSeedApiPostgresEnvironment(validEnvironment);
  const databaseUrl = new URL(result.databaseUrl);

  assert.equal(databaseUrl.protocol, 'postgresql:');
  assert.equal(databaseUrl.pathname, '/rehab_regression');
  assert.equal(databaseUrl.searchParams.has('schema'), false);
  assert.equal(
    result.seedPassword,
    validEnvironment.TASK6_SEED_API_E2E_SEED_PASSWORD,
  );
});

test('rejects missing database URL and isolated-schema confirmation', () => {
  assert.throws(
    () => resolveEncryptedSeedApiPostgresEnvironment({}),
    /TASK6_SEED_API_E2E_DATABASE_URL/,
  );
  assert.throws(
    () =>
      resolveEncryptedSeedApiPostgresEnvironment({
        ...validEnvironment,
        TASK6_SEED_API_E2E_CONFIRM_ISOLATED_SCHEMA: undefined,
      }),
    /CONFIRM_ISOLATED_SCHEMA=YES/,
  );
});

test('rejects non-PostgreSQL URLs and URLs without a database name', () => {
  for (const databaseUrl of [
    'mysql://rehab:secret@127.0.0.1/rehab_regression',
    'postgresql://rehab:secret@127.0.0.1/',
  ]) {
    assert.throws(
      () =>
        resolveEncryptedSeedApiPostgresEnvironment({
          ...validEnvironment,
          TASK6_SEED_API_E2E_DATABASE_URL: databaseUrl,
        }),
      /PostgreSQL|database name/,
    );
  }
});

test('rejects absent or invalid explicit encryption inputs', () => {
  for (const override of [
    { TASK6_SEED_API_E2E_SENSITIVE_DATA_KEY_REF: undefined },
    { TASK6_SEED_API_E2E_SENSITIVE_DATA_KEY: undefined },
    { TASK6_SEED_API_E2E_SENSITIVE_DATA_KEY: 'not-canonical-base64' },
    {
      TASK6_SEED_API_E2E_SENSITIVE_DATA_KEY: Buffer.alloc(31, 41).toString(
        'base64',
      ),
    },
  ]) {
    assert.throws(
      () =>
        resolveEncryptedSeedApiPostgresEnvironment({
          ...validEnvironment,
          ...override,
        }),
      /SENSITIVE_DATA_KEY/,
    );
  }
});

test('rejects missing seed password and missing or weak JWT secrets', () => {
  for (const override of [
    { TASK6_SEED_API_E2E_SEED_PASSWORD: undefined },
    { TASK6_SEED_API_E2E_JWT_SECRET: undefined },
    { TASK6_SEED_API_E2E_JWT_SECRET: 'too-short' },
  ]) {
    assert.throws(() =>
      resolveEncryptedSeedApiPostgresEnvironment({
        ...validEnvironment,
        ...override,
      }),
    );
  }
});

test('API package exposes the encrypted-seed API PostgreSQL smoke runner', async () => {
  const packageJson = JSON.parse(
    await readFile(resolve(apiRoot, 'package.json'), 'utf8'),
  );
  assert.equal(
    packageJson.scripts?.['test:e2e:encrypted-seed-api'],
    'node ./test/run-encrypted-seed-api-postgres-e2e.mjs',
  );
});
