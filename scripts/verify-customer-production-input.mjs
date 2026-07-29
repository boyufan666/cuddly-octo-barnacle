#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const expectedDocumentVersion = "customer-production-input/v2";
const secretRefPrefix = "secret-manager://";
const allowedDeploymentModes = new Set([
  "public_cloud",
  "private_cloud",
  "intranet",
]);
const allowedTtsModels = new Set([
  "mimo-v2.5-tts",
  "mimo-v2.5-tts-voicedesign",
  "mimo-v2.5-tts-voiceclone",
]);
const allowedTtsOutputFormats = new Set(["mp3", "wav"]);
const mimoProviders = Object.freeze({
  ai: "xiaomi-mimo",
  speech: "xiaomi-mimo-audio-understanding",
  tts: "xiaomi-mimo-tts",
});
const maxSttDecodedAudioBytes = 11_796_480;
const mimoUsageIntegerFields = [
  "windowMs",
  "keyValueProbeTimeoutMs",
  "userRequestLimit",
  "patientRequestLimit",
  "organizationRequestLimit",
  "speechSecondsLimit",
  "ttsCharactersLimit",
  "userBudgetUnitsLimit",
  "patientBudgetUnitsLimit",
  "organizationBudgetUnitsLimit",
  "aiCostUnitsPerRequest",
  "speechCostUnitsPerSecond",
  "ttsCostUnitsPerCharacter",
];
const templateTextMarkers = [
  "客户正式名称",
  "客户验收负责人姓名",
  "正式服务器规格",
  "运维责任说明",
  "备份频率",
  "恢复责任人",
  "隐私协议确认负责人",
  "数据保留周期和删除规则",
  "已签署授权的试点患者来源说明",
  "脱敏负责人",
  "导出审批负责人",
  "客户 AI 供应商账号负责人",
  "免费额度、有效期",
  "客户语音供应商账号负责人",
  "客户 TTS 供应商账号负责人",
];

export function validateCustomerProductionInput(input) {
  const failures = [];

  if (!isObject(input)) {
    return { failures: ["客户生产资料包必须是 JSON 对象。"] };
  }

  requireEqual(
    failures,
    input.documentVersion,
    expectedDocumentVersion,
    "documentVersion 必须为 customer-production-input/v2。",
  );

  validateProject(failures, input.project);
  validateInfrastructure(failures, input.infrastructure);
  validateLegal(failures, input.legal);
  validateAccounts(failures, input.accounts);
  validateDataCollection(failures, input.dataCollection);
  const allowedMimoHosts = validateMimo(failures, input.mimo);
  validateAi(failures, input.ai, allowedMimoHosts);
  validateSpeech(failures, input.speech, allowedMimoHosts);
  validateTts(failures, input.tts, allowedMimoHosts);
  validateTrainingContent(failures, input.trainingContent);
  validateAcceptanceEvidence(failures, input.acceptanceEvidence);
  validateNoPlaceholders(failures, input);
  validateNoDemoMockLocalManual(failures, input);
  validateNoTemplateExampleValues(failures, input);

  return { failures };
}

function validateProject(failures, project) {
  requireObject(failures, project, "project 必须是对象。");
  if (!isObject(project)) return;
  requireString(failures, project.customerName, "project.customerName");
  requireString(failures, project.acceptanceOwner, "project.acceptanceOwner");
  requireIsoDate(
    failures,
    project.targetLaunchDate,
    "project.targetLaunchDate",
  );
  requireEnum(
    failures,
    project.deploymentMode,
    allowedDeploymentModes,
    "project.deploymentMode",
  );
}

