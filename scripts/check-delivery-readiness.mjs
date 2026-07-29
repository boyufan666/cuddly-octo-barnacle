#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");

const requiredGitignoreEntries = [
  "node_modules",
  ".next",
  "dist",
  "coverage",
  ".env",
  ".env.local",
  ".env.production",
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
];
const requiredDeliveryDocumentRefs = [
  "docs/formal-delivery-acceptance-runbook.md",
  "docs/customer-production-input-checklist.md",
  "docs/customer-final-input-request.md",
  "docs/customer-input-to-launch-gate-runbook.md",
  "docs/ai-speech-provider-selection-free-first.md",
  "docs/xiaomi-token-plan-stt-tts-connectivity-record.md",
  "docs/customer-delivery-progress-and-input-summary.md",
  "docs/templates/customer-production-input.template.json",
  "docs/templates/customer-acceptance-package-manifest.template.json",
  "docs/browser-pose-field-acceptance-runbook.md",
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
  "docs/collection-condition-data-capture-runbook.md",
  "scripts/verify-speech-ai-assessment-acceptance.mjs",
  "scripts/verify-empty-real-loop-orchestrator.mjs",
  "scripts/verify-customer-acceptance-package-manifest.mjs",
  "scripts/web-playwright-regression.spec.mjs",
  "scripts/playwright-regression.config.mjs",
];
const requiredDeliveryFiles = [
  ...requiredDeliveryDocumentRefs,
  "scripts/verify-browser-pose-evidence.mjs",
  "scripts/verify-browser-pose-field-acceptance.mjs",
  "scripts/verify-unity-field-evidence.mjs",
  "scripts/verify-unity-field-acceptance.mjs",
  "scripts/verify-speech-transcript-evidence.mjs",
  "scripts/verify-speech-transcript-acceptance.mjs",
  "scripts/verify-tts-speech-output-evidence.mjs",
  "scripts/verify-tts-speech-output-acceptance.mjs",
  "scripts/verify-ai-assessment-acceptance.mjs",
  "scripts/verify-speech-ai-assessment-acceptance.mjs",
  "scripts/verify-customer-production-input.mjs",
  "scripts/verify-customer-acceptance-package-manifest.mjs",
  "apps/api/test/run-mimo-usage-gate-redis-integration.mjs",
  "apps/api/test/jest-mimo-usage-gate-redis-integration.json",
  "apps/api/test/mimo-usage-gate.redis.integration.ts",
  "apps/api/test/run-continuous-conversation-high-cost-route-e2e.mjs",
  "apps/api/test/continuous-conversation-high-cost-route-e2e.test.mjs",
  "apps/api/src/production-runtime-event.ts",
  "scripts/__tests__/production-runtime-events.test.mjs",
  "offline-deploy-assets/README.md",
  "offline-deploy-assets/create-docker-image-bundle.sh",
  "offline-deploy-assets/create-docker-image-bundle-with-proxy.sh",
  "scripts/start-customer-mac.sh",
  "scripts/stop-customer-mac.sh",
  "tmp/docs/build_customer_usage_manual.py",
  "tmp/docs/build_customer_usage_manual_illustrated.py",
];
export const requiredGitTrackedRuntimeAssets = [
  "apps/web/public/mediapipe/models/pose_landmarker_lite.task",
  "apps/web/public/mediapipe/tasks-vision/wasm/vision_wasm_internal.js",
  "apps/web/public/mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm",
  "apps/web/public/mediapipe/tasks-vision/wasm/vision_wasm_module_internal.js",
  "apps/web/public/mediapipe/tasks-vision/wasm/vision_wasm_module_internal.wasm",
  "apps/web/public/mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js",
  "apps/web/public/mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.wasm",
  "apps/web/public/unity/rehab-unity-bridge.js",
  "apps/web/public/unity/rhythm_reach_3d/0.1.2/index.html",
  "apps/web/public/unity/rhythm_reach_3d/0.1.2/manifest.json",
  "apps/web/public/unity/rhythm_reach_3d/0.1.2/Build/0.1.2.data",
  "apps/web/public/unity/rhythm_reach_3d/0.1.2/Build/0.1.2.framework.js",
  "apps/web/public/unity/rhythm_reach_3d/0.1.2/Build/0.1.2.loader.js",
  "apps/web/public/unity/rhythm_reach_3d/0.1.2/Build/0.1.2.wasm",
];
export const requiredCommittedDeploymentFiles = [
  ".gitattributes",
  ".gitignore",
  ".node-version",
  ".github/workflows/ci.yml",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "render.yaml",
  "tsconfig.base.json",
  "apps/api/package.json",
  "apps/api/nest-cli.json",
  "apps/api/tsconfig.json",
  "apps/api/tsconfig.build.json",
  "apps/web/package.json",
  "apps/web/next.config.ts",
  "apps/web/tsconfig.json",
  "packages/db/package.json",
  "packages/db/tsconfig.json",
  "packages/db/tsconfig.build.json",
  "packages/db/prisma/schema.prisma",
  "packages/db/prisma/migration-manifest.json",
  "packages/db/prisma/migrations/migration_lock.toml",
  ...requiredDeliveryFiles,
  ...requiredGitTrackedRuntimeAssets,
];
export const requiredCommittedDeploymentSourceRoots = [
  "apps/api/src/",
  "apps/web/src/",
  "packages/db/src/",
  "packages/db/prisma/migrations/",
];
const migrationManifestPath = "packages/db/prisma/migration-manifest.json";
const prismaMigrationsRoot = "packages/db/prisma/migrations/";
const migrationNamePattern = /^\d{14}_[a-z0-9_]+$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const fullCommitIdPattern = /^[a-f0-9]{40}$/i;
const immutableAssetWhitespaceExceptions = [
  "apps/web/public/mediapipe/tasks-vision/wasm/vision_wasm_internal.js",
  "apps/web/public/mediapipe/tasks-vision/wasm/vision_wasm_module_internal.js",
  "apps/web/public/mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js",
  "apps/web/public/unity/rhythm_reach_3d/0.1.2/Build/0.1.2.framework.js",
];

