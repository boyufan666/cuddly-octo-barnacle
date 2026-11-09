#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const productionApiEnvironmentPath = "/etc/rehab/api.env";

const steps = {
  dbGenerate: step("db:generate", "pnpm", ["run", "db:generate"]),
  dbValidate: step("db:validate", "pnpm", [
    "--filter",
    "@rehab-platform/db",
    "exec",
    "prisma",
    "validate",
  ]),
  dbBuild: packageStep("db:build", "@rehab-platform/db", "build"),
  dbTypecheck: packageStep("db:typecheck", "@rehab-platform/db", "typecheck"),
  dbContracts: packageStep("db:contracts", "@rehab-platform/db", "test"),
  apiUnit: packageStep("api:unit", "@rehab-platform/api", "test:unit"),
  apiContracts: packageStep(
    "api:contracts",
    "@rehab-platform/api",
    "test:contracts",
  ),
  apiIntegration: packageStep(
    "api:controller-integration",
    "@rehab-platform/api",
    "test:controller-integration",
  ),
  apiTypecheck: packageStep(
    "api:typecheck",
    "@rehab-platform/api",
    "typecheck",
  ),
  apiLint: packageStep("api:lint", "@rehab-platform/api", "lint"),
  apiBuild: packageStep("api:build", "@rehab-platform/api", "build"),
  webUnit: packageStep("web:unit", "@rehab-platform/web", "test"),
  webRoleLifecycle: packageStep(
    "web:role-workspace-lifecycle",
    "@rehab-platform/web",
    "test:role-workspace-lifecycle",
  ),
  webTypecheck: packageStep(
    "web:typecheck",
    "@rehab-platform/web",
    "typecheck",
  ),
  webLint: packageStep("web:lint", "@rehab-platform/web", "lint"),
  webBuild: packageStep("web:build", "@rehab-platform/web", "build"),
  deliveryTests: step("delivery:tests", "pnpm", ["run", "test:delivery"]),
  deliveryCheck: step("delivery:check", "node", [
    "scripts/check-delivery-readiness.mjs",
  ]),
  renderBlueprint: step("render:blueprint", "pnpm", [
    "run",
    "verify:render-blueprint",
  ]),
  supplyChain: step("supply-chain:production", "pnpm", [
    "run",
    "verify:supply-chain:production",
  ]),
  apiSmoke: packageStep(
    "postgres:api-smoke",
    "@rehab-platform/api",
    "test:e2e:postgres-smoke",
    {
      API_SMOKE_DATABASE_URL: "API_SMOKE_DATABASE_URL",
      API_SMOKE_CONFIRM_DISPOSABLE: "API_SMOKE_CONFIRM_DISPOSABLE",
      API_SMOKE_SEED_PASSWORD: "API_SMOKE_SEED_PASSWORD",
      API_SMOKE_JWT_SECRET: "API_SMOKE_JWT_SECRET",
      API_SMOKE_COOKIE_SECURE: "API_SMOKE_COOKIE_SECURE",
      API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_LIMIT:
        "API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_LIMIT",
      API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS:
        "API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS",
      API_SMOKE_SENSITIVE_DATA_KEY_REF: "API_SMOKE_SENSITIVE_DATA_KEY_REF",
      API_SMOKE_SENSITIVE_DATA_KEY: "API_SMOKE_SENSITIVE_DATA_KEY",
    },
  ),
  apiCredentialPostgres: packageStep(
    "postgres:api-credential-security",
    "@rehab-platform/api",
    "test:e2e:credential-security",
  ),
  apiEncryptedSeedPostgres: packageStep(
    "postgres:api-encrypted-seed-read",
    "@rehab-platform/api",
    "test:e2e:encrypted-seed-api",
  ),
  apiTask4Postgres: packageStep(
    "postgres:api-task4-concurrency",
    "@rehab-platform/api",
    "test:e2e:task4",
  ),
  apiTask7Postgres: packageStep(
    "postgres:api-task7-lifecycle",
    "@rehab-platform/api",
    "test:e2e:task7",
  ),
  dbSensitivePostgres: packageStep(
    "postgres:db-sensitive-encryption",
    "@rehab-platform/db",
    "test:sensitive:postgres",
  ),
  dbSeedPostgres: packageStep(
    "postgres:db-encrypted-seed",
    "@rehab-platform/db",
    "test:seed:postgres",
  ),
  dbConversationRolloutPostgres: step(
    "postgres:db-conversation-rollout",
    "pnpm",
    [
      "--filter",
      "@rehab-platform/db",
      "exec",
      "node",
      "--test",
      "prisma/ai-conversation-turn-count-rollout.postgres.test.mjs",
    ],
  ),
  dbTask7Postgres: packageStep(
    "postgres:db-task7-lifecycle",
    "@rehab-platform/db",
    "test:task7:postgres",
  ),
  playwright: step("playwright:full", "pnpm", ["run", "test:playwright"], {
    PLAYWRIGHT_DATABASE_URL: "PLAYWRIGHT_DATABASE_URL",
    PLAYWRIGHT_CONFIRM_DISPOSABLE: "PLAYWRIGHT_CONFIRM_DISPOSABLE",
    PLAYWRIGHT_WEB_PORT: "PLAYWRIGHT_WEB_PORT",
    PLAYWRIGHT_API_PORT: "PLAYWRIGHT_API_PORT",
    PLAYWRIGHT_JWT_SECRET: "PLAYWRIGHT_JWT_SECRET",
    PLAYWRIGHT_COOKIE_SECURE: "PLAYWRIGHT_COOKIE_SECURE",
    PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_LIMIT:
      "PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_LIMIT",
    PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS:
      "PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS",
    PLAYWRIGHT_SENSITIVE_DATA_KEY_REF: "PLAYWRIGHT_SENSITIVE_DATA_KEY_REF",
    PLAYWRIGHT_SENSITIVE_DATA_KEY: "PLAYWRIGHT_SENSITIVE_DATA_KEY",
    PLAYWRIGHT_SEED_PASSWORD: "PLAYWRIGHT_SEED_PASSWORD",
    PLAYWRIGHT_ACCOUNT_PASSWORD: "PLAYWRIGHT_ACCOUNT_PASSWORD",
  }),
  unitySource: step("unity:source", "pnpm", [
    "run",
    "verify:unity-rhythm-reach-source",
  ]),
  unityBuild: step("unity:webgl-build", "pnpm", [
    "run",
    "verify:unity-rhythm-reach-webgl-build",
  ]),
};

