import test from "node:test";
import assert from "node:assert/strict";
import {
  checkGitignoreExclusions,
  checkPackageScripts,
  checkProductionEnvironment,
} from "../check-delivery-readiness.mjs";

test("package scripts expose non-mutating delivery checks", () => {
  const result = checkPackageScripts({
    rootPackage: {
      scripts: {
        "delivery:check": "node scripts/check-delivery-readiness.mjs",
        "delivery:check:production":
          "node scripts/check-delivery-readiness.mjs --production-env",
        "test:delivery": "node --test scripts/__tests__/*.test.mjs",
      },
    },
    apiPackage: {
      scripts: {
        lint: 'eslint "{src,apps,libs,test}/**/*.ts"',
      },
    },
  });

  assert.deepEqual(result.failures, []);
});

test("package script check rejects mutating api lint", () => {
  const result = checkPackageScripts({
    rootPackage: {
      scripts: {
        "delivery:check": "node scripts/check-delivery-readiness.mjs",
        "delivery:check:production":
          "node scripts/check-delivery-readiness.mjs --production-env",
        "test:delivery": "node --test scripts/__tests__/*.test.mjs",
      },
    },
    apiPackage: {
      scripts: {
        lint: 'eslint "{src,apps,libs,test}/**/*.ts" --fix',
      },
    },
  });

  assert.match(result.failures.join("\n"), /api lint.*--fix/);
});

test("gitignore check requires local and historical directories to be excluded", () => {
  const result = checkGitignoreExclusions([
    "node_modules",
    ".next",
    "dist",
    "coverage",
    ".env",
    ".env.local",
    ".env.production",
    ".DS_Store",
    "*.log",
    "infra/data",
    "客户提供/",
    ".playwright-cli/",
    ".playwright-mcp/",
  ].join("\n"));

  assert.deepEqual(result.failures, []);
});

test("production environment check rejects placeholders and local origins", () => {
  const result = checkProductionEnvironment({
    DATABASE_URL:
      "postgresql://<db_user>:<db_password>@<db_host>:5432/rehab?schema=public",
    REDIS_URL: "redis://localhost:6379",
    JWT_SECRET: "dev-rehab-platform-secret",
    WEB_ORIGIN: "http://localhost:3000",
    NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
    DEFAULT_PATIENT_PASSWORD: "253913",
  });

  assert.match(result.failures.join("\n"), /DATABASE_URL.*占位符/);
  assert.match(result.failures.join("\n"), /REDIS_URL.*localhost/);
  assert.match(result.failures.join("\n"), /JWT_SECRET.*开发/);
  assert.match(result.failures.join("\n"), /WEB_ORIGIN.*正式 HTTPS/);
  assert.match(result.failures.join("\n"), /DEFAULT_PATIENT_PASSWORD.*固定/);
});

test("production environment check accepts explicit production-shaped values", () => {
  const result = checkProductionEnvironment({
    DATABASE_URL:
      "postgresql://rehab_prod:strong-password@db.prod.internal:5432/rehab_platform?schema=public",
    REDIS_URL: "rediss://redis.prod.internal:6379",
    JWT_SECRET:
      "prod_secret_7u9v8w3x6y5z4a2b1c0d9e8f7g6h5j4k3l2m1n0p",
    WEB_ORIGIN: "https://rehab.example.com",
    NEXT_PUBLIC_API_BASE_URL: "https://api.rehab.example.com",
    DEFAULT_PATIENT_PASSWORD: "initial-password-managed-by-ops",
  });

  assert.deepEqual(result.failures, []);
});
