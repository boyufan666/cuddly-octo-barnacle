import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  resolveMimoUsageGateRedisIntegrationEnvironment,
} from './run-mimo-usage-gate-redis-integration.mjs';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const disposableRedisUrl = 'redis://127.0.0.1:6379/15';

test('Redis integration runner rejects an absent or unconfirmed target', () => {
  assert.throws(
    () => resolveMimoUsageGateRedisIntegrationEnvironment({}),
    /MIMO_USAGE_GATE_REDIS_TEST_URL is required/,
  );
  assert.throws(
    () =>
      resolveMimoUsageGateRedisIntegrationEnvironment({
        MIMO_USAGE_GATE_REDIS_TEST_URL: disposableRedisUrl,
      }),
    /MIMO_USAGE_GATE_REDIS_TEST_CONFIRM_DISPOSABLE=YES/,
  );
});

test('Redis integration runner rejects every non-dedicated address and accepts only its disposable target', () => {
  for (const redisUrl of [
    'redis://localhost:6379/15',
    'redis://127.0.0.1:6379/0',
    'redis://127.0.0.1:6380/15',
    'rediss://render-key-value.internal:6379/15',
    'redis://user:password@127.0.0.1:6379/15',
  ]) {
    assert.throws(
      () =>
        resolveMimoUsageGateRedisIntegrationEnvironment({
          MIMO_USAGE_GATE_REDIS_TEST_URL: redisUrl,
          MIMO_USAGE_GATE_REDIS_TEST_CONFIRM_DISPOSABLE: 'YES',
        }),
      /must be exactly/,
    );
  }
  assert.equal(
    resolveMimoUsageGateRedisIntegrationEnvironment({
      MIMO_USAGE_GATE_REDIS_TEST_URL: disposableRedisUrl,
      MIMO_USAGE_GATE_REDIS_TEST_CONFIRM_DISPOSABLE: 'YES',
    }),
    disposableRedisUrl,
  );
});

test('API package exposes the explicit Redis integration runner', async () => {
  const packageJson = JSON.parse(
    await readFile(resolve(apiRoot, 'package.json'), 'utf8'),
  );
  assert.equal(
    packageJson.scripts?.['test:integration:mimo-usage-gate-redis'],
    'node ./test/run-mimo-usage-gate-redis-integration.mjs',
  );
});
