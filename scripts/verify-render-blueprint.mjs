#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptDir, "..");
export const renderBlueprintPath = resolve(repositoryRoot, "render.yaml");

const productionRegion = "singapore";
const apiServiceName = "rehab-platform-api-prod";
const webServiceName = "rehab-platform-web-prod";
const cronServiceName = "rehab-platform-provider-telemetry-retention-prod";
const keyValueServiceName = "rehab-platform-kv-prod";
const databaseName = "rehab-platform-db-prod";

const apiBuildCommand =
  "corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm db:generate && pnpm --filter @rehab-platform/api build";
const webBuildCommand =
  "corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm --filter @rehab-platform/web build";

const forbiddenRawSecretKeys = new Set([
  "MIMO_API_KEY",
  "AI_API_KEY",
  "SPEECH_API_KEY",
  "TTS_API_KEY",
  "SENSITIVE_DATA_KEY",
]);

const requiredApiEnvironment = new Set([
  "NODE_ENV",
  "PORT",
  "COOKIE_SECURE",
  "JWT_SECRET",
  "DATABASE_URL",
  "WEB_ORIGIN",
  "PUBLIC_CREDENTIAL_THROTTLE_LIMIT",
  "PUBLIC_CREDENTIAL_THROTTLE_TTL_MS",
  "SENSITIVE_DATA_KEY_REF",
  "SENSITIVE_DATA_KEY_FILE",
  "PRODUCTION_BOOTSTRAP_CONFIG_FILE",
  "PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD_FILE",
  "PRODUCTION_BOOTSTRAP_DOCTOR_PASSWORD_FILE",
  "MIMO_API_KEY_REF",
  "MIMO_API_KEY_FILE",
  "MIMO_ALLOWED_HOSTS",
  "AI_REQUIRED_FOR_LAUNCH",
  "SPEECH_REQUIRED_FOR_LAUNCH",
  "TTS_REQUIRED_FOR_LAUNCH",
  "AI_HUMAN_REVIEW_REQUIRED",
  "AI_PROVIDER",
  "AI_MODEL_VERSION",
  "AI_MODEL_ENDPOINT",
  "AI_PROMPT_VERSION",
  "SPEECH_PROVIDER",
  "SPEECH_TO_TEXT_ENDPOINT",
  "SPEECH_MODEL_VERSION",
  "TTS_PROVIDER",
  "TTS_ENDPOINT",
  "TTS_MODEL_VERSION",
  "TTS_VOICE_ID",
  "TTS_OUTPUT_FORMAT",
  "AI_PROVIDER_TIMEOUT_MS",
  "AI_PROVIDER_MAX_RESPONSE_BYTES",
  "SPEECH_PROVIDER_TIMEOUT_MS",
  "SPEECH_PROVIDER_MAX_RESPONSE_BYTES",
  "STT_MAX_DECODED_AUDIO_BYTES",
  "STT_MAX_DURATION_SECONDS",
  "TTS_PROVIDER_TIMEOUT_MS",
  "TTS_PROVIDER_MAX_RESPONSE_BYTES",
  "MIMO_KEY_VALUE_URL",
  "MIMO_USAGE_KEY_PREFIX",
  "MIMO_USAGE_WINDOW_MS",
  "MIMO_KEY_VALUE_PROBE_TIMEOUT_MS",
  "MIMO_USER_REQUEST_LIMIT",
  "MIMO_PATIENT_REQUEST_LIMIT",
  "MIMO_ORGANIZATION_REQUEST_LIMIT",
  "MIMO_SPEECH_SECONDS_LIMIT",
  "MIMO_TTS_CHARACTERS_LIMIT",
  "MIMO_USER_BUDGET_UNITS_LIMIT",
  "MIMO_PATIENT_BUDGET_UNITS_LIMIT",
  "MIMO_ORGANIZATION_BUDGET_UNITS_LIMIT",
  "MIMO_AI_COST_UNITS_PER_REQUEST",
  "MIMO_SPEECH_COST_UNITS_PER_SECOND",
  "MIMO_TTS_COST_UNITS_PER_CHARACTER",
  "MIMO_HIGH_COST_USER_OPERATION_REQUEST_LIMIT",
  "MIMO_HIGH_COST_USER_OPERATION_WINDOW_MS",
  "PROVIDER_TELEMETRY_RETENTION_DAYS",
  "PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS",
]);

