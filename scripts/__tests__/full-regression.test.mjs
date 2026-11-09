import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  regressionPlans,
  runRegression,
  validateRegressionEnvironment,
} from "../run-full-regression.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const expectedFullOrder = [
  "db:generate",
  "db:validate",
  "db:typecheck",
  "db:build",
  "db:contracts",
  "api:unit",
  "api:contracts",
  "api:controller-integration",
  "api:typecheck",
  "api:lint",
  "api:build",
  "web:unit",
  "web:role-workspace-lifecycle",
  "web:typecheck",
  "web:lint",
  "web:build",
  "render:blueprint",
  "supply-chain:production",
  "delivery:tests",
  "delivery:check",
  "postgres:api-smoke",
  "postgres:api-credential-security",
  "postgres:api-encrypted-seed-read",
  "postgres:api-task4-concurrency",
  "postgres:api-task7-lifecycle",
  "postgres:db-sensitive-encryption",
  "postgres:db-encrypted-seed",
  "postgres:db-conversation-rollout",
  "postgres:db-task7-lifecycle",
  "playwright:full",
  "unity:source",
  "unity:webgl-build",
];

function completeEnvironment() {
  const databaseUrl = (databaseName) =>
    `postgresql://regression:secret@127.0.0.1:5432/${databaseName}`;
  return {
    NEXT_PUBLIC_API_BASE_URL: "https://api.regression.rehab.invalid",
    API_SMOKE_DATABASE_URL: databaseUrl("rehab_api_smoke_test"),
    API_SMOKE_CONFIRM_DISPOSABLE: "YES",
    API_SMOKE_SEED_PASSWORD: "Regression-Seed-253913!",
    API_SMOKE_JWT_SECRET:
      "regression-api-smoke-jwt-secret-with-at-least-32-bytes",
    API_SMOKE_COOKIE_SECURE: "false",
    API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_LIMIT: "100",
    API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS: "60000",
    API_SMOKE_SENSITIVE_DATA_KEY_REF: "secret-manager://regression/api-smoke",
    API_SMOKE_SENSITIVE_DATA_KEY: Buffer.alloc(32, 5).toString("base64"),
    TASK2_E2E_DATABASE_URL: databaseUrl("rehab_task2_credential_test"),
    TASK2_E2E_CONFIRM_DISPOSABLE: "YES",
    TASK4_E2E_DATABASE_URL: databaseUrl("rehab_task4_followup_test"),
    TASK4_E2E_CONFIRM_DISPOSABLE: "YES",
    TASK7_API_E2E_DATABASE_URL: databaseUrl("rehab_task7_api_test"),
    TASK7_API_E2E_CONFIRM_DISPOSABLE: "YES",
    TASK6_SEED_API_E2E_DATABASE_URL: databaseUrl("rehab_regression"),
    TASK6_SEED_API_E2E_CONFIRM_ISOLATED_SCHEMA: "YES",
    TASK6_SEED_API_E2E_SENSITIVE_DATA_KEY_REF:
      "secret-manager://regression/task6",
    TASK6_SEED_API_E2E_SENSITIVE_DATA_KEY: Buffer.alloc(32, 6).toString(
      "base64",
    ),
    TASK6_SEED_API_E2E_SEED_PASSWORD: "regression-seed-password",
    TASK6_SEED_API_E2E_JWT_SECRET:
      "regression-task6-jwt-secret-with-at-least-32-bytes",
    SENSITIVE_ENCRYPTION_BACKFILL_DISPOSABLE_DATABASE_URL:
      databaseUrl("rehab_regression"),
    ENCRYPTED_SEED_DISPOSABLE_DATABASE_URL: databaseUrl("rehab_regression"),
    AI_CONVERSATION_TURN_COUNT_ROLLOUT_DATABASE_URL:
      databaseUrl("rehab_regression"),
    TASK7_E2E_CONFIRM_DISPOSABLE: "YES",
    TASK7_POSTGRES_CONTAINER: "regression-postgres",
    TASK7_POSTGRES_USER: "regression",
    JWT_SECRET: "regression-api-jwt-secret-with-at-least-32-bytes",
    SENSITIVE_DATA_KEY_REF: "secret-manager://regression/api",
    SENSITIVE_DATA_KEY: Buffer.alloc(32, 7).toString("base64"),
    PLAYWRIGHT_DATABASE_URL: databaseUrl("rehab_playwright_test"),
    PLAYWRIGHT_CONFIRM_DISPOSABLE: "YES",
    PLAYWRIGHT_WEB_PORT: "3100",
    PLAYWRIGHT_API_PORT: "4100",
    PLAYWRIGHT_JWT_SECRET:
      "regression-playwright-jwt-secret-with-at-least-32-bytes",
    PLAYWRIGHT_COOKIE_SECURE: "false",
    PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_LIMIT: "100",
    PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS: "60000",
    PLAYWRIGHT_SENSITIVE_DATA_KEY_REF: "secret-manager://regression/playwright",
    PLAYWRIGHT_SENSITIVE_DATA_KEY: Buffer.alloc(32, 8).toString("base64"),
    PLAYWRIGHT_SEED_PASSWORD: "Playwright-Seed-253913!",
    PLAYWRIGHT_ACCOUNT_PASSWORD: "Playwright-Final-253913!",
  };
}

