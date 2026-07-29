import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkCommittedDeploymentBaseline,
  checkGitAttributesWhitespaceExceptions,
  checkGitignoreExclusions,
  checkDeliveryDocumentReferences,
  checkRequiredDeliveryFiles,
  checkPackageScripts,
  checkProductionLaunchScopeConsistency,
  checkProductionEnvironment,
  requiredCommittedDeploymentFiles,
  requiredCommittedDeploymentSourceRoots,
  requiredGitTrackedRuntimeAssets,
  resolveCommittedGitReference,
} from "../check-delivery-readiness.mjs";

const redisContractPattern = /\bRedis\b|REDIS_URL|redisUrlRef|\bBullMQ\b/i;

function runFixtureGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function writeFixtureFile(cwd, relativePath, content) {
  const path = join(cwd, relativePath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function createCommittedDeploymentFixture() {
  const cwd = mkdtempSync(join(tmpdir(), "rehab-committed-baseline-"));
  const migrationName = "20260101000000_initial";
  const migrationContent = "CREATE TABLE baseline_fixture (id TEXT);\n";
  const migrationChecksum = createHash("sha256")
    .update(migrationContent)
    .digest("hex");
  const attributeLines = [
    "apps/web/public/mediapipe/tasks-vision/wasm/vision_wasm_internal.js -whitespace",
    "apps/web/public/mediapipe/tasks-vision/wasm/vision_wasm_module_internal.js -whitespace",
    "apps/web/public/mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js -whitespace",
    "apps/web/public/unity/rhythm_reach_3d/0.1.2/Build/0.1.2.framework.js -whitespace",
  ];

  runFixtureGit(cwd, ["init"]);
  runFixtureGit(cwd, ["config", "user.email", "ci@example.invalid"]);
  runFixtureGit(cwd, ["config", "user.name", "CI Test"]);
  writeFixtureFile(cwd, ".gitattributes", `${attributeLines.join("\n")}\n`);
  writeFixtureFile(cwd, "apps/api/src/main.ts", "export {};\n");
  writeFixtureFile(
    cwd,
    "packages/db/prisma/migration-manifest.json",
    `${JSON.stringify({
      version: 1,
      migrations: [{ name: migrationName, sha256: migrationChecksum }],
    })}\n`,
  );
  writeFixtureFile(
    cwd,
    `packages/db/prisma/migrations/${migrationName}/migration.sql`,
    migrationContent,
  );
  runFixtureGit(cwd, ["add", "."]);
  runFixtureGit(cwd, ["commit", "-m", "baseline"]);

  return {
    cwd,
    stageRuntimeAsset() {
      writeFixtureFile(cwd, "deploy/runtime-asset.txt", "runtime asset\n");
      runFixtureGit(cwd, ["add", "deploy/runtime-asset.txt"]);
    },
    commitRuntimeAsset() {
      runFixtureGit(cwd, ["commit", "-m", "add runtime asset"]);
    },
  };
}

function fixtureBaselineOptions(cwd) {
  return {
    cwd,
    requiredFiles: ["deploy/runtime-asset.txt"],
    requiredSourceRoots: ["apps/api/src/"],
  };
}

function productionBaseEnv() {
  return {
    NODE_ENV: "production",
    DATABASE_URL:
      "postgresql://rehab_prod:strong-password@db.prod.internal:5432/rehab_platform?schema=public",
    JWT_SECRET: "prod_secret_7u9v8w3x6y5z4a2b1c0d9e8f7g6h5j4k3l2m1n0p",
    WEB_ORIGIN: "https://rehab.example.com",
    NEXT_PUBLIC_API_BASE_URL: "https://api.rehab.example.com",
    PORT: "10000",
    COOKIE_SECURE: "true",
    PUBLIC_CREDENTIAL_THROTTLE_LIMIT: "5",
    PUBLIC_CREDENTIAL_THROTTLE_TTL_MS: "60000",
    SENSITIVE_DATA_KEY_REF: "secret-manager://rehab-prod/sensitive-data-key",
    SENSITIVE_DATA_KEY_FILE: "/etc/secrets/sensitive_data_key",
    MIMO_API_KEY_REF: "secret-manager://rehab-prod/mimo-api-key",
    MIMO_API_KEY_FILE: "/etc/secrets/mimo_api_key",
    MIMO_ALLOWED_HOSTS: "mimo.customer-health.cn",
    AI_REQUIRED_FOR_LAUNCH: "true",
    SPEECH_REQUIRED_FOR_LAUNCH: "true",
    TTS_REQUIRED_FOR_LAUNCH: "true",
    AI_PROVIDER: "xiaomi-mimo",
    AI_MODEL_VERSION: "mimo-v2.5",
    AI_MODEL_ENDPOINT: "https://mimo.customer-health.cn/v1",
    AI_PROMPT_VERSION: "cognitive-assessment-2026-07",
    AI_HUMAN_REVIEW_REQUIRED: "true",
    SPEECH_PROVIDER: "xiaomi-mimo-audio-understanding",
    SPEECH_TO_TEXT_ENDPOINT:
      "https://mimo.customer-health.cn/v1/chat/completions",
    SPEECH_MODEL_VERSION: "mimo-v2.5",
    TTS_PROVIDER: "xiaomi-mimo-tts",
    TTS_ENDPOINT: "https://mimo.customer-health.cn/v1/chat/completions",
    TTS_MODEL_VERSION: "mimo-v2.5-tts",
    TTS_VOICE_ID: "Chloe",
    TTS_OUTPUT_FORMAT: "wav",
    AI_PROVIDER_TIMEOUT_MS: "15000",
    AI_PROVIDER_MAX_RESPONSE_BYTES: "1048576",
    SPEECH_PROVIDER_TIMEOUT_MS: "15000",
    SPEECH_PROVIDER_MAX_RESPONSE_BYTES: "1048576",
    STT_MAX_DECODED_AUDIO_BYTES: "10485760",
    STT_MAX_DURATION_SECONDS: "600",
    TTS_PROVIDER_TIMEOUT_MS: "15000",
    TTS_PROVIDER_MAX_RESPONSE_BYTES: "10485760",
    MIMO_KEY_VALUE_URL: "redis://red-rehab-production:6379",
    MIMO_USAGE_KEY_PREFIX: "rehab:mimo:production",
    MIMO_USAGE_WINDOW_MS: "60000",
    MIMO_KEY_VALUE_PROBE_TIMEOUT_MS: "1000",
    MIMO_USER_REQUEST_LIMIT: "10",
    MIMO_PATIENT_REQUEST_LIMIT: "20",
    MIMO_ORGANIZATION_REQUEST_LIMIT: "100",
    MIMO_SPEECH_SECONDS_LIMIT: "600",
    MIMO_TTS_CHARACTERS_LIMIT: "10000",
    MIMO_USER_BUDGET_UNITS_LIMIT: "100",
    MIMO_PATIENT_BUDGET_UNITS_LIMIT: "200",
    MIMO_ORGANIZATION_BUDGET_UNITS_LIMIT: "1000",
    MIMO_AI_COST_UNITS_PER_REQUEST: "1",
    MIMO_SPEECH_COST_UNITS_PER_SECOND: "1",
    MIMO_TTS_COST_UNITS_PER_CHARACTER: "1",
    MIMO_HIGH_COST_USER_OPERATION_REQUEST_LIMIT: "20",
    MIMO_HIGH_COST_USER_OPERATION_WINDOW_MS: "60000",
    PROVIDER_TELEMETRY_RETENTION_DAYS: "180",
    PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS: "120000",
  };
}

function customerInputScope({
  aiRequiredForLaunch,
  speechRequiredForLaunch,
  ttsRequiredForLaunch = true,
}) {
  return {
    ai: {
      requiredForLaunch: aiRequiredForLaunch,
    },
    speech: {
      requiredForLaunch: speechRequiredForLaunch,
    },
    tts: {
      requiredForLaunch: ttsRequiredForLaunch,
    },
  };
}

test("committed deployment baseline rejects a required runtime asset that exists only in the staged index", () => {
  const fixture = createCommittedDeploymentFixture();
  try {
    fixture.stageRuntimeAsset();
    const result = checkCommittedDeploymentBaseline(
      fixtureBaselineOptions(fixture.cwd),
    );

    assert.match(
      result.failures.join("\n"),
      /已提交 Git tree 缺少部署必需文件 deploy\/runtime-asset\.txt/,
    );
    assert.doesNotMatch(result.failures.join("\n"), /Git 索引/);
  } finally {
    rmSync(fixture.cwd, { recursive: true, force: true });
  }
});

test("committed deployment contract includes Render source, Prisma migrations, and every published runtime dependency", () => {
  for (const path of [
    ".github/workflows/ci.yml",
    ".node-version",
    "render.yaml",
    "pnpm-lock.yaml",
    "packages/db/prisma/migration-manifest.json",
    "packages/db/prisma/migrations/migration_lock.toml",
    "apps/web/public/unity/rehab-unity-bridge.js",
    "apps/web/public/unity/rhythm_reach_3d/0.1.2/index.html",
  ]) {
    assert.ok(
      requiredCommittedDeploymentFiles.includes(path),
      `${path} must be checked in the committed deployment tree`,
    );
  }
  for (const path of [
    "apps/web/public/mediapipe/models/pose_landmarker_lite.task",
    "apps/web/public/unity/rhythm_reach_3d/0.1.2/Build/0.1.2.wasm",
  ]) {
    assert.ok(
      requiredGitTrackedRuntimeAssets.includes(path),
      `${path} must be a committed runtime asset`,
    );
  }
  assert.deepEqual(requiredCommittedDeploymentSourceRoots, [
    "apps/api/src/",
    "apps/web/src/",
    "packages/db/src/",
    "packages/db/prisma/migrations/",
  ]);
});

test("committed deployment baseline accepts deploy sources and migrations after their commit exists", () => {
  const fixture = createCommittedDeploymentFixture();
  try {
    fixture.stageRuntimeAsset();
    fixture.commitRuntimeAsset();
    const result = checkCommittedDeploymentBaseline(
      fixtureBaselineOptions(fixture.cwd),
    );

    assert.deepEqual(result.failures, []);
    assert.match(result.commit, /^[a-f0-9]{40}$/);
  } finally {
    rmSync(fixture.cwd, { recursive: true, force: true });
  }
});

test("committed deployment baseline rejects unresolved and revision-expression references", () => {
  const fixture = createCommittedDeploymentFixture();
  try {
    for (const ref of ["HEAD^{tree}", "refs/heads/missing", "not a ref"]) {
      const result = resolveCommittedGitReference({ cwd: fixture.cwd, ref });
      assert.equal(result.failures.length, 1, ref);
      assert.equal(result.commit, undefined);
    }
  } finally {
    rmSync(fixture.cwd, { recursive: true, force: true });
  }
});

test("immutable asset whitespace exceptions are exact and no public-directory wildcard is accepted", () => {
  const exact = [
    "apps/web/public/mediapipe/tasks-vision/wasm/vision_wasm_internal.js -whitespace",
    "apps/web/public/mediapipe/tasks-vision/wasm/vision_wasm_module_internal.js -whitespace",
    "apps/web/public/mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js -whitespace",
    "apps/web/public/unity/rhythm_reach_3d/0.1.2/Build/0.1.2.framework.js -whitespace",
  ].join("\n");
  assert.deepEqual(checkGitAttributesWhitespaceExceptions(exact).failures, []);
  assert.deepEqual(
    checkGitAttributesWhitespaceExceptions(
      readFileSync(".gitattributes", "utf8"),
    ).failures,
    [],
  );

  const broad = checkGitAttributesWhitespaceExceptions(
    `${exact}\napps/web/public/** -whitespace`,
  );
  assert.match(broad.failures.join("\n"), /只能为四个/);
});

test("package scripts expose non-mutating delivery checks", () => {
  const result = checkPackageScripts({
    rootPackage: {
      scripts: {
        "delivery:check": "node scripts/check-delivery-readiness.mjs",
        "delivery:check:production":
          "node scripts/check-delivery-readiness.mjs --production-env",
        "test:delivery": "node --test scripts/__tests__/*.test.mjs",
        "supply-chain:artifacts":
          "node scripts/produce-production-supply-chain.mjs",
        "verify:supply-chain:production":
          "node scripts/verify-production-supply-chain.mjs",
        "verify:api-sast": "node scripts/run-api-sast.mjs",
        "db:bootstrap:production":
          "pnpm --filter @rehab-platform/db bootstrap:production",
        "verify:browser-pose-field-acceptance":
          "node scripts/verify-browser-pose-field-acceptance.mjs",
        "verify:unity-field-evidence":
          "node scripts/verify-unity-field-evidence.mjs",
        "verify:unity-field-acceptance":
          "node scripts/verify-unity-field-acceptance.mjs",
        "verify:speech-transcript-evidence":
          "node scripts/verify-speech-transcript-evidence.mjs",
        "verify:speech-transcript-acceptance":
          "node scripts/verify-speech-transcript-acceptance.mjs",
        "verify:ai-assessment-acceptance":
          "node scripts/verify-ai-assessment-acceptance.mjs",
        "verify:speech-ai-assessment-acceptance":
          "node scripts/verify-speech-ai-assessment-acceptance.mjs",
        "verify:tts-speech-output-evidence":
          "node scripts/verify-tts-speech-output-evidence.mjs",
        "verify:tts-speech-output-acceptance":
          "node scripts/verify-tts-speech-output-acceptance.mjs",
        "verify:customer-production-input":
          "node scripts/verify-customer-production-input.mjs",
        "verify:customer-acceptance-package-manifest":
          "node scripts/verify-customer-acceptance-package-manifest.mjs",
        "verify:empty-real-loop":
          "node scripts/verify-empty-real-loop-orchestrator.mjs",
        "test:playwright": "node scripts/run-playwright-regression.mjs",
      },
    },
    apiPackage: {
      scripts: {
        lint: 'eslint "{src,apps,libs,test}/**/*.ts"',
        "start:prod": "NODE_ENV=production node dist/main.js",
        "telemetry:retention":
          "NODE_ENV=production node dist/provider-telemetry-retention.js",
        "test:integration:mimo-usage-gate-redis":
          "node ./test/run-mimo-usage-gate-redis-integration.mjs",
        "test:e2e:continuous-conversation-high-cost-route":
          "node ./test/run-continuous-conversation-high-cost-route-e2e.mjs",
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
        "verify:unity-field-evidence":
          "node scripts/verify-unity-field-evidence.mjs",
        "verify:unity-field-acceptance":
          "node scripts/verify-unity-field-acceptance.mjs",
        "verify:speech-transcript-evidence":
          "node scripts/verify-speech-transcript-evidence.mjs",
        "verify:speech-transcript-acceptance":
          "node scripts/verify-speech-transcript-acceptance.mjs",
        "verify:ai-assessment-acceptance":
          "node scripts/verify-ai-assessment-acceptance.mjs",
        "verify:speech-ai-assessment-acceptance":
          "node scripts/verify-speech-ai-assessment-acceptance.mjs",
        "verify:tts-speech-output-evidence":
          "node scripts/verify-tts-speech-output-evidence.mjs",
        "verify:tts-speech-output-acceptance":
          "node scripts/verify-tts-speech-output-acceptance.mjs",
        "verify:customer-production-input":
          "node scripts/verify-customer-production-input.mjs",
        "verify:customer-acceptance-package-manifest":
          "node scripts/verify-customer-acceptance-package-manifest.mjs",
        "verify:empty-real-loop":
          "node scripts/verify-empty-real-loop-orchestrator.mjs",
        "test:playwright": "node scripts/run-playwright-regression.mjs",
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

test("package script check requires the explicit disposable Redis gate integration runner", () => {
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
        "start:prod": "NODE_ENV=production node dist/main.js",
        "telemetry:retention":
          "NODE_ENV=production node dist/provider-telemetry-retention.js",
      },
    },
  });

  assert.match(
    result.failures.join("\n"),
    /test:integration:mimo-usage-gate-redis/,
  );
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

test("package script check requires unity field acceptance verifiers", () => {
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
        "verify:speech-transcript-evidence":
          "node scripts/verify-speech-transcript-evidence.mjs",
        "verify:speech-transcript-acceptance":
          "node scripts/verify-speech-transcript-acceptance.mjs",
      },
    },
    apiPackage: {
      scripts: {
        lint: 'eslint "{src,apps,libs,test}/**/*.ts"',
      },
    },
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /verify:unity-field-evidence/);
  assert.match(failures, /verify:unity-field-acceptance/);
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
        "verify:unity-field-evidence":
          "node scripts/verify-unity-field-evidence.mjs",
        "verify:unity-field-acceptance":
          "node scripts/verify-unity-field-acceptance.mjs",
      },
    },
    apiPackage: {
      scripts: {
        lint: 'eslint "{src,apps,libs,test}/**/*.ts"',
      },
    },
  });

  assert.match(result.failures.join("\n"), /verify:customer-production-input/);
});

