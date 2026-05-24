#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const expectedDocumentVersion = "customer-production-input/v1";
const secretRefPrefix = "secret-manager://";
const allowedDeploymentModes = new Set(["public_cloud", "private_cloud", "intranet"]);
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
    "documentVersion 必须为 customer-production-input/v1。",
  );

  validateProject(failures, input.project);
  validateInfrastructure(failures, input.infrastructure);
  validateLegal(failures, input.legal);
  validateAccounts(failures, input.accounts);
  validateDataCollection(failures, input.dataCollection);
  validateAi(failures, input.ai);
  validateSpeech(failures, input.speech);
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
  requireIsoDate(failures, project.targetLaunchDate, "project.targetLaunchDate");
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
  requireHttpsUrl(failures, infrastructure.webDomain, "infrastructure.webDomain");
  requireHttpsUrl(failures, infrastructure.apiDomain, "infrastructure.apiDomain");
  requireString(failures, infrastructure.serverPlan, "infrastructure.serverPlan");
  requireSecretRef(
    failures,
    infrastructure.databaseUrlRef,
    "infrastructure.databaseUrlRef",
  );
  requireSecretRef(failures, infrastructure.redisUrlRef, "infrastructure.redisUrlRef");
  requireString(failures, infrastructure.backupPolicy, "infrastructure.backupPolicy");
  requireString(failures, infrastructure.monitoringOwner, "infrastructure.monitoringOwner");
}

function validateLegal(failures, legal) {
  requireObject(failures, legal, "legal 必须是对象。");
  if (!isObject(legal)) return;
  requireString(failures, legal.privacyAgreementVersion, "legal.privacyAgreementVersion");
  requireString(failures, legal.consentOwner, "legal.consentOwner");
  requireString(failures, legal.retentionPolicy, "legal.retentionPolicy");
  requireTrue(
    failures,
    legal.thirdPartyAiDataProcessingApproved,
    "legal.thirdPartyAiDataProcessingApproved 必须为 true，才能接入真实 AI/语音。",
  );
}

