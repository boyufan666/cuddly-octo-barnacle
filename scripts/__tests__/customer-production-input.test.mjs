import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateCustomerProductionInput } from "../verify-customer-production-input.mjs";

function validInput(overrides = {}) {
  return {
    documentVersion: "customer-production-input/v2",
    project: {
      customerName: "康复中心",
      acceptanceOwner: "张主任",
      targetLaunchDate: "2026-07-31",
      deploymentMode: "public_cloud",
    },
    infrastructure: {
      webDomain: "https://rehab.customer-health.cn",
      apiDomain: "https://api.customer-health.cn",
      serverPlan: "4c8g production node with managed backup",
      databaseUrlRef: "secret-manager://rehab-prod/database-url",
      backupPolicy: "daily encrypted backup, 30-day retention",
      monitoringOwner: "customer-ops",
    },
    legal: {
      privacyAgreementVersion: "privacy-2026-07",
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
    mimo: {
      accountOwner: "customer-mimo-admin",
      apiKeyRef: "secret-manager://rehab-prod/mimo-api-key-v2",
      apiKeyFile: "/etc/secrets/mimo_api_key",
      allowedHosts: ["mimo.customer-health.cn"],
      providerTelemetryRetentionDays: 180,
      providerTelemetryRetentionTimeoutMs: 120000,
      providerLimits: {
        aiTimeoutMs: 15_000,
        aiMaxResponseBytes: 1_048_576,
        speechTimeoutMs: 15_000,
        speechMaxResponseBytes: 1_048_576,
        ttsTimeoutMs: 15_000,
        ttsMaxResponseBytes: 1_048_576,
      },
      highCostRequestLimit: {
        userOperationRequestLimit: 20,
        windowMs: 60_000,
      },
      usage: {
        keyValueUrl: "redis://mimo-kv.customer-health.cn:6379",
        keyPrefix: "rehab-prod-mimo",
        windowMs: 86_400_000,
        keyValueProbeTimeoutMs: 2_000,
        userRequestLimit: 100,
        patientRequestLimit: 100,
        organizationRequestLimit: 10_000,
        speechSecondsLimit: 3_600,
        ttsCharactersLimit: 100_000,
        userBudgetUnitsLimit: 10_000,
        patientBudgetUnitsLimit: 10_000,
        organizationBudgetUnitsLimit: 1_000_000,
        aiCostUnitsPerRequest: 100,
        speechCostUnitsPerSecond: 1,
        ttsCostUnitsPerCharacter: 1,
      },
    },
    ai: {
      requiredForLaunch: true,
      provider: "xiaomi-mimo",
      modelName: "mimo-v2.5",
      modelVersion: "mimo-v2.5",
      endpoint: "https://mimo.customer-health.cn/v1",
      promptVersion: "cognitive-assessment-mimo-2026-07",
      humanReviewRequired: true,
      humanReviewOwner: "doctor.chen",
    },
    speech: {
      requiredForLaunch: true,
      provider: "xiaomi-mimo-audio-understanding",
      endpoint: "https://mimo.customer-health.cn/v1/chat/completions",
      modelVersion: "mimo-v2.5",
      maxDecodedAudioBytes: 10_485_760,
      maxDurationSeconds: 600,
      microphoneConsentRequired: true,
    },
    tts: {
      requiredForLaunch: true,
      provider: "xiaomi-mimo-tts",
      endpoint: "https://mimo.customer-health.cn/v1/chat/completions",
      modelVersion: "mimo-v2.5-tts",
      voiceId: "Chloe",
      outputFormat: "wav",
      patientPlaybackConsentRequired: true,
    },
    trainingContent: {
      browserPoseAccepted: true,
      browserEvidencePath: "evidence/browser-pose/customer-field-evidence.json",
      targetBrowsers: ["Chrome 126", "Edge 126"],
      cameraModel: "Logitech C920",
      unityRequiredForLaunch: true,
      unityBuildManifestPath: "evidence/unity/manifest.json",
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

test("customer production input accepts the complete MiMo v2 production contract", () => {
  const result = validateCustomerProductionInput(validInput());

  assert.deepEqual(result.failures, []);
});

test("customer production input requires the v2 document and all MiMo capabilities", () => {
  const input = validInput({
    documentVersion: "customer-production-input/v1",
    legal: {
      ...validInput().legal,
      thirdPartyAiDataProcessingApproved: false,
    },
    ai: { ...validInput().ai, requiredForLaunch: false },
    speech: { ...validInput().speech, requiredForLaunch: false },
    tts: { ...validInput().tts, requiredForLaunch: false },
  });

  const failures = validateCustomerProductionInput(input).failures.join("\n");

  assert.match(failures, /customer-production-input\/v2/);
  assert.match(failures, /thirdPartyAiDataProcessingApproved.*true/);
  assert.match(failures, /ai\.requiredForLaunch.*true/);
  assert.match(failures, /speech\.requiredForLaunch.*true/);
  assert.match(failures, /tts\.requiredForLaunch.*true/);
});

test("customer production input rejects non-MiMo providers and legacy per-capability key references", () => {
  const input = validInput({
    ai: {
      ...validInput().ai,
      provider: "iflytek-spark",
      apiKeyRef: "secret-manager://rehab-prod/legacy-ai-key",
    },
    speech: {
      ...validInput().speech,
      provider: "iflytek-iat",
      apiKeyRef: "secret-manager://rehab-prod/legacy-speech-key",
    },
    tts: {
      ...validInput().tts,
      apiKeyRef: "secret-manager://rehab-prod/legacy-tts-key",
    },
  });

  const failures = validateCustomerProductionInput(input).failures.join("\n");

  assert.match(failures, /ai\.provider.*xiaomi-mimo/);
  assert.match(failures, /speech\.provider.*xiaomi-mimo-audio-understanding/);
  assert.match(failures, /ai\.apiKeyRef.*不.*允许/);
  assert.match(failures, /speech\.apiKeyRef.*不.*允许/);
  assert.match(failures, /tts\.apiKeyRef.*不.*允许/);
});

test("customer production input requires one Secret File/reference and approved MiMo hosts", () => {
  const input = validInput({
    mimo: {
      ...validInput().mimo,
      apiKeyRef: "not-a-secret-reference",
      apiKeyFile: "/tmp/mimo_api_key",
      allowedHosts: ["127.0.0.1"],
    },
    ai: {
      ...validInput().ai,
      endpoint: "https://unapproved.customer-health.cn/v1",
    },
    speech: {
      ...validInput().speech,
      endpoint: "https://mimo.customer-health.cn:8443/v1/chat/completions",
    },
  });

  const failures = validateCustomerProductionInput(input).failures.join("\n");

  assert.match(failures, /mimo\.apiKeyRef.*secret-manager/);
  assert.match(failures, /mimo\.apiKeyFile.*Secret File/);
  assert.match(failures, /mimo\.allowedHosts/);
  assert.match(failures, /ai\.endpoint.*mimo\.allowedHosts/);
  assert.match(failures, /speech\.endpoint.*mimo\.allowedHosts/);
});

test("customer production input rejects invalid MiMo retention, provider limits, and Key Value quota configuration", () => {
  const input = validInput({
    mimo: {
      ...validInput().mimo,
      providerTelemetryRetentionDays: 29,
      providerTelemetryRetentionTimeoutMs: 0,
      providerLimits: {
        ...validInput().mimo.providerLimits,
        ttsMaxResponseBytes: 16 * 1024 * 1024 + 1,
      },
      usage: {
        ...validInput().mimo.usage,
        keyValueUrl: "redis://127.0.0.1:6379",
        windowMs: 0,
        ttsCostUnitsPerCharacter: "1",
      },
    },
  });

  const failures = validateCustomerProductionInput(input).failures.join("\n");

  assert.match(failures, /mimo\.providerTelemetryRetentionDays/);
  assert.match(failures, /mimo\.providerTelemetryRetentionTimeoutMs/);
  assert.match(failures, /mimo\.providerLimits\.ttsMaxResponseBytes/);
  assert.match(failures, /mimo\.usage\.keyValueUrl/);
  assert.match(failures, /mimo\.usage\.windowMs/);
  assert.match(failures, /mimo\.usage\.ttsCostUnitsPerCharacter/);
});

test("customer production input requires STT input and independent user-operation request limits", () => {
  const input = validInput({
    mimo: {
      ...validInput().mimo,
      highCostRequestLimit: {
        userOperationRequestLimit: 0,
        windowMs: 1.5,
      },
    },
    speech: {
      ...validInput().speech,
      maxDecodedAudioBytes: 11_796_481,
      maxDurationSeconds: "600",
    },
  });

  const failures = validateCustomerProductionInput(input).failures.join("\n");

  assert.match(
    failures,
    /mimo\.highCostRequestLimit\.userOperationRequestLimit/,
  );
  assert.match(failures, /mimo\.highCostRequestLimit\.windowMs/);
  assert.match(failures, /speech\.maxDecodedAudioBytes/);
  assert.match(failures, /speech\.maxDurationSeconds/);
});

test("customer production input requires the strict MiMo clinical and playback constraints", () => {
  const input = validInput({
    ai: {
      ...validInput().ai,
      humanReviewRequired: false,
      humanReviewOwner: "",
    },
    speech: {
      ...validInput().speech,
      microphoneConsentRequired: false,
    },
    tts: {
      ...validInput().tts,
      modelVersion: "mimo-v2.5",
      outputFormat: "ogg",
      patientPlaybackConsentRequired: false,
    },
  });

  const failures = validateCustomerProductionInput(input).failures.join("\n");

  assert.match(failures, /人工复核/);
  assert.match(failures, /microphone_capture/);
  assert.match(failures, /tts\.modelVersion/);
  assert.match(failures, /tts\.outputFormat/);
  assert.match(failures, /ai_processing/);
});

test("customer production input rejects missing browser pose field evidence", () => {
  const input = validInput({
    trainingContent: {
      ...validInput().trainingContent,
      browserPoseAccepted: false,
      browserEvidencePath: "",
    },
  });

  assert.match(
    validateCustomerProductionInput(input).failures.join("\n"),
    /浏览器体感/,
  );
});

test("customer production input rejects placeholders, demo markers, and unfilled templates", () => {
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
  const template = JSON.parse(
    readFileSync(
      "docs/templates/customer-production-input.template.json",
      "utf8",
    ),
  );

  const failures = validateCustomerProductionInput(input).failures.join("\n");
  const templateFailures =
    validateCustomerProductionInput(template).failures.join("\n");

  assert.match(failures, /占位符/);
  assert.match(failures, /mock\/demo\/local/);
  assert.match(templateFailures, /模板|示例|example|占位符/);
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