function runOnNonProductionHost(options) {
  return runRegression({
    existsSync: () => false,
    ...options,
  });
}

test("full regression has one explicit fail-fast order across every required layer", () => {
  assert.deepEqual(
    regressionPlans.full.map(({ id }) => id),
    expectedFullOrder,
  );
  assert.equal(new Set(expectedFullOrder).size, expectedFullOrder.length);
  assert.doesNotMatch(
    JSON.stringify(regressionPlans.full),
    /--if-present|--passWithNoTests|continue-on-error/i,
  );
});

test("static, unit, and full build the generated database package before API consumers", () => {
  for (const scope of ["static", "unit", "full"]) {
    const plan = regressionPlans[scope];
    const ids = plan.map(({ id }) => id);
    const buildIndex = ids.indexOf("db:build");
    assert.ok(ids.indexOf("db:generate") < buildIndex, scope);
    assert.ok(buildIndex < ids.findIndex((id) => id.startsWith("api:")), scope);
    assert.deepEqual(plan[buildIndex].args, [
      "--filter", "@rehab-platform/db", "run", "build",
    ]);
    const calls = [];
    assert.throws(
      () => runOnNonProductionHost({
        scope,
        env: completeEnvironment(),
        runStep(entry) {
          calls.push(entry.id);
          if (entry.id === "db:build") throw new Error("database build failed");
        },
      }),
      /database build failed/,
    );
    assert.deepEqual(calls, ids.slice(0, buildIndex + 1));
  }
});

test("scoped scripts keep unit tests separate from PostgreSQL write suites and API smoke", () => {
  const unitIds = regressionPlans.unit.map(({ id }) => id);
  const postgresIds = regressionPlans.postgres.map(({ id }) => id);

  assert.deepEqual(unitIds, [
    "db:generate",
    "db:build",
    "db:contracts",
    "api:unit",
    "api:contracts",
    "api:controller-integration",
    "web:unit",
    "web:role-workspace-lifecycle",
    "delivery:tests",
  ]);
  assert.equal(
    unitIds.some((id) => id.startsWith("postgres:")),
    false,
  );
  assert.equal(unitIds.includes("postgres:api-smoke"), false);
  assert.deepEqual(postgresIds, expectedFullOrder.slice(20, 29));
});

test("full and PostgreSQL scopes validate every database input before running a command", () => {
  for (const scope of ["postgres", "full"]) {
    const calls = [];
    assert.throws(
      () =>
        runOnNonProductionHost({
          scope,
          env: {},
          runStep: (entry) => calls.push(entry.id),
        }),
      /Regression environment preflight failed.*API_SMOKE_DATABASE_URL/s,
    );
    assert.deepEqual(calls, []);
  }
});

