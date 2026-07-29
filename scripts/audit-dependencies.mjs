#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const blockingSeverities = new Set(["high", "critical"]);
const trackedSeverities = new Set(["low", "moderate"]);

export function normalizeAuditFindings(report) {
  return Object.values(report?.advisories ?? {})
    .map((advisory) => ({
      id:
        advisory.github_advisory_id ??
        advisory.cve ??
        advisory.id ??
        "unknown-advisory",
      module: advisory.module_name ?? "unknown-module",
      severity: advisory.severity ?? "unknown",
    }))
    .filter((finding) => typeof finding.severity === "string")
    .sort((left, right) =>
      `${left.severity}:${left.module}:${left.id}`.localeCompare(
        `${right.severity}:${right.module}:${right.id}`,
      ),
    );
}

export function summarizeAuditReport(report) {
  const findings = normalizeAuditFindings(report);
  const counts = ["info", "low", "moderate", "high", "critical"].map(
    (severity) => [
      severity,
      Number(report?.metadata?.vulnerabilities?.[severity] ?? 0),
    ],
  );
  return {
    blockers: findings.filter((finding) =>
      blockingSeverities.has(finding.severity),
    ),
    remediation: findings.filter((finding) =>
      trackedSeverities.has(finding.severity),
    ),
    unresolved: findings,
    counts,
  };
}

export function formatAuditSummary(summary) {
  const lines = [
    `Dependency audit: ${summary.counts.map(([severity, count]) => `${severity}=${count}`).join(", ")}.`,
  ];
  if (summary.remediation.length > 0) {
    lines.push(
      "Low/moderate findings require remediation and block CI without an approved exception:",
    );
    lines.push(
      ...summary.remediation.map(
        ({ severity, module, id }) => `- [${severity}] ${module} (${id})`,
      ),
    );
  }
  if (summary.blockers.length > 0) {
    lines.push("High/critical findings block CI:");
    lines.push(
      ...summary.blockers.map(
        ({ severity, module, id }) => `- [${severity}] ${module} (${id})`,
      ),
    );
  }
  return lines.join("\n");
}

export function assertNoUnresolvedAuditFindings(summary) {
  if (summary.unresolved.length > 0) {
    throw new Error(
      "Dependency audit contains unresolved findings; CI cannot pass without approved remediation.",
    );
  }
}

export function parseAuditOutput(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error("pnpm audit did not return a valid JSON report.");
  }
}

function main() {
  const result = spawnSync("pnpm", ["audit", "--json"], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const report = parseAuditOutput(result.stdout ?? "");
  const summary = summarizeAuditReport(report);
  process.stdout.write(`${formatAuditSummary(summary)}\n`);
  assertNoUnresolvedAuditFindings(summary);
  if (result.status !== 0) {
    throw new Error("pnpm audit failed without a remediation report.");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