const syncFalseApiEnvironment = new Set([
  "WEB_ORIGIN",
  "PUBLIC_CREDENTIAL_THROTTLE_LIMIT",
  "PUBLIC_CREDENTIAL_THROTTLE_TTL_MS",
  "SENSITIVE_DATA_KEY_REF",
  "MIMO_API_KEY_REF",
  "MIMO_ALLOWED_HOSTS",
  "AI_MODEL_VERSION",
  "AI_MODEL_ENDPOINT",
  "AI_PROMPT_VERSION",
  "SPEECH_TO_TEXT_ENDPOINT",
  "SPEECH_MODEL_VERSION",
  "TTS_ENDPOINT",
  "TTS_MODEL_VERSION",
  "TTS_VOICE_ID",
  "TTS_OUTPUT_FORMAT",
  "AI_PROVIDER_TIMEOUT_MS",
  "AI_PROVIDER_MAX_RESPONSE_BYTES",
  "SPEECH_PROVIDER_TIMEOUT_MS",
  "SPEECH_PROVIDER_MAX_RESPONSE_BYTES",
  "STT_MAX_DECODED_AUDIO_BYTES",
  "STT_MAX_DURATION_SECONDS",
  "TTS_PROVIDER_TIMEOUT_MS",
  "TTS_PROVIDER_MAX_RESPONSE_BYTES",
  "MIMO_USAGE_KEY_PREFIX",
  "MIMO_USAGE_WINDOW_MS",
  "MIMO_KEY_VALUE_PROBE_TIMEOUT_MS",
  "MIMO_USER_REQUEST_LIMIT",
  "MIMO_PATIENT_REQUEST_LIMIT",
  "MIMO_ORGANIZATION_REQUEST_LIMIT",
  "MIMO_SPEECH_SECONDS_LIMIT",
  "MIMO_TTS_CHARACTERS_LIMIT",
  "MIMO_USER_BUDGET_UNITS_LIMIT",
  "MIMO_PATIENT_BUDGET_UNITS_LIMIT",
  "MIMO_ORGANIZATION_BUDGET_UNITS_LIMIT",
  "MIMO_AI_COST_UNITS_PER_REQUEST",
  "MIMO_SPEECH_COST_UNITS_PER_SECOND",
  "MIMO_TTS_COST_UNITS_PER_CHARACTER",
  "MIMO_HIGH_COST_USER_OPERATION_REQUEST_LIMIT",
  "MIMO_HIGH_COST_USER_OPERATION_WINDOW_MS",
  "PROVIDER_TELEMETRY_RETENTION_DAYS",
  "PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS",
]);

const rubyPsychParser = String.raw`
require "json"
require "psych"

document = Psych.safe_load(
  STDIN.read,
  permitted_classes: [],
  permitted_symbols: [],
  aliases: false,
)
raise "Render Blueprint must be a YAML mapping." unless document.is_a?(Hash)

STDOUT.write(JSON.generate(document))
`;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value) {
  return typeof value === "string";
}

function errorAt(path, message) {
  return `${path}: ${message}`;
}

function requireObject(value, path, errors) {
  if (!isRecord(value)) {
    errors.push(errorAt(path, "must be an object."));
    return undefined;
  }
  return value;
}

function requireArray(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(errorAt(path, "must be an array."));
    return undefined;
  }
  return value;
}

function requireExact(value, expected, path, errors) {
  if (value !== expected) {
    errors.push(errorAt(path, `must equal ${JSON.stringify(expected)}.`));
  }
}

function assertOnlyKeys(value, allowedKeys, path, errors) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      errors.push(
        errorAt(path, `contains unsupported key ${JSON.stringify(key)}.`),
      );
    }
  }
}