function validateInfrastructure(failures, infrastructure) {
  requireObject(failures, infrastructure, "infrastructure 必须是对象。");
  if (!isObject(infrastructure)) return;
  requireHttpsUrl(
    failures,
    infrastructure.webDomain,
    "infrastructure.webDomain",
  );
  requireHttpsUrl(
    failures,
    infrastructure.apiDomain,
    "infrastructure.apiDomain",
  );
  requireString(
    failures,
    infrastructure.serverPlan,
    "infrastructure.serverPlan",
  );
  requireSecretRef(
    failures,
    infrastructure.databaseUrlRef,
    "infrastructure.databaseUrlRef",
  );
  requireString(
    failures,
    infrastructure.backupPolicy,
    "infrastructure.backupPolicy",
  );
  requireString(
    failures,
    infrastructure.monitoringOwner,
    "infrastructure.monitoringOwner",
  );
}

function validateLegal(failures, legal) {
  requireObject(failures, legal, "legal 必须是对象。");
  if (!isObject(legal)) return;
  requireString(
    failures,
    legal.privacyAgreementVersion,
    "legal.privacyAgreementVersion",
  );
  requireString(failures, legal.consentOwner, "legal.consentOwner");
  requireString(failures, legal.retentionPolicy, "legal.retentionPolicy");
  requireTrue(
    failures,
    legal.thirdPartyAiDataProcessingApproved,
    "legal.thirdPartyAiDataProcessingApproved 必须为 true，才能接入真实 MiMo AI/语音。",
  );
}

function validateAccounts(failures, accounts) {
  requireObject(failures, accounts, "accounts 必须是对象。");
  if (!isObject(accounts)) return;
  requireStringArray(failures, accounts.superAdmins, "accounts.superAdmins");
  requireStringArray(
    failures,
    accounts.operatorAdmins,
    "accounts.operatorAdmins",
  );
  requireStringArray(failures, accounts.auditors, "accounts.auditors");
  requireStringArray(failures, accounts.doctors, "accounts.doctors");
}

function validateDataCollection(failures, dataCollection) {
  requireObject(failures, dataCollection, "dataCollection 必须是对象。");
  if (!isObject(dataCollection)) return;
  requireTrue(
    failures,
    dataCollection.realPatientDataApproved,
    "dataCollection.realPatientDataApproved 必须为 true，才能采集真实数据。",
  );
  requireString(
    failures,
    dataCollection.patientSource,
    "dataCollection.patientSource",
  );
  requireString(
    failures,
    dataCollection.desensitizationOwner,
    "dataCollection.desensitizationOwner",
  );
  requireString(
    failures,
    dataCollection.exportApprovalOwner,
    "dataCollection.exportApprovalOwner",
  );
}

function validateMimo(failures, mimo) {
  requireObject(failures, mimo, "mimo 必须是对象。");
  if (!isObject(mimo)) return new Set();

  validateAllowedKeys(
    failures,
    mimo,
    new Set([
      "accountOwner",
      "apiKeyRef",
      "apiKeyFile",
      "allowedHosts",
      "providerTelemetryRetentionDays",
      "providerTelemetryRetentionTimeoutMs",
      "providerLimits",
      "highCostRequestLimit",
      "usage",
    ]),
    "mimo",
  );
  requireString(failures, mimo.accountOwner, "mimo.accountOwner");
  requireSecretRef(failures, mimo.apiKeyRef, "mimo.apiKeyRef");
  requireSecretFilePath(failures, mimo.apiKeyFile, "mimo.apiKeyFile");
  const allowedMimoHosts = requireMimoHostArray(
    failures,
    mimo.allowedHosts,
    "mimo.allowedHosts",
  );
  requireIntegerRange(
    failures,
    mimo.providerTelemetryRetentionDays,
    30,
    3650,
    "mimo.providerTelemetryRetentionDays",
  );
  requirePositiveSafeInteger(
    failures,
    mimo.providerTelemetryRetentionTimeoutMs,
    "mimo.providerTelemetryRetentionTimeoutMs",
    2_147_483_647,
  );
  validateMimoProviderLimits(failures, mimo.providerLimits);
  validateMimoHighCostRequestLimit(failures, mimo.highCostRequestLimit);
  validateMimoUsage(failures, mimo.usage);
  return allowedMimoHosts;
}

