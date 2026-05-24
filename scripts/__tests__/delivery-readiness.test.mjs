import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  checkGitignoreExclusions,
  checkDeliveryDocumentReferences,
  checkPackageScripts,
  checkProductionLaunchScopeConsistency,
  checkProductionEnvironment,
} from "../check-delivery-readiness.mjs";

function productionBaseEnv() {
  return {
    DATABASE_URL:
      "postgresql://rehab_prod:strong-password@db.prod.internal:5432/rehab_platform?schema=public",
    REDIS_URL: "rediss://redis.prod.internal:6379",
    JWT_SECRET:
      "prod_secret_7u9v8w3x6y5z4a2b1c0d9e8f7g6h5j4k3l2m1n0p",
    WEB_ORIGIN: "https://rehab.example.com",
    NEXT_PUBLIC_API_BASE_URL: "https://api.rehab.example.com",
    DEFAULT_PATIENT_PASSWORD: "initial-password-managed-by-ops",
  };
}

function productionAiEnv() {
  return {
    AI_PROVIDER: "iflytek-spark",
    AI_MODEL_VERSION: "spark-x1-2026-05",
    AI_MODEL_ENDPOINT: "https://spark-api.customer-health.cn/v1/chat/completions",
    AI_API_KEY_REF: "secret-manager://rehab-prod/iflytek-spark-api-key",
    AI_PROMPT_VERSION: "cognitive-assessment-2026-05",
    AI_CALL_LOG_RETENTION_DAYS: "180",
    AI_HUMAN_REVIEW_REQUIRED: "true",
  };
}

function productionSpeechEnv() {
  return {
    SPEECH_PROVIDER: "iflytek-iat",
    SPEECH_TO_TEXT_ENDPOINT: "https://speech.customer-health.cn/v2/iat",
    SPEECH_API_KEY_REF: "secret-manager://rehab-prod/iflytek-iat-api-key",
    SPEECH_MODEL_VERSION: "iat-medical-2026-05",
  };
}

function customerInputScope({ aiRequiredForLaunch, speechRequiredForLaunch }) {
  return {
    ai: {
      requiredForLaunch: aiRequiredForLaunch,
    },
    speech: {
      requiredForLaunch: speechRequiredForLaunch,
    },
  };
}

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

test("delivery document check requires formal acceptance runbook and production input references", () => {
  const result = checkDeliveryDocumentReferences({
    readme: [
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/customer-final-input-request.md",
      "docs/customer-input-to-launch-gate-runbook.md",
      "docs/templates/customer-production-input.template.json",
      "docs/ai-speech-provider-selection-free-first.md",
      "docs/customer-delivery-progress-and-input-summary.md",
      "docs/browser-pose-field-acceptance-runbook.md",
    ].join("\n"),
    deliveryBoundary: [
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/customer-final-input-request.md",
      "docs/customer-input-to-launch-gate-runbook.md",
      "docs/ai-speech-provider-selection-free-first.md",
      "docs/customer-delivery-progress-and-input-summary.md",
      "docs/browser-pose-field-acceptance-runbook.md",
    ].join("\n"),
  });

  assert.deepEqual(result.failures, []);
});

test("delivery document check rejects missing formal acceptance runbook reference", () => {
  const result = checkDeliveryDocumentReferences({
    readme: [
      "docs/customer-production-input-checklist.md",
      "docs/templates/customer-production-input.template.json",
      "docs/browser-pose-field-acceptance-runbook.md",
    ].join("\n"),
    deliveryBoundary: [
      "docs/customer-production-input-checklist.md",
      "docs/browser-pose-field-acceptance-runbook.md",
    ].join("\n"),
  });

  assert.match(
    result.failures.join("\n"),
    /formal-delivery-acceptance-runbook/,
  );
});

test("delivery document check rejects missing free-first AI speech provider guide", () => {
  const result = checkDeliveryDocumentReferences({
    readme: [
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/templates/customer-production-input.template.json",
      "docs/browser-pose-field-acceptance-runbook.md",
    ].join("\n"),
    deliveryBoundary: [
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/browser-pose-field-acceptance-runbook.md",
    ].join("\n"),
  });

  assert.match(
    result.failures.join("\n"),
    /ai-speech-provider-selection-free-first/,
  );
});

