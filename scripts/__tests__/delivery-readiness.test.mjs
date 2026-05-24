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
        "verify:browser-pose-field-acceptance":
          "node scripts/verify-browser-pose-field-acceptance.mjs",
        "verify:customer-production-input":
          "node scripts/verify-customer-production-input.mjs",
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
        "verify:browser-pose-field-acceptance":
          "node scripts/verify-browser-pose-field-acceptance.mjs",
        "verify:customer-production-input":
          "node scripts/verify-customer-production-input.mjs",
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

test("package script check requires browser pose field acceptance verifier", () => {
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

  assert.match(
    result.failures.join("\n"),
    /verify:browser-pose-field-acceptance/,
  );
});

test("package script check requires customer production input verifier", () => {
  const result = checkPackageScripts({
    rootPackage: {
      scripts: {
        "delivery:check": "node scripts/check-delivery-readiness.mjs",
        "delivery:check:production":
          "node scripts/check-delivery-readiness.mjs --production-env",
        "test:delivery": "node --test scripts/__tests__/*.test.mjs",
        "verify:browser-pose-field-acceptance":
          "node scripts/verify-browser-pose-field-acceptance.mjs",
      },
    },
    apiPackage: {
      scripts: {
        lint: 'eslint "{src,apps,libs,test}/**/*.ts"',
      },
    },
  });

  assert.match(
    result.failures.join("\n"),
    /verify:customer-production-input/,
  );
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

test("production environment check requires explicit AI and speech integration config", () => {
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

  assert.match(result.failures.join("\n"), /AI_PROVIDER/);
  assert.match(result.failures.join("\n"), /AI_MODEL_VERSION/);
  assert.match(result.failures.join("\n"), /AI_MODEL_ENDPOINT/);
  assert.match(result.failures.join("\n"), /AI_API_KEY_REF/);
  assert.match(result.failures.join("\n"), /AI_PROMPT_VERSION/);
  assert.match(result.failures.join("\n"), /AI_CALL_LOG_RETENTION_DAYS/);
  assert.match(result.failures.join("\n"), /AI_HUMAN_REVIEW_REQUIRED/);
  assert.match(result.failures.join("\n"), /SPEECH_PROVIDER/);
  assert.match(result.failures.join("\n"), /SPEECH_TO_TEXT_ENDPOINT/);
  assert.match(result.failures.join("\n"), /SPEECH_API_KEY_REF/);
  assert.match(result.failures.join("\n"), /SPEECH_MODEL_VERSION/);
});

test("production environment check rejects demo AI and local speech config", () => {
  const result = checkProductionEnvironment({
    DATABASE_URL:
      "postgresql://rehab_prod:strong-password@db.prod.internal:5432/rehab_platform?schema=public",
    REDIS_URL: "rediss://redis.prod.internal:6379",
    JWT_SECRET:
      "prod_secret_7u9v8w3x6y5z4a2b1c0d9e8f7g6h5j4k3l2m1n0p",
    WEB_ORIGIN: "https://rehab.example.com",
    NEXT_PUBLIC_API_BASE_URL: "https://api.rehab.example.com",
    DEFAULT_PATIENT_PASSWORD: "initial-password-managed-by-ops",
    AI_PROVIDER: "mock",
    AI_MODEL_VERSION: "demo-v1",
    AI_MODEL_ENDPOINT: "http://localhost:8317/v1/chat/completions",
    AI_API_KEY_REF: "<ai-api-key>",
    AI_PROMPT_VERSION: "local-prompt",
    AI_CALL_LOG_RETENTION_DAYS: "0",
    AI_HUMAN_REVIEW_REQUIRED: "false",
    SPEECH_PROVIDER: "local-stt",
    SPEECH_TO_TEXT_ENDPOINT: "http://127.0.0.1:9000/stt",
    SPEECH_API_KEY_REF: "mock-speech-key",
    SPEECH_MODEL_VERSION: "demo-speech",
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /AI_PROVIDER.*mock\/demo\/local/);
  assert.match(failures, /AI_MODEL_VERSION.*mock\/demo\/local/);
  assert.match(failures, /AI_MODEL_ENDPOINT.*localhost/);
  assert.match(failures, /AI_MODEL_ENDPOINT.*正式 HTTPS/);
  assert.match(failures, /AI_API_KEY_REF.*占位符/);
  assert.match(failures, /AI_PROMPT_VERSION.*mock\/demo\/local/);
  assert.match(failures, /AI_CALL_LOG_RETENTION_DAYS.*30 到 3650/);
  assert.match(failures, /AI_HUMAN_REVIEW_REQUIRED.*true/);
  assert.match(failures, /SPEECH_PROVIDER.*mock\/demo\/local/);
  assert.match(failures, /SPEECH_TO_TEXT_ENDPOINT.*localhost/);
  assert.match(failures, /SPEECH_TO_TEXT_ENDPOINT.*正式 HTTPS/);
  assert.match(failures, /SPEECH_API_KEY_REF.*mock\/demo\/local/);
  assert.match(failures, /SPEECH_MODEL_VERSION.*mock\/demo\/local/);
});

test("production environment check rejects raw AI and speech key values", () => {
  const result = checkProductionEnvironment({
    DATABASE_URL:
      "postgresql://rehab_prod:strong-password@db.prod.internal:5432/rehab_platform?schema=public",
    REDIS_URL: "rediss://redis.prod.internal:6379",
    JWT_SECRET:
      "prod_secret_7u9v8w3x6y5z4a2b1c0d9e8f7g6h5j4k3l2m1n0p",
    WEB_ORIGIN: "https://rehab.example.com",
    NEXT_PUBLIC_API_BASE_URL: "https://api.rehab.example.com",
    DEFAULT_PATIENT_PASSWORD: "initial-password-managed-by-ops",
    AI_PROVIDER: "iflytek-spark",
    AI_MODEL_VERSION: "spark-x1-2026-05",
    AI_MODEL_ENDPOINT: "https://spark-api.customer-health.cn/v1/chat/completions",
    AI_API_KEY_REF: "sk-live-real-key-value",
    AI_PROMPT_VERSION: "cognitive-assessment-2026-05",
    AI_CALL_LOG_RETENTION_DAYS: "180",
    AI_HUMAN_REVIEW_REQUIRED: "true",
    SPEECH_PROVIDER: "iflytek-iat",
    SPEECH_TO_TEXT_ENDPOINT: "https://speech.customer-health.cn/v2/iat",
    SPEECH_API_KEY_REF: "abc123-real-speech-key",
    SPEECH_MODEL_VERSION: "iat-medical-2026-05",
  });

  assert.match(result.failures.join("\n"), /AI_API_KEY_REF.*secret-manager/);
  assert.match(result.failures.join("\n"), /SPEECH_API_KEY_REF.*secret-manager/);
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
    AI_PROVIDER: "iflytek-spark",
    AI_MODEL_VERSION: "spark-x1-2026-05",
    AI_MODEL_ENDPOINT: "https://spark-api.customer-health.cn/v1/chat/completions",
    AI_API_KEY_REF: "secret-manager://rehab-prod/iflytek-spark-api-key",
    AI_PROMPT_VERSION: "cognitive-assessment-2026-05",
    AI_CALL_LOG_RETENTION_DAYS: "180",
    AI_HUMAN_REVIEW_REQUIRED: "true",
    SPEECH_PROVIDER: "iflytek-iat",
    SPEECH_TO_TEXT_ENDPOINT: "https://speech.customer-health.cn/v2/iat",
    SPEECH_API_KEY_REF: "secret-manager://rehab-prod/iflytek-iat-api-key",
    SPEECH_MODEL_VERSION: "iat-medical-2026-05",
  });

  assert.deepEqual(result.failures, []);
});