const postgresSteps = [
  steps.apiSmoke,
  steps.apiCredentialPostgres,
  steps.apiEncryptedSeedPostgres,
  steps.apiTask4Postgres,
  steps.apiTask7Postgres,
  steps.dbSensitivePostgres,
  steps.dbSeedPostgres,
  steps.dbConversationRolloutPostgres,
  steps.dbTask7Postgres,
];

export const regressionPlans = Object.freeze({
  static: Object.freeze([
    steps.dbGenerate,
    steps.dbValidate,
    steps.dbTypecheck,
    steps.dbBuild,
    steps.apiTypecheck,
    steps.apiLint,
    steps.apiBuild,
    steps.webTypecheck,
    steps.webLint,
    steps.webBuild,
    steps.renderBlueprint,
    steps.supplyChain,
    steps.deliveryCheck,
    steps.unitySource,
    steps.unityBuild,
  ]),
  unit: Object.freeze([
    steps.dbGenerate,
    steps.dbBuild,
    steps.dbContracts,
    steps.apiUnit,
    steps.apiContracts,
    steps.apiIntegration,
    steps.webUnit,
    steps.webRoleLifecycle,
    steps.deliveryTests,
  ]),
  postgres: Object.freeze(postgresSteps),
  full: Object.freeze([
    steps.dbGenerate,
    steps.dbValidate,
    steps.dbTypecheck,
    steps.dbBuild,
    steps.dbContracts,
    steps.apiUnit,
    steps.apiContracts,
    steps.apiIntegration,
    steps.apiTypecheck,
    steps.apiLint,
    steps.apiBuild,
    steps.webUnit,
    steps.webRoleLifecycle,
    steps.webTypecheck,
    steps.webLint,
    steps.webBuild,
    steps.renderBlueprint,
    steps.supplyChain,
    steps.deliveryTests,
    steps.deliveryCheck,
    ...postgresSteps,
    steps.playwright,
    steps.unitySource,
    steps.unityBuild,
  ]),
});