function validateMimoHighCostRequestLimit(failures, requestLimit) {
  requireObject(
    failures,
    requestLimit,
    "mimo.highCostRequestLimit 必须是对象。",
  );
  if (!isObject(requestLimit)) return;
  validateAllowedKeys(
    failures,
    requestLimit,
    new Set(["userOperationRequestLimit", "windowMs"]),
    "mimo.highCostRequestLimit",
  );
  requirePositiveSafeInteger(
    failures,
    requestLimit.userOperationRequestLimit,
    "mimo.highCostRequestLimit.userOperationRequestLimit",
  );
  requirePositiveSafeInteger(
    failures,
    requestLimit.windowMs,
    "mimo.highCostRequestLimit.windowMs",
  );
}

function validateMimoProviderLimits(failures, providerLimits) {
  requireObject(failures, providerLimits, "mimo.providerLimits 必须是对象。");
  if (!isObject(providerLimits)) return;
  validateAllowedKeys(
    failures,
    providerLimits,
    new Set([
      "aiTimeoutMs",
      "aiMaxResponseBytes",
      "speechTimeoutMs",
      "speechMaxResponseBytes",
      "ttsTimeoutMs",
      "ttsMaxResponseBytes",
    ]),
    "mimo.providerLimits",
  );
  for (const field of ["aiTimeoutMs", "speechTimeoutMs", "ttsTimeoutMs"]) {
    requirePositiveSafeInteger(
      failures,
      providerLimits[field],
      `mimo.providerLimits.${field}`,
      2_147_483_647,
    );
  }
  for (const field of [
    "aiMaxResponseBytes",
    "speechMaxResponseBytes",
    "ttsMaxResponseBytes",
  ]) {
    requirePositiveSafeInteger(
      failures,
      providerLimits[field],
      `mimo.providerLimits.${field}`,
      16 * 1024 * 1024,
    );
  }
}

function validateMimoUsage(failures, usage) {
  requireObject(failures, usage, "mimo.usage 必须是对象。");
  if (!isObject(usage)) return;
  validateAllowedKeys(
    failures,
    usage,
    new Set(["keyValueUrl", "keyPrefix", ...mimoUsageIntegerFields]),
    "mimo.usage",
  );
  requireKeyValueUrl(failures, usage.keyValueUrl, "mimo.usage.keyValueUrl");
  requireString(failures, usage.keyPrefix, "mimo.usage.keyPrefix");
  for (const field of mimoUsageIntegerFields) {
    requirePositiveSafeInteger(failures, usage[field], `mimo.usage.${field}`);
  }
}

function validateAi(failures, ai, allowedMimoHosts) {
  requireObject(failures, ai, "ai 必须是对象。");
  if (!isObject(ai)) return;
  validateAllowedKeys(
    failures,
    ai,
    new Set([
      "requiredForLaunch",
      "provider",
      "modelName",
      "modelVersion",
      "endpoint",
      "promptVersion",
      "humanReviewRequired",
      "humanReviewOwner",
    ]),
    "ai",
  );
  requireTrue(
    failures,
    ai.requiredForLaunch,
    "ai.requiredForLaunch 必须为 true。",
  );
  requireEqual(
    failures,
    ai.provider,
    mimoProviders.ai,
    "ai.provider 必须精确为 xiaomi-mimo。",
  );
  requireString(failures, ai.modelName, "ai.modelName");
  requireString(failures, ai.modelVersion, "ai.modelVersion");
  requireApprovedMimoEndpoint(
    failures,
    ai.endpoint,
    "ai.endpoint",
    allowedMimoHosts,
  );
  requireString(failures, ai.promptVersion, "ai.promptVersion");
  requireTrue(
    failures,
    ai.humanReviewRequired,
    "真实 AI 评估必须启用医师人工复核。",
  );
  requireString(failures, ai.humanReviewOwner, "ai.humanReviewOwner");
}

