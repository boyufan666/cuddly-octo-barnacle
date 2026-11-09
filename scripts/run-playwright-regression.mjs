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
export const playwrightProviderEnvironmentNames = Object.freeze([
  "AI_REQUIRED_FOR_LAUNCH",
  "AI_HUMAN_REVIEW_REQUIRED",
  "AI_PROVIDER",
  "AI_MODEL_VERSION",
  "AI_MODEL_ENDPOINT",
  "AI_PROMPT_VERSION",
  "AI_PROVIDER_TIMEOUT_MS",
  "AI_PROVIDER_MAX_RESPONSE_BYTES",
  "MIMO_API_KEY_REF",
  "MIMO_API_KEY_FILE",
  "MIMO_API_KEY",
  "MIMO_ALLOWED_HOSTS",
  "SPEECH_REQUIRED_FOR_LAUNCH",
  "SPEECH_PROVIDER",
  "SPEECH_TO_TEXT_ENDPOINT",
  "SPEECH_MODEL_VERSION",
  "SPEECH_PROVIDER_TIMEOUT_MS",
  "SPEECH_PROVIDER_MAX_RESPONSE_BYTES",
  "STT_MAX_DECODED_AUDIO_BYTES",
  "STT_MAX_DURATION_SECONDS",
  "TTS_REQUIRED_FOR_LAUNCH",
  "TTS_PROVIDER",
  "TTS_ENDPOINT",
  "TTS_MODEL_VERSION",
  "TTS_VOICE_ID",
  "TTS_OUTPUT_FORMAT",
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
  "PROVIDER_TELEMETRY_RETENTION_DAYS",
  "PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS",
]);

export function collectPlaywrightProviderEnvironment(
  environment = process.env,
) {
  return Object.fromEntries(
    playwrightProviderEnvironmentNames.flatMap((name) => {
      const value = environment[name];
      return typeof value === "string" ? [[name, value]] : [];
    }),
  );
}

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
  Object.freeze({
    command: "pnpm",
    args: Object.freeze(["--filter", "@rehab-platform/api", "build"]),
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
    ...collectPlaywrightProviderEnvironment(env),
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