const postgresEnvironment = Object.freeze([
  requiredDatabaseName("API_SMOKE_DATABASE_URL", "rehab_api_smoke_test"),
  requiredConfirmation("API_SMOKE_CONFIRM_DISPOSABLE"),
  requiredExactValue("API_SMOKE_SEED_PASSWORD"),
  requiredUtf8Bytes("API_SMOKE_JWT_SECRET", 32),
  requiredBoolean("API_SMOKE_COOKIE_SECURE"),
  requiredPositiveSafeInteger("API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_LIMIT"),
  requiredPositiveSafeInteger("API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS"),
  requiredExactValue("API_SMOKE_SENSITIVE_DATA_KEY_REF"),
  requiredBase64Key("API_SMOKE_SENSITIVE_DATA_KEY", 32),
  requiredDatabaseName("TASK2_E2E_DATABASE_URL", "rehab_task2_credential_test"),
  requiredConfirmation("TASK2_E2E_CONFIRM_DISPOSABLE"),
  requiredDatabaseName("TASK6_SEED_API_E2E_DATABASE_URL", "rehab_regression"),
  requiredConfirmation("TASK6_SEED_API_E2E_CONFIRM_ISOLATED_SCHEMA"),
  requiredValue("TASK6_SEED_API_E2E_SENSITIVE_DATA_KEY_REF"),
  requiredValue("TASK6_SEED_API_E2E_SENSITIVE_DATA_KEY"),
  requiredValue("TASK6_SEED_API_E2E_SEED_PASSWORD"),
  requiredValue("TASK6_SEED_API_E2E_JWT_SECRET"),
  requiredDatabaseName("TASK4_E2E_DATABASE_URL", "rehab_task4_followup_test"),
  requiredConfirmation("TASK4_E2E_CONFIRM_DISPOSABLE"),
  requiredDatabaseName("TASK7_API_E2E_DATABASE_URL", "rehab_task7_api_test"),
  requiredConfirmation("TASK7_API_E2E_CONFIRM_DISPOSABLE"),
  requiredDatabaseName(
    "SENSITIVE_ENCRYPTION_BACKFILL_DISPOSABLE_DATABASE_URL",
    "rehab_regression",
  ),
  requiredDatabaseName(
    "ENCRYPTED_SEED_DISPOSABLE_DATABASE_URL",
    "rehab_regression",
  ),
  requiredDatabaseName(
    "AI_CONVERSATION_TURN_COUNT_ROLLOUT_DATABASE_URL",
    "rehab_regression",
  ),
  requiredConfirmation("TASK7_E2E_CONFIRM_DISPOSABLE"),
  requiredValue("TASK7_POSTGRES_CONTAINER"),
  requiredValue("TASK7_POSTGRES_USER"),
  requiredValue("JWT_SECRET"),
  requiredValue("SENSITIVE_DATA_KEY_REF"),
  requiredValue("SENSITIVE_DATA_KEY"),
]);

const staticBuildEnvironment = Object.freeze([
  requiredHttpsOrigin("NEXT_PUBLIC_API_BASE_URL"),
]);