function validateSpeech(failures, speech, allowedMimoHosts) {
  requireObject(failures, speech, "speech 必须是对象。");
  if (!isObject(speech)) return;
  validateAllowedKeys(
    failures,
    speech,
    new Set([
      "requiredForLaunch",
      "provider",
      "endpoint",
      "modelVersion",
      "maxDecodedAudioBytes",
      "maxDurationSeconds",
      "microphoneConsentRequired",
    ]),
    "speech",
  );
  requireTrue(
    failures,
    speech.requiredForLaunch,
    "speech.requiredForLaunch 必须为 true。",
  );
  requireEqual(
    failures,
    speech.provider,
    mimoProviders.speech,
    "speech.provider 必须精确为 xiaomi-mimo-audio-understanding。",
  );
  requireApprovedMimoEndpoint(
    failures,
    speech.endpoint,
    "speech.endpoint",
    allowedMimoHosts,
  );
  requireString(failures, speech.modelVersion, "speech.modelVersion");
  requirePositiveSafeInteger(
    failures,
    speech.maxDecodedAudioBytes,
    "speech.maxDecodedAudioBytes",
    maxSttDecodedAudioBytes,
  );
  requirePositiveSafeInteger(
    failures,
    speech.maxDurationSeconds,
    "speech.maxDurationSeconds",
  );
  requireTrue(
    failures,
    speech.microphoneConsentRequired,
    "speech.microphoneConsentRequired 必须为 true，并对应 microphone_capture 授权。",
  );
}

function validateTts(failures, tts, allowedMimoHosts) {
  requireObject(failures, tts, "tts 必须是对象。");
  if (!isObject(tts)) return;
  validateAllowedKeys(
    failures,
    tts,
    new Set([
      "requiredForLaunch",
      "provider",
      "endpoint",
      "modelVersion",
      "voiceId",
      "outputFormat",
      "patientPlaybackConsentRequired",
    ]),
    "tts",
  );
  requireTrue(
    failures,
    tts.requiredForLaunch,
    "tts.requiredForLaunch 必须为 true。",
  );
  requireEqual(
    failures,
    tts.provider,
    mimoProviders.tts,
    "tts.provider 必须精确为 xiaomi-mimo-tts。",
  );
  requireApprovedMimoEndpoint(
    failures,
    tts.endpoint,
    "tts.endpoint",
    allowedMimoHosts,
  );
  requireString(failures, tts.modelVersion, "tts.modelVersion");
  requireEnum(failures, tts.modelVersion, allowedTtsModels, "tts.modelVersion");
  requireString(failures, tts.voiceId, "tts.voiceId");
  requireEnum(
    failures,
    tts.outputFormat,
    allowedTtsOutputFormats,
    "tts.outputFormat",
  );
  requireTrue(
    failures,
    tts.patientPlaybackConsentRequired,
    "tts.patientPlaybackConsentRequired 必须为 true，并对应 privacy_policy 与 ai_processing 授权。",
  );
}

function validateTrainingContent(failures, trainingContent) {
  requireObject(failures, trainingContent, "trainingContent 必须是对象。");
  if (!isObject(trainingContent)) return;
  requireTrue(
    failures,
    trainingContent.browserPoseAccepted,
    "浏览器体感必须完成实机验收。",
  );
  requireString(
    failures,
    trainingContent.browserEvidencePath,
    "trainingContent.browserEvidencePath",
  );
  requireStringArray(
    failures,
    trainingContent.targetBrowsers,
    "trainingContent.targetBrowsers",
  );
  requireString(
    failures,
    trainingContent.cameraModel,
    "trainingContent.cameraModel",
  );
  if (trainingContent.unityRequiredForLaunch === true) {
    requireString(
      failures,
      trainingContent.unityBuildManifestPath,
      "trainingContent.unityBuildManifestPath",
    );
  }
}

