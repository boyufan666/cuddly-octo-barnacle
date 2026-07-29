#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptDirectory, "..");
export const semgrepImage =
  "semgrep/semgrep@sha256:9349edbadf90c3f3c0c3f55867625354e89680e6fa10d9034042af52fdb0e0d0";
export const semgrepVersion = "1.162.0";
export const rulesPath = resolve(
  repositoryRoot,
  "config/semgrep/api-security.yml",
);
export const outputDirectory = resolve(repositoryRoot, "output/api-sast");
export const outputFileName = "api-sast-report.json";
export const apiSastSourceDirectory = "apps/api/src";
export const apiSastRuleTestPath = "config/semgrep/api-security.test.ts";
export const semgrepLocalRuleIdPrefix = "config.semgrep.";
export const apiSastRuleMessages = Object.freeze({
  "rehab-api.no-command-execution":
    "Command execution is not permitted in API request, authentication, AI, audio, or training-result code.",
  "rehab-api.no-dynamic-code-evaluation":
    "Dynamic code evaluation is not permitted in API request, authentication, AI, audio, or training-result code.",
  "rehab-api.no-tls-verification-bypass":
    "TLS verification must not be disabled for authentication, AI, audio, or training-result provider traffic.",
  "rehab-api.no-weak-cryptographic-hash":
    "MD5 and SHA-1 are not permitted for authentication, AI, audio, or training-result security decisions.",
  "rehab-api.no-unsafe-prisma-raw-query":
    "Unsafe Prisma raw SQL is not permitted in authentication, AI, audio, or training-result request paths.",
  "rehab-api.no-insecure-randomness":
    "Math.random is not permitted for authentication, AI, audio, or training-result identifiers, tokens, or security controls.",
});

export class ApiSastError extends Error {}

function relativePathWithinRoot(rootDir, candidate, label) {
  const pathFromRoot = relative(rootDir, candidate);
  if (
    pathFromRoot === "" ||
    pathFromRoot.startsWith("..") ||
    isAbsolute(pathFromRoot)
  ) {
    throw new ApiSastError(`${label} is outside the repository.`);
  }
  return pathFromRoot.replaceAll(sep, "/");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactString(value, label) {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new ApiSastError(`${label} must be an exact non-empty string.`);
  }
  return value;
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function sourcePath(rootDir, scopePath) {
  const candidate = resolve(rootDir, scopePath);
  relativePathWithinRoot(rootDir, candidate, `API SAST scope ${scopePath}`);
  let stat;
  try {
    stat = lstatSync(candidate);
  } catch {
    throw new ApiSastError(`API SAST scope source is missing: ${scopePath}.`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new ApiSastError(
      `API SAST scope source must be a regular file: ${scopePath}.`,
    );
  }
  return candidate;
}

function sourceDirectoryPath(rootDir, relativeDirectory) {
  const candidate = resolve(rootDir, relativeDirectory);
  relativePathWithinRoot(
    rootDir,
    candidate,
    `API SAST source directory ${relativeDirectory}`,
  );
  let stat;
  try {
    stat = lstatSync(candidate);
  } catch {
    throw new ApiSastError(
      `API SAST source directory is missing: ${relativeDirectory}.`,
    );
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new ApiSastError(
      `API SAST source directory must be a real directory: ${relativeDirectory}.`,
    );
  }
  return candidate;
}

export function collectApiSastScope(rootDir = repositoryRoot) {
  const resolvedRoot = resolve(rootDir);
  const sourceDirectory = sourceDirectoryPath(
    resolvedRoot,
    apiSastSourceDirectory,
  );
  const sourceFiles = [];

  function visit(directory) {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      throw new ApiSastError(
        `API SAST source directory cannot be read: ${relativePathWithinRoot(resolvedRoot, directory, "API SAST source directory")}.`,
      );
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const candidate = resolve(directory, entry.name);
      const relativeCandidate = relativePathWithinRoot(
        resolvedRoot,
        candidate,
        `API SAST source path ${entry.name}`,
      );
      if (entry.isSymbolicLink()) {
        throw new ApiSastError(
          `API SAST source path must not be a symbolic link: ${relativeCandidate}.`,
        );
      }
      if (entry.isDirectory()) {
        if (entry.name.endsWith(".ts")) {
          throw new ApiSastError(
            `API SAST source path must be a regular file: ${relativeCandidate}.`,
          );
        }
        visit(candidate);
        continue;
      }
      if (!entry.isFile()) {
        throw new ApiSastError(
          `API SAST source path must be a regular file or directory: ${relativeCandidate}.`,
        );
      }
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".spec.ts")) {
        continue;
      }
      sourcePath(resolvedRoot, relativeCandidate);
      sourceFiles.push(relativeCandidate);
    }
  }

  visit(sourceDirectory);
  if (sourceFiles.length === 0) {
    throw new ApiSastError("API SAST source scope must not be empty.");
  }
  return Object.freeze(sourceFiles);
}

