import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  continuousConversationRouteCommands,
  resolveContinuousConversationRouteEnvironment,
} from './run-continuous-conversation-high-cost-route-e2e.mjs';

function validEnvironment() {
  return {
    CI: 'true',
    MIMO_ROUTE_E2E_CONFIRM_DISPOSABLE: 'YES',
    MIMO_ROUTE_E2E_DATABASE_URL:
      'postgresql://postgres:postgres@127.0.0.1:5432/rehab_mimo_route_test',
    MIMO_ROUTE_E2E_REDIS_URL: 'redis://rehab-mimo-route-ci.internal:6379/14',
    MIMO_ROUTE_E2E_API_PORT_A: '4311',
    MIMO_ROUTE_E2E_API_PORT_B: '4312',
    MIMO_ROUTE_E2E_JWT_SECRET: 'route-jwt-secret-with-at-least-32-bytes',
    MIMO_ROUTE_E2E_SEED_PASSWORD: 'seed-password-value',
    MIMO_ROUTE_E2E_RESET_PASSWORD: 'reset-password-value',
    MIMO_ROUTE_E2E_SENSITIVE_DATA_KEY_FILE:
      '/etc/secrets/rehab_mimo_route_ci_sensitive_data_key',
    MIMO_ROUTE_E2E_MIMO_API_KEY_FILE:
      '/etc/secrets/rehab_mimo_route_ci_mimo_api_key',
  };
}

test('requires CI, exact disposable targets, distinct ports, and Secret Files', () => {
  const resolved =
    resolveContinuousConversationRouteEnvironment(validEnvironment());
  assert.equal(resolved.firstPort, 4311);
  assert.equal(resolved.secondPort, 4312);

  for (const name of Object.keys(validEnvironment())) {
    const environment = validEnvironment();
    delete environment[name];
    assert.throws(
      () => resolveContinuousConversationRouteEnvironment(environment),
      undefined,
      name,
    );
  }
  assert.throws(
    () =>
      resolveContinuousConversationRouteEnvironment({
        ...validEnvironment(),
        MIMO_ROUTE_E2E_DATABASE_URL:
          'postgresql://postgres:postgres@127.0.0.1:5432/project_database',
      }),
    /dedicated rehab_mimo_route_test database/,
  );
  assert.throws(
    () =>
      resolveContinuousConversationRouteEnvironment({
        ...validEnvironment(),
        MIMO_ROUTE_E2E_REDIS_URL: 'redis://127.0.0.1:6379/14',
      }),
    /must be exactly/,
  );
  assert.throws(
    () =>
      resolveContinuousConversationRouteEnvironment({
        ...validEnvironment(),
        MIMO_ROUTE_E2E_API_PORT_B: '4311',
      }),
    /ports must be distinct/,
  );
});

test('rejects raw production secret environment variables before database reset', () => {
  for (const name of [
    'MIMO_API_KEY',
    'AI_API_KEY',
    'SPEECH_API_KEY',
    'TTS_API_KEY',
    'SENSITIVE_DATA_KEY',
  ]) {
    assert.throws(
      () =>
        resolveContinuousConversationRouteEnvironment({
          ...validEnvironment(),
          [name]: 'forbidden-value',
        }),
      new RegExp(`${name} must remain absent`),
    );
  }
});

test('uses the migrated seeded database and the compiled production API entrypoint', () => {
  assert.deepEqual(
    continuousConversationRouteCommands.map(({ args }) => args.join(' ')),
    [
      '--filter @rehab-platform/db exec prisma migrate reset --force --skip-seed',
      '--filter @rehab-platform/db build',
      '--filter @rehab-platform/db exec tsx prisma/seed.ts',
      '--filter @rehab-platform/api build',
    ],
  );

  const source = readFileSync(
    resolve(
      import.meta.dirname,
      'run-continuous-conversation-high-cost-route-e2e.mjs',
    ),
    'utf8',
  );
  assert.match(source, /NODE_ENV: 'production'/);
  assert.match(source, /apps\/api\/dist\/main\.js/);
  assert.match(source, /\/health\/ready/);
  assert.match(source, /\/ai\/conversations\/\$\{sessionId\}\/messages/);
  assert.match(source, /result\.response\.status !== 404/);
  assert.match(source, /result\.response\.status !== 429/);
  assert.match(source, /redisCount !== '4'/);
  assert.match(source, /providerCallTelemetry\.count\(\)\) !== 0/);
  assert.doesNotMatch(
    source,
    /supertest|@nestjs\/testing|start:dev|NODE_ENV:\s*'test'|mock|fallback/i,
  );
});