function indexNamedResources(values, path, errors) {
  const byName = new Map();
  for (const [index, value] of values.entries()) {
    const resourcePath = `${path}[${index}]`;
    const resource = requireObject(value, resourcePath, errors);
    if (!resource) continue;
    if (!isString(resource.name) || resource.name.trim() !== resource.name) {
      errors.push(
        errorAt(`${resourcePath}.name`, "must be an exact non-empty string."),
      );
      continue;
    }
    if (byName.has(resource.name)) {
      errors.push(errorAt(`${resourcePath}.name`, "must be unique."));
      continue;
    }
    byName.set(resource.name, { resource, path: resourcePath });
  }
  return byName;
}

function createEnvironmentMap(service, path, errors) {
  const envVars = requireArray(service.envVars, `${path}.envVars`, errors);
  const environment = new Map();
  if (!envVars) return environment;

  for (const [index, value] of envVars.entries()) {
    const envPath = `${path}.envVars[${index}]`;
    const env = requireObject(value, envPath, errors);
    if (!env) continue;
    assertOnlyKeys(
      env,
      new Set([
        "key",
        "value",
        "sync",
        "generateValue",
        "fromDatabase",
        "fromService",
      ]),
      envPath,
      errors,
    );
    if (!isString(env.key) || env.key.trim() !== env.key) {
      errors.push(
        errorAt(`${envPath}.key`, "must be an exact non-empty string."),
      );
      continue;
    }
    if (environment.has(env.key)) {
      errors.push(
        errorAt(`${envPath}.key`, "must be unique within the service."),
      );
      continue;
    }
    if (forbiddenRawSecretKeys.has(env.key)) {
      errors.push(
        errorAt(`${envPath}.key`, "must not define a raw production secret."),
      );
    }
    const valueSources = [
      "value",
      "sync",
      "generateValue",
      "fromDatabase",
      "fromService",
    ].filter((key) => Object.hasOwn(env, key));
    if (valueSources.length !== 1) {
      errors.push(errorAt(envPath, "must define exactly one value source."));
    }
    environment.set(env.key, { env, path: envPath });
  }
  return environment;
}

function requireEnvironmentKey(environment, key, path, errors) {
  const entry = environment.get(key);
  if (!entry) {
    errors.push(errorAt(path, `is missing required environment key ${key}.`));
  }
  return entry;
}

function requireEnvironmentValue(environment, key, expected, path, errors) {
  const entry = requireEnvironmentKey(environment, key, path, errors);
  if (entry)
    requireExact(entry.env.value, expected, `${entry.path}.value`, errors);
}

function requireEnvironmentSyncFalse(environment, key, path, errors) {
  const entry = requireEnvironmentKey(environment, key, path, errors);
  if (entry) requireExact(entry.env.sync, false, `${entry.path}.sync`, errors);
}

function requireDatabaseReference(environment, key, path, errors) {
  const entry = requireEnvironmentKey(environment, key, path, errors);
  if (!entry) return;
  const reference = requireObject(
    entry.env.fromDatabase,
    `${entry.path}.fromDatabase`,
    errors,
  );
  if (!reference) return;
  assertOnlyKeys(
    reference,
    new Set(["name", "property"]),
    `${entry.path}.fromDatabase`,
    errors,
  );
  requireExact(
    reference.name,
    databaseName,
    `${entry.path}.fromDatabase.name`,
    errors,
  );
  requireExact(
    reference.property,
    "connectionString",
    `${entry.path}.fromDatabase.property`,
    errors,
  );
}

function requireKeyValueReference(environment, path, errors) {
  const entry = requireEnvironmentKey(
    environment,
    "MIMO_KEY_VALUE_URL",
    path,
    errors,
  );
  if (!entry) return;
  const reference = requireObject(
    entry.env.fromService,
    `${entry.path}.fromService`,
    errors,
  );
  if (!reference) return;
  assertOnlyKeys(
    reference,
    new Set(["type", "name", "property"]),
    `${entry.path}.fromService`,
    errors,
  );
  requireExact(
    reference.type,
    "keyvalue",
    `${entry.path}.fromService.type`,
    errors,
  );
  requireExact(
    reference.name,
    keyValueServiceName,
    `${entry.path}.fromService.name`,
    errors,
  );
  requireExact(
    reference.property,
    "connectionString",
    `${entry.path}.fromService.property`,
    errors,
  );
}

