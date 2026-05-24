#!/usr/bin/env node

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
  "infra/data",
  "客户提供/",
  ".playwright-cli/",
  ".playwright-mcp/",
];
const requiredDeliveryDocumentRefs = [
  "docs/formal-delivery-acceptance-runbook.md",
  "docs/customer-production-input-checklist.md",
  "docs/customer-final-input-request.md",
  "docs/customer-input-to-launch-gate-runbook.md",
  "docs/ai-speech-provider-selection-free-first.md",
  "docs/customer-delivery-progress-and-input-summary.md",
  "docs/templates/customer-production-input.template.json",
  "docs/browser-pose-field-acceptance-runbook.md",
];

const requiredProductionEnv = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "WEB_ORIGIN",
  "NEXT_PUBLIC_API_BASE_URL",
  "DEFAULT_PATIENT_PASSWORD",
];
const aiProductionEnv = [
  "AI_PROVIDER",
  "AI_MODEL_VERSION",
  "AI_MODEL_ENDPOINT",
  "AI_API_KEY_REF",
  "AI_PROMPT_VERSION",
  "AI_CALL_LOG_RETENTION_DAYS",
  "AI_HUMAN_REVIEW_REQUIRED",
];
const speechProductionEnv = [
  "SPEECH_PROVIDER",
  "SPEECH_TO_TEXT_ENDPOINT",
  "SPEECH_API_KEY_REF",
  "SPEECH_MODEL_VERSION",
];

const weakOrLocalValues = new Map([
  ["253913", "固定本地密码"],
  ["dev-rehab-platform-secret", "开发 JWT 密钥"],
]);

export function checkPackageScripts({ rootPackage, apiPackage }) {
  const failures = [];
  const rootScripts = rootPackage.scripts ?? {};
  const apiScripts = apiPackage.scripts ?? {};

  if (rootScripts["delivery:check"] !== "node scripts/check-delivery-readiness.mjs") {
    failures.push("root package 缺少 delivery:check 交付检查脚本。");
  }

  if (
    rootScripts["delivery:check:production"] !==
    "node scripts/check-delivery-readiness.mjs --production-env"
  ) {
    failures.push("root package 缺少 delivery:check:production 生产配置检查脚本。");
  }

  if (rootScripts["test:delivery"] !== "node --test scripts/__tests__/*.test.mjs") {
    failures.push("root package 缺少 test:delivery 交付检查测试脚本。");
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
    rootScripts["verify:customer-production-input"] !==
    "node scripts/verify-customer-production-input.mjs"
  ) {
    failures.push(
      "root package 缺少 verify:customer-production-input 客户生产资料包校验脚本。",
    );
  }

  if (/\s--fix(?:\s|$)/.test(apiScripts.lint ?? "")) {
    failures.push("api lint 包含 --fix，会修改文件，不适合作为交付前纯检查命令。");
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
    .map((entry) => `.gitignore 缺少 ${entry}，正式源码包可能混入本地或历史资料。`);

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
      failures.push(`delivery-boundary-and-readiness.md 缺少 ${ref} 交付文档索引。`);
    }
  }

  return { failures };
}