const requiredProductionEnv = [
  "NODE_ENV",
  "DATABASE_URL",
  "JWT_SECRET",
  "WEB_ORIGIN",
  "NEXT_PUBLIC_API_BASE_URL",
  "PORT",
  "MIMO_ALLOWED_HOSTS",
  "MIMO_API_KEY_REF",
  "MIMO_API_KEY_FILE",
  "SENSITIVE_DATA_KEY_REF",
  "SENSITIVE_DATA_KEY_FILE",
  "PROVIDER_TELEMETRY_RETENTION_DAYS",
  "PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS",
];
const publicCredentialThrottleProductionEnv = [
  "PUBLIC_CREDENTIAL_THROTTLE_LIMIT",
  "PUBLIC_CREDENTIAL_THROTTLE_TTL_MS",
];
const mimoProductionEnv = [
  "AI_PROVIDER",
  "AI_MODEL_VERSION",
  "AI_MODEL_ENDPOINT",
  "AI_PROMPT_VERSION",
  "AI_HUMAN_REVIEW_REQUIRED",
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
  "PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS",
];
const forbiddenRawSecretEnv = [
  "MIMO_API_KEY",
  "AI_API_KEY",
  "SPEECH_API_KEY",
  "TTS_API_KEY",
  "SENSITIVE_DATA_KEY",
];
const forbiddenLegacyMimoReferenceEnv = [
  "AI_API_KEY_REF",
  "SPEECH_API_KEY_REF",
  "TTS_API_KEY_REF",
];
const requiredMimoPositiveIntegerEnv = [
  "AI_PROVIDER_TIMEOUT_MS",
  "AI_PROVIDER_MAX_RESPONSE_BYTES",
  "SPEECH_PROVIDER_TIMEOUT_MS",
  "SPEECH_PROVIDER_MAX_RESPONSE_BYTES",
  "STT_MAX_DECODED_AUDIO_BYTES",
  "STT_MAX_DURATION_SECONDS",
  "TTS_PROVIDER_TIMEOUT_MS",
  "TTS_PROVIDER_MAX_RESPONSE_BYTES",
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
];

const weakOrLocalValues = new Map([
  ["253913", "固定本地密码"],
  ["dev-rehab-platform-secret", "开发 JWT 密钥"],
]);