const fullOnlyEnvironment = Object.freeze([
  requiredDatabaseName("PLAYWRIGHT_DATABASE_URL", "rehab_playwright_test"),
  requiredConfirmation("PLAYWRIGHT_CONFIRM_DISPOSABLE"),
  requiredPort("PLAYWRIGHT_WEB_PORT"),
  requiredPort("PLAYWRIGHT_API_PORT"),
  requiredUtf8Bytes("PLAYWRIGHT_JWT_SECRET", 32),
  requiredBoolean("PLAYWRIGHT_COOKIE_SECURE"),
  requiredPositiveSafeInteger("PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_LIMIT"),
  requiredPositiveSafeInteger("PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS"),
  requiredExactValue("PLAYWRIGHT_SENSITIVE_DATA_KEY_REF"),
  requiredBase64Key("PLAYWRIGHT_SENSITIVE_DATA_KEY", 32),
  requiredCredentialPassword("PLAYWRIGHT_SEED_PASSWORD"),
  requiredCredentialPassword("PLAYWRIGHT_ACCOUNT_PASSWORD"),
]);

export function validateRegressionEnvironment(scope, env = process.env) {
  const requirements =
    scope === "full"
      ? [
          ...staticBuildEnvironment,
          ...postgresEnvironment,
          ...fullOnlyEnvironment,
        ]
      : scope === "postgres"
        ? postgresEnvironment
        : scope === "static"
          ? staticBuildEnvironment
          : [];
  const failures = requirements.flatMap((requirement) =>
    requirement.validate(env[requirement.name]),
  );
  if (scope === "full" && env.PLAYWRIGHT_WEB_PORT === env.PLAYWRIGHT_API_PORT) {
    failures.push("PLAYWRIGHT_WEB_PORT and PLAYWRIGHT_API_PORT must differ.");
  }
  if (
    scope === "full" &&
    env.PLAYWRIGHT_SEED_PASSWORD === env.PLAYWRIGHT_ACCOUNT_PASSWORD
  ) {
    failures.push(
      "PLAYWRIGHT_SEED_PASSWORD and PLAYWRIGHT_ACCOUNT_PASSWORD must differ.",
    );
  }
  if (failures.length > 0) {
    throw new Error(
      `Regression environment preflight failed:\n- ${failures.join("\n- ")}`,
    );
  }
}

export function runRegression({
  scope,
  env = process.env,
  runStep = runChildStep,
  existsSync: checkExists = existsSync,
} = {}) {
  if (checkExists(productionApiEnvironmentPath)) {
    throw new Error(
      `Regression is blocked because ${productionApiEnvironmentPath} exists on this single-host production server. Run this scope on an independent Linux runner with dedicated test databases.`,
    );
  }

  const plan = regressionPlans[scope];
  if (!plan) {
    throw new Error(
      `Unknown regression scope ${JSON.stringify(scope)}; expected static, unit, postgres, or full.`,
    );
  }

  validateRegressionEnvironment(scope, env);
  for (const currentStep of plan) {
    runStep(currentStep, env);
  }
}

function step(id, command, args, envFrom = {}) {
  return Object.freeze({
    id,
    command,
    args: Object.freeze(args),
    envFrom: Object.freeze(envFrom),
  });
}

function packageStep(id, packageName, scriptName, envFrom) {
  return step(
    id,
    "pnpm",
    ["--filter", packageName, "run", scriptName],
    envFrom,
  );
}

function requiredValue(name) {
  return {
    name,
    validate(value) {
      return typeof value === "string" && value.trim() !== ""
        ? []
        : [`${name} is required and must not be blank.`];
    },
  };
}

function requiredConfirmation(name) {
  return {
    name,
    validate(value) {
      return value === "YES" ? [] : [`${name}=YES is required.`];
    },
  };
}

function requiredExactValue(name) {
  return {
    name,
    validate(value) {
      return typeof value === "string" && value !== "" && value.trim() === value
        ? []
        : [`${name} must be an exact non-empty value.`];
    },
  };
}

function requiredCredentialPassword(name) {
  return {
    name,
    validate(value) {
      if (
        typeof value !== "string" ||
        value.trim() !== value ||
        value.length < 8 ||
        value.length > 128
      ) {
        return [
          `${name} must be an exact credential password between 8 and 128 characters.`,
        ];
      }
      return [];
    },
  };
}

function requiredUtf8Bytes(name, minimumBytes) {
  return {
    name,
    validate(value) {
      return typeof value === "string" &&
        Buffer.byteLength(value, "utf8") >= minimumBytes
        ? []
        : [`${name} must contain at least ${minimumBytes} UTF-8 bytes.`];
    },
  };
}