function assertNoLocalEndpoints(value, path, errors) {
  if (isString(value)) {
    if (/(?:localhost|127\.0\.0\.1)/i.test(value)) {
      errors.push(errorAt(path, "must not reference localhost or 127.0.0.1."));
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoLocalEndpoints(item, `${path}[${index}]`, errors),
    );
    return;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      assertNoLocalEndpoints(item, `${path}.${key}`, errors);
    }
  }
}

function validateKeyValueService(service, path, errors) {
  requireExact(service.type, "keyvalue", `${path}.type`, errors);
  requireExact(service.region, productionRegion, `${path}.region`, errors);
  requireExact(service.plan, "starter", `${path}.plan`, errors);
  requireExact(
    service.maxmemoryPolicy,
    "noeviction",
    `${path}.maxmemoryPolicy`,
    errors,
  );
  requireExact(
    service.persistenceMode,
    "journal-snapshot",
    `${path}.persistenceMode`,
    errors,
  );
  if (!Array.isArray(service.ipAllowList) || service.ipAllowList.length !== 0) {
    errors.push(errorAt(`${path}.ipAllowList`, "must be an empty array."));
  }
}

function validateApiService(service, path, errors) {
  requireExact(service.type, "web", `${path}.type`, errors);
  requireExact(service.runtime, "node", `${path}.runtime`, errors);
  requireExact(service.region, productionRegion, `${path}.region`, errors);
  requireExact(
    service.autoDeployTrigger,
    "off",
    `${path}.autoDeployTrigger`,
    errors,
  );
  requireExact(
    service.buildCommand,
    apiBuildCommand,
    `${path}.buildCommand`,
    errors,
  );
  requireExact(
    service.preDeployCommand,
    "pnpm db:migrate:deploy",
    `${path}.preDeployCommand`,
    errors,
  );
  requireExact(
    service.startCommand,
    "pnpm --filter @rehab-platform/api start:prod",
    `${path}.startCommand`,
    errors,
  );
  requireExact(
    service.healthCheckPath,
    "/health/ready",
    `${path}.healthCheckPath`,
    errors,
  );
  if (Object.hasOwn(service, "rootDir")) {
    errors.push(
      errorAt(
        `${path}.rootDir`,
        "must not be configured for the monorepo build.",
      ),
    );
  }

  const environment = createEnvironmentMap(service, path, errors);
  for (const key of requiredApiEnvironment) {
    requireEnvironmentKey(environment, key, path, errors);
  }
  for (const key of syncFalseApiEnvironment) {
    requireEnvironmentSyncFalse(environment, key, path, errors);
  }
  requireEnvironmentValue(environment, "NODE_ENV", "production", path, errors);
  requireEnvironmentValue(environment, "PORT", "10000", path, errors);
  requireEnvironmentValue(environment, "COOKIE_SECURE", "true", path, errors);
  requireEnvironmentValue(
    environment,
    "AI_REQUIRED_FOR_LAUNCH",
    "true",
    path,
    errors,
  );
  requireEnvironmentValue(
    environment,
    "SPEECH_REQUIRED_FOR_LAUNCH",
    "true",
    path,
    errors,
  );
  requireEnvironmentValue(
    environment,
    "TTS_REQUIRED_FOR_LAUNCH",
    "true",
    path,
    errors,
  );
  requireEnvironmentValue(
    environment,
    "AI_HUMAN_REVIEW_REQUIRED",
    "true",
    path,
    errors,
  );
  requireEnvironmentValue(
    environment,
    "AI_PROVIDER",
    "xiaomi-mimo",
    path,
    errors,
  );
  requireEnvironmentValue(
    environment,
    "SPEECH_PROVIDER",
    "xiaomi-mimo-audio-understanding",
    path,
    errors,
  );
  requireEnvironmentValue(
    environment,
    "TTS_PROVIDER",
    "xiaomi-mimo-tts",
    path,
    errors,
  );
  requireEnvironmentValue(
    environment,
    "MIMO_API_KEY_FILE",
    "/etc/secrets/mimo_api_key",
    path,
    errors,
  );
  requireEnvironmentValue(
    environment,
    "SENSITIVE_DATA_KEY_FILE",
    "/etc/secrets/sensitive_data_key",
    path,
    errors,
  );
  requireEnvironmentValue(
    environment,
    "PRODUCTION_BOOTSTRAP_CONFIG_FILE",
    "/etc/secrets/production_bootstrap.json",
    path,
    errors,
  );
  requireEnvironmentValue(
    environment,
    "PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD_FILE",
    "/etc/secrets/production_bootstrap_admin_password",
    path,
    errors,
  );
  requireEnvironmentValue(
    environment,
    "PRODUCTION_BOOTSTRAP_DOCTOR_PASSWORD_FILE",
    "/etc/secrets/production_bootstrap_doctor_password",
    path,
    errors,
  );
  const jwtSecret = requireEnvironmentKey(
    environment,
    "JWT_SECRET",
    path,
    errors,
  );
  if (jwtSecret)
    requireExact(
      jwtSecret.env.generateValue,
      true,
      `${jwtSecret.path}.generateValue`,
      errors,
    );
  requireDatabaseReference(environment, "DATABASE_URL", path, errors);
  requireKeyValueReference(environment, path, errors);
}