test("static and full scopes require an explicit exact HTTPS API build origin", () => {
  for (const value of [
    undefined,
    " https://api.regression.rehab.invalid",
    "http://api.regression.rehab.invalid",
    "https://api.regression.rehab.invalid/v1",
    "https://api.regression.rehab.invalid?preview=1",
    "https://user:password@api.regression.rehab.invalid",
  ]) {
    assert.throws(
      () =>
        validateRegressionEnvironment("static", {
          NEXT_PUBLIC_API_BASE_URL: value,
        }),
      /NEXT_PUBLIC_API_BASE_URL must be an exact HTTPS origin/,
    );
  }

  const environment = completeEnvironment();
  delete environment.NEXT_PUBLIC_API_BASE_URL;
  const calls = [];
  assert.throws(
    () =>
      runOnNonProductionHost({
        scope: "full",
        env: environment,
        runStep: (entry) => calls.push(entry.id),
      }),
    /NEXT_PUBLIC_API_BASE_URL must be an exact HTTPS origin/,
  );
  assert.deepEqual(calls, []);
});

test("PostgreSQL preflight rejects non-PostgreSQL URLs and missing exact confirmations", () => {
  const environment = completeEnvironment();
  environment.TASK4_E2E_DATABASE_URL = "mysql://localhost/regression";
  environment.TASK7_API_E2E_CONFIRM_DISPOSABLE = "true";

  assert.throws(
    () => validateRegressionEnvironment("postgres", environment),
    /TASK4_E2E_DATABASE_URL must be a PostgreSQL URL.*TASK7_API_E2E_CONFIRM_DISPOSABLE=YES/s,
  );
});

test("full preflight rejects every unexpected database name before any child runs", () => {
  const expectedDatabaseNames = {
    API_SMOKE_DATABASE_URL: "rehab_api_smoke_test",
    TASK2_E2E_DATABASE_URL: "rehab_task2_credential_test",
    TASK6_SEED_API_E2E_DATABASE_URL: "rehab_regression",
    TASK4_E2E_DATABASE_URL: "rehab_task4_followup_test",
    TASK7_API_E2E_DATABASE_URL: "rehab_task7_api_test",
    SENSITIVE_ENCRYPTION_BACKFILL_DISPOSABLE_DATABASE_URL: "rehab_regression",
    ENCRYPTED_SEED_DISPOSABLE_DATABASE_URL: "rehab_regression",
    AI_CONVERSATION_TURN_COUNT_ROLLOUT_DATABASE_URL: "rehab_regression",
    PLAYWRIGHT_DATABASE_URL: "rehab_playwright_test",
  };

  for (const [name, expectedDatabaseName] of Object.entries(
    expectedDatabaseNames,
  )) {
    const environment = completeEnvironment();
    environment[name] =
      "postgresql://regression:secret@127.0.0.1:5432/unexpected_database";
    const calls = [];

    assert.throws(
      () =>
        runOnNonProductionHost({
          scope: "full",
          env: environment,
          runStep: (entry) => calls.push(entry.id),
        }),
      new RegExp(`${name} database name must be ${expectedDatabaseName}`),
    );
    assert.deepEqual(calls, []);
  }
});

test("API smoke preflight strictly validates runtime security configuration", () => {
  const environment = completeEnvironment();
  environment.API_SMOKE_JWT_SECRET = "too-short";
  environment.API_SMOKE_COOKIE_SECURE = "FALSE";
  environment.API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_LIMIT = "0";
  environment.API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS = "1.5";
  environment.API_SMOKE_SENSITIVE_DATA_KEY_REF = " padded ";
  environment.API_SMOKE_SENSITIVE_DATA_KEY =
    Buffer.alloc(31).toString("base64");

  assert.throws(
    () => validateRegressionEnvironment("postgres", environment),
    /API_SMOKE_JWT_SECRET must contain at least 32 UTF-8 bytes.*API_SMOKE_COOKIE_SECURE must be exactly true or false.*API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_LIMIT must be a positive safe integer.*API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS must be a positive safe integer.*API_SMOKE_SENSITIVE_DATA_KEY_REF must be an exact non-empty value.*API_SMOKE_SENSITIVE_DATA_KEY must be canonical base64 encoding exactly 32 bytes/s,
  );
});

