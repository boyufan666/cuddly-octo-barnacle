import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const credentialDisposableDatabaseName = 'rehab_task2_credential_test';

export function resolveDisposableDatabaseUrl(env) {
  const databaseUrl = env.TASK2_E2E_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'TASK2_E2E_DATABASE_URL is required for credential security PostgreSQL e2e.',
    );
  }
  if (env.TASK2_E2E_CONFIRM_DISPOSABLE !== 'YES') {
    throw new Error(
      'Set TASK2_E2E_CONFIRM_DISPOSABLE=YES to confirm this database is disposable.',
    );
  }
  const parsed = new URL(databaseUrl);
  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
    throw new Error('TASK2_E2E_DATABASE_URL must reference PostgreSQL.');
  }
  if (!parsed.pathname || parsed.pathname === '/') {
    throw new Error('TASK2_E2E_DATABASE_URL must include a database name.');
  }
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (databaseName !== credentialDisposableDatabaseName) {
    throw new Error(
      'TASK2_E2E_DATABASE_URL must reference the dedicated rehab_task2_credential_test database.',
    );
  }
  if (parsed.searchParams.has('schema')) {
    throw new Error('TASK2_E2E_DATABASE_URL must not select a schema.');
  }
  return databaseUrl;
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function runCredentialSecurityPostgresE2e(env = process.env) {
  const databaseUrl = resolveDisposableDatabaseUrl(env);
  const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../..',
  );
  const childEnv = {
    ...env,
    DATABASE_URL: databaseUrl,
  };
  run(
    'pnpm',
    ['--filter', '@rehab-platform/db', 'exec', 'prisma', 'migrate', 'deploy'],
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
      './test/jest-credential-security-postgres.json',
      '--runInBand',
    ],
    { cwd: repositoryRoot, env: childEnv },
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runCredentialSecurityPostgresE2e();
}
