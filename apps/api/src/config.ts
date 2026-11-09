import type { Provider } from '@nestjs/common';
import { config } from 'dotenv';
import { lstatSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { loadMimoUsageGateConfig } from './mimo-usage-gate';
import {
  MAX_PROVIDER_RESPONSE_BYTES,
  MAX_PROVIDER_TIMEOUT_MS,
} from './provider-request';
import type { SensitiveEncryptionKey } from './sensitive-encryption';

export const SENSITIVE_ENCRYPTION_KEY = 'SENSITIVE_ENCRYPTION_KEY';
export const RENDER_SECRET_DIRECTORY = '/etc/secrets';

config({ path: resolve(__dirname, '../../..', '.env') });

export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const JWT_SECRET_MIN_UTF8_BYTES = 32;
export const API_REQUEST_BODY_LIMIT_BYTES = 16 * 1024 * 1024;
export const STT_REQUEST_METADATA_BUDGET_BYTES = 1024 * 1024;
export const MAX_STT_DECODED_AUDIO_BYTES =
  Math.floor(
    (API_REQUEST_BODY_LIMIT_BYTES - STT_REQUEST_METADATA_BUDGET_BYTES) / 4,
  ) * 3;
const MIN_PROVIDER_TELEMETRY_RETENTION_DAYS = 30;
const MAX_PROVIDER_TELEMETRY_RETENTION_DAYS = 3650;
const MAX_PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS = 2_147_483_647;

export function requireStrongJwtSecret() {
  const secret = requireEnv('JWT_SECRET');
  const utf8Bytes = Buffer.byteLength(secret, 'utf8');
  if (utf8Bytes < JWT_SECRET_MIN_UTF8_BYTES) {
    throw new Error(
      `JWT_SECRET must be at least ${JWT_SECRET_MIN_UTF8_BYTES} UTF-8 bytes; received ${utf8Bytes}.`,
    );
  }
  return secret;
}

export function requireCookieSecure() {
  const value = process.env.COOKIE_SECURE;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('COOKIE_SECURE must be exactly true or false.');
}

export type RuntimeSecret = {
  key: string;
  ref: string;
};

export type ProviderRequestLimits = {
  timeoutMs: number;
  maxResponseBytes: number;
};

export type SttInputLimits = {
  maxDecodedAudioBytes: number;
  maxDurationSeconds: number;
};

export type MimoCapability = 'ai' | 'speech' | 'tts';

type SecretLoaderOptions = {
  secretDirectory?: string;
};

export class ProductionRuntimeDependencyConfigurationError extends Error {
  constructor(
    readonly dependency: 'mimo_api_key' | 'sensitive_data_key' | 'key_value',
    cause: unknown,
  ) {
    super(
      cause instanceof Error
        ? cause.message
        : `Production dependency configuration failed: ${dependency}.`,
      { cause },
    );
    this.name = 'ProductionRuntimeDependencyConfigurationError';
  }
}

function requireProductionDependency<T>(
  dependency: ProductionRuntimeDependencyConfigurationError['dependency'],
  load: () => T,
) {
  try {
    return load();
  } catch (error) {
    throw new ProductionRuntimeDependencyConfigurationError(dependency, error);
  }
}

function isProductionEnvironment(env: NodeJS.ProcessEnv) {
  return env.NODE_ENV === 'production';
}

function requireExactEnvironmentValue(
  env: NodeJS.ProcessEnv,
  name: string,
  message: string,
) {
  const value = env[name];
  if (!value || value.trim() !== value) {
    throw new Error(message);
  }
  return value;
}

function assertRawSecretIsAbsent(env: NodeJS.ProcessEnv, name: string) {
  if (Object.prototype.hasOwnProperty.call(env, name)) {
    throw new Error(
      `${name} must not be defined in production; configure its approved Secret File instead.`,
    );
  }
}

function loadRenderSecretFile(
  env: NodeJS.ProcessEnv,
  fileEnvironmentName: string,
  options: SecretLoaderOptions = {},
) {
  const secretDirectory = options.secretDirectory ?? RENDER_SECRET_DIRECTORY;
  const configuredPath = requireExactEnvironmentValue(
    env,
    fileEnvironmentName,
    `${fileEnvironmentName} must be an exact non-empty Secret File path.`,
  );
  if (!isAbsolute(configuredPath)) {
    throw new Error(
      `${fileEnvironmentName} must be an absolute Secret File path.`,
    );
  }

  const resolvedDirectory = resolve(secretDirectory);
  const resolvedPath = resolve(configuredPath);
  const pathFromSecretDirectory = relative(resolvedDirectory, resolvedPath);
  if (
    pathFromSecretDirectory === '' ||
    pathFromSecretDirectory.startsWith('..') ||
    isAbsolute(pathFromSecretDirectory) ||
    pathFromSecretDirectory.includes(sep)
  ) {
    throw new Error(
      `${fileEnvironmentName} must point to a file directly under ${resolvedDirectory}.`,
    );
  }

  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(resolvedPath);
  } catch {
    throw new Error(`${fileEnvironmentName} Secret File is unavailable.`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${fileEnvironmentName} must point to a regular file.`);
  }

  let secret: string;
  try {
    secret = readFileSync(resolvedPath, 'utf8');
  } catch {
    throw new Error(`${fileEnvironmentName} Secret File cannot be read.`);
  }
  if (!secret || secret.trim() !== secret) {
    throw new Error(
      `${fileEnvironmentName} Secret File must contain one exact non-empty secret value.`,
    );
  }
  return secret;
}

function requireRuntimeSecret(
  env: NodeJS.ProcessEnv,
  options: {
    referenceEnvironmentName: string;
    fileEnvironmentName: string;
    localValueEnvironmentName: string;
    legacyRawEnvironmentNames?: string[];
    secretDirectory?: string;
  },
): RuntimeSecret {
  const ref = requireExactEnvironmentValue(
    env,
    options.referenceEnvironmentName,
    `${options.referenceEnvironmentName} must be an exact non-empty key identifier.`,
  );
  if (!ref.startsWith('secret-manager://')) {
    throw new Error(
      `${options.referenceEnvironmentName} must use the secret-manager:// reference form.`,
    );
  }

  if (isProductionEnvironment(env)) {
    assertRawSecretIsAbsent(env, options.localValueEnvironmentName);
    for (const legacyName of options.legacyRawEnvironmentNames ?? []) {
      assertRawSecretIsAbsent(env, legacyName);
    }
    return {
      ref,
      key: loadRenderSecretFile(env, options.fileEnvironmentName, options),
    };
  }

  return {
    ref,
    key: requireExactEnvironmentValue(
      env,
      options.localValueEnvironmentName,
      `${options.localValueEnvironmentName} must be an exact non-empty local runtime secret.`,
    ),
  };
}