export const apiSastScope = collectApiSastScope();

function normaliseReportPath(rootDir, value) {
  const path = exactString(value, "Semgrep finding path").replaceAll("\\", "/");
  const normalizedRoot = resolve(rootDir).replaceAll("\\", "/");
  if (path.startsWith(`${normalizedRoot}/`)) {
    return path.slice(normalizedRoot.length + 1);
  }
  if (path.startsWith("/src/")) {
    return path.slice("/src/".length);
  }
  if (path.startsWith("/") || path.startsWith("../") || path.includes("/../")) {
    throw new ApiSastError(
      "Semgrep finding path must resolve inside the repository.",
    );
  }
  return path;
}

export function canonicalizeSemgrepRuleId(value, label) {
  const reportedRuleId = exactString(value, label);
  const ruleId = reportedRuleId.startsWith(semgrepLocalRuleIdPrefix)
    ? reportedRuleId.slice(semgrepLocalRuleIdPrefix.length)
    : reportedRuleId;
  if (!Object.hasOwn(apiSastRuleMessages, ruleId)) {
    throw new ApiSastError(
      `${label} references a rule outside the pinned local API SAST ruleset.`,
    );
  }
  return ruleId;
}

function position(value) {
  if (!isRecord(value)) return {};
  const line = safeInteger(value.line);
  const column = safeInteger(value.col);
  return {
    ...(line === undefined ? {} : { line }),
    ...(column === undefined ? {} : { column }),
  };
}

export function validateSemgrepScanCoverage(
  rawReport,
  rootDir = repositoryRoot,
  scope = apiSastScope,
) {
  if (!isRecord(rawReport) || !isRecord(rawReport.paths)) {
    throw new ApiSastError(
      "Semgrep did not emit paths metadata for API SAST coverage verification.",
    );
  }
  if (!Array.isArray(rawReport.paths.scanned)) {
    throw new ApiSastError(
      "Semgrep scanned-path metadata must be an array for API SAST coverage verification.",
    );
  }
  const scannedScope = rawReport.paths.scanned.map((value, index) => {
    const path = normaliseReportPath(
      rootDir,
      exactString(value, `Semgrep scanned path ${index}`),
    );
    if (!scope.includes(path)) {
      throw new ApiSastError(
        "Semgrep scanned a path outside the requested API SAST scope.",
      );
    }
    return path;
  });
  const uniqueScannedScope = [...new Set(scannedScope)].sort((left, right) =>
    left.localeCompare(right),
  );
  const expectedScope = [...scope].sort((left, right) =>
    left.localeCompare(right),
  );
  if (
    scannedScope.length !== uniqueScannedScope.length ||
    uniqueScannedScope.length !== expectedScope.length ||
    uniqueScannedScope.some((path, index) => path !== expectedScope[index])
  ) {
    throw new ApiSastError(
      "Semgrep scanned scope must exactly match the requested API SAST scope.",
    );
  }
  return Object.freeze(uniqueScannedScope);
}