export function checkPackageScripts({ rootPackage, apiPackage }) {
  const failures = [];
  const rootScripts = rootPackage.scripts ?? {};
  const apiScripts = apiPackage.scripts ?? {};

  if (
    rootScripts["delivery:check"] !==
    "node scripts/check-delivery-readiness.mjs"
  ) {
    failures.push("root package 缺少 delivery:check 交付检查脚本。");
  }

  if (
    rootScripts["delivery:check:production"] !==
    "node scripts/check-delivery-readiness.mjs --production-env"
  ) {
    failures.push(
      "root package 缺少 delivery:check:production 生产配置检查脚本。",
    );
  }

  if (
    rootScripts["test:delivery"] !== "node --test scripts/__tests__/*.test.mjs"
  ) {
    failures.push("root package 缺少 test:delivery 交付检查测试脚本。");
  }

  if (
    rootScripts["supply-chain:artifacts"] !==
    "node scripts/produce-production-supply-chain.mjs"
  ) {
    failures.push(
      "root package 缺少 supply-chain:artifacts 生产依赖 SBOM 生成脚本。",
    );
  }

  if (
    rootScripts["verify:supply-chain:production"] !==
    "node scripts/verify-production-supply-chain.mjs"
  ) {
    failures.push(
      "root package 缺少 verify:supply-chain:production 客户许可证策略门禁脚本。",
    );
  }

  if (rootScripts["verify:api-sast"] !== "node scripts/run-api-sast.mjs") {
    failures.push("root package 缺少 verify:api-sast 固定 API SAST 门禁脚本。");
  }

  if (
    rootScripts["verify:browser-pose-field-acceptance"] !==
    "node scripts/verify-browser-pose-field-acceptance.mjs"
  ) {
    failures.push(
      "root package 缺少 verify:browser-pose-field-acceptance 浏览器体感只读实机验真脚本。",
    );
  }

  if (
    rootScripts["verify:unity-field-evidence"] !==
    "node scripts/verify-unity-field-evidence.mjs"
  ) {
    failures.push(
      "root package 缺少 verify:unity-field-evidence Unity WebGL evidence JSON 静态自检脚本。",
    );
  }

  if (
    rootScripts["verify:unity-field-acceptance"] !==
    "node scripts/verify-unity-field-acceptance.mjs"
  ) {
    failures.push(
      "root package 缺少 verify:unity-field-acceptance Unity WebGL 只读实机验真脚本。",
    );
  }

  if (
    rootScripts["verify:speech-transcript-evidence"] !==
    "node scripts/verify-speech-transcript-evidence.mjs"
  ) {
    failures.push(
      "root package 缺少 verify:speech-transcript-evidence 语音转写 evidence JSON 静态自检脚本。",
    );
  }

  if (
    rootScripts["verify:speech-transcript-acceptance"] !==
    "node scripts/verify-speech-transcript-acceptance.mjs"
  ) {
    failures.push(
      "root package 缺少 verify:speech-transcript-acceptance 语音转写现场验收脚本。",
    );
  }

  if (
    rootScripts["verify:ai-assessment-acceptance"] !==
    "node scripts/verify-ai-assessment-acceptance.mjs"
  ) {
    failures.push(
      "root package 缺少 verify:ai-assessment-acceptance AI 评估草稿到正式评估验收脚本。",
    );
  }

  if (
    rootScripts["verify:speech-ai-assessment-acceptance"] !==
    "node scripts/verify-speech-ai-assessment-acceptance.mjs"
  ) {
    failures.push(
      "root package 缺少 verify:speech-ai-assessment-acceptance 语音转写到 AI 评估正式入库组合验收脚本。",
    );
  }

  if (
    rootScripts["verify:tts-speech-output-evidence"] !==
    "node scripts/verify-tts-speech-output-evidence.mjs"
  ) {
    failures.push(
      "root package 缺少 verify:tts-speech-output-evidence TTS 语音输出 evidence JSON 静态自检脚本。",
    );
  }

  if (
    rootScripts["verify:tts-speech-output-acceptance"] !==
    "node scripts/verify-tts-speech-output-acceptance.mjs"
  ) {
    failures.push(
      "root package 缺少 verify:tts-speech-output-acceptance TTS 语音输出现场验收脚本。",
    );
  }

  if (
    rootScripts["verify:customer-production-input"] !==
    "node scripts/verify-customer-production-input.mjs"
  ) {
    failures.push(
      "root package 缺少 verify:customer-production-input 客户生产资料包校验脚本。",
    );
  }

  if (
    rootScripts["verify:customer-acceptance-package-manifest"] !==
    "node scripts/verify-customer-acceptance-package-manifest.mjs"
  ) {
    failures.push(
      "root package 缺少 verify:customer-acceptance-package-manifest 客户验收包 manifest 校验脚本。",
    );
  }

  if (
    rootScripts["verify:empty-real-loop"] !==
    "node scripts/verify-empty-real-loop-orchestrator.mjs"
  ) {
    failures.push(
      "root package 缺少 verify:empty-real-loop 新库真实总闭环验收编排脚本。",
    );
  }

  if (
    rootScripts["test:playwright"] !==
    "node scripts/run-playwright-regression.mjs"
  ) {
    failures.push(
      "root package 缺少 test:playwright 专用数据库严格浏览器回归 runner。",
    );
  }

  if (
    rootScripts["db:bootstrap:production"] !==
    "pnpm --filter @rehab-platform/db bootstrap:production"
  ) {
    failures.push(
      "root package 缺少 db:bootstrap:production 受控生产机构、首管理员与医师初始化脚本。",
    );
  }

  if (/\s--fix(?:\s|$)/.test(apiScripts.lint ?? "")) {
    failures.push(
      "api lint 包含 --fix，会修改文件，不适合作为交付前纯检查命令。",
    );
  }

  if (
    apiScripts["start:prod"] !==
    "NODE_ENV=production node dist/main.js"
  ) {
    failures.push(
      "api start:prod 必须以 NODE_ENV=production 启动，不能绕过生产 Secret File、KV 与 ready gate。",
    );
  }

  if (
    apiScripts["telemetry:retention"] !==
    "NODE_ENV=production node dist/provider-telemetry-retention.js"
  ) {
    failures.push(
      "api telemetry:retention 必须以 NODE_ENV=production 启动 Nest 实际构建出的留存清理入口。",
    );
  }

  if (
    apiScripts["test:integration:mimo-usage-gate-redis"] !==
    "node ./test/run-mimo-usage-gate-redis-integration.mjs"
  ) {
    failures.push(
      "api package 缺少 test:integration:mimo-usage-gate-redis 显式 disposable Redis 原子闸门回归 runner。",
    );
  }

  if (
    apiScripts["test:e2e:continuous-conversation-high-cost-route"] !==
    "node ./test/run-continuous-conversation-high-cost-route-e2e.mjs"
  ) {
    failures.push(
      "api package 缺少 test:e2e:continuous-conversation-high-cost-route 两实例真实路由 PostgreSQL + Redis 回归 runner。",
    );
  }

  return { failures };
}

