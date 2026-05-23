import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildConsentRestoreWhere,
  requiredLocalContractChecks,
  verifyCompletedContractChecks,
} from "../local-contract-checks.mjs";

const scriptPath = resolve(
  import.meta.dirname,
  "../verify-local-contracts.mjs",
);

test("local contract verifier covers the training result review workflow", () => {
  const source = readFileSync(scriptPath, "utf8");

  assert.match(source, /const doctorAccount = "doctor001"/);
  assert.match(source, /PATCH/);
  assert.match(source, /\/training-results\/\$\{[^}]+\.id\}\/review/);
  assert.match(source, /training_result\.review/);
  assert.match(source, /reviewStatus === "reviewed"/);
  assert.match(source, /qualityFlag === "suspicious"/);
  assert.match(source, /abnormalFlag === true/);
  assert.match(source, /正常训练结果.*expectedStatus:\s*400/s);
  assert.match(source, /重复复核.*expectedStatus:\s*400/s);
});

test("local contract verifier covers desensitized patient export evidence", () => {
  const source = readFileSync(scriptPath, "utf8");

  assert.match(source, /\/admin\/exports\/patients/);
  assert.match(source, /const payload = exported;/);
  assert.match(source, /desensitized_patient_export_verified/);
  assert.match(source, /data_export_audit_log_persisted/);
  assert.match(source, /doctor_export_role_denied/);
  assert.match(source, /auditor_export_role_denied/);
  assert.doesNotMatch(source, /non_export_role_denied/);
  assert.match(source, /data\.export/);
  assert.match(source, /targetType:\s*"data_export"/);
  assert.match(source, /actorUserId,/);
  assert.match(source, /dateFrom:\s*requestedAt/);
  assert.match(source, /result:\s*"denied"/);
  assert.match(source, /limit:\s*"200"/);
  assert.match(source, /expectedStatus:\s*403/);
  assert.match(source, /patientExportId/);
  assert.match(source, /reasonHash/);
  assert.match(source, /reasonLength/);
  assert.match(source, /expectedPatientExportColumns/);
  assert.match(source, /assertStringArrayEqual\(\s*metadata\.columns/s);
  assert.match(source, /exportReason = `[^`]*\$\{runKey\}/s);
  assert.match(source, /deniedReason = `[^`]*\$\{runKey\}/s);
  assert.match(source, /!exportedText\.includes\("李明"\)/);
  assert.match(source, /!auditText\.includes\("李明"\)/);
});

test("local contract checklist requires every runtime review gate", () => {
  assert.ok(
    requiredLocalContractChecks.includes("desensitized_patient_export_verified"),
  );
  assert.ok(
    requiredLocalContractChecks.includes("data_export_audit_log_persisted"),
  );
  assert.ok(requiredLocalContractChecks.includes("doctor_export_role_denied"));
  assert.ok(requiredLocalContractChecks.includes("auditor_export_role_denied"));
  assert.ok(!requiredLocalContractChecks.includes("non_export_role_denied"));

  assert.deepEqual(
    verifyCompletedContractChecks(new Set(requiredLocalContractChecks)),
    [],
  );

  const incompleteChecks = new Set(requiredLocalContractChecks);
  incompleteChecks.delete("review_audit_log_persisted");

  assert.deepEqual(verifyCompletedContractChecks(incompleteChecks), [
    "review_audit_log_persisted",
  ]);
});

test("consent restore condition only targets this run's revoked snapshots", () => {
  assert.deepEqual(
    buildConsentRestoreWhere(["consent-a", "consent-a", "", "consent-b"], {
      "consent-a": new Date("2026-05-23T09:00:00.000Z"),
      "consent-b": new Date("2026-05-23T09:00:01.000Z"),
    }),
    {
      OR: [
        {
          id: "consent-a",
          status: "revoked",
          revokedAt: new Date("2026-05-23T09:00:00.000Z"),
        },
        {
          id: "consent-b",
          status: "revoked",
          revokedAt: new Date("2026-05-23T09:00:01.000Z"),
        },
      ],
    },
  );
});