export function sanitizeSemgrepReport(
  rawReport,
  rootDir = repositoryRoot,
  scope = apiSastScope,
) {
  if (!isRecord(rawReport) || !Array.isArray(rawReport.results)) {
    throw new ApiSastError(
      "Semgrep did not emit a JSON report with a results array.",
    );
  }
  if (!Array.isArray(rawReport.errors)) {
    throw new ApiSastError("Semgrep report errors must be an array.");
  }
  const scannedScope = validateSemgrepScanCoverage(rawReport, rootDir, scope);
  const findings = rawReport.results.map((result, index) => {
    if (!isRecord(result)) {
      throw new ApiSastError(`Semgrep result ${index} is invalid.`);
    }
    const ruleId = canonicalizeSemgrepRuleId(
      result.check_id,
      `Semgrep result ${index} check_id`,
    );
    const message = apiSastRuleMessages[ruleId];
    const path = normaliseReportPath(rootDir, result.path);
    if (!scope.includes(path)) {
      throw new ApiSastError(
        `Semgrep result ${index} is outside the pinned API SAST scope.`,
      );
    }
    return {
      ruleId,
      path,
      start: position(result.start),
      end: position(result.end),
      severity: "ERROR",
      message,
    };
  });
  findings.sort((left, right) =>
    `${left.path}:${left.start.line ?? 0}:${left.start.column ?? 0}:${left.ruleId}`.localeCompare(
      `${right.path}:${right.start.line ?? 0}:${right.start.column ?? 0}:${right.ruleId}`,
    ),
  );
  return {
    findings,
    errorCount: rawReport.errors.length,
    scannedScope,
  };
}

export function buildApiSastReport({
  rootDir = repositoryRoot,
  rulesSource,
  sanitized,
  scope = apiSastScope,
  version = semgrepVersion,
} = {}) {
  return {
    format: "rehab-platform/api-sast-report/v1",
    tool: {
      name: "Semgrep Community Edition",
      version: exactString(version, "Semgrep version"),
      image: semgrepImage,
    },
    rules: {
      path: relative(rootDir, rulesPath),
      sha256: sha256(rulesSource),
    },
    scope: [...scope],
    scannedScope: [...sanitized.scannedScope],
    findings: sanitized.findings,
    errorCount: sanitized.errorCount,
  };
}

