#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const expectedDatabaseName = 'rehab_mimo_route_test';
const expectedRedisUrl = 'redis://rehab-mimo-route-ci.internal:6379/14';
const expectedSensitiveDataKeyFile =
  '/etc/secrets/rehab_mimo_route_ci_sensitive_data_key';
const expectedMimoApiKeyFile = '/etc/secrets/rehab_mimo_route_ci_mimo_api_key';
const providerHost = 'token-plan-cn.xiaomimimo.com';
const usageKeyPrefix = 'rehab:ci:continuous-conversation-route';
const forbiddenRawRuntimeSecretNames = [
  'MIMO_API_KEY',
  'AI_API_KEY',
  'SPEECH_API_KEY',
  'TTS_API_KEY',
  'SENSITIVE_DATA_KEY',
];

export const continuousConversationRouteCommands = Object.freeze([
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
    args: Object.freeze(['--filter', '@rehab-platform/api', 'build']),
  }),
]);

function requireExactInput(env, name) {
  const value = env[name];
  if (!value || value.trim() !== value) {
    throw new Error(`${name} must be an exact non-empty value.`);
  }
  return value;
}

function requirePort(env, name) {
  const rawValue = requireExactInput(env, name);
  if (!/^[1-9]\d*$/.test(rawValue)) {
    throw new Error(`${name} must be a port from 1 through 65535.`);
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value > 65_535) {
    throw new Error(`${name} must be a port from 1 through 65535.`);
  }
  return value;
}

export function resolveContinuousConversationRouteEnvironment(
  env = process.env,
) {
  if (env.CI !== 'true') {
    throw new Error(
      'Continuous conversation route integration is restricted to CI=true.',
    );
  }
  if (env.MIMO_ROUTE_E2E_CONFIRM_DISPOSABLE !== 'YES') {
    throw new Error(
      'Set MIMO_ROUTE_E2E_CONFIRM_DISPOSABLE=YES for the dedicated disposable PostgreSQL and Redis targets.',
    );
  }
  for (const name of forbiddenRawRuntimeSecretNames) {
    if (Object.prototype.hasOwnProperty.call(env, name)) {
      throw new Error(
        `${name} must remain absent; the production API instances require Secret Files.`,
      );
    }
  }

  const databaseUrl = requireExactInput(env, 'MIMO_ROUTE_E2E_DATABASE_URL');
  const parsedDatabaseUrl = new URL(databaseUrl);
  if (!['postgresql:', 'postgres:'].includes(parsedDatabaseUrl.protocol)) {
    throw new Error('MIMO_ROUTE_E2E_DATABASE_URL must reference PostgreSQL.');
  }
  if (
    decodeURIComponent(parsedDatabaseUrl.pathname) !==
    `/${expectedDatabaseName}`
  ) {
    throw new Error(
      `MIMO_ROUTE_E2E_DATABASE_URL must reference the dedicated ${expectedDatabaseName} database.`,
    );
  }
  if (parsedDatabaseUrl.searchParams.has('schema')) {
    throw new Error('MIMO_ROUTE_E2E_DATABASE_URL must not select a schema.');
  }

  const redisUrl = requireExactInput(env, 'MIMO_ROUTE_E2E_REDIS_URL');
  if (redisUrl !== expectedRedisUrl) {
    throw new Error(
      `MIMO_ROUTE_E2E_REDIS_URL must be exactly ${expectedRedisUrl}.`,
    );
  }

  const firstPort = requirePort(env, 'MIMO_ROUTE_E2E_API_PORT_A');
  const secondPort = requirePort(env, 'MIMO_ROUTE_E2E_API_PORT_B');
  if (firstPort === secondPort) {
    throw new Error('The two production API ports must be distinct.');
  }

  const jwtSecret = requireExactInput(env, 'MIMO_ROUTE_E2E_JWT_SECRET');
  if (Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    throw new Error(
      'MIMO_ROUTE_E2E_JWT_SECRET must contain at least 32 UTF-8 bytes.',
    );
  }
  const seedPassword = requireExactInput(env, 'MIMO_ROUTE_E2E_SEED_PASSWORD');
  const resetPassword = requireExactInput(env, 'MIMO_ROUTE_E2E_RESET_PASSWORD');
  if (
    seedPassword.length < 8 ||
    seedPassword.length > 128 ||
    resetPassword.length < 8 ||
    resetPassword.length > 128 ||
    seedPassword === resetPassword
  ) {
    throw new Error(
      'The two route integration passwords must be distinct 8 to 128 character values.',
    );
  }

  const sensitiveDataKeyFile = requireExactInput(
    env,
    'MIMO_ROUTE_E2E_SENSITIVE_DATA_KEY_FILE',
  );
  if (sensitiveDataKeyFile !== expectedSensitiveDataKeyFile) {
    throw new Error(
      `MIMO_ROUTE_E2E_SENSITIVE_DATA_KEY_FILE must be exactly ${expectedSensitiveDataKeyFile}.`,
    );
  }
  const mimoApiKeyFile = requireExactInput(
    env,
    'MIMO_ROUTE_E2E_MIMO_API_KEY_FILE',
  );
  if (mimoApiKeyFile !== expectedMimoApiKeyFile) {
    throw new Error(
      `MIMO_ROUTE_E2E_MIMO_API_KEY_FILE must be exactly ${expectedMimoApiKeyFile}.`,
    );
  }

  return {
    databaseUrl,
    redisUrl,
    firstPort,
    secondPort,
    jwtSecret,
    seedPassword,
    resetPassword,
    sensitiveDataKeyFile,
    mimoApiKeyFile,
  };
}

