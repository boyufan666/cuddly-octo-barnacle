import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateCustomerProductionInput } from "../verify-customer-production-input.mjs";

function validInput(overrides = {}) {
  return {
    documentVersion: "customer-production-input/v1",
    project: {
      customerName: "康复中心",
      acceptanceOwner: "张主任",
      targetLaunchDate: "2026-06-30",
      deploymentMode: "public_cloud",
    },
    infrastructure: {
      webDomain: "https://rehab.customer-health.cn",
      apiDomain: "https://api.customer-health.cn",
      serverPlan: "4c8g production node with managed backup",
      databaseUrlRef: "secret-manager://rehab-prod/database-url",
      redisUrlRef: "secret-manager://rehab-prod/redis-url",
      backupPolicy: "daily encrypted backup, 30-day retention",
      monitoringOwner: "customer-ops",
    },
    legal: {
      privacyAgreementVersion: "privacy-2026-06",
      consentOwner: "张主任",
      retentionPolicy: "assessment and training records retained for 3 years",
      thirdPartyAiDataProcessingApproved: true,
    },
    accounts: {
      superAdmins: ["admin.li"],
      operatorAdmins: ["ops.wang"],
      auditors: ["audit.zhao"],
      doctors: ["doctor.chen"],
    },
    dataCollection: {
      realPatientDataApproved: true,
      patientSource: "signed pilot patients",
      desensitizationOwner: "audit.zhao",
      exportApprovalOwner: "张主任",
    },
    ai: {
      requiredForLaunch: true,
      freeTierPreferred: true,
      provider: "iflytek-spark",
      accountOwner: "customer-ai-admin",
      freeQuotaConfirmed: true,
      freeQuotaDescription: "星火企业账号试用额度，已确认可用于试点",
      endpoint: "https://spark-api.customer-health.cn/v1/chat/completions",
      apiKeyRef: "secret-manager://rehab-prod/iflytek-spark-api-key",
      modelName: "spark-x1",
      modelVersion: "spark-x1-2026-06",
      promptVersion: "cognitive-assessment-2026-06",
      callLogRetentionDays: 180,
      humanReviewRequired: true,
      humanReviewOwner: "doctor.chen",
    },
    speech: {
      requiredForLaunch: true,
      freeTierPreferred: true,
      provider: "iflytek-iat",
      accountOwner: "customer-ai-admin",
      freeQuotaConfirmed: true,
      freeQuotaDescription: "讯飞语音试用额度，已确认可用于试点",
      endpoint: "https://speech.customer-health.cn/v2/iat",
      apiKeyRef: "secret-manager://rehab-prod/iflytek-iat-api-key",
      modelVersion: "iat-medical-2026-06",
      microphoneConsentRequired: true,
    },
    trainingContent: {
      browserPoseAccepted: true,
      browserEvidencePath: "evidence/browser-pose/customer-field-evidence.json",
      targetBrowsers: ["Chrome 126", "Edge 126"],
      cameraModel: "Logitech C920",
      unityRequiredForLaunch: false,
      unityBuildManifestPath: "",
    },
    acceptanceEvidence: {
      roleScreenshotsReady: true,
      assessmentEvidenceReady: true,
      trainingEvidenceReady: true,
      auditEvidenceReady: true,
      desensitizedExportReady: true,
      deploymentEvidenceReady: true,
    },
    ...overrides,
  };
}

test("customer production input accepts complete production launch materials", () => {
  const result = validateCustomerProductionInput(validInput());

  assert.deepEqual(result.failures, []);
});

test("customer production input rejects missing free quota confirmation when free AI is preferred", () => {
  const input = validInput({
    ai: {
      ...validInput().ai,
      freeTierPreferred: true,
      freeQuotaConfirmed: false,
      freeQuotaDescription: "",
    },
  });

  const result = validateCustomerProductionInput(input);

  assert.match(result.failures.join("\n"), /AI 免费额度/);
});

test("customer production input rejects raw keys and non-HTTPS AI endpoints", () => {
  const input = validInput({
    ai: {
      ...validInput().ai,
      endpoint: "http://localhost:8317/v1/chat/completions",
      apiKeyRef: "sk-live-real-key",
    },
  });

  const result = validateCustomerProductionInput(input);

  assert.match(result.failures.join("\n"), /ai.endpoint.*HTTPS/);
  assert.match(result.failures.join("\n"), /ai.apiKeyRef.*secret-manager/);
});

test("customer production input rejects launch AI without human review", () => {
  const input = validInput({
    ai: {
      ...validInput().ai,
      humanReviewRequired: false,
      humanReviewOwner: "",
    },
  });

  const result = validateCustomerProductionInput(input);

  assert.match(result.failures.join("\n"), /人工复核/);
});

test("customer production input rejects speech launch without microphone consent requirement", () => {
  const input = validInput({
    speech: {
      ...validInput().speech,
      microphoneConsentRequired: false,
    },
  });

  const result = validateCustomerProductionInput(input);

  assert.match(result.failures.join("\n"), /microphone_capture/);
});

test("customer production input rejects missing browser pose field evidence", () => {
  const input = validInput({
    trainingContent: {
      ...validInput().trainingContent,
      browserPoseAccepted: false,
      browserEvidencePath: "",
    },
  });

  const result = validateCustomerProductionInput(input);

  assert.match(result.failures.join("\n"), /浏览器体感/);
});

test("customer production input rejects placeholders and demo markers anywhere", () => {
  const input = validInput({
    project: {
      ...validInput().project,
      customerName: "<customer-name>",
    },
    ai: {
      ...validInput().ai,
      provider: "demo-ai",
    },
  });

  const result = validateCustomerProductionInput(input);

  assert.match(result.failures.join("\n"), /占位符/);
  assert.match(result.failures.join("\n"), /mock\/demo\/local/);
});

test("customer production input CLI accepts pnpm separator before the JSON path", () => {
  const dir = mkdtempSync(join(tmpdir(), "customer-production-input-"));
  const inputPath = join(dir, "input.json");
  writeFileSync(inputPath, `${JSON.stringify(validInput(), null, 2)}\n`);

  const result = spawnSync(
    process.execPath,
    ["scripts/verify-customer-production-input.mjs", "--", inputPath],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /校验通过/);
});
