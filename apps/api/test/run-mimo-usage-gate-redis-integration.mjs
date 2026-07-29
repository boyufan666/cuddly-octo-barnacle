import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const expectedRedisTestUrl = 'redis://127.0.0.1:6379/15';

export function resolveMimoUsageGateRedisIntegrationEnvironment(
  env = process.env,
) {
  const redisUrl = env.MIMO_USAGE_GATE_REDIS_TEST_URL;
  if (!redisUrl || redisUrl.trim() !== redisUrl) {
    throw new Error(
      'MIMO_USAGE_GATE_REDIS_TEST_URL is required for the Redis integration test.',
    );
  }
  if (env.MIMO_USAGE_GATE_REDIS_TEST_CONFIRM_DISPOSABLE !== 'YES') {
    throw new Error(
      'Set MIMO_USAGE_GATE_REDIS_TEST_CONFIRM_DISPOSABLE=YES to confirm the dedicated disposable Redis target.',
    );
  }
  if (redisUrl !== expectedRedisTestUrl) {
    throw new Error(
      `MIMO_USAGE_GATE_REDIS_TEST_URL must be exactly ${expectedRedisTestUrl}; Render, production, remote, credentialed, and non-dedicated Redis targets are forbidden.`,
    );
  }
  return redisUrl;
}

export function runMimoUsageGateRedisIntegration(env = process.env) {
  const redisUrl = resolveMimoUsageGateRedisIntegrationEnvironment(env);
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@rehab-platform/api',
      'exec',
      'jest',
      '--config',
      './test/jest-mimo-usage-gate-redis-integration.json',
      '--runInBand',
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...env,
        MIMO_USAGE_GATE_REDIS_TEST_URL: redisUrl,
      },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Mimo usage gate Redis integration test failed with status ${String(result.status)}.`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runMimoUsageGateRedisIntegration();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