function validateAcceptanceEvidence(failures, acceptanceEvidence) {
  requireObject(
    failures,
    acceptanceEvidence,
    "acceptanceEvidence 必须是对象。",
  );
  if (!isObject(acceptanceEvidence)) return;
  for (const field of [
    "roleScreenshotsReady",
    "assessmentEvidenceReady",
    "trainingEvidenceReady",
    "auditEvidenceReady",
    "desensitizedExportReady",
    "deploymentEvidenceReady",
  ]) {
    requireTrue(
      failures,
      acceptanceEvidence[field],
      `acceptanceEvidence.${field} 必须为 true。`,
    );
  }
}

function requireObject(failures, value, message) {
  if (!isObject(value)) {
    failures.push(message);
  }
}

function requireString(failures, value, field) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${field} 不能为空。`);
  }
}

function requireStringArray(failures, value, field) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    failures.push(`${field} 必须是非空字符串数组。`);
  }
}

function requireTrue(failures, value, message) {
  if (value !== true) {
    failures.push(message);
  }
}

function requireEqual(failures, actual, expected, message) {
  if (actual !== expected) {
    failures.push(message);
  }
}

function requireEnum(failures, value, allowedValues, field) {
  requireString(failures, value, field);
  if (
    typeof value === "string" &&
    value.trim() &&
    !allowedValues.has(value.trim())
  ) {
    failures.push(
      `${field} 必须是 ${Array.from(allowedValues).join("、")} 之一。`,
    );
  }
}

function requireSecretRef(failures, value, field) {
  requireString(failures, value, field);
  if (
    typeof value === "string" &&
    value.trim() &&
    !value.startsWith(secretRefPrefix)
  ) {
    failures.push(`${field} 必须使用 secret-manager:// 形式的密钥引用。`);
  }
}

function requireSecretFilePath(failures, value, field) {
  if (
    typeof value !== "string" ||
    !/^\/etc\/secrets\/[A-Za-z0-9._-]+$/.test(value)
  ) {
    failures.push(`${field} 必须是 /etc/secrets 下的直接 Secret File 路径。`);
  }
}

function requireMimoHostArray(failures, value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    failures.push(`${field} 必须是非空的批准 MiMo DNS 主机名数组。`);
    return new Set();
  }

  const hosts = value.map((host) => (typeof host === "string" ? host : ""));
  if (
    hosts.some(
      (host) =>
        !host ||
        host.trim() !== host ||
        host.includes("/") ||
        host.includes(":") ||
        host === "localhost" ||
        host.endsWith(".local") ||
        /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host),
    )
  ) {
    failures.push(`${field} 必须是无空白的批准 MiMo DNS 主机名数组。`);
  }
  return new Set(hosts.map((host) => host.toLowerCase()));
}

function requireApprovedMimoEndpoint(failures, value, field, allowedMimoHosts) {
  try {
    const endpoint = new URL(value);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password ||
      endpoint.port ||
      !allowedMimoHosts.has(endpoint.hostname.toLowerCase())
    ) {
      throw new Error("invalid endpoint");
    }
    for (const queryName of endpoint.searchParams.keys()) {
      if (
        /authorization|api[-_ ]?key|token|secret|password|credential|cookie/i.test(
          queryName,
        )
      ) {
        throw new Error("credential query");
      }
    }
  } catch {
    failures.push(
      `${field} 必须使用 mimo.allowedHosts 内无凭据的正式 HTTPS endpoint。`,
    );
  }
}

function requireKeyValueUrl(failures, value, field) {
  try {
    const endpoint = new URL(value);
    const host = endpoint.hostname.toLowerCase();
    if (
      (endpoint.protocol !== "redis:" && endpoint.protocol !== "rediss:") ||
      !host ||
      host === "localhost" ||
      host.endsWith(".local") ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
    ) {
      throw new Error("invalid key value URL");
    }
  } catch {
    failures.push(
      `${field} 必须是批准私网 Key Value 的 redis:// 或 rediss:// URL。`,
    );
  }
}

function requirePositiveSafeInteger(
  failures,
  value,
  field,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    failures.push(`${field} 必须是范围内的正安全整数。`);
  }
}