test("API smoke preflight requires its dedicated whole-database reset target", () => {
  const wrongDatabase = completeEnvironment();
  wrongDatabase.API_SMOKE_DATABASE_URL =
    "postgresql://regression:secret@127.0.0.1:5432/project_database";
  assert.throws(
    () => validateRegressionEnvironment("postgres", wrongDatabase),
    /API_SMOKE_DATABASE_URL database name must be rehab_api_smoke_test/,
  );

  const scopedDatabase = completeEnvironment();
  scopedDatabase.API_SMOKE_DATABASE_URL += "?schema=public";
  assert.throws(
    () => validateRegressionEnvironment("postgres", scopedDatabase),
    /API_SMOKE_DATABASE_URL must not select a schema/,
  );
});

test("full preflight strictly validates every Playwright runtime input", () => {
  const environment = completeEnvironment();
  environment.PLAYWRIGHT_WEB_PORT = "0";
  environment.PLAYWRIGHT_API_PORT = "65536";
  environment.PLAYWRIGHT_JWT_SECRET = "short";
  environment.PLAYWRIGHT_COOKIE_SECURE = "yes";
  environment.PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_LIMIT = "Infinity";
  environment.PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS = "0";
  environment.PLAYWRIGHT_SENSITIVE_DATA_KEY_REF = " key-ref";
  environment.PLAYWRIGHT_SENSITIVE_DATA_KEY = "not-base64";
  environment.PLAYWRIGHT_SEED_PASSWORD = "short";
  environment.PLAYWRIGHT_ACCOUNT_PASSWORD = " padded-password ";

  assert.throws(
    () => validateRegressionEnvironment("full", environment),
    /PLAYWRIGHT_WEB_PORT must be an integer from 1 through 65535.*PLAYWRIGHT_API_PORT must be an integer from 1 through 65535.*PLAYWRIGHT_JWT_SECRET must contain at least 32 UTF-8 bytes.*PLAYWRIGHT_COOKIE_SECURE must be exactly true or false.*PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_LIMIT must be a positive safe integer.*PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS must be a positive safe integer.*PLAYWRIGHT_SENSITIVE_DATA_KEY_REF must be an exact non-empty value.*PLAYWRIGHT_SENSITIVE_DATA_KEY must be canonical base64 encoding exactly 32 bytes.*PLAYWRIGHT_SEED_PASSWORD must be an exact credential password.*PLAYWRIGHT_ACCOUNT_PASSWORD must be an exact credential password/s,
  );
});

test("full preflight rejects a shared API and Web port before any child runs", () => {
  const environment = completeEnvironment();
  environment.PLAYWRIGHT_API_PORT = environment.PLAYWRIGHT_WEB_PORT;
  const calls = [];

  assert.throws(
    () =>
      runOnNonProductionHost({
        scope: "full",
        env: environment,
        runStep: (entry) => calls.push(entry.id),
      }),
    /PLAYWRIGHT_WEB_PORT and PLAYWRIGHT_API_PORT must differ/,
  );
  assert.deepEqual(calls, []);
});

test("validated PostgreSQL and full plans can be inspected without executing children", () => {
  const environment = completeEnvironment();
  const postgresCalls = [];
  const fullCalls = [];

  runOnNonProductionHost({
    scope: "postgres",
    env: environment,
    runStep: (entry) => postgresCalls.push(entry.id),
  });
  runOnNonProductionHost({
    scope: "full",
    env: environment,
    runStep: (entry) => fullCalls.push(entry.id),
  });

  assert.deepEqual(postgresCalls, expectedFullOrder.slice(20, 29));
  assert.deepEqual(fullCalls, expectedFullOrder);
});