function validateWebService(service, path, errors) {
  requireExact(service.type, "web", `${path}.type`, errors);
  requireExact(service.runtime, "node", `${path}.runtime`, errors);
  requireExact(service.region, productionRegion, `${path}.region`, errors);
  requireExact(
    service.autoDeployTrigger,
    "off",
    `${path}.autoDeployTrigger`,
    errors,
  );
  requireExact(
    service.buildCommand,
    webBuildCommand,
    `${path}.buildCommand`,
    errors,
  );
  requireExact(
    service.startCommand,
    "pnpm --filter @rehab-platform/web start -- -p $PORT -H 0.0.0.0",
    `${path}.startCommand`,
    errors,
  );
  if (Object.hasOwn(service, "rootDir")) {
    errors.push(
      errorAt(
        `${path}.rootDir`,
        "must not be configured for the monorepo build.",
      ),
    );
  }
  const environment = createEnvironmentMap(service, path, errors);
  requireEnvironmentValue(environment, "NODE_ENV", "production", path, errors);
  requireEnvironmentSyncFalse(
    environment,
    "NEXT_PUBLIC_API_BASE_URL",
    path,
    errors,
  );
  for (const key of environment.keys()) {
    if (key !== "NODE_ENV" && key !== "NEXT_PUBLIC_API_BASE_URL") {
      errors.push(errorAt(path, `web service must not define ${key}.`));
    }
  }
}

function validateCronService(service, path, errors) {
  requireExact(service.type, "cron", `${path}.type`, errors);
  requireExact(service.runtime, "node", `${path}.runtime`, errors);
  requireExact(service.region, productionRegion, `${path}.region`, errors);
  requireExact(
    service.autoDeployTrigger,
    "off",
    `${path}.autoDeployTrigger`,
    errors,
  );
  requireExact(service.schedule, "17 3 * * *", `${path}.schedule`, errors);
  requireExact(
    service.buildCommand,
    apiBuildCommand,
    `${path}.buildCommand`,
    errors,
  );
  requireExact(
    service.startCommand,
    "pnpm --filter @rehab-platform/api telemetry:retention",
    `${path}.startCommand`,
    errors,
  );
  const environment = createEnvironmentMap(service, path, errors);
  requireEnvironmentValue(environment, "NODE_ENV", "production", path, errors);
  requireDatabaseReference(environment, "DATABASE_URL", path, errors);
  requireEnvironmentSyncFalse(
    environment,
    "PROVIDER_TELEMETRY_RETENTION_DAYS",
    path,
    errors,
  );
  requireEnvironmentSyncFalse(
    environment,
    "PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS",
    path,
    errors,
  );
  for (const key of environment.keys()) {
    if (
      !new Set([
        "NODE_ENV",
        "DATABASE_URL",
        "PROVIDER_TELEMETRY_RETENTION_DAYS",
        "PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS",
      ]).has(key)
    ) {
      errors.push(errorAt(path, `cron service must not define ${key}.`));
    }
  }
}

