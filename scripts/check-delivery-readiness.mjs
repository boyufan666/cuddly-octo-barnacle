#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = resolve(import.meta.dirname, "..");

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

const requiredProductionEnv = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "WEB_ORIGIN",
  "NEXT_PUBLIC_API_BASE_URL",
  "DEFAULT_PATIENT_PASSWORD",
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

export function checkProductionEnvironment(env) {
  const failures = [];

  for (const name of requiredProductionEnv) {
    const value = env[name]?.trim();
    if (!value) {
      failures.push(`缺少生产环境变量 ${name}。`);
      continue;
    }

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
  }

  for (const name of ["WEB_ORIGIN", "NEXT_PUBLIC_API_BASE_URL"]) {
    const value = env[name]?.trim();
    if (value && !value.startsWith("https://")) {
      failures.push(`${name} 必须使用正式 HTTPS 地址。`);
    }
  }

  const jwtSecret = env.JWT_SECRET?.trim() ?? "";
  if (jwtSecret && jwtSecret.length < 32) {
    failures.push("JWT_SECRET 长度不足 32 字符。");
  }

  return { failures };
}

export function runDeliveryReadinessChecks({
  rootPackage,
  apiPackage,
  gitignore,
  productionEnv,
}) {
  const sections = [
    ["package scripts", checkPackageScripts({ rootPackage, apiPackage })],
    ["source package exclusions", checkGitignoreExclusions(gitignore)],
  ];

  if (productionEnv) {
    sections.push([
      "production environment",
      checkProductionEnvironment(productionEnv),
    ]);
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
  const args = new Set(process.argv.slice(2));
  const productionEnv =
    args.has("--production-env") || process.env.DELIVERY_TARGET === "production"
      ? {
          ...readEnvFile(resolve(rootDir, ".env")),
          ...process.env,
        }
      : undefined;

  const failures = runDeliveryReadinessChecks({
    rootPackage: readJson(resolve(rootDir, "package.json")),
    apiPackage: readJson(resolve(rootDir, "apps/api/package.json")),
    gitignore: readFileSync(resolve(rootDir, ".gitignore"), "utf8"),
    productionEnv,
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
