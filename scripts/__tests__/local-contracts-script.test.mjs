import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  requiredLocalContractChecks,
  verifyCompletedContractChecks,
} from "../local-contract-checks.mjs";

const scriptPath = resolve(
  import.meta.dirname,
  "../verify-local-contracts.mjs",
);
const rootDir = resolve(import.meta.dirname, "../..");
const composePath = resolve(rootDir, "infra/docker-compose.yml");
const requiredCredentialVariables = [
  "LOCAL_CONTRACT_PATIENT_ACCOUNT",
  "LOCAL_CONTRACT_PATIENT_PASSWORD",
  "LOCAL_CONTRACT_CAREGIVER_ACCOUNT",
  "LOCAL_CONTRACT_CAREGIVER_PASSWORD",
  "LOCAL_CONTRACT_ADMIN_ACCOUNT",
  "LOCAL_CONTRACT_ADMIN_PASSWORD",
  "LOCAL_CONTRACT_AUDITOR_ACCOUNT",
  "LOCAL_CONTRACT_AUDITOR_PASSWORD",
  "LOCAL_CONTRACT_DOCTOR_ACCOUNT",
  "LOCAL_CONTRACT_DOCTOR_PASSWORD",
];

function runVerifierWithCredentialEnv({ omittedName, overrides = {} } = {}) {
  const env = {
    ...process.env,
    ...Object.fromEntries(
      requiredCredentialVariables.map((name) => [
        name,
        `test-only-${name.toLowerCase()}`,
      ]),
    ),
    ...overrides,
  };
  if (omittedName) delete env[omittedName];

  return spawnSync(process.execPath, [scriptPath], {
    cwd: rootDir,
    env,
    encoding: "utf8",
  });
}

function runComposeConfig(postgresPassword) {
  const env = { ...process.env };
  if (postgresPassword === undefined) {
    delete env.POSTGRES_PASSWORD;
  } else {
    env.POSTGRES_PASSWORD = postgresPassword;
  }

  return spawnSync(
    "docker",
    ["compose", "--env-file", "/dev/null", "-f", composePath, "config"],
    {
      cwd: rootDir,
      env,
      encoding: "utf8",
    },
  );
}

test("postgres compose password is a required explicit environment variable", () => {
  const source = readFileSync(composePath, "utf8");

  assert.match(
    source,
    /POSTGRES_PASSWORD:\s*"\$\{POSTGRES_PASSWORD:\?POSTGRES_PASSWORD must be set\}"/,
  );

  for (const value of [undefined, ""]) {
    const result = runComposeConfig(value);
    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /POSTGRES_PASSWORD must be set/,
    );
  }
});

test("local contract verifier requires every role account and password before startup", () => {
  const source = readFileSync(scriptPath, "utf8");
  const projectEnvReadIndex = source.indexOf("readProjectEnv(");

  for (const name of requiredCredentialVariables) {
    assert.match(source, new RegExp(`requiredEnv\\(\"${name}\"\\)`));
    assert.ok(
      source.indexOf(`requiredEnv("${name}")`) < projectEnvReadIndex,
      `${name} must be checked before project .env is read`,
    );

    for (const result of [
      runVerifierWithCredentialEnv({ omittedName: name }),
      runVerifierWithCredentialEnv({ overrides: { [name]: " \t " } }),
    ]) {
      assert.notEqual(result.status, 0);
      assert.match(
        `${result.stdout}\n${result.stderr}`,
        new RegExp(`缺少环境变量 ${name}`),
      );
      assert.doesNotMatch(result.stdout, /接口契约验收/);
    }
  }

  assert.doesNotMatch(source, /const seedPassword\s*=/);
  assert.match(source, /async function login\(account, password\)/);
  assert.match(source, /session\.login\(account, password\)/);
});

test("local contract verifier uses only isolated cookie sessions", () => {
  const source = readFileSync(scriptPath, "utf8");
  const retiredAuthMarkers = [
    ["access", "Token"].join(""),
    ["Authoriz", "ation"].join(""),
    ["Bear", "er"].join(""),
  ];

  for (const marker of retiredAuthMarkers) {
    assert.equal(
      source.includes(marker),
      false,
      `local contract verifier must not contain retired auth marker ${marker}`,
    );
  }

  assert.match(source, /new CookieSessionClient\(apiBaseUrl\)/);
  assert.match(source, /loginResponse\.status === "authenticated"/);
  assert.match(source, /loginResponse\.context/);
  assert.match(source, /session:\s*patientLogin\.session/);
  assert.match(source, /session:\s*caregiverLogin\.session/);
  assert.match(source, /session:\s*adminLogin\.session/);
  assert.match(source, /session:\s*auditorLogin\.session/);
  assert.match(source, /session:\s*doctorLogin\.session/);
});

