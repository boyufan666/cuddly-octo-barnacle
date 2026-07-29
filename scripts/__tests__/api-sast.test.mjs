import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  apiSastScope,
  buildApiSastReport,
  buildSemgrepRuleTestDockerArguments,
  buildSemgrepScanDockerArguments,
  collectApiSastScope,
  repositoryRoot,
  sanitizeSemgrepReport,
  semgrepImage,
  semgrepVersion,
  validateSemgrepScanCoverage,
} from "../run-api-sast.mjs";

const source = readFileSync(
  resolve(repositoryRoot, "scripts/run-api-sast.mjs"),
  "utf8",
);
const rules = readFileSync(
  resolve(repositoryRoot, "config/semgrep/api-security.yml"),
  "utf8",
);
const workflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/ci.yml"),
  "utf8",
);

const expectedProductionApiSources = [
  "apps/api/src/app.controller.ts",
  "apps/api/src/app.module.ts",
  "apps/api/src/app.service.ts",
  "apps/api/src/auth-session.ts",
  "apps/api/src/auth.guard.ts",
  "apps/api/src/config.ts",
  "apps/api/src/credential-security.ts",
  "apps/api/src/csrf.guard.ts",
  "apps/api/src/current-user.ts",
  "apps/api/src/expected-prisma-migrations.ts",
  "apps/api/src/main.ts",
  "apps/api/src/mimo-high-cost-rate-limit.guard.ts",
  "apps/api/src/mimo-usage-gate.ts",
  "apps/api/src/password-reset.guard.ts",
  "apps/api/src/prisma.service.ts",
  "apps/api/src/production-runtime-event.ts",
  "apps/api/src/provider-operation.service.ts",
  "apps/api/src/provider-operation.ts",
  "apps/api/src/provider-outcome.ts",
  "apps/api/src/provider-request.ts",
  "apps/api/src/provider-telemetry-retention.ts",
  "apps/api/src/provider-telemetry.service.ts",
  "apps/api/src/runtime-readiness.service.ts",
  "apps/api/src/sensitive-encryption.ts",
  "apps/api/src/user-identity.ts",
];

function completeCoverage() {
  return { paths: { scanned: [...apiSastScope] } };
}