function requiredBoolean(name) {
  return {
    name,
    validate(value) {
      return value === "true" || value === "false"
        ? []
        : [`${name} must be exactly true or false.`];
    },
  };
}

function requiredPositiveSafeInteger(name) {
  return {
    name,
    validate(value) {
      if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
        return [
          `${name} must be a positive safe integer expressed in base-10 digits.`,
        ];
      }
      return Number.isSafeInteger(Number(value))
        ? []
        : [
            `${name} must be a positive safe integer expressed in base-10 digits.`,
          ];
    },
  };
}

function requiredPort(name) {
  return {
    name,
    validate(value) {
      if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
        return [`${name} must be an integer from 1 through 65535.`];
      }
      const port = Number(value);
      return Number.isSafeInteger(port) && port <= 65_535
        ? []
        : [`${name} must be an integer from 1 through 65535.`];
    },
  };
}

function requiredBase64Key(name, expectedBytes) {
  return {
    name,
    validate(value) {
      if (
        typeof value !== "string" ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          value,
        )
      ) {
        return [
          `${name} must be canonical base64 encoding exactly ${expectedBytes} bytes.`,
        ];
      }
      const decoded = Buffer.from(value, "base64");
      return decoded.byteLength === expectedBytes &&
        decoded.toString("base64") === value
        ? []
        : [
            `${name} must be canonical base64 encoding exactly ${expectedBytes} bytes.`,
          ];
    },
  };
}

function requiredUrl(name) {
  return {
    name,
    validate(value) {
      if (typeof value !== "string" || value.trim() === "") {
        return [`${name} is required and must not be blank.`];
      }
      try {
        const parsed = new URL(value);
        if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
          return [`${name} must be a PostgreSQL URL.`];
        }
        if (parsed.pathname === "" || parsed.pathname === "/") {
          return [`${name} must include a database name.`];
        }
      } catch {
        return [`${name} must be a valid PostgreSQL URL.`];
      }
      return [];
    },
  };
}

function requiredHttpsOrigin(name) {
  return {
    name,
    validate(value) {
      if (typeof value !== "string" || value.trim() !== value || value === "") {
        return [`${name} must be an exact HTTPS origin.`];
      }
      try {
        const url = new URL(value);
        return url.protocol === "https:" &&
          url.username === "" &&
          url.password === "" &&
          url.pathname === "/" &&
          url.search === "" &&
          url.hash === ""
          ? []
          : [`${name} must be an exact HTTPS origin.`];
      } catch {
        return [`${name} must be an exact HTTPS origin.`];
      }
    },
  };
}

function requiredDatabaseName(name, expectedName) {
  const urlRequirement = requiredUrl(name);
  return {
    name,
    validate(value) {
      const urlFailures = urlRequirement.validate(value);
      if (urlFailures.length > 0) return urlFailures;
      const parsed = new URL(value);
      if (decodeURIComponent(parsed.pathname) !== `/${expectedName}`) {
        return [`${name} database name must be ${expectedName}.`];
      }
      return parsed.searchParams.has("schema")
        ? [`${name} must not select a schema.`]
        : [];
    },
  };
}

function runChildStep(currentStep, env) {
  const childEnv = { ...env };
  for (const [targetName, sourceName] of Object.entries(currentStep.envFrom)) {
    childEnv[targetName] = env[sourceName];
  }

  process.stdout.write(`\n[regression] ${currentStep.id}\n`);
  const result = spawnSync(currentStep.command, currentStep.args, {
    cwd: rootDir,
    env: childEnv,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${currentStep.id} failed with exit code ${result.status ?? "unknown"}.`,
    );
  }
}

function parseScope(argv) {
  if (argv.length !== 2 || argv[0] !== "--scope") {
    throw new Error(
      "Usage: node scripts/run-full-regression.mjs --scope <static|unit|postgres|full>",
    );
  }
  return argv[1];
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    runRegression({ scope: parseScope(process.argv.slice(2)) });
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
