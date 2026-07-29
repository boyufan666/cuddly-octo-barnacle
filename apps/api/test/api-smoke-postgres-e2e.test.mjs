import assert from 'node:assert/strict';
import test from 'node:test';

import {
  apiSmokePostgresCommands,
  resolveApiSmokePostgresEnvironment,
  runApiSmokePostgresE2e,
} from './run-api-smoke-postgres-e2e.mjs';

function validEnvironment() {
  return {
    API_SMOKE_DATABASE_URL:
      'postgresql://smoke:secret@127.0.0.1:5432/rehab_api_smoke_test',
    API_SMOKE_CONFIRM_DISPOSABLE: 'YES',
    API_SMOKE_SEED_PASSWORD: 'Smoke-Seed-253913!',
    API_SMOKE_JWT_SECRET: 'smoke-jwt-secret-with-at-least-32-bytes',
    API_SMOKE_COOKIE_SECURE: 'false',
    API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_LIMIT: '100',
    API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS: '60000',
    API_SMOKE_SENSITIVE_DATA_KEY_REF: 'secret-manager://smoke/key',
    API_SMOKE_SENSITIVE_DATA_KEY: Buffer.alloc(32, 9).toString('base64'),
  };
}

test('rejects every missing required API smoke input before commands run', () => {
  for (const name of Object.keys(validEnvironment())) {
    const environment = validEnvironment();
    delete environment[name];
    const calls = [];
    assert.throws(() =>
      runApiSmokePostgresE2e(environment, (entry) => calls.push(entry)),
    );
    assert.deepEqual(calls, [], name);
  }
});

test('requires exact disposable confirmation and the dedicated PostgreSQL database', () => {
  assert.throws(
    () =>
      resolveApiSmokePostgresEnvironment({
        ...validEnvironment(),
        API_SMOKE_CONFIRM_DISPOSABLE: 'true',
      }),
    /API_SMOKE_CONFIRM_DISPOSABLE=YES/,
  );
  assert.throws(
    () =>
      resolveApiSmokePostgresEnvironment({
        ...validEnvironment(),
        API_SMOKE_DATABASE_URL:
          'mysql://smoke:secret@127.0.0.1/rehab_api_smoke_test',
      }),
    /must reference PostgreSQL/,
  );
  assert.throws(
    () =>
      resolveApiSmokePostgresEnvironment({
        ...validEnvironment(),
        API_SMOKE_DATABASE_URL:
          'postgresql://smoke:secret@127.0.0.1:5432/project_database',
      }),
    /database name must be rehab_api_smoke_test/,
  );
  assert.throws(
    () =>
      resolveApiSmokePostgresEnvironment({
        ...validEnvironment(),
        API_SMOKE_DATABASE_URL:
          'postgresql://smoke:secret@127.0.0.1:5432/rehab_api_smoke_test?schema=public',
      }),
    /must not select a schema/,
  );
});

test('strictly validates runtime security inputs', () => {
  const invalidValues = [
    ['API_SMOKE_JWT_SECRET', 'short', /at least 32 UTF-8 bytes/],
    ['API_SMOKE_COOKIE_SECURE', 'FALSE', /exactly true or false/],
    [
      'API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_LIMIT',
      '0',
      /positive safe integer/,
    ],
    [
      'API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS',
      '1.5',
      /positive safe integer/,
    ],
    ['API_SMOKE_SENSITIVE_DATA_KEY_REF', ' padded ', /exact non-empty/],
    [
      'API_SMOKE_SENSITIVE_DATA_KEY',
      Buffer.alloc(31).toString('base64'),
      /canonical base64 encoding exactly 32 bytes/,
    ],
  ];
  for (const [name, value, expected] of invalidValues) {
    assert.throws(
      () =>
        resolveApiSmokePostgresEnvironment({
          ...validEnvironment(),
          [name]: value,
        }),
      expected,
      name,
    );
  }
});

test('runs reset, database build, seed, and app Jest in one exact order', () => {
  assert.deepEqual(
    apiSmokePostgresCommands.map(({ args }) => args.join(' ')),
    [
      '--filter @rehab-platform/db exec prisma migrate reset --force --skip-seed',
      '--filter @rehab-platform/db build',
      '--filter @rehab-platform/db exec tsx prisma/seed.ts',
      '--filter @rehab-platform/api exec jest --config ./test/jest-e2e.json --runInBand',
    ],
  );

  const calls = [];
  runApiSmokePostgresE2e(validEnvironment(), (entry, childEnvironment) => {
    calls.push(entry);
    assert.equal(
      childEnvironment.DATABASE_URL,
      validEnvironment().API_SMOKE_DATABASE_URL,
    );
    assert.equal(
      childEnvironment.DEFAULT_PATIENT_PASSWORD,
      validEnvironment().API_SMOKE_SEED_PASSWORD,
    );
    assert.equal(
      childEnvironment.API_SMOKE_SEED_PASSWORD,
      validEnvironment().API_SMOKE_SEED_PASSWORD,
    );
  });
  assert.deepEqual(calls, apiSmokePostgresCommands);
});

test('stops at the first failed command', () => {
  const calls = [];
  assert.throws(
    () =>
      runApiSmokePostgresE2e(validEnvironment(), (entry) => {
        calls.push(entry);
        if (calls.length === 2) throw new Error('build failed');
      }),
    /build failed/,
  );
  assert.deepEqual(calls, apiSmokePostgresCommands.slice(0, 2));
});