test("local contract verifier covers the training result review workflow", () => {
  const source = readFileSync(scriptPath, "utf8");

  assert.match(
    source,
    /const doctorAccount = requiredEnv\("LOCAL_CONTRACT_DOCTOR_ACCOUNT"\)/,
  );
  assert.match(source, /login\(doctorAccount, doctorPassword\)/);
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

test("local contract verifier covers caregiver summary privacy and revocation gates", () => {
  const source = readFileSync(scriptPath, "utf8");

  assert.match(
    source,
    /const caregiverAccount = requiredEnv\("LOCAL_CONTRACT_CAREGIVER_ACCOUNT"\)/,
  );
  assert.match(source, /login\(caregiverAccount, caregiverPassword\)/);
  assert.match(source, /caregiver_login_verified/);
  assert.match(source, /\/caregiver\/patients\/\$\{patient\.id\}\/summary/);
  assert.match(source, /caregiver_summary_desensitized/);
  assert.match(source, /caregiver_summary_view_audit_log_persisted/);
  assert.match(source, /caregiver_full_training_records_denied/);
  assert.match(source, /caregiver_full_record_denied_audit_log_persisted/);
  assert.match(source, /caregiver_sharing_consent_revoked/);
  assert.match(source, /revoked_caregiver_sharing_blocks_summary/);
  assert.match(source, /caregiver_sharing_revoke_audit_log_persisted/);
  assert.match(source, /caregiver\.summary\.view/);
  assert.match(source, /access\.denied/);
  assert.match(source, /consent\.revoke/);
  assert.match(source, /motionMetrics/);
  assert.match(source, /metricsSummary/);
  assert.match(source, /expectedStatus:\s*403/);
  assert.doesNotMatch(source, /expectedMetadata:\s*\(\)\s*=>\s*true/);
  assert.match(source, /actorRole:\s*"caregiver"/);
  assert.match(source, /actorRole:\s*"patient"/);
  assert.match(source, /dateFrom:\s*requestedAt/);
  assert.match(source, /dateTo:/);
  assert.match(
    source,
    /findAuditLog\(\{[\s\S]*action:\s*"consent\.revoke"[\s\S]*consentType === "caregiver_sharing"/,
  );
  assert.doesNotMatch(source, /consentRecord\.updateMany/);
  assert.match(source, /restoreRevokedConsents/);
  assert.match(source, /\/consents/);
  assert.match(source, /consentVersion:\s*"v1\.2"/);
});

test("local contract verifier selects the current released browser pose item by formal metrics", () => {
  const source = readFileSync(scriptPath, "utf8");

  assert.match(source, /const requiredBrowserPoseMetricTypes = \[/);
  assert.match(
    source,
    /findReleasedBrowserPosePlanItem\(\s*activePlan\.items/s,
  );
  assert.match(source, /content\.runtimeType !== "browser_pose_canvas"/);
  assert.match(source, /content\.status !== "active"/);
  assert.match(source, /content\.buildStatus !== "released"/);
  assert.match(
    source,
    /hasRequiredBrowserPoseMetrics\(content\.requiredMetrics\)/,
  );
  assert.match(
    source,
    /当前计划中没有已发布且包含必要指标的 browser_pose_canvas 训练项目/,
  );

  const selectionBlock = source.slice(
    source.indexOf("function findReleasedBrowserPosePlanItem"),
    source.indexOf("async function createTrainingSession"),
  );
  assert.doesNotMatch(selectionBlock, /pose_reaction_hit/);
});

test("local contract verifier creates and binds a formal collection batch before training", () => {
  const source = readFileSync(scriptPath, "utf8");

  assert.match(source, /created = \{[\s\S]*collectionConditionIds:\s*\[\]/);
  assert.match(source, /collectionProtocolIds:\s*\[\]/);
  assert.match(source, /collectionBatchIds:\s*\[\]/);
  assert.match(
    source,
    /createFormalCollectionCondition\(\{[\s\S]*adminLogin\.session/s,
  );
  assert.match(source, /createFormalCollectionProtocol\(\{[\s\S]*game/s);
  assert.match(
    source,
    /createFormalCollectionBatch\(\{[\s\S]*doctorLogin\.session/s,
  );
  assert.match(source, /request\("\/admin\/collection-conditions"/);
  assert.match(source, /request\("\/admin\/collection-protocols"/);
  assert.match(source, /request\("\/collection-batches"/);
  assert.match(source, /collectionBatchId:\s*collectionBatch\.id/);
  assert.match(
    source,
    /const metricsSummary = \{[\s\S]*collectionBatchId:\s*collectionBatch\.id/s,
  );
  assert.match(
    source,
    /rawPayloadHash:\s*hashPayload\(\{[\s\S]*collectionBatchId:\s*collectionBatch\.id/s,
  );
  assert.match(
    source,
    /dynamicDifficultyEvidence:\s*buildDynamicDifficultyEvidence\(\{/,
  );
  assert.match(
    source,
    /const approvedPlanItemId =\s*session\.runtimeConfigSnapshot\?\.approvedPlanItemId/s,
  );
  assert.match(
    source,
    /const assessmentSourceId =\s*session\.runtimeConfigSnapshot\?\.assessmentSourceId/s,
  );
  assert.match(
    source,
    /const startingDifficultyLevel =\s*session\.runtimeConfigSnapshot\?\.startingDifficultyLevel/s,
  );
  assert.match(source, /response\.collectionBatchId === collectionBatch\.id/);
  assert.match(
    source,
    /runtimeConfigSnapshot\?\.collectionBatch\?\.id\s*===\s*collectionBatch\.id/,
  );
  assert.match(
    source,
    /body:\s*buildTrainingSessionPayload\(\{[\s\S]*collectionBatch,[\s\S]*caseKey:\s*"camera_revoked_block"/,
  );
  assert.match(
    source,
    /\/patients\/\$\{patient\.id\}\/training-records`,\s*\{\s*session:\s*doctorLogin\.session/s,
  );
  assert.match(source, /cleanupCreatedCollectionRecords/);
});

test("local contract checklist requires every runtime review gate", () => {
  assert.ok(
    requiredLocalContractChecks.includes(
      "desensitized_patient_export_verified",
    ),
  );
  assert.ok(
    requiredLocalContractChecks.includes("data_export_audit_log_persisted"),
  );
  assert.ok(requiredLocalContractChecks.includes("doctor_export_role_denied"));
  assert.ok(requiredLocalContractChecks.includes("auditor_export_role_denied"));
  assert.ok(requiredLocalContractChecks.includes("caregiver_login_verified"));
  assert.ok(
    requiredLocalContractChecks.includes("caregiver_summary_desensitized"),
  );
  assert.ok(
    requiredLocalContractChecks.includes(
      "caregiver_summary_view_audit_log_persisted",
    ),
  );
  assert.ok(
    requiredLocalContractChecks.includes(
      "caregiver_full_training_records_denied",
    ),
  );
  assert.ok(
    requiredLocalContractChecks.includes(
      "caregiver_full_record_denied_audit_log_persisted",
    ),
  );
  assert.ok(
    requiredLocalContractChecks.includes("caregiver_sharing_consent_revoked"),
  );
  assert.ok(
    requiredLocalContractChecks.includes(
      "revoked_caregiver_sharing_blocks_summary",
    ),
  );
  assert.ok(
    requiredLocalContractChecks.includes(
      "revoked_caregiver_summary_denied_audit_log_persisted",
    ),
  );
  assert.ok(
    requiredLocalContractChecks.includes(
      "caregiver_sharing_revoke_audit_log_persisted",
    ),
  );
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

test("local contract verifier restores revoked consents through the public consent API", () => {
  const source = readFileSync(scriptPath, "utf8");

  assert.doesNotMatch(source, /buildConsentRestoreWhere/);
  assert.doesNotMatch(source, /revokedAtByConsentId/);
  assert.match(source, /created\.revokedConsentTypes/);
  assert.match(source, /POST/);
  assert.match(
    source,
    /evidenceSnapshot:[\s\S]*source:\s*"local_contract_restore"/,
  );
});