test("runner stops at the first failed child and never executes later commands", () => {
  const calls = [];

  assert.throws(
    () =>
      runOnNonProductionHost({
        scope: "unit",
        env: {},
        runStep(entry) {
          calls.push(entry.id);
          if (entry.id === "api:unit") throw new Error("child failed");
        },
      }),
    /child failed/,
  );
  assert.deepEqual(calls, ["db:generate", "db:build", "db:contracts", "api:unit"]);
});

test("every scope stops before children when the single-host production config exists", () => {
  for (const scope of Object.keys(regressionPlans)) {
    const checkedPaths = [];
    const childCalls = [];

    assert.throws(
      () =>
        runRegression({
          scope,
          env: completeEnvironment(),
          existsSync(path) {
            checkedPaths.push(path);
            return true;
          },
          runStep(entry) {
            childCalls.push(entry.id);
          },
        }),
      /Regression is blocked because \/etc\/rehab\/api\.env exists on this single-host production server.*independent Linux runner with dedicated test databases/,
    );

    assert.deepEqual(checkedPaths, ["/etc/rehab/api.env"]);
    assert.deepEqual(childCalls, []);
  }
});

test("API smoke and Playwright receive complete explicit runtime mappings", () => {
  const apiSmoke = regressionPlans.full.find(
    ({ id }) => id === "postgres:api-smoke",
  );
  const playwright = regressionPlans.full.find(
    ({ id }) => id === "playwright:full",
  );

  assert.deepEqual(apiSmoke?.envFrom, {
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
  });
  assert.deepEqual(playwright?.envFrom, {
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
  });
});

