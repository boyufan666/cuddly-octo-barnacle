import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  formatCredentialFindings,
  scanGitHistoryCredentials,
  scanGitIndexCredentials,
} from "../scan-git-history-credentials.mjs";

function runGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function commit(cwd, path, content) {
  writeFileSync(join(cwd, path), content);
  runGit(cwd, ["add", path]);
  runGit(cwd, ["commit", "-m", `add ${path}`]);
}

test("Git history scanner reports only location and detector, never matched content", () => {
  const cwd = mkdtempSync(join(tmpdir(), "rehab-credential-scan-"));
  const fakeToken = `ghp_${"a".repeat(36)}`;
  try {
    runGit(cwd, ["init"]);
    runGit(cwd, ["config", "user.email", "ci@example.invalid"]);
    runGit(cwd, ["config", "user.name", "CI Test"]);
    commit(cwd, "safe.txt", "safe fixture\n");
    assert.deepEqual(scanGitHistoryCredentials({ cwd }), []);

    commit(cwd, "exposed.env", `GITHUB_TOKEN=${fakeToken}\n`);
    const findings = scanGitHistoryCredentials({ cwd });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].path, "exposed.env");
    assert.equal(findings[0].detector, "github-token");
    const formatted = formatCredentialFindings(findings).join("\n");
    assert.doesNotMatch(formatted, new RegExp(fakeToken));
    assert.match(formatted, /exposed\.env \(github-token\)/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("Git index scanner rejects staged candidate credentials without echoing their values", () => {
  const cwd = mkdtempSync(join(tmpdir(), "rehab-credential-index-scan-"));
  const fakeToken = `ghp_${"b".repeat(36)}`;
  try {
    runGit(cwd, ["init"]);
    runGit(cwd, ["config", "user.email", "ci@example.invalid"]);
    runGit(cwd, ["config", "user.name", "CI Test"]);
    commit(cwd, "safe.txt", "safe fixture\n");
    writeFileSync(join(cwd, "candidate.env"), `GITHUB_TOKEN=${fakeToken}\n`);
    runGit(cwd, ["add", "candidate.env"]);

    assert.deepEqual(scanGitHistoryCredentials({ cwd }), []);
    const findings = scanGitIndexCredentials({ cwd });
    assert.deepEqual(findings, [
      {
        source: "index",
        path: "candidate.env",
        detector: "github-token",
      },
    ]);
    const formatted = formatCredentialFindings(findings).join("\n");
    assert.doesNotMatch(formatted, new RegExp(fakeToken));
    assert.match(formatted, /index candidate\.env \(github-token\)/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