function validateDatabase(database, path, errors) {
  requireExact(database.region, productionRegion, `${path}.region`, errors);
  requireExact(database.plan, "basic-1gb", `${path}.plan`, errors);
  requireExact(
    database.databaseName,
    "rehab_platform",
    `${path}.databaseName`,
    errors,
  );
  requireExact(database.user, "rehab_platform", `${path}.user`, errors);
  if (
    !Array.isArray(database.ipAllowList) ||
    database.ipAllowList.length !== 0
  ) {
    errors.push(errorAt(`${path}.ipAllowList`, "must be an empty array."));
  }
}

export function parseRenderBlueprintYaml(source) {
  if (!isString(source)) {
    throw new TypeError("Render Blueprint YAML source must be a string.");
  }
  const result = spawnSync("ruby", ["-e", rubyPsychParser], {
    encoding: "utf8",
    input: source,
  });
  if (result.error) {
    throw new Error(
      `Render Blueprint parsing requires system Ruby with Psych: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `Ruby Psych could not parse render.yaml: ${(result.stderr || "unknown parser failure").trim()}`,
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("Ruby Psych did not return valid JSON for render.yaml.");
  }
}

export function validateRenderBlueprint(blueprint) {
  const errors = [];
  const root = requireObject(blueprint, "render.yaml", errors);
  if (!root) return errors;

  assertOnlyKeys(
    root,
    new Set(["previews", "services", "databases"]),
    "render.yaml",
    errors,
  );
  const previews = requireObject(root.previews, "render.yaml.previews", errors);
  if (previews) {
    assertOnlyKeys(
      previews,
      new Set(["generation"]),
      "render.yaml.previews",
      errors,
    );
    requireExact(
      previews.generation,
      "off",
      "render.yaml.previews.generation",
      errors,
    );
  }

  const services = requireArray(root.services, "render.yaml.services", errors);
  const databases = requireArray(
    root.databases,
    "render.yaml.databases",
    errors,
  );
  if (!services || !databases) return errors;

  const serviceByName = indexNamedResources(
    services,
    "render.yaml.services",
    errors,
  );
  const databaseByName = indexNamedResources(
    databases,
    "render.yaml.databases",
    errors,
  );
  const expectedServiceNames = new Set([
    keyValueServiceName,
    apiServiceName,
    webServiceName,
    cronServiceName,
  ]);
  for (const name of expectedServiceNames) {
    if (!serviceByName.has(name)) {
      errors.push(errorAt("render.yaml.services", `is missing ${name}.`));
    }
  }
  for (const name of serviceByName.keys()) {
    if (!expectedServiceNames.has(name)) {
      errors.push(
        errorAt("render.yaml.services", `contains unexpected service ${name}.`),
      );
    }
  }
  if (!databaseByName.has(databaseName)) {
    errors.push(
      errorAt("render.yaml.databases", `is missing ${databaseName}.`),
    );
  }
  for (const name of databaseByName.keys()) {
    if (name !== databaseName) {
      errors.push(
        errorAt(
          "render.yaml.databases",
          `contains unexpected database ${name}.`,
        ),
      );
    }
  }

  const keyValue = serviceByName.get(keyValueServiceName);
  if (keyValue)
    validateKeyValueService(keyValue.resource, keyValue.path, errors);
  const api = serviceByName.get(apiServiceName);
  if (api) validateApiService(api.resource, api.path, errors);
  const web = serviceByName.get(webServiceName);
  if (web) validateWebService(web.resource, web.path, errors);
  const cron = serviceByName.get(cronServiceName);
  if (cron) validateCronService(cron.resource, cron.path, errors);
  const database = databaseByName.get(databaseName);
  if (database) validateDatabase(database.resource, database.path, errors);

  assertNoLocalEndpoints(root, "render.yaml", errors);
  return errors;
}

export function verifyRenderBlueprint(
  source = readFileSync(renderBlueprintPath, "utf8"),
) {
  const blueprint = parseRenderBlueprintYaml(source);
  const errors = validateRenderBlueprint(blueprint);
  if (errors.length > 0) {
    throw new Error(
      `Render Blueprint validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
  }
  return blueprint;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    verifyRenderBlueprint();
    process.stdout.write(
      "Render Blueprint structural validation passed with Ruby Psych. Render provider schema and dashboard deployment validation remain external gates.\n",
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
