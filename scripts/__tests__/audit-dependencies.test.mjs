import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNoUnresolvedAuditFindings,
  formatAuditSummary,
  parseAuditOutput,
  summarizeAuditReport,
} from "../audit-dependencies.mjs";

const report = {
  advisories: {
    low: {
      github_advisory_id: "GHSA-low-fixture",
      module_name: "low-package",
      severity: "low",
    },
    moderate: {
      github_advisory_id: "GHSA-moderate-fixture",
      module_name: "moderate-package",
      severity: "moderate",
    },
    high: {
      github_advisory_id: "GHSA-high-fixture",
      module_name: "high-package",
      severity: "high",
    },
  },
  metadata: {
    vulnerabilities: { info: 0, low: 1, moderate: 1, high: 1, critical: 0 },
  },
};

test("dependency audit keeps every advisory visible and blocks high and critical findings", () => {
  const summary = summarizeAuditReport(report);
  assert.equal(summary.remediation.length, 2);
  assert.equal(summary.blockers.length, 1);
  const output = formatAuditSummary(summary);
  assert.match(
    output,
    /Low\/moderate findings require remediation and block CI without an approved exception/,
  );
  assert.match(output, /\[low\] low-package/);
  assert.match(output, /\[moderate\] moderate-package/);
  assert.match(output, /High\/critical findings block CI/);
  assert.throws(() => assertNoUnresolvedAuditFindings(summary), /unresolved/);
});

test("dependency audit blocks unresolved low or moderate findings without an exception", () => {
  const parsed = parseAuditOutput(
    JSON.stringify({
      ...report,
      advisories: {
        low: report.advisories.low,
        moderate: report.advisories.moderate,
      },
      metadata: {
        vulnerabilities: { info: 0, low: 1, moderate: 1, high: 0, critical: 0 },
      },
    }),
  );
  const summary = summarizeAuditReport(parsed);
  assert.throws(() => assertNoUnresolvedAuditFindings(summary), /unresolved/);
});