export function requireMimoApiKey(
  env: NodeJS.ProcessEnv = process.env,
  options: SecretLoaderOptions = {},
): RuntimeSecret {
  return requireRuntimeSecret(env, {
    referenceEnvironmentName: 'MIMO_API_KEY_REF',
    fileEnvironmentName: 'MIMO_API_KEY_FILE',
    localValueEnvironmentName: 'MIMO_API_KEY',
    legacyRawEnvironmentNames: ['AI_API_KEY', 'SPEECH_API_KEY', 'TTS_API_KEY'],
    ...options,
  });
}

function requirePositiveIntegerEnvironmentValue(
  env: NodeJS.ProcessEnv,
  name: string,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  const value = requireExactEnvironmentValue(
    env,
    name,
    `${name} must be a positive base-10 integer.`,
  );
  const parsed = Number(value);
  if (
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(parsed) ||
    parsed > maximum
  ) {
    throw new Error(`${name} must be a positive base-10 integer within range.`);
  }
  return parsed;
}

function requireProviderTelemetryRetentionConfiguration(
  env: NodeJS.ProcessEnv,
) {
  const retentionDays = requirePositiveIntegerEnvironmentValue(
    env,
    'PROVIDER_TELEMETRY_RETENTION_DAYS',
  );
  if (
    retentionDays < MIN_PROVIDER_TELEMETRY_RETENTION_DAYS ||
    retentionDays > MAX_PROVIDER_TELEMETRY_RETENTION_DAYS
  ) {
    throw new Error(
      `PROVIDER_TELEMETRY_RETENTION_DAYS must be an integer from ${MIN_PROVIDER_TELEMETRY_RETENTION_DAYS} to ${MAX_PROVIDER_TELEMETRY_RETENTION_DAYS}.`,
    );
  }

  requirePositiveIntegerEnvironmentValue(
    env,
    'PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS',
    MAX_PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS,
  );
}