export function checkGitignoreExclusions(content) {
  const entries = new Set(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
  const failures = requiredGitignoreEntries
    .filter((entry) => !entries.has(entry))
    .map(
      (entry) => `.gitignore 缺少 ${entry}，正式源码包可能混入本地或历史资料。`,
    );

  return { failures };
}

export function checkDeliveryDocumentReferences({ readme, deliveryBoundary }) {
  const failures = [];

  for (const ref of requiredDeliveryDocumentRefs) {
    if (!readme.includes(ref)) {
      failures.push(`README.md 缺少 ${ref} 交付文档索引。`);
    }
    if (
      ref !== "docs/templates/customer-production-input.template.json" &&
      !deliveryBoundary.includes(ref)
    ) {
      failures.push(
        `delivery-boundary-and-readiness.md 缺少 ${ref} 交付文档索引。`,
      );
    }
  }

  if (/已按公开文档接入小米\s*MiMo/.test(readme)) {
    failures.push(
      "README.md 对小米 MiMo 使用“已接入”容易被误读为已完成正式验收，请改为协议适配/本地联调并明确仍需客户正式验收。",
    );
  }

  if (/已发布\s*WebGL\s*构建产物/.test(readme)) {
    failures.push(
      "README.md 的“已发布 WebGL 构建产物”容易被误读为 Unity 正式验收完成，请改为仓内构建产物并明确仍需现场验收。",
    );
  }

  if (/Web Playwright 回归测试：/.test(readme)) {
    failures.push(
      "README.md 应将 Playwright 表述为前端入口回归能力，并明确不验证供应商调用、采集、入库或现场闭环。",
    );
  }

  const formalScopeSection = extractMarkdownSection(
    deliveryBoundary,
    "正式交付范围",
  );
  if (
    formalScopeSection.includes(
      "docs/xiaomi-token-plan-stt-tts-connectivity-record.md",
    )
  ) {
    failures.push(
      "docs/xiaomi-token-plan-stt-tts-connectivity-record.md 是本地联调参考附件，不能列入正式交付范围或作为正式验收证据。",
    );
  }

  return { failures };
}

export function checkRequiredDeliveryFiles({
  fileExists = (path) => existsSync(resolve(rootDir, path)),
} = {}) {
  const failures = [];

  for (const filePath of requiredDeliveryFiles) {
    if (!fileExists(filePath)) {
      failures.push(`缺少交付文件 ${filePath}。`);
    }
  }

  return { failures };
}

function runGitCommand(args, { cwd = rootDir, execFile = execFileSync } = {}) {
  return execFile("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function isSafeRepositoryRelativePath(path) {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    path
      .split("/")
      .every((segment) => segment && segment !== "." && segment !== "..")
  );
}

function isSafeGitReference(reference, { cwd, execFile } = {}) {
  if (
    typeof reference !== "string" ||
    reference.length === 0 ||
    reference.trim() !== reference ||
    reference.startsWith("-") ||
    reference.includes("@{") ||
    reference.includes("\\")
  ) {
    return false;
  }
  if (reference === "HEAD" || fullCommitIdPattern.test(reference)) {
    return true;
  }
  try {
    runGitCommand(["check-ref-format", "--allow-onelevel", reference], {
      cwd,
      execFile,
    });
    return true;
  } catch {
    return false;
  }
}

export function resolveCommittedGitReference({
  ref = "HEAD",
  cwd = rootDir,
  execFile = execFileSync,
} = {}) {
  if (!isSafeGitReference(ref, { cwd, execFile })) {
    return {
      failures: [
        "Git 部署基线必须是已解析的 HEAD、完整 commit SHA 或有效 ref，不能使用工作区、暂存区或 Git revision expression。",
      ],
    };
  }

  let commit;
  try {
    commit = runGitCommand(
      [
        "rev-parse",
        "--verify",
        "--quiet",
        "--end-of-options",
        `${ref}^{commit}`,
      ],
      { cwd, execFile },
    ).trim();
  } catch {
    return {
      failures: [
        "无法将 Git 部署基线解析为 commit；部署证明必须来自一个已存在的 commit tree。",
      ],
    };
  }

  if (!fullCommitIdPattern.test(commit)) {
    return {
      failures: ["Git 部署基线未解析为规范的完整 commit SHA。"],
    };
  }

  return { failures: [], commit: commit.toLowerCase() };
}

function listCommittedTreePaths({ commit, cwd, execFile }) {
  const output = runGitCommand(["ls-tree", "-r", "-z", "--name-only", commit], {
    cwd,
    execFile,
  });
  return new Set(output.split("\0").filter(Boolean));
}

function readCommittedTextFile({ commit, path, cwd, execFile }) {
  return runGitCommand(["show", `${commit}:${path}`], { cwd, execFile });
}

function checkCommittedPrismaMigrations({ commit, treePaths, cwd, execFile }) {
  const failures = [];
  if (!treePaths.has(migrationManifestPath)) {
    return {
      failures: [
        `已提交 Git tree 缺少 Prisma migration manifest ${migrationManifestPath}。`,
      ],
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(
      readCommittedTextFile({
        commit,
        path: migrationManifestPath,
        cwd,
        execFile,
      }),
    );
  } catch {
    return {
      failures: [
        "已提交 Git tree 中的 Prisma migration manifest 缺失或不是有效 JSON。",
      ],
    };
  }

  if (
    manifest?.version !== 1 ||
    !Array.isArray(manifest.migrations) ||
    manifest.migrations.length === 0
  ) {
    return {
      failures: [
        "已提交 Git tree 中的 Prisma migration manifest 必须是包含至少一个迁移的 version 1 清单。",
      ],
    };
  }

  const expectedMigrations = new Map();
  for (const entry of manifest.migrations) {
    if (
      !entry ||
      typeof entry.name !== "string" ||
      !migrationNamePattern.test(entry.name) ||
      typeof entry.sha256 !== "string" ||
      !sha256Pattern.test(entry.sha256) ||
      expectedMigrations.has(entry.name)
    ) {
      failures.push(
        "已提交 Git tree 中的 Prisma migration manifest 包含无效或重复条目。",
      );
      continue;
    }
    expectedMigrations.set(entry.name, entry.sha256);
  }

  const actualMigrationPaths = [...treePaths]
    .filter((path) =>
      new RegExp(
        `^${prismaMigrationsRoot}\\d{14}_[a-z0-9_]+/migration\\.sql$`,
      ).test(path),
    )
    .sort();
  const actualMigrationNames = new Set(
    actualMigrationPaths.map((path) =>
      path.slice(prismaMigrationsRoot.length, -"/migration.sql".length),
    ),
  );

  for (const [name, expectedChecksum] of expectedMigrations) {
    const path = `${prismaMigrationsRoot}${name}/migration.sql`;
    if (!treePaths.has(path)) {
      failures.push(`已提交 Git tree 缺少 Prisma migration ${name}。`);
      continue;
    }
    try {
      const actualChecksum = createHash("sha256")
        .update(readCommittedTextFile({ commit, path, cwd, execFile }))
        .digest("hex");
      if (actualChecksum !== expectedChecksum) {
        failures.push(
          `已提交 Git tree 中的 Prisma migration ${name} checksum 不匹配。`,
        );
      }
    } catch {
      failures.push(`无法读取已提交 Git tree 中的 Prisma migration ${name}。`);
    }
  }

  for (const name of actualMigrationNames) {
    if (!expectedMigrations.has(name)) {
      failures.push(
        `已提交 Git tree 中的 Prisma migration ${name} 未列入 manifest。`,
      );
    }
  }

  return { failures };
}

export function checkGitAttributesWhitespaceExceptions(content) {
  const failures = [];
  const entries = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const expectedEntries = new Set(
    immutableAssetWhitespaceExceptions.map((path) => `${path} -whitespace`),
  );

  for (const entry of expectedEntries) {
    if (!entries.includes(entry)) {
      failures.push(
        `.gitattributes 缺少不可变资源的精确 whitespace 例外：${entry}。`,
      );
    }
  }
  for (const entry of entries) {
    if (!expectedEntries.has(entry)) {
      failures.push(
        `.gitattributes 只能为四个已校验哈希的不可变 JS 资源关闭 whitespace 检查，发现非精确条目：${entry}。`,
      );
    }
  }

  return { failures };
}

function checkCommittedGitAttributes({ commit, treePaths, cwd, execFile }) {
  if (!treePaths.has(".gitattributes")) {
    return { failures: ["已提交 Git tree 缺少 .gitattributes。"] };
  }
  try {
    return checkGitAttributesWhitespaceExceptions(
      readCommittedTextFile({
        commit,
        path: ".gitattributes",
        cwd,
        execFile,
      }),
    );
  } catch {
    return { failures: ["无法读取已提交 Git tree 中的 .gitattributes。"] };
  }
}

export function checkCommittedDeploymentBaseline({
  ref = "HEAD",
  cwd = rootDir,
  execFile = execFileSync,
  requiredFiles = requiredCommittedDeploymentFiles,
  requiredSourceRoots = requiredCommittedDeploymentSourceRoots,
  verifyPrismaMigrations = true,
  verifyGitAttributes = true,
} = {}) {
  const resolved = resolveCommittedGitReference({ ref, cwd, execFile });
  if (resolved.failures.length > 0) return resolved;

  if (
    !requiredFiles.every(isSafeRepositoryRelativePath) ||
    !requiredSourceRoots.every(
      (path) =>
        isSafeRepositoryRelativePath(path.slice(0, -1)) && path.endsWith("/"),
    )
  ) {
    return {
      failures: ["部署基线的必需路径定义无效，拒绝继续验证。"],
    };
  }

  let treePaths;
  try {
    treePaths = listCommittedTreePaths({
      commit: resolved.commit,
      cwd,
      execFile,
    });
  } catch {
    return {
      failures: [
        "无法读取已提交 Git tree，不能把当前工作区或暂存区作为部署证明。",
      ],
    };
  }

  const failures = [];
  for (const path of requiredFiles) {
    if (!treePaths.has(path)) {
      failures.push(`已提交 Git tree 缺少部署必需文件 ${path}。`);
    }
  }
  for (const sourceRoot of requiredSourceRoots) {
    if (![...treePaths].some((path) => path.startsWith(sourceRoot))) {
      failures.push(`已提交 Git tree 缺少部署必需源码目录 ${sourceRoot}。`);
    }
  }

  if (verifyPrismaMigrations) {
    failures.push(
      ...checkCommittedPrismaMigrations({
        commit: resolved.commit,
        treePaths,
        cwd,
        execFile,
      }).failures,
    );
  }
  if (verifyGitAttributes) {
    failures.push(
      ...checkCommittedGitAttributes({
        commit: resolved.commit,
        treePaths,
        cwd,
        execFile,
      }).failures,
    );
  }

  return { failures, commit: resolved.commit };
}

export function checkGitTrackedRuntimeAssets({
  ref = "HEAD",
  cwd = rootDir,
  execFile = execFileSync,
} = {}) {
  return checkCommittedDeploymentBaseline({
    ref,
    cwd,
    execFile,
    requiredFiles: requiredGitTrackedRuntimeAssets,
    requiredSourceRoots: [],
    verifyPrismaMigrations: false,
    verifyGitAttributes: false,
  });
}

export function checkProductionEnvironment(env) {
  const failures = [];

  for (const name of requiredProductionEnv) {
    validateProductionValue(failures, env, name);
  }
  if (env.COOKIE_SECURE !== "true") {
    failures.push("COOKIE_SECURE 必须显式配置且值精确为 true。");
  }
  for (const name of publicCredentialThrottleProductionEnv) {
    validatePositiveSafeIntegerProductionValue(failures, env, name);
  }

  for (const name of [
    "AI_REQUIRED_FOR_LAUNCH",
    "SPEECH_REQUIRED_FOR_LAUNCH",
    "TTS_REQUIRED_FOR_LAUNCH",
    "AI_HUMAN_REVIEW_REQUIRED",
  ]) {
    if (env[name] !== "true") {
      failures.push(`${name} 必须显式配置且值精确为 true。`);
    }
  }
  if (env.NODE_ENV !== "production") {
    failures.push("NODE_ENV 必须显式配置且值精确为 production。");
  }
  if (env.AI_PROVIDER !== "xiaomi-mimo") {
    failures.push("AI_PROVIDER 必须精确为 xiaomi-mimo。");
  }
  if (env.SPEECH_PROVIDER !== "xiaomi-mimo-audio-understanding") {
    failures.push(
      "SPEECH_PROVIDER 必须精确为 xiaomi-mimo-audio-understanding。",
    );
  }
  if (env.TTS_PROVIDER !== "xiaomi-mimo-tts") {
    failures.push("TTS_PROVIDER 必须精确为 xiaomi-mimo-tts。");
  }
  if (
    ![
      "mimo-v2.5-tts",
      "mimo-v2.5-tts-voicedesign",
      "mimo-v2.5-tts-voiceclone",
    ].includes(env.TTS_MODEL_VERSION)
  ) {
    failures.push("TTS_MODEL_VERSION 必须是批准的 MiMo TTS 模型。");
  }
  if (!["mp3", "wav"].includes(env.TTS_OUTPUT_FORMAT)) {
    failures.push("TTS_OUTPUT_FORMAT 必须精确为 mp3 或 wav。");
  }

  for (const name of mimoProductionEnv) {
    validateProductionValue(failures, env, name);
  }
  for (const name of requiredMimoPositiveIntegerEnv) {
    validatePositiveSafeIntegerProductionValue(failures, env, name);
  }
  validateBoundedPositiveIntegerProductionValue(failures, env, "PORT", 65_535);
  for (const name of [
    "AI_PROVIDER_TIMEOUT_MS",
    "SPEECH_PROVIDER_TIMEOUT_MS",
    "TTS_PROVIDER_TIMEOUT_MS",
  ]) {
    validateBoundedPositiveIntegerProductionValue(
      failures,
      env,
      name,
      2_147_483_647,
    );
  }
  for (const name of [
    "AI_PROVIDER_MAX_RESPONSE_BYTES",
    "SPEECH_PROVIDER_MAX_RESPONSE_BYTES",
    "TTS_PROVIDER_MAX_RESPONSE_BYTES",
  ]) {
    validateBoundedPositiveIntegerProductionValue(
      failures,
      env,
      name,
      16 * 1024 * 1024,
    );
  }
  validateBoundedPositiveIntegerProductionValue(
    failures,
    env,
    "STT_MAX_DECODED_AUDIO_BYTES",
    11_796_480,
  );

  validateProductionHttpsOrigin(failures, env, "WEB_ORIGIN");
  validateProductionHttpsOrigin(failures, env, "NEXT_PUBLIC_API_BASE_URL");
  const allowedMimoHosts = validateMimoAllowedHosts(failures, env);
  for (const name of [
    "AI_MODEL_ENDPOINT",
    "SPEECH_TO_TEXT_ENDPOINT",
    "TTS_ENDPOINT",
  ]) {
    validateApprovedMimoEndpoint(failures, env, name, allowedMimoHosts);
  }
  validateProductionKeyValueUrl(failures, env);

  const jwtSecret = env.JWT_SECRET?.trim() ?? "";
  if (jwtSecret && jwtSecret.length < 32) {
    failures.push("JWT_SECRET 长度不足 32 字符。");
  }

  const retentionDays = env.PROVIDER_TELEMETRY_RETENTION_DAYS?.trim();
  if (retentionDays) {
    const days = Number(retentionDays);
    if (!Number.isInteger(days) || days < 30 || days > 3650) {
      failures.push(
        "PROVIDER_TELEMETRY_RETENTION_DAYS 必须是 30 到 3650 之间的整数。",
      );
    }
  }
  validateBoundedPositiveIntegerProductionValue(
    failures,
    env,
    "PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS",
    2_147_483_647,
  );

  for (const name of ["MIMO_API_KEY_REF", "SENSITIVE_DATA_KEY_REF"]) {
    const value = env[name]?.trim();
    if (value && !value.startsWith("secret-manager://")) {
      failures.push(
        `${name} 必须使用 secret-manager:// 形式的密钥引用，不能直接填写密钥值。`,
      );
    }
  }

  for (const name of ["MIMO_API_KEY_FILE", "SENSITIVE_DATA_KEY_FILE"]) {
    const value = env[name];
    if (!/^\/etc\/secrets\/[A-Za-z0-9._-]+$/.test(value ?? "")) {
      failures.push(`${name} 必须是 /etc/secrets 下的直接 Secret File 路径。`);
    }
  }

  for (const name of forbiddenRawSecretEnv) {
    if (Object.hasOwn(env, name)) {
      failures.push(`${name} 是明文密钥，生产环境必须使用批准的 Secret File。`);
    }
  }
  for (const name of forbiddenLegacyMimoReferenceEnv) {
    if (Object.hasOwn(env, name)) {
      failures.push(
        `${name} 是已废弃的分能力密钥引用，生产环境只能使用 MIMO_API_KEY_REF。`,
      );
    }
  }

  return { failures };
}

export function checkProductionLaunchScopeConsistency({ env, customerInput }) {
  const failures = [];
  validateLaunchScopeConsistency(failures, {
    envValue: env.AI_REQUIRED_FOR_LAUNCH,
    customerValue: customerInput?.ai?.requiredForLaunch,
    envName: "AI_REQUIRED_FOR_LAUNCH",
    customerPath: "ai.requiredForLaunch",
  });
  validateLaunchScopeConsistency(failures, {
    envValue: env.SPEECH_REQUIRED_FOR_LAUNCH,
    customerValue: customerInput?.speech?.requiredForLaunch,
    envName: "SPEECH_REQUIRED_FOR_LAUNCH",
    customerPath: "speech.requiredForLaunch",
  });
  validateLaunchScopeConsistency(failures, {
    envValue: env.TTS_REQUIRED_FOR_LAUNCH,
    customerValue: customerInput?.tts?.requiredForLaunch,
    envName: "TTS_REQUIRED_FOR_LAUNCH",
    customerPath: "tts.requiredForLaunch",
  });

  return { failures };
}

function validateProductionValue(failures, env, name) {
  const value = env[name]?.trim();
  if (!value) {
    failures.push(`缺少生产环境变量 ${name}。`);
    return;
  }

  validatePresentProductionValue(failures, name, value);
}

function validatePositiveSafeIntegerProductionValue(failures, env, name) {
  const rawValue = env[name];
  if (
    rawValue === undefined ||
    !/^[1-9]\d*$/.test(rawValue) ||
    !Number.isSafeInteger(Number(rawValue))
  ) {
    failures.push(`${name} 必须显式配置为 base-10 正安全整数。`);
  }
}

function validateBoundedPositiveIntegerProductionValue(
  failures,
  env,
  name,
  maximum,
) {
  const rawValue = env[name];
  if (
    rawValue === undefined ||
    !/^[1-9]\d*$/.test(rawValue) ||
    !Number.isSafeInteger(Number(rawValue)) ||
    Number(rawValue) > maximum
  ) {
    failures.push(`${name} 必须显式配置为范围内的 base-10 正安全整数。`);
  }
}

function validateProductionHttpsOrigin(failures, env, name) {
  const value = env[name];
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.origin !== value
    ) {
      throw new Error("invalid origin");
    }
  } catch {
    failures.push(`${name} 必须使用一个精确的正式 HTTPS origin。`);
  }
}

