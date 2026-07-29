import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

function requireExactInput(env, name) {
  const value = env[name];
  if (!value || value.trim() !== value) {
    throw new Error(`${name} must be an exact non-empty value.`);
  }
  return value;
}

function requirePositiveSafeInteger(env, name) {
  const value = requireExactInput(env, name);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return value;
}

export function resolveApiSmokePostgresEnvironment(env) {
  const rawDatabaseUrl = requireExactInput(env, 'API_SMOKE_DATABASE_URL');
  if (env.API_SMOKE_CONFIRM_DISPOSABLE !== 'YES') {
    throw new Error(
      'Set API_SMOKE_CONFIRM_DISPOSABLE=YES to authorize resetting the disposable PostgreSQL database.',
    );
  }
  const databaseUrl = new URL(rawDatabaseUrl);
  if (!['postgresql:', 'postgres:'].includes(databaseUrl.protocol)) {
    throw new Error('API_SMOKE_DATABASE_URL must reference PostgreSQL.');
  }
  if (decodeURIComponent(databaseUrl.pathname) !== '/rehab_api_smoke_test') {
    throw new Error(
      'API_SMOKE_DATABASE_URL database name must be rehab_api_smoke_test.',
    );
  }
  if (databaseUrl.searchParams.has('schema')) {
    throw new Error('API_SMOKE_DATABASE_URL must not select a schema.');
  }

  const seedPassword = requireExactInput(env, 'API_SMOKE_SEED_PASSWORD');
  const jwtSecret = requireExactInput(env, 'API_SMOKE_JWT_SECRET');
  if (Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    throw new Error(
      'API_SMOKE_JWT_SECRET must contain at least 32 UTF-8 bytes.',
    );
  }
  const cookieSecure = requireExactInput(env, 'API_SMOKE_COOKIE_SECURE');
  if (cookieSecure !== 'true' && cookieSecure !== 'false') {
    throw new Error('API_SMOKE_COOKIE_SECURE must be exactly true or false.');
  }
  const throttleLimit = requirePositiveSafeInteger(
    env,
    'API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_LIMIT',
  );
  const throttleTtlMs = requirePositiveSafeInteger(
    env,
    'API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS',
  );
  const sensitiveDataKeyRef = requireExactInput(
    env,
    'API_SMOKE_SENSITIVE_DATA_KEY_REF',
  );
  const sensitiveDataKey = requireExactInput(
    env,
    'API_SMOKE_SENSITIVE_DATA_KEY',
  );
  const decodedKey = Buffer.from(sensitiveDataKey, 'base64');
  if (
    decodedKey.byteLength !== 32 ||
    decodedKey.toString('base64') !== sensitiveDataKey
  ) {
    throw new Error(
      'API_SMOKE_SENSITIVE_DATA_KEY must be canonical base64 encoding exactly 32 bytes.',
    );
  }

  return {
    databaseUrl: rawDatabaseUrl,
    seedPassword,
    jwtSecret,
    cookieSecure,
    throttleLimit,
    throttleTtlMs,
    sensitiveDataKeyRef,
    sensitiveDataKey,
  };
}

export const apiSmokePostgresCommands = Object.freeze([
  Object.freeze({
    command: 'pnpm',
    args: Object.freeze([
      '--filter',
      '@rehab-platform/db',
      'exec',
      'prisma',
      'migrate',
      'reset',
      '--force',
      '--skip-seed',
    ]),
  }),
  Object.freeze({
    command: 'pnpm',
    args: Object.freeze(['--filter', '@rehab-platform/db', 'build']),
  }),
  Object.freeze({
    command: 'pnpm',
    args: Object.freeze([
      '--filter',
      '@rehab-platform/db',
      'exec',
      'tsx',
      'prisma/seed.ts',
    ]),
  }),
  Object.freeze({
    command: 'pnpm',
    args: Object.freeze([
      '--filter',
      '@rehab-platform/api',
      'exec',
      'jest',
      '--config',
      './test/jest-e2e.json',
      '--runInBand',
    ]),
  }),
]);

function runChild(commandEntry, environment) {
  const result = spawnSync(commandEntry.command, commandEntry.args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${commandEntry.command} ${commandEntry.args.join(' ')} failed with status ${String(result.status)}.`,
    );
  }
}

export function runApiSmokePostgresE2e(
  env = process.env,
  executeCommand = runChild,
) {
  const input = resolveApiSmokePostgresEnvironment(env);
  const childEnvironment = {
    ...env,
    DATABASE_URL: input.databaseUrl,
    DEFAULT_PATIENT_PASSWORD: input.seedPassword,
    API_SMOKE_SEED_PASSWORD: input.seedPassword,
    JWT_SECRET: input.jwtSecret,
    COOKIE_SECURE: input.cookieSecure,
    PUBLIC_CREDENTIAL_THROTTLE_LIMIT: input.throttleLimit,
    PUBLIC_CREDENTIAL_THROTTLE_TTL_MS: input.throttleTtlMs,
    SENSITIVE_DATA_KEY_REF: input.sensitiveDataKeyRef,
    SENSITIVE_DATA_KEY: input.sensitiveDataKey,
  };

  for (const commandEntry of apiSmokePostgresCommands) {
    executeCommand(commandEntry, childEnvironment);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    runApiSmokePostgresE2e();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