test("delivery document check rejects missing customer final input request", () => {
  const result = checkDeliveryDocumentReferences({
    readme: [
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/templates/customer-production-input.template.json",
      "docs/ai-speech-provider-selection-free-first.md",
      "docs/browser-pose-field-acceptance-runbook.md",
    ].join("\n"),
    deliveryBoundary: [
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/ai-speech-provider-selection-free-first.md",
      "docs/browser-pose-field-acceptance-runbook.md",
    ].join("\n"),
  });

  assert.match(
    result.failures.join("\n"),
    /customer-final-input-request/,
  );
});

test("delivery document check rejects missing customer input launch gate runbook", () => {
  const result = checkDeliveryDocumentReferences({
    readme: [
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/customer-final-input-request.md",
      "docs/templates/customer-production-input.template.json",
      "docs/ai-speech-provider-selection-free-first.md",
      "docs/browser-pose-field-acceptance-runbook.md",
    ].join("\n"),
    deliveryBoundary: [
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/customer-final-input-request.md",
      "docs/ai-speech-provider-selection-free-first.md",
      "docs/browser-pose-field-acceptance-runbook.md",
    ].join("\n"),
  });

  assert.match(
    result.failures.join("\n"),
    /customer-input-to-launch-gate-runbook/,
  );
});

