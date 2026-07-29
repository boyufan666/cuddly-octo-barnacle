import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

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

export function resolveEncryptedSeedApiPostgresEnvironment(env) {
  const rawDatabaseUrl = requireExactInput(
    env,
    'TASK6_SEED_API_E2E_DATABASE_URL',
  );
  if (env.TASK6_SEED_API_E2E_CONFIRM_ISOLATED_SCHEMA !== 'YES') {
    throw new Error(
      'Set TASK6_SEED_API_E2E_CONFIRM_ISOLATED_SCHEMA=YES to authorize an isolated PostgreSQL schema.',
    );
  }
  const databaseUrl = new URL(rawDatabaseUrl);
  if (!['postgresql:', 'postgres:'].includes(databaseUrl.protocol)) {
    throw new Error(
      'TASK6_SEED_API_E2E_DATABASE_URL must reference PostgreSQL.',
    );
  }
  if (!databaseUrl.pathname || databaseUrl.pathname === '/') {
    throw new Error(
      'TASK6_SEED_API_E2E_DATABASE_URL must include a database name.',
    );
  }
  databaseUrl.searchParams.delete('schema');

  const kid = requireExactInput(
    env,
    'TASK6_SEED_API_E2E_SENSITIVE_DATA_KEY_REF',
  );
  const encodedKey = requireExactInput(
    env,
    'TASK6_SEED_API_E2E_SENSITIVE_DATA_KEY',
  );
  const key = Buffer.from(encodedKey, 'base64');
  if (key.byteLength !== 32 || key.toString('base64') !== encodedKey) {
    throw new Error(
      'TASK6_SEED_API_E2E_SENSITIVE_DATA_KEY must be canonical base64 encoding exactly 32 bytes.',
    );
  }
  const seedPassword = requireExactInput(
    env,
    'TASK6_SEED_API_E2E_SEED_PASSWORD',
  );
  const jwtSecret = requireExactInput(env, 'TASK6_SEED_API_E2E_JWT_SECRET');
  if (Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    throw new Error(
      'TASK6_SEED_API_E2E_JWT_SECRET must contain at least 32 UTF-8 bytes.',
    );
  }

  return {
    databaseUrl: databaseUrl.toString(),
    kid,
    encodedKey,
    seedPassword,
    jwtSecret,
  };
}

function run(command, args, environment) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with status ${result.status}.`,
    );
  }
}

function quoteIdentifier(value) {
  if (!/^[a-z][a-z0-9_]+$/.test(value)) {
    throw new Error('Generated PostgreSQL schema name is invalid.');
  }
  return `"${value}"`;
}

export async function runEncryptedSeedApiPostgresE2e(env = process.env) {
  const input = resolveEncryptedSeedApiPostgresEnvironment(env);
  const schemaName = `task6_seed_api_${process.pid}_${randomBytes(6).toString('hex')}`;
  const scopedUrl = new URL(input.databaseUrl);
  scopedUrl.searchParams.set('schema', schemaName);
  const databaseUrl = scopedUrl.toString();
  const admin = new PrismaClient({
    datasources: { db: { url: input.databaseUrl } },
  });
  const childEnvironment = {
    ...env,
    DATABASE_URL: databaseUrl,
    DEFAULT_PATIENT_PASSWORD: input.seedPassword,
    SENSITIVE_DATA_KEY_REF: input.kid,
    SENSITIVE_DATA_KEY: input.encodedKey,
    JWT_SECRET: input.jwtSecret,
    TASK6_SEED_API_E2E_SEED_PASSWORD: input.seedPassword,
    TASK6_SEED_API_E2E_SCOPED_DATABASE_URL: databaseUrl,
  };

  await admin.$connect();
  try {
    await admin.$executeRawUnsafe(
      `CREATE SCHEMA ${quoteIdentifier(schemaName)}`,
    );
    run('pnpm', ['--filter', '@rehab-platform/db', 'build'], childEnvironment);
    run(
      'pnpm',
      ['--filter', '@rehab-platform/db', 'exec', 'prisma', 'migrate', 'deploy'],
      childEnvironment,
    );
    run(
      'pnpm',
      ['--filter', '@rehab-platform/db', 'exec', 'tsx', 'prisma/seed.ts'],
      childEnvironment,
    );
    run(
      'pnpm',
      [
        '--filter',
        '@rehab-platform/api',
        'exec',
        'jest',
        '--config',
        './test/jest-encrypted-seed-api-postgres.json',
        '--runInBand',
      ],
      childEnvironment,
    );
  } finally {
    await admin.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`,
    );
    await admin.$disconnect();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runEncryptedSeedApiPostgresE2e().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
