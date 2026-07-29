import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const task7DisposableDatabaseName = 'rehab_task7_api_test';

export function resolveTask7DisposableDatabaseUrl(env) {
  const databaseUrl = env.TASK7_API_E2E_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'TASK7_API_E2E_DATABASE_URL is required for Task 7 PostgreSQL lifecycle tests.',
    );
  }
  if (env.TASK7_API_E2E_CONFIRM_DISPOSABLE !== 'YES') {
    throw new Error(
      'Set TASK7_API_E2E_CONFIRM_DISPOSABLE=YES to confirm this database is disposable.',
    );
  }
  const parsed = new URL(databaseUrl);
  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
    throw new Error('TASK7_API_E2E_DATABASE_URL must reference PostgreSQL.');
  }
  if (!parsed.pathname || parsed.pathname === '/') {
    throw new Error('TASK7_API_E2E_DATABASE_URL must include a database name.');
  }
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (databaseName !== task7DisposableDatabaseName) {
    throw new Error(
      'TASK7_API_E2E_DATABASE_URL must reference the dedicated rehab_task7_api_test database.',
    );
  }
  return databaseUrl;
}

function run(command, args, options) {
  const result = spawnSync(command, args, { ...options, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function runTask7PostgresLifecycle(env = process.env) {
  const databaseUrl = resolveTask7DisposableDatabaseUrl(env);
  const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../..',
  );
  const childEnv = { ...env, DATABASE_URL: databaseUrl };

  run(
    'pnpm',
    [
      '--filter',
      '@rehab-platform/db',
      'exec',
      'prisma',
      'migrate',
      'reset',
      '--force',
      '--skip-seed',
    ],
    { cwd: repositoryRoot, env: childEnv },
  );
  run(
    'pnpm',
    [
      '--filter',
      '@rehab-platform/api',
      'exec',
      'jest',
      '--config',
      './test/jest-task7-postgres.json',
      '--runInBand',
    ],
    { cwd: repositoryRoot, env: childEnv },
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runTask7PostgresLifecycle();
}