function withTemporaryApiSourceRoot(callback) {
  const rootDir = mkdtempSync(join(tmpdir(), "rehab-api-sast-"));
  try {
    mkdirSync(join(rootDir, "apps/api/src"), { recursive: true });
    return callback(rootDir);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

test("API SAST uses an immutable official Semgrep image with an exact expected version", () => {
  assert.equal(
    semgrepImage,
    "semgrep/semgrep@sha256:9349edbadf90c3f3c0c3f55867625354e89680e6fa10d9034042af52fdb0e0d0",
  );
  assert.equal(semgrepVersion, "1.162.0");
  assert.match(source, /actualVersion !== semgrepVersion/);
  assert.doesNotMatch(source, /\b(?:latest|pipx|pip install)\b/i);
});

test("API SAST discovers every current production TypeScript source deterministically", () => {
  assert.deepEqual(apiSastScope, expectedProductionApiSources);
  assert.deepEqual(collectApiSastScope(), expectedProductionApiSources);
});

test("API SAST source discovery excludes only specs and fails closed for unsafe source entries", () => {
  withTemporaryApiSourceRoot((rootDir) => {
    const sourceDir = join(rootDir, "apps/api/src");
    mkdirSync(join(sourceDir, "nested"));
    writeFileSync(join(sourceDir, "main.ts"), "export {};\n");
    writeFileSync(join(sourceDir, "main.spec.ts"), "export {};\n");
    writeFileSync(join(sourceDir, "nested/service.ts"), "export {};\n");
    writeFileSync(join(sourceDir, "nested/service.spec.ts"), "export {};\n");
    writeFileSync(join(sourceDir, "notes.txt"), "not a source file\n");

    assert.deepEqual(collectApiSastScope(rootDir), [
      "apps/api/src/main.ts",
      "apps/api/src/nested/service.ts",
    ]);

    symlinkSync(join(sourceDir, "main.ts"), join(sourceDir, "linked.ts"));
    assert.throws(
      () => collectApiSastScope(rootDir),
      /must not be a symbolic link/,
    );
  });

  withTemporaryApiSourceRoot((rootDir) => {
    mkdirSync(join(rootDir, "apps/api/src/not-a-file.ts"));
    assert.throws(() => collectApiSastScope(rootDir), /must be a regular file/);
  });
});

test("API SAST Semgrep invocation is local-rule, hardened, and fail-closed", () => {
  const argumentsList = buildSemgrepScanDockerArguments({
    rootDir: repositoryRoot,
    rawOutputDirectory: "/tmp/rehab-api-sast-test",
  });
  assert.equal(argumentsList.includes("--network"), true);
  assert.equal(argumentsList.includes("none"), true);
  assert.equal(argumentsList.includes("--read-only"), true);
  assert.equal(argumentsList.includes("--cap-drop"), true);
  assert.equal(argumentsList.includes("ALL"), true);
  assert.equal(argumentsList.includes("--security-opt"), true);
  assert.equal(argumentsList.includes("no-new-privileges"), true);
  assert.equal(argumentsList.includes("/tmp:rw,noexec,nosuid,size=64m"), true);
  assert.equal(argumentsList.includes("HOME=/tmp"), true);
  assert.equal(argumentsList.includes("SEMGREP_SEND_METRICS=off"), true);
  assert.equal(argumentsList.includes("SEMGREP_ENABLE_VERSION_CHECK=0"), true);
  assert.equal(argumentsList.includes(semgrepImage), true);
  assert.equal(argumentsList.includes("--metrics=off"), true);
  assert.equal(argumentsList.includes("--error"), true);
  assert.equal(argumentsList.includes("--json"), true);
  assert.equal(
    argumentsList.includes("/src/config/semgrep/api-security.yml"),
    true,
  );
  assert.equal(argumentsList.includes("--config=auto"), false);
  for (const scopePath of apiSastScope) {
    assert.equal(argumentsList.includes(`/src/${scopePath}`), true);
  }
  const ruleTestArguments = buildSemgrepRuleTestDockerArguments({
    rootDir: repositoryRoot,
  });
  assert.equal(ruleTestArguments.includes("test"), true);
  assert.equal(
    ruleTestArguments.includes("/src/config/semgrep/api-security.test.ts"),
    true,
  );
});

test("API SAST report keeps tool/rule evidence but strips source-bearing Semgrep fields", () => {
  const sanitized = sanitizeSemgrepReport(
    {
      results: [
        {
          check_id: "config.semgrep.rehab-api.no-command-execution",
          path: "/src/apps/api/src/provider-request.ts",
          start: { line: 40, col: 2, offset: 500 },
          end: { line: 41, col: 5, offset: 600 },
          extra: {
            severity: "unexpected-raw-severity",
            message: "patient-secret",
            lines: "exec('patient-secret')",
            metavars: { $COMMAND: { abstract_content: "patient-secret" } },
          },
        },
      ],
      errors: [],
      ...completeCoverage(),
    },
    repositoryRoot,
  );
  const rulesSource = Buffer.from("rules: []\n", "utf8");
  const report = buildApiSastReport({
    rootDir: repositoryRoot,
    rulesSource,
    sanitized,
  });

  assert.equal(report.tool.version, semgrepVersion);
  assert.equal(report.tool.image, semgrepImage);
  assert.equal(
    report.rules.sha256,
    createHash("sha256").update(rulesSource).digest("hex"),
  );
  assert.deepEqual(report.findings, [
    {
      ruleId: "rehab-api.no-command-execution",
      path: "apps/api/src/provider-request.ts",
      start: { line: 40, column: 2 },
      end: { line: 41, column: 5 },
      severity: "ERROR",
      message:
        "Command execution is not permitted in API request, authentication, AI, audio, or training-result code.",
    },
  ]);
  assert.deepEqual(report.scope, apiSastScope);
  assert.deepEqual(
    report.scannedScope,
    [...apiSastScope].sort((left, right) => left.localeCompare(right)),
  );
  assert.doesNotMatch(
    JSON.stringify(report),
    /patient-secret|abstract_content|lines/,
  );
});

test("API SAST canonicalizes only the known Semgrep local-rule prefix and verifies exact scan coverage", () => {
  const rawReport = {
    results: [],
    errors: [],
    ...completeCoverage(),
  };
  assert.deepEqual(
    validateSemgrepScanCoverage(rawReport),
    [...apiSastScope].sort((left, right) => left.localeCompare(right)),
  );
  assert.throws(
    () =>
      sanitizeSemgrepReport({
        ...rawReport,
        results: [
          {
            check_id: "untrusted.prefix.rehab-api.no-command-execution",
            path: "apps/api/src/app.controller.ts",
          },
        ],
      }),
    /outside the pinned local API SAST ruleset/,
  );
  assert.throws(
    () =>
      sanitizeSemgrepReport({
        ...rawReport,
        errors: {},
      }),
    /errors must be an array/,
  );
  assert.throws(
    () =>
      validateSemgrepScanCoverage({
        ...rawReport,
        paths: { scanned: apiSastScope.slice(1) },
      }),
    /must exactly match/,
  );
  assert.throws(
    () =>
      validateSemgrepScanCoverage({
        ...rawReport,
        paths: {
          scanned: [...apiSastScope, "apps/api/src/unexpected.ts"],
        },
      }),
    /outside the requested API SAST scope/,
  );
  assert.throws(
    () =>
      validateSemgrepScanCoverage({
        ...rawReport,
        paths: { scanned: "not-an-array" },
      }),
    /must be an array/,
  );
});

test("API SAST rules use Semgrep AST patterns for auth, provider, and training-result security risks", () => {
  assert.match(rules, /languages: \[typescript, javascript\]/);
  assert.match(rules, /no-command-execution/);
  assert.match(rules, /no-dynamic-code-evaluation/);
  assert.match(rules, /no-tls-verification-bypass/);
  assert.match(rules, /no-weak-cryptographic-hash/);
  assert.match(rules, /no-unsafe-prisma-raw-query/);
  assert.match(rules, /no-insecure-randomness/);
  assert.match(rules, /execFileSync/);
  assert.match(rules, /spawnSync/);
  assert.match(rules, /\bfork\(/);
  assert.match(rules, /runInNewContext/);
  assert.match(rules, /NODE_TLS_REJECT_UNAUTHORIZED/);
  assert.match(rules, /createHmac/);
  assert.match(rules, /sha-1/);
  assert.match(source, /verifyPinnedSemgrepRules/);
  assert.doesNotMatch(rules, /pattern-regex/);
});

test("GitHub CI blocks on API SAST and uploads its non-sensitive report with the fixed retention policy", () => {
  assert.match(
    workflow,
    /Run fixed API Semgrep SAST gate[\s\S]*pnpm verify:api-sast/,
  );
  assert.match(
    workflow,
    /Upload non-sensitive API SAST report[\s\S]*if: always\(\)[\s\S]*actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4\.6\.2[\s\S]*name: api-sast-report[\s\S]*path: output\/api-sast\/\*\*[\s\S]*if-no-files-found: error[\s\S]*retention-days: 14/,
  );
});