function validateAllowedKeys(failures, value, allowedKeys, field) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      failures.push(`${field}.${key} 不是 v2 MiMo 生产资料允许的字段。`);
    }
  }
}

function requireHttpsUrl(failures, value, field) {
  requireString(failures, value, field);
  if (typeof value !== "string" || !value.trim()) return;
  let url;
  try {
    url = new URL(value);
  } catch {
    failures.push(`${field} 必须是有效 URL。`);
    return;
  }
  if (url.protocol !== "https:") {
    failures.push(`${field} 必须使用正式 HTTPS 地址。`);
  }
  if (["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname)) {
    failures.push(`${field} 不能指向本地地址。`);
  }
}

function requireIsoDate(failures, value, field) {
  requireString(failures, value, field);
  if (
    typeof value === "string" &&
    value.trim() &&
    !Number.isFinite(Date.parse(value))
  ) {
    failures.push(`${field} 必须是有效日期。`);
  }
}

function requireIntegerRange(failures, value, min, max, field) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    failures.push(`${field} 必须是 ${min} 到 ${max} 之间的整数。`);
  }
}

function validateNoPlaceholders(failures, value, path = "root") {
  if (typeof value === "string") {
    if (/[<>]/.test(value)) {
      failures.push(`${path} 含占位符，必须填写客户确认后的正式资料。`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateNoPlaceholders(failures, item, `${path}[${index}]`),
    );
    return;
  }
  if (isObject(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      validateNoPlaceholders(failures, nestedValue, `${path}.${key}`);
    }
  }
}

function validateNoDemoMockLocalManual(failures, value, path = "root") {
  if (typeof value === "string") {
    if (
      /(^|[^a-z0-9])(mock|demo|local|manual|fallback)([^a-z0-9]|$)/i.test(value)
    ) {
      failures.push(
        `${path} 包含 mock/demo/local/manual/fallback 标记，不能作为客户生产资料。`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateNoDemoMockLocalManual(failures, item, `${path}[${index}]`),
    );
    return;
  }
  if (isObject(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      validateNoDemoMockLocalManual(failures, nestedValue, `${path}.${key}`);
    }
  }
}

function validateNoTemplateExampleValues(failures, value, path = "root") {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return;

    if (/\bexample\.(com|cn|org|net)\b/i.test(trimmed)) {
      failures.push(
        `${path} 使用 example 示例域名，必须替换为客户确认后的正式资料。`,
      );
    }

    if (trimmed.includes(" | ")) {
      failures.push(
        `${path} 使用模板枚举提示，必须选择客户确认后的单一正式值。`,
      );
    }

    if (templateTextMarkers.some((marker) => trimmed.includes(marker))) {
      failures.push(
        `${path} 使用模板说明文字，必须替换为客户确认后的正式资料。`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateNoTemplateExampleValues(failures, item, `${path}[${index}]`),
    );
    return;
  }
  if (isObject(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      validateNoTemplateExampleValues(failures, nestedValue, `${path}.${key}`);
    }
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readInput(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function cli() {
  const inputPath = process.argv.slice(2).find((arg) => arg !== "--");
  if (!inputPath) {
    console.error(
      "用法：pnpm verify:customer-production-input -- <customer-production-input.json>",
    );
    process.exitCode = 1;
    return;
  }

  const resolvedPath = resolve(process.cwd(), inputPath);
  if (!existsSync(resolvedPath)) {
    console.error(`客户生产资料包不存在：${resolvedPath}`);
    process.exitCode = 1;
    return;
  }

  let input;
  try {
    input = readInput(resolvedPath);
  } catch (error) {
    console.error(`客户生产资料包不是有效 JSON：${error.message}`);
    process.exitCode = 1;
    return;
  }

  const result = validateCustomerProductionInput(input);
  if (result.failures.length) {
    console.error("客户生产资料包校验失败：");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("客户生产资料包校验通过。");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}
