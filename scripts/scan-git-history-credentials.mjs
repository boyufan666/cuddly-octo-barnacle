#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const defaultRepositoryRoot = fileURLToPath(new URL("..", import.meta.url));

// Every command returns paths only. A possible credential must never reach CI output.
const credentialDetectors = Object.freeze([
  Object.freeze({
    id: "private-key",
    pattern: "-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----",
  }),
  Object.freeze({
    id: "github-token",
    pattern: "gh[pousr]_[A-Za-z0-9_]{30,}",
  }),
  Object.freeze({
    id: "gitlab-token",
    pattern: "glpat-[A-Za-z0-9_-]{20,}",
  }),
  Object.freeze({
    id: "aws-access-key-id",
    pattern: "AKIA[0-9A-Z]{16}",
  }),
  Object.freeze({
    id: "slack-token",
    pattern: "xox[baprs]-[A-Za-z0-9-]{20,}",
  }),
  Object.freeze({
    id: "assigned-high-entropy-credential",
    pattern:
      "(api[_-]?[Kk]ey|api[_-]?[Tt]oken|access[_-]?[Tt]oken|secret[_-]?([Kk]ey|[Tt]oken)|private[_-]?[Kk]ey)[[:space:]]*[:=][[:space:]]*['\"]?[A-Za-z0-9_./+=-]{24,}",
  }),
]);

const assignedHighEntropyCredentialPattern =
  /(api[_-]?[Kk]ey|api[_-]?[Tt]oken|access[_-]?[Tt]oken|secret[_-]?([Kk]ey|[Tt]oken)|private[_-]?[Kk]ey)[ \t]*[:=][ \t]*["']?([A-Za-z0-9_./+=-]{24,})/g;

// These fixed digests cover synthetic redaction sentinels in tests only. The
// scanner reads the staged or historical blob and permits a file only when all
// candidate values match its exact allowlist; a changed or newly added value
// remains a blocking finding.
const knownSyntheticTestCredentialDigests = Object.freeze({
  "apps/api/src/production-runtime-event.spec.ts": new Set([
    "dffa3f68fe13",
  ]),
  "apps/api/src/provider-request.spec.ts": new Set(["c315f50948f1"]),
  "scripts/__tests__/ai-assessment-acceptance.test.mjs": new Set([
    "497d29bd103a",
    "2a791efb1ec3",
  ]),
  "scripts/__tests__/speech-ai-assessment-acceptance.test.mjs": new Set([
    "d7ff007674d3",
  ]),
  "scripts/__tests__/speech-transcript-acceptance.test.mjs": new Set([
    "d7ff007674d3",
  ]),
  "scripts/__tests__/tts-speech-output-acceptance.test.mjs": new Set([
    "d7ff007674d3",
  ]),
});

function runGit(args, { cwd = defaultRepositoryRoot, run = spawnSync } = {}) {
  const result = run("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function isKnownSyntheticTestCredential({
  cwd,
  source,
  path,
  run = spawnSync,
}) {
  const allowedDigests = knownSyntheticTestCredentialDigests[path];
  if (!allowedDigests) return false;

  const object = source === "index" ? `:${path}` : `${source}:${path}`;
  const result = runGit(["show", object], { cwd, run });
  if (result.status !== 0) return false;

  const matches = [...result.stdout.matchAll(assignedHighEntropyCredentialPattern)];
  return (
    matches.length > 0 &&
    matches.every((match) =>
      allowedDigests.has(
        createHash("sha256").update(match[3]).digest("hex").slice(0, 12),
      ),
    )
  );
}

export function listReachableCommits(options = {}) {
  const result = runGit(["rev-list", "--all"], options);
  if (result.status !== 0) {
    throw new Error(
      "Unable to enumerate reachable Git history for credential scanning.",
    );
  }
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

export function scanGitHistoryCredentials({
  cwd = defaultRepositoryRoot,
  detectors = credentialDetectors,
  run = spawnSync,
} = {}) {
  const findings = [];
  for (const commit of listReachableCommits({ cwd, run })) {
    for (const detector of detectors) {
      const result = runGit(
        ["grep", "-I", "-l", "-E", "-e", detector.pattern, commit, "--"],
        { cwd, run },
      );
      if (result.status === 1) continue;
      if (result.status !== 0) {
        throw new Error(
          `Credential scanner could not inspect commit ${commit.slice(0, 12)}.`,
        );
      }
      for (const outputPath of result.stdout.split(/\r?\n/).filter(Boolean)) {
        const prefix = `${commit}:`;
        const path = outputPath.startsWith(prefix)
          ? outputPath.slice(prefix.length)
          : outputPath;
        if (
          detector.id === "assigned-high-entropy-credential" &&
          isKnownSyntheticTestCredential({ cwd, source: commit, path, run })
        ) {
          continue;
        }
        findings.push({ commit, path, detector: detector.id });
      }
    }
  }
  return findings;
}

export function listStagedCandidatePaths({
  cwd = defaultRepositoryRoot,
  run = spawnSync,
} = {}) {
  const result = runGit(
    [
      "diff",
      "--cached",
      "--no-renames",
      "--name-only",
      "-z",
      "--diff-filter=AM",
      "--",
    ],
    { cwd, run },
  );
  if (result.status !== 0) {
    throw new Error(
      "Unable to enumerate staged candidate files for credential scanning.",
    );
  }
  return result.stdout.split("\0").filter(Boolean);
}

export function scanGitIndexCredentials({
  cwd = defaultRepositoryRoot,
  detectors = credentialDetectors,
  run = spawnSync,
} = {}) {
  const candidatePaths = listStagedCandidatePaths({ cwd, run });
  if (candidatePaths.length === 0) return [];

  const findings = [];
  for (const detector of detectors) {
    const result = runGit(
      [
        "grep",
        "--cached",
        "-l",
        "-z",
        "-E",
        "-e",
        detector.pattern,
        "--",
        ...candidatePaths,
      ],
      { cwd, run },
    );
    if (result.status === 1) continue;
    if (result.status !== 0) {
      throw new Error(
        "Credential scanner could not inspect the staged Git index.",
      );
    }
    for (const path of result.stdout.split("\0").filter(Boolean)) {
      if (
        detector.id === "assigned-high-entropy-credential" &&
        isKnownSyntheticTestCredential({ cwd, source: "index", path, run })
      ) {
        continue;
      }
      findings.push({ source: "index", path, detector: detector.id });
    }
  }
  return findings;
}

export function formatCredentialFindings(findings) {
  return findings.map(
    ({ commit, source, path, detector }) =>
      `- ${source === "index" ? "index" : commit.slice(0, 12)} ${path} (${detector})`,
  );
}

function main() {
  const findings = [
    ...scanGitHistoryCredentials(),
    ...scanGitIndexCredentials(),
  ];
  if (findings.length === 0) {
    process.stdout.write(
      "Git history and staged candidate credential scan passed.\n",
    );
    return;
  }
  process.stderr.write(
    `Git history or staged candidate credential scan found ${findings.length} possible credential(s). Content is intentionally redacted.\n${formatCredentialFindings(findings).join("\n")}\n`,
  );
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