export function requireMimoProviderRequestLimits(
  capability: MimoCapability,
  env: NodeJS.ProcessEnv = process.env,
): ProviderRequestLimits {
  const prefix =
    capability === 'ai'
      ? 'AI_PROVIDER'
      : capability === 'speech'
        ? 'SPEECH_PROVIDER'
        : 'TTS_PROVIDER';
  return {
    timeoutMs: requirePositiveIntegerEnvironmentValue(
      env,
      `${prefix}_TIMEOUT_MS`,
      MAX_PROVIDER_TIMEOUT_MS,
    ),
    maxResponseBytes: requirePositiveIntegerEnvironmentValue(
      env,
      `${prefix}_MAX_RESPONSE_BYTES`,
      MAX_PROVIDER_RESPONSE_BYTES,
    ),
  };
}

export function requireSttInputLimits(
  env: NodeJS.ProcessEnv = process.env,
): SttInputLimits {
  return {
    maxDecodedAudioBytes: requirePositiveIntegerEnvironmentValue(
      env,
      'STT_MAX_DECODED_AUDIO_BYTES',
      MAX_STT_DECODED_AUDIO_BYTES,
    ),
    maxDurationSeconds: requirePositiveIntegerEnvironmentValue(
      env,
      'STT_MAX_DURATION_SECONDS',
    ),
  };
}

export function requireListenPort(env: NodeJS.ProcessEnv = process.env) {
  return requirePositiveIntegerEnvironmentValue(env, 'PORT', 65_535);
}

function requireProductionWebOrigin(env: NodeJS.ProcessEnv) {
  const value = requireExactEnvironmentValue(
    env,
    'WEB_ORIGIN',
    'WEB_ORIGIN must be one exact HTTPS browser origin in production.',
  );
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error(
      'WEB_ORIGIN must be one exact HTTPS browser origin in production.',
    );
  }
  if (
    origin.protocol !== 'https:' ||
    !origin.hostname ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.origin !== value
  ) {
    throw new Error(
      'WEB_ORIGIN must be one exact HTTPS browser origin in production.',
    );
  }
  return value;
}

function requireProductionKeyValueUrl(env: NodeJS.ProcessEnv) {
  const rawValue = loadMimoUsageGateConfig(env).url;
  const endpoint = new URL(rawValue);
  const host = endpoint.hostname.toLowerCase();
  if (env.DEPLOYMENT_MODE !== undefined) {
    if (env.DEPLOYMENT_MODE !== 'single-host') {
      throw new Error('DEPLOYMENT_MODE must be single-host when configured.');
    }
    let password: string;
    try {
      password = decodeURIComponent(endpoint.password);
    } catch {
      throw new Error(
        'MIMO_KEY_VALUE_URL contains an invalid password encoding.',
      );
    }
    if (
      endpoint.protocol !== 'redis:' ||
      host !== '127.0.0.1' ||
      endpoint.port !== '6379' ||
      Buffer.byteLength(password, 'utf8') < 32 ||
      password.trim() !== password ||
      (endpoint.username !== '' && endpoint.username !== 'default') ||
      !/^\/(?:0|[1-9]\d*)$|^$/.test(endpoint.pathname) ||
      endpoint.search !== '' ||
      endpoint.hash !== ''
    ) {
      throw new Error(
        'MIMO_KEY_VALUE_URL in single-host mode must use redis://127.0.0.1:6379 with a password of at least 32 UTF-8 bytes and an optional numeric database.',
      );
    }
    return rawValue;
  }
  if (host === 'localhost' || host.endsWith('.local') || isIP(host) !== 0) {
    throw new Error(
      'MIMO_KEY_VALUE_URL must use an approved private Render Key Value host in production.',
    );
  }
  return rawValue;
}