test("package script check requires customer acceptance package manifest verifier", () => {
  const result = checkPackageScripts({
    rootPackage: {
      scripts: {
        "delivery:check": "node scripts/check-delivery-readiness.mjs",
        "delivery:check:production":
          "node scripts/check-delivery-readiness.mjs --production-env",
        "test:delivery": "node --test scripts/__tests__/*.test.mjs",
        "verify:browser-pose-field-acceptance":
          "node scripts/verify-browser-pose-field-acceptance.mjs",
        "verify:unity-field-evidence":
          "node scripts/verify-unity-field-evidence.mjs",
        "verify:unity-field-acceptance":
          "node scripts/verify-unity-field-acceptance.mjs",
        "verify:speech-transcript-evidence":
          "node scripts/verify-speech-transcript-evidence.mjs",
        "verify:speech-transcript-acceptance":
          "node scripts/verify-speech-transcript-acceptance.mjs",
        "verify:ai-assessment-acceptance":
          "node scripts/verify-ai-assessment-acceptance.mjs",
        "verify:speech-ai-assessment-acceptance":
          "node scripts/verify-speech-ai-assessment-acceptance.mjs",
        "verify:tts-speech-output-evidence":
          "node scripts/verify-tts-speech-output-evidence.mjs",
        "verify:tts-speech-output-acceptance":
          "node scripts/verify-tts-speech-output-acceptance.mjs",
        "verify:customer-production-input":
          "node scripts/verify-customer-production-input.mjs",
        "verify:empty-real-loop":
          "node scripts/verify-empty-real-loop-orchestrator.mjs",
        "test:playwright": "node scripts/run-playwright-regression.mjs",
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
    /verify:customer-acceptance-package-manifest/,
  );
});

test("package script check requires speech transcript acceptance verifiers", () => {
  const result = checkPackageScripts({
    rootPackage: {
      scripts: {
        "delivery:check": "node scripts/check-delivery-readiness.mjs",
        "delivery:check:production":
          "node scripts/check-delivery-readiness.mjs --production-env",
        "test:delivery": "node --test scripts/__tests__/*.test.mjs",
        "verify:browser-pose-field-acceptance":
          "node scripts/verify-browser-pose-field-acceptance.mjs",
        "verify:unity-field-evidence":
          "node scripts/verify-unity-field-evidence.mjs",
        "verify:unity-field-acceptance":
          "node scripts/verify-unity-field-acceptance.mjs",
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

  const failures = result.failures.join("\n");
  assert.match(failures, /verify:speech-transcript-evidence/);
  assert.match(failures, /verify:speech-transcript-acceptance/);
});

test("package script check requires TTS speech output acceptance verifiers", () => {
  const result = checkPackageScripts({
    rootPackage: {
      scripts: {
        "delivery:check": "node scripts/check-delivery-readiness.mjs",
        "delivery:check:production":
          "node scripts/check-delivery-readiness.mjs --production-env",
        "test:delivery": "node --test scripts/__tests__/*.test.mjs",
        "verify:browser-pose-field-acceptance":
          "node scripts/verify-browser-pose-field-acceptance.mjs",
        "verify:unity-field-evidence":
          "node scripts/verify-unity-field-evidence.mjs",
        "verify:unity-field-acceptance":
          "node scripts/verify-unity-field-acceptance.mjs",
        "verify:speech-transcript-evidence":
          "node scripts/verify-speech-transcript-evidence.mjs",
        "verify:speech-transcript-acceptance":
          "node scripts/verify-speech-transcript-acceptance.mjs",
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

  const failures = result.failures.join("\n");
  assert.match(failures, /verify:tts-speech-output-evidence/);
  assert.match(failures, /verify:tts-speech-output-acceptance/);
});

test("package script check requires AI assessment acceptance verifier", () => {
  const result = checkPackageScripts({
    rootPackage: {
      scripts: {
        "delivery:check": "node scripts/check-delivery-readiness.mjs",
        "delivery:check:production":
          "node scripts/check-delivery-readiness.mjs --production-env",
        "test:delivery": "node --test scripts/__tests__/*.test.mjs",
        "verify:browser-pose-field-acceptance":
          "node scripts/verify-browser-pose-field-acceptance.mjs",
        "verify:unity-field-evidence":
          "node scripts/verify-unity-field-evidence.mjs",
        "verify:unity-field-acceptance":
          "node scripts/verify-unity-field-acceptance.mjs",
        "verify:speech-transcript-evidence":
          "node scripts/verify-speech-transcript-evidence.mjs",
        "verify:speech-transcript-acceptance":
          "node scripts/verify-speech-transcript-acceptance.mjs",
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

  assert.match(result.failures.join("\n"), /verify:ai-assessment-acceptance/);
});

test("package script check requires empty real loop orchestrator", () => {
  const result = checkPackageScripts({
    rootPackage: {
      scripts: {
        "delivery:check": "node scripts/check-delivery-readiness.mjs",
        "delivery:check:production":
          "node scripts/check-delivery-readiness.mjs --production-env",
        "test:delivery": "node --test scripts/__tests__/*.test.mjs",
        "verify:browser-pose-field-acceptance":
          "node scripts/verify-browser-pose-field-acceptance.mjs",
        "verify:unity-field-evidence":
          "node scripts/verify-unity-field-evidence.mjs",
        "verify:unity-field-acceptance":
          "node scripts/verify-unity-field-acceptance.mjs",
        "verify:speech-transcript-evidence":
          "node scripts/verify-speech-transcript-evidence.mjs",
        "verify:speech-transcript-acceptance":
          "node scripts/verify-speech-transcript-acceptance.mjs",
        "verify:ai-assessment-acceptance":
          "node scripts/verify-ai-assessment-acceptance.mjs",
        "verify:speech-ai-assessment-acceptance":
          "node scripts/verify-speech-ai-assessment-acceptance.mjs",
        "verify:tts-speech-output-evidence":
          "node scripts/verify-tts-speech-output-evidence.mjs",
        "verify:tts-speech-output-acceptance":
          "node scripts/verify-tts-speech-output-acceptance.mjs",
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

  assert.match(result.failures.join("\n"), /verify:empty-real-loop/);
});

test("package script check requires web Playwright regression", () => {
  const result = checkPackageScripts({
    rootPackage: {
      scripts: {
        "delivery:check": "node scripts/check-delivery-readiness.mjs",
        "delivery:check:production":
          "node scripts/check-delivery-readiness.mjs --production-env",
        "test:delivery": "node --test scripts/__tests__/*.test.mjs",
        "verify:browser-pose-field-acceptance":
          "node scripts/verify-browser-pose-field-acceptance.mjs",
        "verify:unity-field-evidence":
          "node scripts/verify-unity-field-evidence.mjs",
        "verify:unity-field-acceptance":
          "node scripts/verify-unity-field-acceptance.mjs",
        "verify:speech-transcript-evidence":
          "node scripts/verify-speech-transcript-evidence.mjs",
        "verify:speech-transcript-acceptance":
          "node scripts/verify-speech-transcript-acceptance.mjs",
        "verify:ai-assessment-acceptance":
          "node scripts/verify-ai-assessment-acceptance.mjs",
        "verify:speech-ai-assessment-acceptance":
          "node scripts/verify-speech-ai-assessment-acceptance.mjs",
        "verify:tts-speech-output-evidence":
          "node scripts/verify-tts-speech-output-evidence.mjs",
        "verify:tts-speech-output-acceptance":
          "node scripts/verify-tts-speech-output-acceptance.mjs",
        "verify:customer-production-input":
          "node scripts/verify-customer-production-input.mjs",
        "verify:empty-real-loop":
          "node scripts/verify-empty-real-loop-orchestrator.mjs",
      },
    },
    apiPackage: {
      scripts: {
        lint: 'eslint "{src,apps,libs,test}/**/*.ts"',
      },
    },
  });

  assert.match(result.failures.join("\n"), /test:playwright/);
});

test("package script check rejects direct Playwright execution that bypasses the strict runner", () => {
  const result = checkPackageScripts({
    rootPackage: {
      scripts: {
        "delivery:check": "node scripts/check-delivery-readiness.mjs",
        "delivery:check:production":
          "node scripts/check-delivery-readiness.mjs --production-env",
        "test:delivery": "node --test scripts/__tests__/*.test.mjs",
        "test:playwright":
          "playwright test --config scripts/playwright-regression.config.mjs",
      },
    },
    apiPackage: {
      scripts: {
        lint: 'eslint "{src,apps,libs,test}/**/*.ts"',
      },
    },
  });

  assert.match(result.failures.join("\n"), /test:playwright/);
});

test("gitignore check requires local and historical directories to be excluded", () => {
  const result = checkGitignoreExclusions(
    [
      "node_modules",
      ".next",
      "dist",
      "coverage",
      ".env",
      ".env.local",
      ".env.production",
      ".DS_Store",
      "*.log",
      "*read-credentials*.json",
      "infra/data",
      "offline-deploy-assets/*.tar",
      "offline-deploy-assets/*.dmg",
      "tmp/docs/rendered-*",
      "tmp/playwright-qa/",
      ".superpowers/",
      "客户提供/",
      ".playwright-cli/",
      ".playwright-mcp/",
      "[Ll]ibrary/",
      "[Tt]emp/",
      "[Oo]bj/",
      "[Bb]uild/",
      "[Bb]uilds/",
      "[Ll]ogs/",
      "[Uu]ser[Ss]ettings/",
      "*.csproj",
      "*.sln",
      "*.slnx",
      "**/.vscode/",
      "!apps/web/public/unity/*/*/[Bb]uild/**",
      "!apps/web/public/unity/*/*/manifest.json",
    ].join("\n"),
  );

  assert.deepEqual(result.failures, []);
});

test("gitignore check requires exact customer deployment artifact exclusions", () => {
  const result = checkGitignoreExclusions(
    [
      "node_modules",
      ".next",
      "dist",
      "coverage",
      ".env",
      ".env.local",
      ".env.production",
      "*read-credentials*.json",
      "infra/data",
      "客户提供/",
      ".playwright-cli/",
      ".playwright-mcp/",
      "[Ll]ibrary/",
      "[Tt]emp/",
      "[Oo]bj/",
      "[Bb]uild/",
      "[Bb]uilds/",
      "[Ll]ogs/",
      "[Uu]ser[Ss]ettings/",
      "*.csproj",
      "*.sln",
      "*.slnx",
      "**/.vscode/",
      "!apps/web/public/unity/*/*/[Bb]uild/**",
      "!apps/web/public/unity/*/*/manifest.json",
    ].join("\n"),
  );

  const failures = result.failures.join("\n");
  assert.match(failures, /offline-deploy-assets\/\*\.tar/);
  assert.match(failures, /offline-deploy-assets\/\*\.dmg/);
  assert.match(failures, /tmp\/docs\/rendered-\*/);
  assert.match(failures, /tmp\/playwright-qa\//);
  assert.match(failures, /\.superpowers\//);
});

test("gitignore excludes only generated offline and QA artifacts without masking delivery sources", () => {
  const root = process.cwd();
  for (const path of [
    "offline-deploy-assets/Docker-Desktop-Mac-arm64.dmg",
    "tmp/playwright-qa/result.json",
    ".superpowers/sdd/progress.md",
  ]) {
    const result = spawnSync("git", ["check-ignore", "-q", "--", path], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${path} must be excluded`);
  }
  for (const path of [
    "offline-deploy-assets/README.md",
    "offline-deploy-assets/create-docker-image-bundle.sh",
    "offline-deploy-assets/create-docker-image-bundle-with-proxy.sh",
    "tmp/docs/build_customer_usage_manual.py",
    "tmp/docs/build_customer_usage_manual_illustrated.py",
  ]) {
    const result = spawnSync("git", ["check-ignore", "-q", "--", path], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 1, `${path} must remain available for Git`);
  }
});

test("gitignore check requires Unity editor caches to be excluded while allowing formal WebGL assets", () => {
  const result = checkGitignoreExclusions(
    [
      "node_modules",
      ".next",
      "dist",
      "coverage",
      ".env",
      ".env.local",
      ".env.production",
      "*read-credentials*.json",
      "infra/data",
      "客户提供/",
      ".playwright-cli/",
      ".playwright-mcp/",
    ].join("\n"),
  );

  const failures = result.failures.join("\n");
  assert.match(failures, /\[Ll\]ibrary\//);
  assert.match(failures, /\[Tt\]emp\//);
  assert.match(failures, /\[Oo\]bj\//);
  assert.match(failures, /\[Bb\]uild\//);
  assert.match(failures, /\[Ll\]ogs\//);
  assert.match(failures, /\[Uu\]ser\[Ss\]ettings\//);
  assert.match(failures, /apps\/web\/public\/unity\/\*\/\*\/\[Bb\]uild\/\*\*/);
  assert.match(failures, /apps\/web\/public\/unity\/\*\/\*\/manifest\.json/);
});

test("delivery document check requires formal acceptance runbook and production input references", () => {
  const result = checkDeliveryDocumentReferences({
    readme: [
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/customer-final-input-request.md",
      "docs/customer-input-to-launch-gate-runbook.md",
      "docs/templates/customer-production-input.template.json",
      "docs/templates/customer-acceptance-package-manifest.template.json",
      "docs/ai-speech-provider-selection-free-first.md",
      "docs/customer-delivery-progress-and-input-summary.md",
      "docs/browser-pose-field-acceptance-runbook.md",
      "docs/collection-condition-data-capture-runbook.md",
      "docs/unity-field-acceptance-runbook.md",
      "docs/templates/unity-field-evidence.template.json",
      "docs/speech-transcript-acceptance-runbook.md",
      "docs/templates/speech-transcript-evidence.template.json",
      "docs/templates/speech-transcript-acceptance-config.template.json",
      "docs/tts-speech-output-acceptance-runbook.md",
      "docs/templates/tts-speech-output-evidence.template.json",
      "docs/templates/tts-speech-output-acceptance-config.template.json",
      "docs/ai-assessment-acceptance-runbook.md",
      "docs/templates/ai-assessment-acceptance-config.template.json",
      "docs/templates/speech-ai-assessment-acceptance-config.template.json",
      "docs/empty-real-loop-acceptance-runbook.md",
      "docs/templates/empty-real-loop-orchestrator.template.json",
      "docs/supply-chain-license-policy-runbook.md",
      "docs/templates/customer-license-policy.template.json",
      "docs/web-playwright-regression-runbook.md",
      "scripts/verify-speech-ai-assessment-acceptance.mjs",
      "scripts/verify-empty-real-loop-orchestrator.mjs",
      "scripts/verify-customer-acceptance-package-manifest.mjs",
      "scripts/web-playwright-regression.spec.mjs",
      "scripts/playwright-regression.config.mjs",
      "docs/xiaomi-token-plan-stt-tts-connectivity-record.md",
    ].join("\n"),
    deliveryBoundary: [
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/customer-final-input-request.md",
      "docs/customer-input-to-launch-gate-runbook.md",
      "docs/ai-speech-provider-selection-free-first.md",
      "docs/templates/customer-acceptance-package-manifest.template.json",
      "docs/customer-delivery-progress-and-input-summary.md",
      "docs/browser-pose-field-acceptance-runbook.md",
      "docs/collection-condition-data-capture-runbook.md",
      "docs/unity-field-acceptance-runbook.md",
      "docs/templates/unity-field-evidence.template.json",
      "docs/speech-transcript-acceptance-runbook.md",
      "docs/templates/speech-transcript-evidence.template.json",
      "docs/templates/speech-transcript-acceptance-config.template.json",
      "docs/tts-speech-output-acceptance-runbook.md",
      "docs/templates/tts-speech-output-evidence.template.json",
      "docs/templates/tts-speech-output-acceptance-config.template.json",
      "docs/ai-assessment-acceptance-runbook.md",
      "docs/templates/ai-assessment-acceptance-config.template.json",
      "docs/templates/speech-ai-assessment-acceptance-config.template.json",
      "docs/empty-real-loop-acceptance-runbook.md",
      "docs/templates/empty-real-loop-orchestrator.template.json",
      "docs/supply-chain-license-policy-runbook.md",
      "docs/templates/customer-license-policy.template.json",
      "docs/web-playwright-regression-runbook.md",
      "scripts/verify-speech-ai-assessment-acceptance.mjs",
      "scripts/verify-empty-real-loop-orchestrator.mjs",
      "scripts/verify-customer-acceptance-package-manifest.mjs",
      "scripts/web-playwright-regression.spec.mjs",
      "scripts/playwright-regression.config.mjs",
      "docs/xiaomi-token-plan-stt-tts-connectivity-record.md",
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

test("delivery document check rejects overclaiming local AI speech and Unity evidence", () => {
  const result = checkDeliveryDocumentReferences({
    readme: [
      "当前已按公开文档接入小米 MiMo 文本对话、音频理解 STT 与 mimo-v2.5-tts TTS 协议。",
      "当前已包含可打开的 RhythmReachTraining.unity 场景、真实 WebGL 构建入口和已发布 WebGL 构建产物。",
      "Web Playwright 回归测试：使用真实浏览器验证 AI/STT/TTS、Unity WebGL、浏览器体感入口不丢失。",
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/customer-final-input-request.md",
      "docs/customer-input-to-launch-gate-runbook.md",
      "docs/templates/customer-production-input.template.json",
      "docs/ai-speech-provider-selection-free-first.md",
      "docs/xiaomi-token-plan-stt-tts-connectivity-record.md",
      "docs/customer-delivery-progress-and-input-summary.md",
      "docs/browser-pose-field-acceptance-runbook.md",
      "docs/unity-field-acceptance-runbook.md",
      "docs/templates/unity-field-evidence.template.json",
      "docs/speech-transcript-acceptance-runbook.md",
      "docs/templates/speech-transcript-evidence.template.json",
      "docs/tts-speech-output-acceptance-runbook.md",
      "docs/templates/tts-speech-output-evidence.template.json",
      "docs/ai-assessment-acceptance-runbook.md",
      "docs/empty-real-loop-acceptance-runbook.md",
      "docs/templates/empty-real-loop-orchestrator.template.json",
      "docs/web-playwright-regression-runbook.md",
      "scripts/verify-speech-ai-assessment-acceptance.mjs",
      "scripts/verify-empty-real-loop-orchestrator.mjs",
      "scripts/web-playwright-regression.spec.mjs",
      "scripts/playwright-regression.config.mjs",
    ].join("\n"),
    deliveryBoundary: [
      "## 正式交付范围",
      "- `docs/xiaomi-token-plan-stt-tts-connectivity-record.md`：小米 MiMo Token Plan STT/TTS 本地联通记录与推荐 endpoint",
      "## 不纳入运行源码包",
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/customer-final-input-request.md",
      "docs/customer-input-to-launch-gate-runbook.md",
      "docs/ai-speech-provider-selection-free-first.md",
      "docs/xiaomi-token-plan-stt-tts-connectivity-record.md",
      "docs/customer-delivery-progress-and-input-summary.md",
      "docs/browser-pose-field-acceptance-runbook.md",
      "docs/unity-field-acceptance-runbook.md",
      "docs/templates/unity-field-evidence.template.json",
      "docs/speech-transcript-acceptance-runbook.md",
      "docs/templates/speech-transcript-evidence.template.json",
      "docs/tts-speech-output-acceptance-runbook.md",
      "docs/templates/tts-speech-output-evidence.template.json",
      "docs/ai-assessment-acceptance-runbook.md",
      "docs/empty-real-loop-acceptance-runbook.md",
      "docs/templates/empty-real-loop-orchestrator.template.json",
      "docs/web-playwright-regression-runbook.md",
      "scripts/verify-speech-ai-assessment-acceptance.mjs",
      "scripts/verify-empty-real-loop-orchestrator.mjs",
      "scripts/web-playwright-regression.spec.mjs",
      "scripts/playwright-regression.config.mjs",
    ].join("\n"),
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /MiMo.*已接入.*正式验收/);
  assert.match(failures, /已发布 WebGL 构建产物.*正式验收/);
  assert.match(failures, /Playwright.*入口回归/);
  assert.match(failures, /xiaomi-token-plan.*参考附件/);
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

  assert.match(result.failures.join("\n"), /customer-final-input-request/);
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

test("delivery document check requires unity field acceptance runbook and template", () => {
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

  const failures = result.failures.join("\n");
  assert.match(failures, /unity-field-acceptance-runbook/);
  assert.match(failures, /unity-field-evidence\.template\.json/);
});

test("delivery document check requires empty real loop runbook, template, and script", () => {
  const result = checkDeliveryDocumentReferences({
    readme: [
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/customer-final-input-request.md",
      "docs/customer-input-to-launch-gate-runbook.md",
      "docs/templates/customer-production-input.template.json",
      "docs/ai-speech-provider-selection-free-first.md",
      "docs/xiaomi-token-plan-stt-tts-connectivity-record.md",
      "docs/customer-delivery-progress-and-input-summary.md",
      "docs/browser-pose-field-acceptance-runbook.md",
      "docs/unity-field-acceptance-runbook.md",
      "docs/templates/unity-field-evidence.template.json",
      "docs/speech-transcript-acceptance-runbook.md",
      "docs/templates/speech-transcript-evidence.template.json",
      "docs/tts-speech-output-acceptance-runbook.md",
      "docs/templates/tts-speech-output-evidence.template.json",
      "docs/ai-assessment-acceptance-runbook.md",
      "scripts/verify-speech-ai-assessment-acceptance.mjs",
    ].join("\n"),
    deliveryBoundary: [
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/customer-final-input-request.md",
      "docs/customer-input-to-launch-gate-runbook.md",
      "docs/ai-speech-provider-selection-free-first.md",
      "docs/xiaomi-token-plan-stt-tts-connectivity-record.md",
      "docs/customer-delivery-progress-and-input-summary.md",
      "docs/browser-pose-field-acceptance-runbook.md",
      "docs/unity-field-acceptance-runbook.md",
      "docs/speech-transcript-acceptance-runbook.md",
      "docs/tts-speech-output-acceptance-runbook.md",
      "docs/ai-assessment-acceptance-runbook.md",
      "scripts/verify-speech-ai-assessment-acceptance.mjs",
      "scripts/verify-empty-real-loop-orchestrator.mjs",
    ].join("\n"),
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /empty-real-loop-acceptance-runbook/);
  assert.match(failures, /empty-real-loop-orchestrator\.template\.json/);
});

test("delivery document check requires web Playwright regression runbook and test files", () => {
  const result = checkDeliveryDocumentReferences({
    readme: [
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/customer-final-input-request.md",
      "docs/customer-input-to-launch-gate-runbook.md",
      "docs/templates/customer-production-input.template.json",
      "docs/ai-speech-provider-selection-free-first.md",
      "docs/xiaomi-token-plan-stt-tts-connectivity-record.md",
      "docs/customer-delivery-progress-and-input-summary.md",
      "docs/browser-pose-field-acceptance-runbook.md",
      "docs/unity-field-acceptance-runbook.md",
      "docs/templates/unity-field-evidence.template.json",
      "docs/speech-transcript-acceptance-runbook.md",
      "docs/templates/speech-transcript-evidence.template.json",
      "docs/tts-speech-output-acceptance-runbook.md",
      "docs/templates/tts-speech-output-evidence.template.json",
      "docs/ai-assessment-acceptance-runbook.md",
      "docs/empty-real-loop-acceptance-runbook.md",
      "docs/templates/empty-real-loop-orchestrator.template.json",
      "scripts/verify-speech-ai-assessment-acceptance.mjs",
      "scripts/verify-empty-real-loop-orchestrator.mjs",
    ].join("\n"),
    deliveryBoundary: [
      "docs/formal-delivery-acceptance-runbook.md",
      "docs/customer-production-input-checklist.md",
      "docs/customer-final-input-request.md",
      "docs/customer-input-to-launch-gate-runbook.md",
      "docs/ai-speech-provider-selection-free-first.md",
      "docs/xiaomi-token-plan-stt-tts-connectivity-record.md",
      "docs/customer-delivery-progress-and-input-summary.md",
      "docs/browser-pose-field-acceptance-runbook.md",
      "docs/unity-field-acceptance-runbook.md",
      "docs/templates/unity-field-evidence.template.json",
      "docs/speech-transcript-acceptance-runbook.md",
      "docs/templates/speech-transcript-evidence.template.json",
      "docs/tts-speech-output-acceptance-runbook.md",
      "docs/templates/tts-speech-output-evidence.template.json",
      "docs/ai-assessment-acceptance-runbook.md",
      "docs/empty-real-loop-acceptance-runbook.md",
      "docs/templates/empty-real-loop-orchestrator.template.json",
      "scripts/verify-speech-ai-assessment-acceptance.mjs",
      "scripts/verify-empty-real-loop-orchestrator.mjs",
    ].join("\n"),
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /docs\/web-playwright-regression-runbook\.md/);
  assert.match(failures, /scripts\/web-playwright-regression\.spec\.mjs/);
  assert.match(failures, /scripts\/playwright-regression\.config\.mjs/);
});

test("required delivery file check rejects missing unity acceptance artifacts", () => {
  const result = checkRequiredDeliveryFiles({
    fileExists: (path) =>
      ![
        "docs/unity-field-acceptance-runbook.md",
        "docs/templates/unity-field-evidence.template.json",
        "scripts/verify-unity-field-evidence.mjs",
        "scripts/verify-unity-field-acceptance.mjs",
      ].includes(path),
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /docs\/unity-field-acceptance-runbook\.md/);
  assert.match(
    failures,
    /docs\/templates\/unity-field-evidence\.template\.json/,
  );
  assert.match(failures, /scripts\/verify-unity-field-evidence\.mjs/);
  assert.match(failures, /scripts\/verify-unity-field-acceptance\.mjs/);
});

test("required delivery file check rejects missing speech transcript acceptance artifacts", () => {
  const result = checkRequiredDeliveryFiles({
    fileExists: (path) =>
      ![
        "docs/speech-transcript-acceptance-runbook.md",
        "docs/templates/speech-transcript-evidence.template.json",
        "scripts/verify-speech-transcript-evidence.mjs",
        "scripts/verify-speech-transcript-acceptance.mjs",
      ].includes(path),
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /docs\/speech-transcript-acceptance-runbook\.md/);
  assert.match(
    failures,
    /docs\/templates\/speech-transcript-evidence\.template\.json/,
  );
  assert.match(failures, /scripts\/verify-speech-transcript-evidence\.mjs/);
  assert.match(failures, /scripts\/verify-speech-transcript-acceptance\.mjs/);
});

test("required delivery file check rejects missing TTS speech output acceptance artifacts", () => {
  const result = checkRequiredDeliveryFiles({
    fileExists: (path) =>
      ![
        "docs/tts-speech-output-acceptance-runbook.md",
        "docs/templates/tts-speech-output-evidence.template.json",
        "scripts/verify-tts-speech-output-evidence.mjs",
        "scripts/verify-tts-speech-output-acceptance.mjs",
      ].includes(path),
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /docs\/tts-speech-output-acceptance-runbook\.md/);
  assert.match(
    failures,
    /docs\/templates\/tts-speech-output-evidence\.template\.json/,
  );
  assert.match(failures, /scripts\/verify-tts-speech-output-evidence\.mjs/);
  assert.match(failures, /scripts\/verify-tts-speech-output-acceptance\.mjs/);
});

test("required delivery file check rejects missing AI speech acceptance config templates", () => {
  const result = checkRequiredDeliveryFiles({
    fileExists: (path) =>
      ![
        "docs/templates/ai-assessment-acceptance-config.template.json",
        "docs/templates/speech-transcript-acceptance-config.template.json",
        "docs/templates/speech-ai-assessment-acceptance-config.template.json",
        "docs/templates/tts-speech-output-acceptance-config.template.json",
      ].includes(path),
  });

  const failures = result.failures.join("\n");
  assert.match(
    failures,
    /docs\/templates\/ai-assessment-acceptance-config\.template\.json/,
  );
  assert.match(
    failures,
    /docs\/templates\/speech-transcript-acceptance-config\.template\.json/,
  );
  assert.match(
    failures,
    /docs\/templates\/speech-ai-assessment-acceptance-config\.template\.json/,
  );
  assert.match(
    failures,
    /docs\/templates\/tts-speech-output-acceptance-config\.template\.json/,
  );
});

test("required delivery file check rejects missing AI assessment acceptance artifacts", () => {
  const result = checkRequiredDeliveryFiles({
    fileExists: (path) =>
      ![
        "docs/ai-assessment-acceptance-runbook.md",
        "scripts/verify-ai-assessment-acceptance.mjs",
      ].includes(path),
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /docs\/ai-assessment-acceptance-runbook\.md/);
  assert.match(failures, /scripts\/verify-ai-assessment-acceptance\.mjs/);
});

test("required delivery file check rejects missing empty real loop artifacts", () => {
  const result = checkRequiredDeliveryFiles({
    fileExists: (path) =>
      ![
        "docs/empty-real-loop-acceptance-runbook.md",
        "docs/templates/empty-real-loop-orchestrator.template.json",
        "scripts/verify-empty-real-loop-orchestrator.mjs",
      ].includes(path),
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /docs\/empty-real-loop-acceptance-runbook\.md/);
  assert.match(
    failures,
    /docs\/templates\/empty-real-loop-orchestrator\.template\.json/,
  );
  assert.match(failures, /scripts\/verify-empty-real-loop-orchestrator\.mjs/);
});

test("required delivery file check rejects missing web Playwright regression artifacts", () => {
  const result = checkRequiredDeliveryFiles({
    fileExists: (path) =>
      ![
        "docs/web-playwright-regression-runbook.md",
        "scripts/web-playwright-regression.spec.mjs",
        "scripts/playwright-regression.config.mjs",
      ].includes(path),
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /docs\/web-playwright-regression-runbook\.md/);
  assert.match(failures, /scripts\/web-playwright-regression\.spec\.mjs/);
  assert.match(failures, /scripts\/playwright-regression\.config\.mjs/);
});

test("required delivery file check protects customer startup and manual generator sources", () => {
  const requiredSources = [
    "offline-deploy-assets/README.md",
    "offline-deploy-assets/create-docker-image-bundle.sh",
    "offline-deploy-assets/create-docker-image-bundle-with-proxy.sh",
    "scripts/start-customer-mac.sh",
    "scripts/stop-customer-mac.sh",
    "tmp/docs/build_customer_usage_manual.py",
    "tmp/docs/build_customer_usage_manual_illustrated.py",
  ];
  const result = checkRequiredDeliveryFiles({
    fileExists: (path) => !requiredSources.includes(path),
  });

  for (const path of requiredSources) {
    assert.ok(
      result.failures.some((failure) => failure.includes(path)),
      `required delivery file check must protect ${path}`,
    );
  }
});

test("production environment check rejects placeholders and local origins", () => {
  const result = checkProductionEnvironment({
    DATABASE_URL:
      "postgresql://<db_user>:<db_password>@<db_host>:5432/rehab?schema=public",
    JWT_SECRET: "dev-rehab-platform-secret",
    WEB_ORIGIN: "http://localhost:3000",
    NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
    DEFAULT_PATIENT_PASSWORD: "253913",
  });

  assert.match(result.failures.join("\n"), /DATABASE_URL.*占位符/);
  assert.match(result.failures.join("\n"), /JWT_SECRET.*开发/);
  assert.match(result.failures.join("\n"), /WEB_ORIGIN.*正式 HTTPS/);
});

for (const [value, description] of [
  [undefined, "missing"],
  ["false", "false"],
  ["TRUE", "uppercase"],
  ["1", "numeric"],
  [" true", "leading whitespace"],
  ["true ", "trailing whitespace"],
]) {
  test(`production environment check rejects ${description} COOKIE_SECURE`, () => {
    const env = {
      ...productionBaseEnv(),
      AI_REQUIRED_FOR_LAUNCH: "false",
      SPEECH_REQUIRED_FOR_LAUNCH: "false",
      TTS_REQUIRED_FOR_LAUNCH: "false",
    };
    if (value === undefined) {
      delete env.COOKIE_SECURE;
    } else {
      env.COOKIE_SECURE = value;
    }

    const result = checkProductionEnvironment(env);

    assert.match(result.failures.join("\n"), /COOKIE_SECURE.*true/);
  });
}

for (const name of [
  "PUBLIC_CREDENTIAL_THROTTLE_LIMIT",
  "PUBLIC_CREDENTIAL_THROTTLE_TTL_MS",
]) {
  for (const [value, description] of [
    [undefined, "missing"],
    ["", "empty"],
    ["0", "zero"],
    ["-1", "negative"],
    ["+1", "signed"],
    ["1.5", "fractional"],
    ["1e3", "exponential"],
    ["01", "leading-zero"],
    [" 1", "leading-whitespace"],
    ["1 ", "trailing-whitespace"],
    ["9007199254740992", "unsafe"],
    ["not-a-number", "non-numeric"],
  ]) {
    test(`production environment check rejects ${description} ${name}`, () => {
      const env = {
        ...productionBaseEnv(),
        AI_REQUIRED_FOR_LAUNCH: "false",
        SPEECH_REQUIRED_FOR_LAUNCH: "false",
        TTS_REQUIRED_FOR_LAUNCH: "false",
      };
      if (value === undefined) {
        delete env[name];
      } else {
        env[name] = value;
      }

      const result = checkProductionEnvironment(env);

      assert.match(
        result.failures.join("\n"),
        new RegExp(`${name}.*base-10.*正安全整数`),
      );
    });
  }
}

test("production environment check accepts positive safe integer throttle boundaries", () => {
  const result = checkProductionEnvironment({
    ...productionBaseEnv(),
    PUBLIC_CREDENTIAL_THROTTLE_LIMIT: "1",
    PUBLIC_CREDENTIAL_THROTTLE_TTL_MS: "9007199254740991",
  });

  assert.deepEqual(result.failures, []);
});

test("Docker Compose resolves to the PostgreSQL service only", () => {
  const result = spawnSync(
    "docker",
    ["compose", "-f", "infra/docker-compose.yml", "config", "--format", "json"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        POSTGRES_PASSWORD: "delivery-readiness-compose-test-password",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(config.services).sort(), ["postgres"]);
  assert.equal(config.services.postgres.image, "postgres:18");
});

for (const path of [
  "offline-deploy-assets/create-docker-image-bundle.sh",
  "offline-deploy-assets/create-docker-image-bundle-with-proxy.sh",
]) {
  test(`${path} packages only the PostgreSQL image`, () => {
    const source = readFileSync(path, "utf8");
    const imageReferences = [
      ...new Set(source.match(/\b(?:postgres|redis):[\w.-]+/gi) ?? []),
    ];

    assert.deepEqual(imageReferences, ["postgres:18"]);
    assert.match(source, /docker pull postgres:18/);
    assert.match(source, /docker save[^\n]*postgres18\.tar postgres:18/);
    assert.doesNotMatch(source, redisContractPattern);
  });
}

for (const { path, postgresPattern } of [
  {
    path: "scripts/start-customer-mac.sh",
    postgresPattern:
      /docker image inspect postgres:18[\s\S]*rehab-platform-postgres/,
  },
  {
    path: "scripts/stop-customer-mac.sh",
    postgresPattern: /Docker Postgres is left running to protect data/,
  },
  {
    path: "offline-deploy-assets/README.md",
    postgresPattern:
      /docker load -i rehab-platform-docker-images-postgres18\.tar/,
  },
]) {
  test(`${path} retains PostgreSQL without a Redis contract`, () => {
    const source = readFileSync(path, "utf8");

    assert.match(source, postgresPattern);
    assert.doesNotMatch(source, redisContractPattern);
  });
}

for (const path of [
  "tmp/docs/build_customer_usage_manual.py",
  "tmp/docs/build_customer_usage_manual_illustrated.py",
]) {
  test(`${path} documents PostgreSQL without a Redis contract`, () => {
    const source = readFileSync(path, "utf8");

    assert.match(source, /PostgreSQL/);
    assert.match(source, /pnpm infra:up/);
    assert.doesNotMatch(source, /\bRedis\b|REDIS_URL/i);
  });
}

test("production environment CLI rejects missing customer input path after flag", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/check-delivery-readiness.mjs",
      "--production-env",
      "--customer-input",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, ...productionBaseEnv() },
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
      env: { ...process.env, ...productionBaseEnv() },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--customer-input/);
});

test("production environment check accepts only the complete MiMo Secret File and Key Value contract", () => {
  assert.deepEqual(
    checkProductionEnvironment(productionBaseEnv()).failures,
    [],
  );
});

test("production environment check requires STT input and user-operation request limits", () => {
  for (const name of [
    "STT_MAX_DECODED_AUDIO_BYTES",
    "STT_MAX_DURATION_SECONDS",
    "MIMO_HIGH_COST_USER_OPERATION_REQUEST_LIMIT",
    "MIMO_HIGH_COST_USER_OPERATION_WINDOW_MS",
  ]) {
    const env = productionBaseEnv();
    delete env[name];
    assert.match(
      checkProductionEnvironment(env).failures.join("\n"),
      new RegExp(name),
    );
  }
});

test("production environment check requires every MiMo capability and approved provider identity", () => {
  const result = checkProductionEnvironment({
    ...productionBaseEnv(),
    AI_REQUIRED_FOR_LAUNCH: "false",
    SPEECH_REQUIRED_FOR_LAUNCH: "false",
    TTS_REQUIRED_FOR_LAUNCH: "false",
    AI_PROVIDER: "iflytek-spark",
    SPEECH_PROVIDER: "iflytek-iat",
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /AI_REQUIRED_FOR_LAUNCH.*true/);
  assert.match(failures, /SPEECH_REQUIRED_FOR_LAUNCH.*true/);
  assert.match(failures, /TTS_REQUIRED_FOR_LAUNCH.*true/);
  assert.match(failures, /AI_PROVIDER.*xiaomi-mimo/);
  assert.match(failures, /SPEECH_PROVIDER.*xiaomi-mimo-audio-understanding/);
});

test("production environment check rejects mock, manual, and fallback launch markers", () => {
  const result = checkProductionEnvironment({
    ...productionBaseEnv(),
    AI_MODEL_VERSION: "demo-model-v1",
    AI_PROMPT_VERSION: "manual-prompt-v1",
    SPEECH_MODEL_VERSION: "fallback-speech-v1",
    TTS_VOICE_ID: "local-voice",
  });

  const failures = result.failures.join("\n");
  assert.match(
    failures,
    /AI_MODEL_VERSION.*mock\/demo\/local\/manual\/fallback/,
  );
  assert.match(
    failures,
    /AI_PROMPT_VERSION.*mock\/demo\/local\/manual\/fallback/,
  );
  assert.match(
    failures,
    /SPEECH_MODEL_VERSION.*mock\/demo\/local\/manual\/fallback/,
  );
  assert.match(failures, /TTS_VOICE_ID.*mock\/demo\/local\/manual\/fallback/);
});

test("production environment check rejects raw, legacy, and malformed Secret File configuration", () => {
  const result = checkProductionEnvironment({
    ...productionBaseEnv(),
    MIMO_API_KEY: "must-not-be-present",
    AI_API_KEY_REF: "secret-manager://rehab-prod/legacy-ai-key",
    MIMO_API_KEY_FILE: "/etc/secrets/nested/mimo_api_key",
    SENSITIVE_DATA_KEY_FILE: "/tmp/sensitive_data_key",
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /MIMO_API_KEY 是明文密钥/);
  assert.match(failures, /AI_API_KEY_REF.*已废弃/);
  assert.match(failures, /MIMO_API_KEY_FILE.*直接 Secret File/);
  assert.match(failures, /SENSITIVE_DATA_KEY_FILE.*直接 Secret File/);
});

test("production environment check rejects unapproved MiMo endpoints, local Key Value, and out-of-range limits", () => {
  const result = checkProductionEnvironment({
    ...productionBaseEnv(),
    MIMO_ALLOWED_HOSTS:
      "mimo.customer-health.cn, mimo-secondary.customer-health.cn",
    TTS_ENDPOINT: "http://mimo.customer-health.cn/v1/chat/completions",
    MIMO_KEY_VALUE_URL: "redis://127.0.0.1:6379",
    TTS_PROVIDER_MAX_RESPONSE_BYTES: "16777217",
    STT_MAX_DECODED_AUDIO_BYTES: "11796481",
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /MIMO_ALLOWED_HOSTS/);
  assert.match(failures, /TTS_ENDPOINT.*HTTPS endpoint/);
  assert.match(failures, /MIMO_KEY_VALUE_URL/);
  assert.match(failures, /TTS_PROVIDER_MAX_RESPONSE_BYTES/);
  assert.match(failures, /STT_MAX_DECODED_AUDIO_BYTES/);
});

test("production environment check requires bounded provider telemetry retention configuration", () => {
  const result = checkProductionEnvironment({
    ...productionBaseEnv(),
    PROVIDER_TELEMETRY_RETENTION_DAYS: "3651",
    PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS: "2147483648",
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /PROVIDER_TELEMETRY_RETENTION_DAYS/);
  assert.match(failures, /PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS/);
});

test("production environment check rejects non-production runtime, insecure browser origin, cookie, and port", () => {
  const result = checkProductionEnvironment({
    ...productionBaseEnv(),
    NODE_ENV: "development",
    COOKIE_SECURE: "false",
    WEB_ORIGIN: "http://rehab.example.com",
    PORT: "65536",
  });

  const failures = result.failures.join("\n");
  assert.match(failures, /NODE_ENV.*production/);
  assert.match(failures, /COOKIE_SECURE.*true/);
  assert.match(failures, /WEB_ORIGIN.*HTTPS origin/);
  assert.match(failures, /PORT/);
});

test("production launch scope consistency requires every customer and runtime scope to be true", () => {
  assert.deepEqual(
    checkProductionLaunchScopeConsistency({
      env: {
        AI_REQUIRED_FOR_LAUNCH: "true",
        SPEECH_REQUIRED_FOR_LAUNCH: "true",
        TTS_REQUIRED_FOR_LAUNCH: "true",
      },
      customerInput: customerInputScope({
        aiRequiredForLaunch: true,
        speechRequiredForLaunch: true,
        ttsRequiredForLaunch: true,
      }),
    }).failures,
    [],
  );

  const result = checkProductionLaunchScopeConsistency({
    env: {
      AI_REQUIRED_FOR_LAUNCH: "false",
      SPEECH_REQUIRED_FOR_LAUNCH: "true",
      TTS_REQUIRED_FOR_LAUNCH: "true",
    },
    customerInput: customerInputScope({
      aiRequiredForLaunch: true,
      speechRequiredForLaunch: false,
      ttsRequiredForLaunch: true,
    }),
  });
  assert.match(result.failures.join("\n"), /AI_REQUIRED_FOR_LAUNCH.*true/);
  assert.match(result.failures.join("\n"), /speech\.requiredForLaunch.*true/);
});

test("production environment CLI still requires a customer input package", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-delivery-readiness.mjs", "--production-env"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, ...productionBaseEnv() },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--customer-input/);
});