function validateMimoAllowedHosts(failures, env) {
  const rawValue = env.MIMO_ALLOWED_HOSTS;
  const hosts = rawValue?.split(",") ?? [];
  if (
    hosts.length === 0 ||
    hosts.some(
      (host) =>
        !host ||
        host.trim() !== host ||
        host.includes("/") ||
        host.includes(":") ||
        host === "localhost" ||
        host.endsWith(".local") ||
        /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host),
    )
  ) {
    failures.push(
      "MIMO_ALLOWED_HOSTS 必须是逗号分隔、无空白的批准 DNS 主机名列表。",
    );
  }
  return new Set(hosts.map((host) => host.toLowerCase()));
}

function validateApprovedMimoEndpoint(failures, env, name, allowedHosts) {
  const value = env[name];
  try {
    const endpoint = new URL(value);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password ||
      endpoint.port ||
      !allowedHosts.has(endpoint.hostname.toLowerCase())
    ) {
      throw new Error("invalid endpoint");
    }
    for (const queryName of endpoint.searchParams.keys()) {
      if (
        /authorization|api[-_ ]?key|token|secret|password|credential|cookie/i.test(
          queryName,
        )
      ) {
        throw new Error("credential query");
      }
    }
  } catch {
    failures.push(
      `${name} 必须使用 MIMO_ALLOWED_HOSTS 内无凭据的正式 HTTPS endpoint。`,
    );
  }
}