function readRequiredSecretFile(path, kind) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error(`${kind} must be a private regular Secret File.`);
  }
  const value = readFileSync(path, 'utf8');
  if (!value || value.trim() !== value) {
    throw new Error(`${kind} must contain one exact non-empty value.`);
  }
  return value;
}

function requireCanonicalSensitiveDataKey(value) {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.byteLength !== 32 || decoded.toString('base64') !== value) {
    throw new Error(
      'The sensitive data Secret File must contain canonical base64 for exactly 32 bytes.',
    );
  }
}

function runCommand(entry, environment) {
  const result = spawnSync(entry.command, entry.args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${entry.command} ${entry.args.join(' ')} failed with status ${String(result.status)}.`,
    );
  }
}

function productionRuntimeEnvironment(input, port, env) {
  const inheritedNames = [
    'PATH',
    'HOME',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'TZ',
    'NODE_OPTIONS',
  ];
  const runtimeEnvironment = {};
  for (const name of inheritedNames) {
    if (env[name] !== undefined) runtimeEnvironment[name] = env[name];
  }
  return {
    ...runtimeEnvironment,
    NODE_ENV: 'production',
    DATABASE_URL: input.databaseUrl,
    JWT_SECRET: input.jwtSecret,
    COOKIE_SECURE: 'true',
    WEB_ORIGIN: 'https://rehab-route-ci.example',
    PORT: String(port),
    PUBLIC_CREDENTIAL_THROTTLE_LIMIT: '100',
    PUBLIC_CREDENTIAL_THROTTLE_TTL_MS: '60000',
    SENSITIVE_DATA_KEY_REF: 'secret-manager://ci/continuous-conversation',
    SENSITIVE_DATA_KEY_FILE: input.sensitiveDataKeyFile,
    MIMO_API_KEY_REF: 'secret-manager://ci/mimo-route-not-invoked',
    MIMO_API_KEY_FILE: input.mimoApiKeyFile,
    MIMO_ALLOWED_HOSTS: providerHost,
    AI_REQUIRED_FOR_LAUNCH: 'true',
    SPEECH_REQUIRED_FOR_LAUNCH: 'true',
    TTS_REQUIRED_FOR_LAUNCH: 'true',
    AI_HUMAN_REVIEW_REQUIRED: 'true',
    AI_PROVIDER: 'xiaomi-mimo',
    AI_MODEL_VERSION: 'mimo-v2.5',
    AI_MODEL_ENDPOINT: `https://${providerHost}/v1`,
    AI_PROMPT_VERSION: 'continuous-conversation-ci-v1',
    SPEECH_PROVIDER: 'xiaomi-mimo-audio-understanding',
    SPEECH_MODEL_VERSION: 'mimo-v2.5',
    SPEECH_TO_TEXT_ENDPOINT: `https://${providerHost}/v1/chat/completions`,
    TTS_PROVIDER: 'xiaomi-mimo-tts',
    TTS_MODEL_VERSION: 'mimo-v2.5-tts',
    TTS_ENDPOINT: `https://${providerHost}/v1/chat/completions`,
    TTS_VOICE_ID: 'default_zh',
    TTS_OUTPUT_FORMAT: 'wav',
    AI_PROVIDER_TIMEOUT_MS: '10000',
    AI_PROVIDER_MAX_RESPONSE_BYTES: '1048576',
    SPEECH_PROVIDER_TIMEOUT_MS: '10000',
    SPEECH_PROVIDER_MAX_RESPONSE_BYTES: '1048576',
    STT_MAX_DECODED_AUDIO_BYTES: '1048576',
    STT_MAX_DURATION_SECONDS: '600',
    TTS_PROVIDER_TIMEOUT_MS: '10000',
    TTS_PROVIDER_MAX_RESPONSE_BYTES: '1048576',
    MIMO_KEY_VALUE_URL: input.redisUrl,
    MIMO_USAGE_KEY_PREFIX: usageKeyPrefix,
    MIMO_USAGE_WINDOW_MS: '60000',
    MIMO_KEY_VALUE_PROBE_TIMEOUT_MS: '1000',
    MIMO_USER_REQUEST_LIMIT: '100',
    MIMO_PATIENT_REQUEST_LIMIT: '100',
    MIMO_ORGANIZATION_REQUEST_LIMIT: '100',
    MIMO_SPEECH_SECONDS_LIMIT: '3600',
    MIMO_TTS_CHARACTERS_LIMIT: '100000',
    MIMO_USER_BUDGET_UNITS_LIMIT: '100',
    MIMO_PATIENT_BUDGET_UNITS_LIMIT: '100',
    MIMO_ORGANIZATION_BUDGET_UNITS_LIMIT: '100',
    MIMO_AI_COST_UNITS_PER_REQUEST: '1',
    MIMO_SPEECH_COST_UNITS_PER_SECOND: '1',
    MIMO_TTS_COST_UNITS_PER_CHARACTER: '1',
    MIMO_HIGH_COST_USER_OPERATION_REQUEST_LIMIT: '2',
    MIMO_HIGH_COST_USER_OPERATION_WINDOW_MS: '60000',
    PROVIDER_TELEMETRY_RETENTION_DAYS: '30',
    PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS: '120000',
  };
}