function requireMimoAllowedHosts(env: NodeJS.ProcessEnv) {
  const rawHosts = requireExactEnvironmentValue(
    env,
    'MIMO_ALLOWED_HOSTS',
    'MIMO_ALLOWED_HOSTS must list one or more approved HTTPS host names.',
  ).split(',');
  const hosts = rawHosts.map((host) => host.toLowerCase());
  if (
    hosts.length === 0 ||
    hosts.some(
      (host) =>
        !host ||
        host.trim() !== host ||
        host.includes('/') ||
        host.includes(':') ||
        host === 'localhost' ||
        host.endsWith('.local') ||
        isIP(host) !== 0,
    )
  ) {
    throw new Error(
      'MIMO_ALLOWED_HOSTS must contain only approved DNS host names without ports or paths.',
    );
  }
  return new Set(hosts);
}

function requireApprovedMimoHttpsEndpoint(
  env: NodeJS.ProcessEnv,
  name: string,
  allowedHosts: Set<string>,
) {
  const rawValue = requireExactEnvironmentValue(
    env,
    name,
    `${name} must be an exact approved HTTPS endpoint.`,
  );
  let endpoint: URL;
  try {
    endpoint = new URL(rawValue);
  } catch {
    throw new Error(`${name} must be an approved HTTPS endpoint.`);
  }
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port ||
    !allowedHosts.has(endpoint.hostname.toLowerCase())
  ) {
    throw new Error(
      `${name} must use HTTPS and an approved host from MIMO_ALLOWED_HOSTS.`,
    );
  }
  for (const queryName of endpoint.searchParams.keys()) {
    if (
      /authorization|api[-_ ]?key|token|secret|password|credential|cookie/i.test(
        queryName,
      )
    ) {
      throw new Error(
        `${name} must not include credentials in query parameters.`,
      );
    }
  }
  return endpoint;
}

function requireProductionFlag(env: NodeJS.ProcessEnv, name: string) {
  if (env[name] !== 'true') {
    throw new Error(`${name} must be exactly true in production.`);
  }
}