function validateAccounts(failures, accounts) {
  requireObject(failures, accounts, "accounts 必须是对象。");
  if (!isObject(accounts)) return;
  requireStringArray(failures, accounts.superAdmins, "accounts.superAdmins");
  requireStringArray(failures, accounts.operatorAdmins, "accounts.operatorAdmins");
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
  requireString(failures, dataCollection.patientSource, "dataCollection.patientSource");
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

function validateAi(failures, ai) {
  requireObject(failures, ai, "ai 必须是对象。");
  if (!isObject(ai)) return;
  validateExternalService(failures, ai, "ai", {
    requirePrompt: true,
    requireHumanReview: true,
    freeQuotaLabel: "AI 免费额度",
  });
  requireString(failures, ai.modelName, "ai.modelName");
  requireString(failures, ai.modelVersion, "ai.modelVersion");
  requireIntegerRange(
    failures,
    ai.callLogRetentionDays,
    30,
    3650,
    "ai.callLogRetentionDays",
  );
}

function validateSpeech(failures, speech) {
  requireObject(failures, speech, "speech 必须是对象。");
  if (!isObject(speech)) return;
  validateExternalService(failures, speech, "speech", {
    requirePrompt: false,
    requireHumanReview: false,
    freeQuotaLabel: "语音免费额度",
  });
  requireString(failures, speech.modelVersion, "speech.modelVersion");
  requireTrue(
    failures,
    speech.microphoneConsentRequired,
    "speech.microphoneConsentRequired 必须为 true，并对应 microphone_capture 授权。",
  );
}

function validateExternalService(failures, service, prefix, options) {
  const requiredForLaunch = service.requiredForLaunch === true;
  if (!requiredForLaunch) return;

  requireString(failures, service.provider, `${prefix}.provider`);
  requireString(failures, service.accountOwner, `${prefix}.accountOwner`);
  requireHttpsUrl(failures, service.endpoint, `${prefix}.endpoint`);
  requireSecretRef(failures, service.apiKeyRef, `${prefix}.apiKeyRef`);
  if (options.requirePrompt) {
    requireString(failures, service.promptVersion, `${prefix}.promptVersion`);
  }
  if (service.freeTierPreferred === true) {
    requireTrue(
      failures,
      service.freeQuotaConfirmed,
      `${options.freeQuotaLabel}已优先选择，必须确认免费额度可用于试点或生产。`,
    );
    requireString(
      failures,
      service.freeQuotaDescription,
      `${prefix}.freeQuotaDescription`,
    );
    requireFreeQuotaEvidence(
      failures,
      service.freeQuotaDescription,
      `${prefix}.freeQuotaDescription`,
    );
  }
  if (options.requireHumanReview) {
    requireTrue(
      failures,
      service.humanReviewRequired,
      "真实 AI 评估必须启用医师人工复核。",
    );
    requireString(failures, service.humanReviewOwner, `${prefix}.humanReviewOwner`);
  }
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
  requireString(failures, trainingContent.cameraModel, "trainingContent.cameraModel");
  if (trainingContent.unityRequiredForLaunch === true) {
    requireString(
      failures,
      trainingContent.unityBuildManifestPath,
      "trainingContent.unityBuildManifestPath",
    );
  }
}

function validateAcceptanceEvidence(failures, acceptanceEvidence) {
  requireObject(failures, acceptanceEvidence, "acceptanceEvidence 必须是对象。");
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
  if (typeof value === "string" && value.trim() && !allowedValues.has(value.trim())) {
    failures.push(`${field} 必须是 ${Array.from(allowedValues).join("、")} 之一。`);
  }
}

function requireSecretRef(failures, value, field) {
  requireString(failures, value, field);
  if (typeof value === "string" && value.trim() && !value.startsWith(secretRefPrefix)) {
    failures.push(`${field} 必须使用 secret-manager:// 形式的密钥引用。`);
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
  if (typeof value === "string" && value.trim() && !Number.isFinite(Date.parse(value))) {
    failures.push(`${field} 必须是有效日期。`);
  }
}

function requireIntegerRange(failures, value, min, max, field) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    failures.push(`${field} 必须是 ${min} 到 ${max} 之间的整数。`);
  }
}

function requireFreeQuotaEvidence(failures, value, field) {
  if (typeof value !== "string" || !value.trim()) return;

  const evidenceGroups = [
    ["额度", "quota", "tokens", "分钟", "minutes", "次"],
    ["有效期", "到期", "expiry", "expires"],
    ["QPS", "并发", "concurrency", "rate limit"],
    ["超额", "计费", "billing", "用完即停"],
    ["试点", "生产", "production", "pilot"],
  ];
  const missingGroup = evidenceGroups.find(
    (keywords) => !keywords.some((keyword) => value.toLowerCase().includes(keyword.toLowerCase())),
  );

  if (missingGroup) {
    failures.push(
      `${field} 必须写明免费额度、有效期、QPS/并发、超额计费和试点或生产授权。`,
    );
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
    value.forEach((item, index) => validateNoPlaceholders(failures, item, `${path}[${index}]`));
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
    if (/(^|[^a-z0-9])(mock|demo|local|manual|fallback)([^a-z0-9]|$)/i.test(value)) {
      failures.push(`${path} 包含 mock/demo/local/manual/fallback 标记，不能作为客户生产资料。`);
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
      failures.push(`${path} 使用 example 示例域名，必须替换为客户确认后的正式资料。`);
    }

    if (trimmed.includes(" | ")) {
      failures.push(`${path} 使用模板枚举提示，必须选择客户确认后的单一正式值。`);
    }

    if (templateTextMarkers.some((marker) => trimmed.includes(marker))) {
      failures.push(`${path} 使用模板说明文字，必须替换为客户确认后的正式资料。`);
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
    console.error("用法：pnpm verify:customer-production-input -- <customer-production-input.json>");
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