function validateProductionKeyValueUrl(failures, env) {
  try {
    const endpoint = new URL(env.MIMO_KEY_VALUE_URL);
    const host = endpoint.hostname.toLowerCase();
    if (
      (endpoint.protocol !== "redis:" && endpoint.protocol !== "rediss:") ||
      !host ||
      host === "localhost" ||
      host.endsWith(".local") ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
    ) {
      throw new Error("invalid key value url");
    }
  } catch {
    failures.push(
      "MIMO_KEY_VALUE_URL 必须是批准私网 Key Value 的 redis:// 或 rediss:// URL。",
    );
  }
}

function extractMarkdownSection(markdown, title) {
  const pattern = new RegExp(`^## ${escapeRegExp(title)}\\s*$`, "m");
  const match = pattern.exec(markdown);
  if (!match) return "";
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const nextSection = rest.search(/^## /m);
  return nextSection >= 0 ? rest.slice(0, nextSection) : rest;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validatePresentProductionValue(failures, name, value) {
  if (/[<>]/.test(value)) {
    failures.push(`${name} 含占位符，必须替换为正式配置。`);
  }

  const weakReason = weakOrLocalValues.get(value);
  if (weakReason) {
    failures.push(`${name} 使用${weakReason}，必须替换为正式值。`);
  }

  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value)) {
    failures.push(`${name} 指向 localhost，本项必须使用正式环境地址。`);
  }

  if (isDisallowedLaunchMarkerValue(value)) {
    failures.push(
      `${name} 包含 mock/demo/local/manual/fallback 标记，不能作为正式 AI/语音配置。`,
    );
  }
}