export function validateProductionRuntimeConfiguration(
  env: NodeJS.ProcessEnv = process.env,
  options: SecretLoaderOptions = {},
) {
  if (!isProductionEnvironment(env)) {
    return;
  }

  requireProductionFlag(env, 'AI_REQUIRED_FOR_LAUNCH');
  requireProductionFlag(env, 'SPEECH_REQUIRED_FOR_LAUNCH');
  requireProductionFlag(env, 'TTS_REQUIRED_FOR_LAUNCH');
  requireProductionFlag(env, 'AI_HUMAN_REVIEW_REQUIRED');
  requireProductionFlag(env, 'COOKIE_SECURE');
  requireProductionWebOrigin(env);
  requireListenPort(env);
  const allowedHosts = requireMimoAllowedHosts(env);
  requireProductionDependency('mimo_api_key', () =>
    requireMimoApiKey(env, options),
  );
  requireProductionDependency('sensitive_data_key', () =>
    requireSensitiveEncryptionKey(env, options),
  );

  if (env.AI_PROVIDER !== 'xiaomi-mimo') {
    throw new Error('AI_PROVIDER must be xiaomi-mimo in production.');
  }
  requireExactEnvironmentValue(
    env,
    'AI_MODEL_VERSION',
    'AI_MODEL_VERSION must be an exact non-empty value in production.',
  );
  requireApprovedMimoHttpsEndpoint(env, 'AI_MODEL_ENDPOINT', allowedHosts);
  requireExactEnvironmentValue(
    env,
    'AI_PROMPT_VERSION',
    'AI_PROMPT_VERSION must be an exact non-empty value in production.',
  );

  if (env.SPEECH_PROVIDER !== 'xiaomi-mimo-audio-understanding') {
    throw new Error(
      'SPEECH_PROVIDER must be xiaomi-mimo-audio-understanding in production.',
    );
  }
  requireExactEnvironmentValue(
    env,
    'SPEECH_MODEL_VERSION',
    'SPEECH_MODEL_VERSION must be an exact non-empty value in production.',
  );
  requireApprovedMimoHttpsEndpoint(
    env,
    'SPEECH_TO_TEXT_ENDPOINT',
    allowedHosts,
  );

  if (env.TTS_PROVIDER !== 'xiaomi-mimo-tts') {
    throw new Error('TTS_PROVIDER must be xiaomi-mimo-tts in production.');
  }
  const ttsModel = requireExactEnvironmentValue(
    env,
    'TTS_MODEL_VERSION',
    'TTS_MODEL_VERSION must be an exact MiMo TTS model in production.',
  );
  if (
    ![
      'mimo-v2.5-tts',
      'mimo-v2.5-tts-voicedesign',
      'mimo-v2.5-tts-voiceclone',
    ].includes(ttsModel)
  ) {
    throw new Error('TTS_MODEL_VERSION must be an approved MiMo TTS model.');
  }
  requireApprovedMimoHttpsEndpoint(env, 'TTS_ENDPOINT', allowedHosts);
  requireExactEnvironmentValue(
    env,
    'TTS_VOICE_ID',
    'TTS_VOICE_ID must be an exact non-empty value in production.',
  );
  if (env.TTS_OUTPUT_FORMAT !== 'mp3' && env.TTS_OUTPUT_FORMAT !== 'wav') {
    throw new Error('TTS_OUTPUT_FORMAT must be mp3 or wav in production.');
  }

  requireMimoProviderRequestLimits('ai', env);
  requireMimoProviderRequestLimits('speech', env);
  requireMimoProviderRequestLimits('tts', env);
  requireSttInputLimits(env);
  requireProductionDependency('key_value', () => {
    requireProductionKeyValueUrl(env);
    loadMimoUsageGateConfig(env);
  });
  requireProviderTelemetryRetentionConfiguration(env);
}

export function requireSensitiveEncryptionKey(
  env: NodeJS.ProcessEnv = process.env,
  options: SecretLoaderOptions = {},
): SensitiveEncryptionKey {
  const secret = requireRuntimeSecret(env, {
    referenceEnvironmentName: 'SENSITIVE_DATA_KEY_REF',
    fileEnvironmentName: 'SENSITIVE_DATA_KEY_FILE',
    localValueEnvironmentName: 'SENSITIVE_DATA_KEY',
    ...options,
  });
  const kid = secret.ref;
  if (!kid || kid.trim() !== kid) {
    throw new Error(
      'SENSITIVE_DATA_KEY_REF must be an exact non-empty key identifier.',
    );
  }

  const encodedKey = secret.key;
  if (
    !encodedKey ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encodedKey,
    )
  ) {
    throw new Error(
      'SENSITIVE_DATA_KEY must be canonical base64 encoding exactly 32 bytes.',
    );
  }
  const key = Buffer.from(encodedKey, 'base64');
  if (key.byteLength !== 32 || key.toString('base64') !== encodedKey) {
    throw new Error(
      'SENSITIVE_DATA_KEY must be canonical base64 encoding exactly 32 bytes.',
    );
  }
  return { kid, key };
}

export const sensitiveEncryptionKeyProvider: Provider = {
  provide: SENSITIVE_ENCRYPTION_KEY,
  useFactory: requireSensitiveEncryptionKey,
};