function startProductionApi(input, port, env) {
  const entryPoint = resolve(
    repositoryRoot,
    'apps/api/dist/main.js',
  );
  const child = spawn(process.execPath, [entryPoint], {
    cwd: repositoryRoot,
    env: productionRuntimeEnvironment(input, port, env),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.resume();
  child.stderr.resume();
  return child;
}

async function waitForReady(child, port) {
  const deadline = Date.now() + 30_000;
  const url = `http://127.0.0.1:${port}/health/ready`;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error('A production API instance exited before readiness.');
    }
    try {
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status !== 200) {
        throw new Error('A production API readiness check returned non-200.');
      }
      const body = await response.json();
      if (body?.status !== 'ready') {
        throw new Error('A production API readiness payload was invalid.');
      }
      return;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message ===
          'A production API readiness check returned non-200.' ||
          error.message === 'A production API readiness payload was invalid.')
      ) {
        throw error;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  throw new Error('A production API instance did not become ready in time.');
}

async function stopProductionApi(child) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit');
  if (!child.kill('SIGTERM')) {
    throw new Error('Failed to stop a production API instance.');
  }
  await exited;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
    ...options,
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('An API response was not JSON.');
  }
  return { response, body };
}

function responseCookie(response, name) {
  const headers =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
  const pattern = new RegExp(`(?:^|,\\s*)${name}=([^;]*)`);
  for (const header of headers) {
    const match = pattern.exec(header);
    if (match) return `${name}=${match[1]}`;
  }
  throw new Error(`API response did not set the required ${name} cookie.`);
}