function parseLaunchScope(failures, env, name) {
  const value = env[name]?.trim();
  if (!value) {
    failures.push(`缺少生产环境变量 ${name}，必须显式声明 true 或 false。`);
    return undefined;
  }
  if (value !== "true" && value !== "false") {
    failures.push(`${name} 必须显式配置为 true 或 false。`);
    return undefined;
  }
  return value === "true";
}

function validateScopedProductionValues(
  failures,
  env,
  { required, scopeName, names, rawSecretNames = [] },
) {
  if (required === true) {
    for (const name of names) {
      validateProductionValue(failures, env, name);
    }
    for (const name of rawSecretNames) {
      const value = env[name]?.trim();
      if (value) {
        failures.push(
          `${name} 是明文密钥，生产环境必须改用 secret-manager:// 形式的密钥引用。`,
        );
      }
    }
    return;
  }

  if (required === false) {
    for (const name of [...names, ...rawSecretNames]) {
      const value = env[name]?.trim();
      if (value) {
        failures.push(
          `${name} 已配置，但 ${scopeName}=false，不能保留非上线范围的半配置。`,
        );
      }
    }
  }
}

function validateLaunchScopeConsistency(
  failures,
  { envValue, customerValue, envName, customerPath },
) {
  const parsedEnvValue = envValue?.trim();
  if (parsedEnvValue !== "true") {
    failures.push(
      `${envName} 必须显式配置为 true，才能与 ${customerPath} 对齐。`,
    );
    return;
  }

  if (customerValue !== true) {
    failures.push(`${customerPath} 必须在客户资料包中明确为 true。`);
    return;
  }
}