test("delivery document check rejects missing customer delivery progress summary", () => {
  const result = checkDeliveryDocumentReferences({
    readme: [
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/customer-final-input-request.md",
      "docs/customer-input-to-launch-gate-runbook.md",
      "docs/templates/customer-production-input.template.json",
      "docs/ai-speech-provider-selection-free-first.md",
      "docs/browser-pose-field-acceptance-runbook.md",
    ].join("\n"),
    deliveryBoundary: [
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/customer-final-input-request.md",
      "docs/customer-input-to-launch-gate-runbook.md",
      "docs/ai-speech-provider-selection-free-first.md",
      "docs/browser-pose-field-acceptance-runbook.md",
    ].join("\n"),
  });

  assert.match(
    result.failures.join("\n"),
    /customer-delivery-progress-and-input-summary/,
  );
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

test("production environment check requires explicit AI and speech launch scope", () => {
  const result = checkProductionEnvironment({
    ...productionBaseEnv(),
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /缺少生产环境变量 AI_REQUIRED_FOR_LAUNCH/);
  assert.match(failures, /缺少生产环境变量 SPEECH_REQUIRED_FOR_LAUNCH/);
  assert.doesNotMatch(failures, /AI_PROVIDER/);
  assert.doesNotMatch(failures, /SPEECH_PROVIDER/);
});

test("production environment check rejects invalid AI and speech launch scope values", () => {
  const result = checkProductionEnvironment({
    ...productionBaseEnv(),
    AI_REQUIRED_FOR_LAUNCH: "TRUE",
    SPEECH_REQUIRED_FOR_LAUNCH: "0",
  });

  assert.match(result.failures.join("\n"), /AI_REQUIRED_FOR_LAUNCH.*true 或 false/);
  assert.match(result.failures.join("\n"), /SPEECH_REQUIRED_FOR_LAUNCH.*true 或 false/);
});

test("production environment check requires AI config only when AI is launch scope", () => {
  const result = checkProductionEnvironment({
    ...productionBaseEnv(),
    AI_REQUIRED_FOR_LAUNCH: "true",
    SPEECH_REQUIRED_FOR_LAUNCH: "false",
  });

  const failures = result.failures.join("\n");
  assert.match(result.failures.join("\n"), /AI_PROVIDER/);
  assert.match(result.failures.join("\n"), /AI_MODEL_VERSION/);
  assert.match(result.failures.join("\n"), /AI_MODEL_ENDPOINT/);
  assert.match(result.failures.join("\n"), /AI_API_KEY_REF/);
  assert.match(result.failures.join("\n"), /AI_PROMPT_VERSION/);
  assert.match(result.failures.join("\n"), /AI_CALL_LOG_RETENTION_DAYS/);
  assert.match(result.failures.join("\n"), /AI_HUMAN_REVIEW_REQUIRED/);
  assert.doesNotMatch(failures, /SPEECH_PROVIDER/);
  assert.doesNotMatch(failures, /SPEECH_TO_TEXT_ENDPOINT/);
  assert.doesNotMatch(failures, /SPEECH_API_KEY_REF/);
  assert.doesNotMatch(failures, /SPEECH_MODEL_VERSION/);
});

test("production environment check requires speech config only when speech is launch scope", () => {
  const result = checkProductionEnvironment({
    ...productionBaseEnv(),
    AI_REQUIRED_FOR_LAUNCH: "false",
    SPEECH_REQUIRED_FOR_LAUNCH: "true",
  });

  const failures = result.failures.join("\n");
  assert.doesNotMatch(failures, /AI_PROVIDER/);
  assert.doesNotMatch(failures, /AI_MODEL_VERSION/);
  assert.doesNotMatch(failures, /AI_MODEL_ENDPOINT/);
  assert.doesNotMatch(failures, /AI_API_KEY_REF/);
  assert.doesNotMatch(failures, /AI_PROMPT_VERSION/);
  assert.doesNotMatch(failures, /AI_CALL_LOG_RETENTION_DAYS/);
  assert.doesNotMatch(failures, /AI_HUMAN_REVIEW_REQUIRED/);
  assert.match(result.failures.join("\n"), /SPEECH_PROVIDER/);
  assert.match(result.failures.join("\n"), /SPEECH_TO_TEXT_ENDPOINT/);
  assert.match(result.failures.join("\n"), /SPEECH_API_KEY_REF/);
  assert.match(result.failures.join("\n"), /SPEECH_MODEL_VERSION/);
});

test("production environment check accepts explicit non-launch AI and speech scope", () => {
  const result = checkProductionEnvironment({
    ...productionBaseEnv(),
    AI_REQUIRED_FOR_LAUNCH: "false",
    SPEECH_REQUIRED_FOR_LAUNCH: "false",
  });

  assert.deepEqual(result.failures, []);
});

test("production environment check rejects partial AI config when AI is not launch scope", () => {
  const result = checkProductionEnvironment({
    ...productionBaseEnv(),
    AI_REQUIRED_FOR_LAUNCH: "false",
    AI_PROVIDER: "iflytek-spark",
    SPEECH_REQUIRED_FOR_LAUNCH: "false",
  });

  assert.match(result.failures.join("\n"), /AI_PROVIDER.*AI_REQUIRED_FOR_LAUNCH=false/);
});

test("production environment check rejects partial speech config when speech is not launch scope", () => {
  const result = checkProductionEnvironment({
    ...productionBaseEnv(),
    AI_REQUIRED_FOR_LAUNCH: "false",
    SPEECH_REQUIRED_FOR_LAUNCH: "false",
    SPEECH_TO_TEXT_ENDPOINT: "https://speech.customer-health.cn/v2/iat",
  });

  assert.match(
    result.failures.join("\n"),
    /SPEECH_TO_TEXT_ENDPOINT.*SPEECH_REQUIRED_FOR_LAUNCH=false/,
  );
});

test("production environment check accepts scoped AI-only launch config", () => {
  const result = checkProductionEnvironment({
    ...productionBaseEnv(),
    AI_REQUIRED_FOR_LAUNCH: "true",
    ...productionAiEnv(),
    SPEECH_REQUIRED_FOR_LAUNCH: "false",
  });

  assert.deepEqual(result.failures, []);
});

test("production environment check accepts scoped speech-only launch config", () => {
  const result = checkProductionEnvironment({
    ...productionBaseEnv(),
    AI_REQUIRED_FOR_LAUNCH: "false",
    SPEECH_REQUIRED_FOR_LAUNCH: "true",
    ...productionSpeechEnv(),
  });

  assert.deepEqual(result.failures, []);
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
    AI_REQUIRED_FOR_LAUNCH: "true",
    AI_PROVIDER: "mock",
    AI_MODEL_VERSION: "demo-v1",
    AI_MODEL_ENDPOINT: "http://localhost:8317/v1/chat/completions",
    AI_API_KEY_REF: "<ai-api-key>",
    AI_PROMPT_VERSION: "local-prompt",
    AI_CALL_LOG_RETENTION_DAYS: "0",
    AI_HUMAN_REVIEW_REQUIRED: "false",
    SPEECH_REQUIRED_FOR_LAUNCH: "true",
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
    AI_REQUIRED_FOR_LAUNCH: "true",
    AI_PROVIDER: "iflytek-spark",
    AI_MODEL_VERSION: "spark-x1-2026-05",
    AI_MODEL_ENDPOINT: "https://spark-api.customer-health.cn/v1/chat/completions",
    AI_API_KEY_REF: "sk-live-real-key-value",
    AI_PROMPT_VERSION: "cognitive-assessment-2026-05",
    AI_CALL_LOG_RETENTION_DAYS: "180",
    AI_HUMAN_REVIEW_REQUIRED: "true",
    SPEECH_REQUIRED_FOR_LAUNCH: "true",
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
    AI_REQUIRED_FOR_LAUNCH: "true",
    AI_PROVIDER: "iflytek-spark",
    AI_MODEL_VERSION: "spark-x1-2026-05",
    AI_MODEL_ENDPOINT: "https://spark-api.customer-health.cn/v1/chat/completions",
    AI_API_KEY_REF: "secret-manager://rehab-prod/iflytek-spark-api-key",
    AI_PROMPT_VERSION: "cognitive-assessment-2026-05",
    AI_CALL_LOG_RETENTION_DAYS: "180",
    AI_HUMAN_REVIEW_REQUIRED: "true",
    SPEECH_REQUIRED_FOR_LAUNCH: "true",
    SPEECH_PROVIDER: "iflytek-iat",
    SPEECH_TO_TEXT_ENDPOINT: "https://speech.customer-health.cn/v2/iat",
    SPEECH_API_KEY_REF: "secret-manager://rehab-prod/iflytek-iat-api-key",
    SPEECH_MODEL_VERSION: "iat-medical-2026-05",
  });

  assert.deepEqual(result.failures, []);
});

test("production launch scope consistency accepts matching customer input package", () => {
  const result = checkProductionLaunchScopeConsistency({
    env: {
      AI_REQUIRED_FOR_LAUNCH: "true",
      SPEECH_REQUIRED_FOR_LAUNCH: "false",
    },
    customerInput: customerInputScope({
      aiRequiredForLaunch: true,
      speechRequiredForLaunch: false,
    }),
  });

  assert.deepEqual(result.failures, []);
});

test("production launch scope consistency rejects env that contradicts customer input package", () => {
  const result = checkProductionLaunchScopeConsistency({
    env: {
      AI_REQUIRED_FOR_LAUNCH: "false",
      SPEECH_REQUIRED_FOR_LAUNCH: "true",
    },
    customerInput: customerInputScope({
      aiRequiredForLaunch: true,
      speechRequiredForLaunch: false,
    }),
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /AI_REQUIRED_FOR_LAUNCH.*ai\.requiredForLaunch/);
  assert.match(failures, /SPEECH_REQUIRED_FOR_LAUNCH.*speech\.requiredForLaunch/);
});

test("production environment CLI rejects missing customer input path after flag", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-delivery-readiness.mjs", "--production-env", "--customer-input"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        ...productionBaseEnv(),
        AI_REQUIRED_FOR_LAUNCH: "false",
        SPEECH_REQUIRED_FOR_LAUNCH: "false",
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--customer-input/);
});

test("production environment CLI requires customer input package for production checks", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-delivery-readiness.mjs", "--production-env"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        ...productionBaseEnv(),
        AI_REQUIRED_FOR_LAUNCH: "false",
        SPEECH_REQUIRED_FOR_LAUNCH: "false",
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--customer-input/);
});