test("Playwright orchestration is explicit, isolated, and has no service-start fallback", () => {
  const config = readFileSync(
    resolve(rootDir, "scripts/playwright-regression.config.mjs"),
    "utf8",
  );
  const formalSpec = readFileSync(
    resolve(rootDir, "scripts/formal-ui-business-chain.spec.mjs"),
    "utf8",
  );
  const visualSpec = readFileSync(
    resolve(rootDir, "scripts/web-playwright-regression.spec.mjs"),
    "utf8",
  );
  const setupSpec = readFileSync(
    resolve(rootDir, "scripts/playwright-account-setup.spec.mjs"),
    "utf8",
  );
  const runner = readFileSync(
    resolve(rootDir, "scripts/run-playwright-regression.mjs"),
    "utf8",
  );

  assert.match(config, /webServer:\s*\[/);
  assert.equal([...config.matchAll(/reuseExistingServer: false/g)].length, 2);
  assert.doesNotMatch(
    config,
    /\?\?|NO_PROXY|no_proxy|until\s|sleep\s|api_pid|secret-manager:\/\/rehab\/playwright/,
  );
  assert.doesNotMatch(formalSpec, /localhost:(?:3000|4000)|\?\?\s*3000/);
  assert.doesNotMatch(visualSpec, /localhost:(?:3000|4000)/);
  assert.match(formalSpec, /PLAYWRIGHT_WEB_PORT/);
  assert.match(formalSpec, /PLAYWRIGHT_API_PORT/);
  assert.match(visualSpec, /PLAYWRIGHT_API_PORT/);
  assert.match(visualSpec, /PLAYWRIGHT_WEB_PORT/);
  assert.match(config, /dependencies:\s*\["account-setup"\]/);
  assert.match(setupSpec, /password_reset_required/);
  assert.match(setupSpec, /password_reset_complete/);
  assert.match(setupSpec, /status:\s*"authenticated"/);
  assert.doesNotMatch(setupSpec, /retry|fallback|253913/);
  assert.match(runner, /migrate[\s\S]*reset[\s\S]*--force[\s\S]*--skip-seed/);
});

test("root and workspace package scripts expose the audited regression entry points", () => {
  const rootPackage = JSON.parse(
    readFileSync(resolve(rootDir, "package.json"), "utf8"),
  );
  const apiPackage = JSON.parse(
    readFileSync(resolve(rootDir, "apps/api/package.json"), "utf8"),
  );
  const webPackage = JSON.parse(
    readFileSync(resolve(rootDir, "apps/web/package.json"), "utf8"),
  );
  const dbPackage = JSON.parse(
    readFileSync(resolve(rootDir, "packages/db/package.json"), "utf8"),
  );

  assert.equal(
    rootPackage.scripts["check:static"],
    "node scripts/run-full-regression.mjs --scope static",
  );
  assert.equal(
    rootPackage.scripts["test:unit"],
    "node scripts/run-full-regression.mjs --scope unit",
  );
  assert.equal(
    rootPackage.scripts["test:postgres"],
    "node scripts/run-full-regression.mjs --scope postgres",
  );
  assert.equal(
    rootPackage.scripts["regression:full"],
    "node scripts/run-full-regression.mjs --scope full",
  );
  assert.equal(
    rootPackage.scripts["test:playwright"],
    "node scripts/run-playwright-regression.mjs",
  );
  assert.equal(
    rootPackage.scripts["supply-chain:artifacts"],
    "node scripts/produce-production-supply-chain.mjs",
  );
  assert.equal(
    rootPackage.scripts["verify:supply-chain:production"],
    "node scripts/verify-production-supply-chain.mjs",
  );
  assert.equal(
    rootPackage.scripts["verify:api-sast"],
    "node scripts/run-api-sast.mjs",
  );
  assert.equal(apiPackage.scripts.typecheck, "tsc --noEmit");
  assert.equal(
    apiPackage.scripts["test:e2e:postgres-smoke"],
    "node ./test/run-api-smoke-postgres-e2e.mjs",
  );
  assert.equal(apiPackage.scripts["test:unit"], "jest --runInBand");
  assert.equal(
    apiPackage.scripts["test:contracts"],
    "node --test test/*.test.mjs",
  );
  assert.equal(webPackage.scripts.typecheck, "tsc --noEmit");
  assert.match(webPackage.scripts.test, /^tsx --test /);
  assert.doesNotMatch(webPackage.scripts.test, /role-workspace-lifecycle/);
  assert.equal(
    webPackage.scripts["test:role-workspace-lifecycle"],
    "playwright test src/features/session/role-workspace-lifecycle.spec.mjs --workers=1",
  );
  assert.equal(dbPackage.scripts.typecheck, "tsc --noEmit");
});

test("CLI reports missing PostgreSQL configuration with a nonzero exit before child output", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/run-full-regression.mjs", "--scope", "postgres"],
    {
      cwd: rootDir,
      encoding: "utf8",
      env: { PATH: process.env.PATH },
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Regression environment preflight failed/);
  assert.doesNotMatch(result.stdout, /\[regression\]/);
});

test("CLI returns nonzero and stops immediately when a child command fails", () => {
  const commandDirectory = mkdtempSync(
    resolve(tmpdir(), "rehab-regression-command-"),
  );
  const pnpmPath = resolve(commandDirectory, "pnpm");
  writeFileSync(pnpmPath, "#!/bin/sh\nexit 23\n", "utf8");
  chmodSync(pnpmPath, 0o755);

  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/run-full-regression.mjs", "--scope", "static"],
      {
        cwd: rootDir,
        encoding: "utf8",
        env: {
          PATH: commandDirectory,
          NEXT_PUBLIC_API_BASE_URL: "https://api.regression.rehab.invalid",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /\[regression\] db:generate/);
    assert.doesNotMatch(result.stdout, /\[regression\] db:validate/);
    assert.match(result.stderr, /db:generate failed with exit code 23/);
  } finally {
    rmSync(commandDirectory, { recursive: true, force: true });
  }
});