async function authenticateDoctor(baseUrl, input) {
  const firstCsrf = await fetchJson(`${baseUrl}/auth/csrf`);
  if (firstCsrf.response.status !== 200 || !firstCsrf.body?.csrfToken) {
    throw new Error('Initial CSRF request failed.');
  }
  const firstCsrfCookie = responseCookie(firstCsrf.response, 'rehab_csrf');
  const firstLogin = await fetchJson(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: firstCsrfCookie,
      'x-csrf-token': firstCsrf.body.csrfToken,
    },
    body: JSON.stringify({
      account: 'doctor001',
      password: input.seedPassword,
    }),
  });
  if (
    firstLogin.response.status !== 201 ||
    firstLogin.body?.status !== 'password_reset_required'
  ) {
    throw new Error('Seeded doctor did not enter the required reset flow.');
  }
  const resetCookie = responseCookie(
    firstLogin.response,
    'rehab_password_reset',
  );
  const reset = await fetchJson(`${baseUrl}/auth/password-reset`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${firstCsrfCookie}; ${resetCookie}`,
      'x-csrf-token': firstCsrf.body.csrfToken,
    },
    body: JSON.stringify({ newPassword: input.resetPassword }),
  });
  if (reset.response.status !== 200) {
    throw new Error('Seeded doctor password reset failed.');
  }

  const secondCsrf = await fetchJson(`${baseUrl}/auth/csrf`);
  if (secondCsrf.response.status !== 200 || !secondCsrf.body?.csrfToken) {
    throw new Error('Post-reset CSRF request failed.');
  }
  const secondCsrfCookie = responseCookie(secondCsrf.response, 'rehab_csrf');
  const secondLogin = await fetchJson(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: secondCsrfCookie,
      'x-csrf-token': secondCsrf.body.csrfToken,
    },
    body: JSON.stringify({
      account: 'doctor001',
      password: input.resetPassword,
    }),
  });
  if (
    secondLogin.response.status !== 201 ||
    secondLogin.body?.status !== 'authenticated' ||
    typeof secondLogin.body?.user?.id !== 'string'
  ) {
    throw new Error('Seeded doctor authentication failed after reset.');
  }
  return {
    authCookie: responseCookie(secondLogin.response, 'rehab_session'),
    csrfCookie: secondCsrfCookie,
    csrfToken: secondCsrf.body.csrfToken,
    userId: secondLogin.body.user.id,
  };
}

async function appendToMissingConversation(baseUrl, sessionId, auth) {
  return fetchJson(`${baseUrl}/ai/conversations/${sessionId}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${auth.authCookie}; ${auth.csrfCookie}`,
      'x-csrf-token': auth.csrfToken,
    },
    body: '{}',
  });
}

function requirePostGuardNotFound(result) {
  if (
    result.response.status !== 404 ||
    result.body?.message !== 'AI 会话不存在。'
  ) {
    throw new Error(
      'A pre-limit request did not pass the real guard and stop at the missing conversation lookup.',
    );
  }
}

function requireGuardRejection(result) {
  if (result.response.status !== 429) {
    throw new Error(
      'A post-limit request was not rejected by the shared high-cost guard.',
    );
  }
}

export async function runContinuousConversationRouteIntegration(
  env = process.env,
) {
  const input = resolveContinuousConversationRouteEnvironment(env);
  const sensitiveDataKey = readRequiredSecretFile(
    input.sensitiveDataKeyFile,
    'Sensitive data key',
  );
  requireCanonicalSensitiveDataKey(sensitiveDataKey);
  readRequiredSecretFile(input.mimoApiKeyFile, 'MiMo API key');

  const databaseEnvironment = {
    ...env,
    DATABASE_URL: input.databaseUrl,
  };
  runCommand(continuousConversationRouteCommands[0], databaseEnvironment);
  runCommand(continuousConversationRouteCommands[1], databaseEnvironment);
  runCommand(continuousConversationRouteCommands[2], {
    ...databaseEnvironment,
    DEFAULT_PATIENT_PASSWORD: input.seedPassword,
    SENSITIVE_DATA_KEY_REF: 'secret-manager://ci/continuous-conversation',
    SENSITIVE_DATA_KEY: sensitiveDataKey,
  });
  runCommand(continuousConversationRouteCommands[3], databaseEnvironment);

  const redis = new Redis(input.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    reconnectOnError: () => false,
    connectTimeout: 1_000,
  });
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: input.databaseUrl } },
  });
  const processes = [];
  try {
    await redis.connect();
    await redis.ping();
    await redis.flushdb();
    if ((await prisma.providerCallTelemetry.count()) !== 0) {
      throw new Error(
        'Provider telemetry was not empty before route evidence.',
      );
    }

    const firstApi = startProductionApi(input, input.firstPort, env);
    const secondApi = startProductionApi(input, input.secondPort, env);
    processes.push(firstApi, secondApi);
    await Promise.all([
      waitForReady(firstApi, input.firstPort),
      waitForReady(secondApi, input.secondPort),
    ]);

    const firstBaseUrl = `http://127.0.0.1:${input.firstPort}`;
    const secondBaseUrl = `http://127.0.0.1:${input.secondPort}`;
    const auth = await authenticateDoctor(firstBaseUrl, input);
    const missingSessionId = randomUUID();

    const firstResult = await appendToMissingConversation(
      firstBaseUrl,
      missingSessionId,
      auth,
    );
    const secondResult = await appendToMissingConversation(
      secondBaseUrl,
      missingSessionId,
      auth,
    );
    requirePostGuardNotFound(firstResult);
    requirePostGuardNotFound(secondResult);

    const concurrentResults = await Promise.all([
      appendToMissingConversation(firstBaseUrl, missingSessionId, auth),
      appendToMissingConversation(secondBaseUrl, missingSessionId, auth),
    ]);
    for (const result of concurrentResults) requireGuardRejection(result);

    const redisCount = await redis.get(
      `${usageKeyPrefix}:request-rate:user:${auth.userId}:operation:ai`,
    );
    if (redisCount !== '4') {
      throw new Error(
        'The shared Redis user-operation count was not exactly 4.',
      );
    }
    if ((await prisma.providerCallTelemetry.count()) !== 0) {
      throw new Error(
        'A provider telemetry row appeared during route evidence.',
      );
    }
  } finally {
    await Promise.all(processes.map(stopProductionApi));
    if (redis.status !== 'end') {
      await redis.flushdb();
      await redis.quit();
    }
    await prisma.$disconnect();
  }

  process.stdout.write(
    'continuous conversation route evidence passed: instances=2 post-guard-404=2 concurrent-429=2 redis-ai-count=4 provider-telemetry=0\n',
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await runContinuousConversationRouteIntegration();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Continuous conversation route integration failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