function isDisallowedLaunchMarkerValue(value) {
  return /(^|[^a-z0-9])(mock|demo|local|manual|fallback)([^a-z0-9]|$)/i.test(
    value,
  );
}

export function runDeliveryReadinessChecks({
  rootPackage,
  apiPackage,
  gitignore,
  readme,
  deliveryBoundary,
  productionEnv,
  customerInput,
  gitRef = "HEAD",
  gitCwd = rootDir,
  gitExecFile = execFileSync,
}) {
  const sections = [
    ["package scripts", checkPackageScripts({ rootPackage, apiPackage })],
    ["source package exclusions", checkGitignoreExclusions(gitignore)],
    [
      "delivery documents",
      checkDeliveryDocumentReferences({ readme, deliveryBoundary }),
    ],
    [
      "committed deployment baseline",
      checkCommittedDeploymentBaseline({
        ref: gitRef,
        cwd: gitCwd,
        execFile: gitExecFile,
      }),
    ],
  ];

  if (productionEnv) {
    sections.push([
      "production environment",
      checkProductionEnvironment(productionEnv),
    ]);
    if (customerInput) {
      sections.push([
        "production launch scope",
        checkProductionLaunchScopeConsistency({
          env: productionEnv,
          customerInput,
        }),
      ]);
    }
  }

  return sections.flatMap(([section, result]) =>
    result.failures.map((message) => `[${section}] ${message}`),
  );
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const entries = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    entries[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  return entries;
}

function cli() {
  const rawArgs = process.argv.slice(2);
  const args = new Set(rawArgs);
  const customerInputFlagIndex = rawArgs.indexOf("--customer-input");
  const gitRefFlagIndexes = rawArgs
    .map((argument, index) => (argument === "--git-ref" ? index : -1))
    .filter((index) => index >= 0);
  const customerInputPath =
    customerInputFlagIndex >= 0
      ? rawArgs[customerInputFlagIndex + 1]
      : undefined;
  const gitRef =
    gitRefFlagIndexes.length === 1 ? rawArgs[gitRefFlagIndexes[0] + 1] : "HEAD";
  const productionEnvRequested =
    args.has("--production-env") ||
    process.env.DELIVERY_TARGET === "production";
  if (
    customerInputFlagIndex >= 0 &&
    (!customerInputPath || customerInputPath.startsWith("--"))
  ) {
    console.error(
      "用法：pnpm delivery:check:production -- --customer-input <customer-production-input.json>",
    );
    process.exitCode = 1;
    return;
  }
  if (productionEnvRequested && !customerInputPath) {
    console.error(
      "生产配置检查必须传入客户资料包：pnpm delivery:check:production -- --customer-input <customer-production-input.json>",
    );
    process.exitCode = 1;
    return;
  }
  if (
    gitRefFlagIndexes.length > 1 ||
    (gitRefFlagIndexes.length === 1 && (!gitRef || gitRef.startsWith("--")))
  ) {
    console.error(
      "用法：pnpm delivery:check -- --git-ref <HEAD|full-commit-sha|ref>",
    );
    process.exitCode = 1;
    return;
  }
  const productionEnv = productionEnvRequested
    ? {
        ...readEnvFile(resolve(rootDir, ".env")),
        ...process.env,
      }
    : undefined;
  const customerInput =
    productionEnv && customerInputPath
      ? readJson(resolve(process.cwd(), customerInputPath))
      : undefined;

  const failures = runDeliveryReadinessChecks({
    rootPackage: readJson(resolve(rootDir, "package.json")),
    apiPackage: readJson(resolve(rootDir, "apps/api/package.json")),
    gitignore: readFileSync(resolve(rootDir, ".gitignore"), "utf8"),
    readme: readFileSync(resolve(rootDir, "README.md"), "utf8"),
    deliveryBoundary: readFileSync(
      resolve(rootDir, "docs/delivery-boundary-and-readiness.md"),
      "utf8",
    ),
    productionEnv,
    customerInput,
    gitRef,
  });

  if (failures.length) {
    console.error("交付前检查失败：");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("交付前检查通过。");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}