function runDocker(argumentsList, { rootDir, run = spawnSync } = {}) {
  const result = run("docker", argumentsList, {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) {
    throw new ApiSastError(
      `Unable to run pinned Semgrep container: ${result.error.message}`,
    );
  }
  return result;
}

function dockerBaseArguments() {
  return [
    "run",
    "--rm",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m",
    "--env",
    "HOME=/tmp",
    "--env",
    "SEMGREP_SEND_METRICS=off",
    "--env",
    "SEMGREP_ENABLE_VERSION_CHECK=0",
  ];
}

function inspectPinnedSemgrepVersion({ rootDir, run }) {
  const result = runDocker(
    [...dockerBaseArguments(), semgrepImage, "semgrep", "--version"],
    { rootDir, run },
  );
  if (result.status !== 0) {
    throw new ApiSastError(
      `Pinned Semgrep image version check failed: ${(result.stderr || "unknown Docker failure").trim()}`,
    );
  }
  const actualVersion = (result.stdout ?? "").trim();
  if (actualVersion !== semgrepVersion) {
    throw new ApiSastError(
      `Pinned Semgrep image version must be ${semgrepVersion}; received ${actualVersion || "no version output"}.`,
    );
  }
  return actualVersion;
}

export function buildSemgrepRuleTestDockerArguments({ rootDir }) {
  return [
    ...dockerBaseArguments(),
    "--mount",
    `type=bind,source=${rootDir},target=/src,readonly`,
    "--workdir",
    "/src",
    semgrepImage,
    "semgrep",
    "test",
    "--config",
    "/src/config/semgrep/api-security.yml",
    `/src/${apiSastRuleTestPath}`,
  ];
}

function verifyPinnedSemgrepRules({ rootDir, run }) {
  const result = runDocker(buildSemgrepRuleTestDockerArguments({ rootDir }), {
    rootDir,
    run,
  });
  if (result.status !== 0) {
    throw new ApiSastError(
      `Pinned Semgrep rule regression failed: ${(result.stderr || "unknown Docker failure").trim()}`,
    );
  }
}

export function buildSemgrepScanDockerArguments({
  rootDir,
  rawOutputDirectory,
  scope = apiSastScope,
}) {
  return [
    ...dockerBaseArguments(),
    "--mount",
    `type=bind,source=${rootDir},target=/src,readonly`,
    "--mount",
    `type=bind,source=${rawOutputDirectory},target=/out`,
    "--workdir",
    "/src",
    semgrepImage,
    "semgrep",
    "scan",
    "--metrics=off",
    "--config",
    "/src/config/semgrep/api-security.yml",
    "--error",
    "--json",
    "--output",
    "/out/semgrep.raw.json",
    "--jobs",
    "1",
    ...scope.map((scopePath) => `/src/${scopePath}`),
  ];
}

function writeDeterministicJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createRawOutputDirectory(rootDir) {
  // Colima only guarantees bind mounts for the shared repository tree, not macOS /var/folders.
  const parentDirectory = resolve(rootDir, "output", "api-sast");
  mkdirSync(parentDirectory, { recursive: true });
  return mkdtempSync(join(parentDirectory, ".raw-"));
}

export function runApiSast({
  rootDir = repositoryRoot,
  reportOutputDirectory = outputDirectory,
  run = spawnSync,
} = {}) {
  const resolvedRoot = resolve(rootDir);
  const rulesSource = readFileSync(rulesPath);
  const scope = collectApiSastScope(resolvedRoot);
  for (const scopePath of scope) {
    sourcePath(resolvedRoot, scopePath);
  }
  const actualVersion = inspectPinnedSemgrepVersion({
    rootDir: resolvedRoot,
    run,
  });
  verifyPinnedSemgrepRules({ rootDir: resolvedRoot, run });
  const rawOutputDirectory = createRawOutputDirectory(resolvedRoot);
  const rawOutputPath = join(rawOutputDirectory, "semgrep.raw.json");
  let scanResult;
  try {
    scanResult = runDocker(
      buildSemgrepScanDockerArguments({
        rootDir: resolvedRoot,
        rawOutputDirectory,
        scope,
      }),
      { rootDir: resolvedRoot, run },
    );
    if (!existsSync(rawOutputPath)) {
      throw new ApiSastError(
        "Pinned Semgrep scan did not produce its required JSON report.",
      );
    }
    let rawReport;
    try {
      rawReport = JSON.parse(readFileSync(rawOutputPath, "utf8"));
    } catch {
      throw new ApiSastError("Pinned Semgrep scan report is not valid JSON.");
    }
    const sanitized = sanitizeSemgrepReport(rawReport, resolvedRoot, scope);
    const report = buildApiSastReport({
      rootDir: resolvedRoot,
      rulesSource,
      sanitized,
      scope,
      version: actualVersion,
    });
    const reportPath = join(resolve(reportOutputDirectory), outputFileName);
    writeDeterministicJson(reportPath, report);
    if (
      scanResult.status !== 0 ||
      report.errorCount > 0 ||
      report.findings.length > 0
    ) {
      throw new ApiSastError(
        `API SAST gate failed with ${report.findings.length} finding(s) and ${report.errorCount} Semgrep error(s).`,
      );
    }
    return { report, reportPath };
  } finally {
    rmSync(rawOutputDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = runApiSast();
    process.stdout.write(
      `API SAST gate passed with Semgrep ${result.report.tool.version}. Report: ${result.reportPath}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
