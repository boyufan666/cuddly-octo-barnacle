#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolvePlaywrightRegressionEnvironment } from "./playwright-regression-environment.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const playwrightRegressionOutputDirectory = resolve(
  repositoryRoot,
  "output/playwright",
);
const managedScreenshotPattern = /^web-regression-.*\.png$/;
export const playwrightBusinessProjects = Object.freeze([
  "chromium-1280",
  "chromium-1366",
  "chromium-1440",
  "chromium-pixel",
  "chromium-iphone",
]);

export const playwrightRegressionCommands = Object.freeze([
  Object.freeze({
    command: "pnpm",
    args: Object.freeze(["--filter", "@rehab-platform/web", "build"]),
  }),
  Object.freeze({
    command: "pnpm",
    args: Object.freeze(["--filter", "@rehab-platform/db", "build"]),
  }),
  ...playwrightBusinessProjects.flatMap((project) => [
    Object.freeze({
      command: "pnpm",
      args: Object.freeze([
        "--filter",
        "@rehab-platform/db",
        "exec",
        "prisma",
        "migrate",
        "reset",
        "--force",
        "--skip-seed",
      ]),
    }),
    Object.freeze({
      command: "pnpm",
      args: Object.freeze([
        "--filter",
        "@rehab-platform/db",
        "exec",
        "tsx",
        "prisma/seed.ts",
      ]),
    }),
    Object.freeze({
      command: "pnpm",
      args: Object.freeze([
        "exec",
        "playwright",
        "test",
        "--config",
        "scripts/playwright-regression.config.mjs",
        "--project",
        project,
      ]),
    }),
  ]),
]);

function runChild(entry, environment) {
  const result = spawnSync(entry.command, entry.args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${entry.command} ${entry.args.join(" ")} failed with status ${String(result.status)}.`,
    );
  }
}

export function cleanPlaywrightRegressionArtifacts(
  outputDirectory = playwrightRegressionOutputDirectory,
) {
  rmSync(join(outputDirectory, "test-results"), {
    force: true,
    recursive: true,
  });

  if (!existsSync(outputDirectory)) return;

  for (const entry of readdirSync(outputDirectory)) {
    if (managedScreenshotPattern.test(entry)) {
      rmSync(join(outputDirectory, entry), { force: true, recursive: true });
    }
  }
}

export function runPlaywrightRegression(
  env = process.env,
  executeCommand = runChild,
  cleanArtifacts = cleanPlaywrightRegressionArtifacts,
) {
  const input = resolvePlaywrightRegressionEnvironment(env);
  const childEnvironment = {
    ...env,
    DATABASE_URL: input.databaseUrl,
    DEFAULT_PATIENT_PASSWORD: input.seedPassword,
    JWT_SECRET: input.jwtSecret,
    COOKIE_SECURE: input.cookieSecure,
    PUBLIC_CREDENTIAL_THROTTLE_LIMIT: input.throttleLimit,
    PUBLIC_CREDENTIAL_THROTTLE_TTL_MS: input.throttleTtlMs,
    SENSITIVE_DATA_KEY_REF: input.sensitiveDataKeyRef,
    SENSITIVE_DATA_KEY: input.sensitiveDataKey,
    NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${input.apiPort}`,
  };
  cleanArtifacts();
  for (const entry of playwrightRegressionCommands) {
    executeCommand(entry, childEnvironment);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    runPlaywrightRegression();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