export function checkProductionEnvironment(env) {
  const failures = [];

  for (const name of requiredProductionEnv) {
    validateProductionValue(failures, env, name);
  }

  const aiRequired = parseLaunchScope(failures, env, "AI_REQUIRED_FOR_LAUNCH");
  const speechRequired = parseLaunchScope(failures, env, "SPEECH_REQUIRED_FOR_LAUNCH");

  validateScopedProductionValues(failures, env, {
    required: aiRequired,
    scopeName: "AI_REQUIRED_FOR_LAUNCH",
    names: aiProductionEnv,
  });
  validateScopedProductionValues(failures, env, {
    required: speechRequired,
    scopeName: "SPEECH_REQUIRED_FOR_LAUNCH",
    names: speechProductionEnv,
  });

  for (const name of [
    "WEB_ORIGIN",
    "NEXT_PUBLIC_API_BASE_URL",
    "AI_MODEL_ENDPOINT",
    "SPEECH_TO_TEXT_ENDPOINT",
  ]) {
    const value = env[name]?.trim();
    if (value && !value.startsWith("https://")) {
      failures.push(`${name} 必须使用正式 HTTPS 地址。`);
    }
  }

  const jwtSecret = env.JWT_SECRET?.trim() ?? "";
  if (jwtSecret && jwtSecret.length < 32) {
    failures.push("JWT_SECRET 长度不足 32 字符。");
  }

  const aiRetentionDays = env.AI_CALL_LOG_RETENTION_DAYS?.trim();
  if (aiRetentionDays) {
    const days = Number(aiRetentionDays);
    if (!Number.isInteger(days) || days < 30 || days > 3650) {
      failures.push("AI_CALL_LOG_RETENTION_DAYS 必须是 30 到 3650 之间的整数。");
    }
  }

  if (aiRequired === true && env.AI_HUMAN_REVIEW_REQUIRED?.trim() !== "true") {
    failures.push("AI_HUMAN_REVIEW_REQUIRED 必须显式配置为 true。");
  }

  for (const name of ["AI_API_KEY_REF", "SPEECH_API_KEY_REF"]) {
    const value = env[name]?.trim();
    if (value && !value.startsWith("secret-manager://")) {
      failures.push(`${name} 必须使用 secret-manager:// 形式的密钥引用，不能直接填写密钥值。`);
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

  if (isDemoMockOrLocalValue(value)) {
    failures.push(`${name} 包含 mock/demo/local 标记，不能作为正式 AI/语音配置。`);
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

function validateScopedProductionValues(failures, env, { required, scopeName, names }) {
  if (required === true) {
    for (const name of names) {
      validateProductionValue(failures, env, name);
    }
    return;
  }

  if (required === false) {
    for (const name of names) {
      const value = env[name]?.trim();
      if (value) {
        failures.push(`${name} 已配置，但 ${scopeName}=false，不能保留非上线范围的半配置。`);
      }
    }
  }
}

function validateLaunchScopeConsistency(
  failures,
  { envValue, customerValue, envName, customerPath },
) {
  const parsedEnvValue = envValue?.trim();
  if (parsedEnvValue !== "true" && parsedEnvValue !== "false") {
    failures.push(`${envName} 必须显式配置为 true 或 false，才能与 ${customerPath} 对齐。`);
    return;
  }

  if (typeof customerValue !== "boolean") {
    failures.push(`${customerPath} 必须是客户资料包中的布尔值。`);
    return;
  }

  if ((parsedEnvValue === "true") !== customerValue) {
    failures.push(`${envName} 必须与客户资料包 ${customerPath} 保持一致。`);
  }
}

function isDemoMockOrLocalValue(value) {
  return /(^|[^a-z0-9])(mock|demo|local)([^a-z0-9]|$)/i.test(value);
}

export function runDeliveryReadinessChecks({
  rootPackage,
  apiPackage,
  gitignore,
  readme,
  deliveryBoundary,
  productionEnv,
  customerInput,
}) {
  const sections = [
    ["package scripts", checkPackageScripts({ rootPackage, apiPackage })],
    ["source package exclusions", checkGitignoreExclusions(gitignore)],
    [
      "delivery documents",
      checkDeliveryDocumentReferences({ readme, deliveryBoundary }),
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
        checkProductionLaunchScopeConsistency({ env: productionEnv, customerInput }),
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
  const customerInputPath =
    customerInputFlagIndex >= 0 ? rawArgs[customerInputFlagIndex + 1] : undefined;
  const productionEnvRequested =
    args.has("--production-env") || process.env.DELIVERY_TARGET === "production";
  if (customerInputFlagIndex >= 0 && (!customerInputPath || customerInputPath.startsWith("--"))) {
    console.error("用法：pnpm delivery:check:production -- --customer-input <customer-production-input.json>");
    process.exitCode = 1;
    return;
  }
  if (productionEnvRequested && !customerInputPath) {
    console.error("生产配置检查必须传入客户资料包：pnpm delivery:check:production -- --customer-input <customer-production-input.json>");
    process.exitCode = 1;
    return;
  }
  const productionEnv =
    productionEnvRequested
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
