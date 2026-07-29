#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CookieSessionClient } from "./local-contract-cookie-session.mjs";

const defaultRequiredAuditActions = [
  "consent.grant",
  "caregiver_relation.create",
  "assessment.create",
  "rehab_plan.recommend",
  "rehab_plan.confirm",
  "training_session.start",
  "training_result.submit",
  "training_result.review",
  "caregiver.summary.view",
];
const forbiddenMarkerPattern =
  /(^|[^a-z0-9])(mock|demo|seed|fallback|fixed|manual)([^a-z0-9]|$)/i;
const sensitiveMetadataKeys = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "contentbase64",
  "key",
  "payload",
  "raw",
  "rawpayload",
  "requestbody",
  "responsebody",
  "secret",
  "token",
  "transcript",
]);
const formalAcceptanceConfigKeys = new Set([
  "templateNotice",
  "apiBaseUrl",
  "doctorAccount",
  "doctorPassword",
  "caregiverAccount",
  "caregiverPassword",
  "auditAccount",
  "auditPassword",
  "chain",
  "requiredAuditActions",
]);

export async function verifyFormalAcceptanceChain(config = {}) {
  const failures = [];
  if (!isObject(config)) {
    return { failures: ["正式业务链验收配置必须是对象。"] };
  }
  validateAllowedKeys(failures, config, formalAcceptanceConfigKeys);
  const {
    apiBaseUrl,
    doctorAccount,
    doctorPassword,
    caregiverAccount,
    caregiverPassword,
    auditAccount,
    auditPassword,
    chain,
    requiredAuditActions = defaultRequiredAuditActions,
  } = config;
  validateConfig(failures, {
    apiBaseUrl,
    doctorAccount,
    doctorPassword,
    caregiverAccount,
    caregiverPassword,
    auditAccount,
    auditPassword,
    chain,
    requiredAuditActions,
  });
  if (failures.length) return { failures };

  const apiRoot = normalizeApiRoot(apiBaseUrl);
  const doctorClient = new CookieSessionClient(apiBaseUrl);
  const caregiverClient = new CookieSessionClient(apiBaseUrl);
  const auditClient = new CookieSessionClient(apiBaseUrl);
  if (
    !(await loginClient(failures, {
      client: doctorClient,
      account: doctorAccount,
      password: doctorPassword,
      label: "医师账号",
    }))
  ) {
    return { failures };
  }
  if (
    !(await loginClient(failures, {
      client: caregiverClient,
      account: caregiverAccount,
      password: caregiverPassword,
      label: "家属账号",
    }))
  ) {
    return { failures };
  }
  if (
    !(await loginClient(failures, {
      client: auditClient,
      account: auditAccount,
      password: auditPassword,
      label: "审计账号",
    }))
  ) {
    return { failures };
  }

  const patient = await fetchJson(failures, {
    url: `${apiRoot}/patients/${encodeURIComponent(chain.patientId)}`,
    client: doctorClient,
    label: "患者详情 API",
  });
  if (!requireObjectResponse(failures, patient, "患者详情 API")) {
    return { failures };
  }
  validateBusinessEvidenceSafe(failures, patient, "患者详情");
  verifyPatientDetail(failures, { patient, chain });
  if (failures.length) return { failures };

  const assessments = await fetchArray(failures, {
    url: `${apiRoot}/patients/${encodeURIComponent(chain.patientId)}/assessments`,
    client: doctorClient,
    label: "评估列表 API",
  });
  if (!assessments) return { failures };
  validateBusinessEvidenceSafe(failures, assessments, "正式评估列表");
  verifyAssessment(failures, { assessments, chain });
  if (failures.length) return { failures };

  const trainingRecords = await fetchJson(failures, {
    url: `${apiRoot}/patients/${encodeURIComponent(chain.patientId)}/training-records`,
    client: doctorClient,
    label: "训练记录 API",
  });
  if (!requireObjectResponse(failures, trainingRecords, "训练记录 API")) {
    return { failures };
  }
  validateBusinessEvidenceSafe(failures, trainingRecords, "训练记录");
  verifyTrainingRecords(failures, { trainingRecords, chain });
  if (failures.length) return { failures };

  const caregiverSummary = await fetchJson(failures, {
    url: `${apiRoot}/caregiver/patients/${encodeURIComponent(chain.patientId)}/summary`,
    client: caregiverClient,
    label: "家属摘要 API",
  });
  if (!requireObjectResponse(failures, caregiverSummary, "家属摘要 API")) {
    return { failures };
  }
  validateBusinessEvidenceSafe(failures, caregiverSummary, "家属摘要");
  verifyCaregiverSummary(failures, { caregiverSummary, chain });
  if (failures.length) return { failures };

  await verifyAuditLogs(failures, {
    apiRoot,
    client: auditClient,
    chain,
    requiredAuditActions,
    patient,
  });

  return { failures };
}

function validateAllowedKeys(failures, config, allowedKeys) {
  for (const key of Object.keys(config)) {
    if (!allowedKeys.has(key)) {
      failures.push(`${key} 是不支持的配置字段。`);
    }
  }
}

function validateConfig(
  failures,
  {
    apiBaseUrl,
    doctorAccount,
    doctorPassword,
    caregiverAccount,
    caregiverPassword,
    auditAccount,
    auditPassword,
    chain,
    requiredAuditActions,
  },
) {
  requireHttpsUrl(failures, apiBaseUrl, "apiBaseUrl");
  requireString(failures, doctorAccount, "doctorAccount");
  requireString(failures, doctorPassword, "doctorPassword");
  requireString(failures, caregiverAccount, "caregiverAccount");
  requireString(failures, caregiverPassword, "caregiverPassword");
  requireString(failures, auditAccount, "auditAccount");
  requireString(failures, auditPassword, "auditPassword");
  validateChain(failures, chain);
  if (
    !Array.isArray(requiredAuditActions) ||
    requiredAuditActions.length === 0
  ) {
    failures.push("requiredAuditActions 必须显式提供审计动作列表。");
  } else {
    for (const action of requiredAuditActions) {
      if (!defaultRequiredAuditActions.includes(action)) {
        failures.push(
          `requiredAuditActions 包含未知审计动作 ${action}，不能作为正式业务链验收项。`,
        );
      }
    }
    for (const action of defaultRequiredAuditActions) {
      if (!requiredAuditActions.includes(action)) {
        failures.push(`requiredAuditActions 缺少 ${action}。`);
      }
    }
  }
}

async function loginClient(failures, { client, account, password, label }) {
  try {
    await client.login(account, password);
    return true;
  } catch (error) {
    const status = readHttpStatus(error);
    if (status) {
      failures.push(
        `${label}登录返回 HTTP ${status}：响应体已隐藏，未执行后续验收。`,
      );
      return false;
    }
    const message = String(error?.message ?? "");
    if (/password_reset_required/i.test(message)) {
      failures.push(
        `${label}登录失败：password_reset_required，未执行后续验收。`,
      );
    } else if (/csrf|rehab_csrf/i.test(message)) {
      failures.push(`${label}登录失败：Cookie/CSRF 会话无效，未执行后续验收。`);
    } else {
      failures.push(`${label}登录失败：错误详情已隐藏，未执行后续验收。`);
    }
    return false;
  }
}

function validateChain(failures, chain) {
  if (!requireObject(failures, chain, "chain 必须是对象。")) return;
  for (const field of [
    "patientId",
    "assessmentId",
    "rehabPlanId",
    "planItemId",
    "gameContentId",
    "trainingSessionId",
    "trainingResultId",
    "caregiverUserId",
  ]) {
    requireString(failures, chain[field], `chain.${field}`);
  }
}

function verifyPatientDetail(failures, { patient, chain }) {
  compareFields(failures, "患者详情", patient, { id: chain.patientId });
  verifyRequiredConsents(failures, patient.consents);

  const plan = findPlan(patient.rehabPlans, chain.rehabPlanId);
  if (!plan) {
    failures.push("患者详情未找到同一条业务链的当前康复方案。");
  } else {
    verifyPlan(failures, { plan, chain, label: "患者详情康复方案" });
  }

  const caregiverRelation = Array.isArray(patient.caregiverRelations)
    ? patient.caregiverRelations.find(
        (relation) =>
          relation?.caregiverUserId === chain.caregiverUserId ||
          relation?.caregiver?.id === chain.caregiverUserId,
      )
    : null;
  if (!caregiverRelation) {
    failures.push("患者详情未找到同一条业务链的家属授权关系。");
  } else if (
    caregiverRelation.authorizationStatus !== "active" ||
    caregiverRelation.revokedAt
  ) {
    failures.push("同一条业务链的家属授权关系必须处于 active 且未撤回。");
  }
}

function verifyRequiredConsents(failures, consents) {
  if (!Array.isArray(consents)) {
    failures.push("患者详情 consents 必须是数组。");
    return;
  }
  for (const consentType of [
    "privacy_policy",
    "ai_processing",
    "camera_capture",
    "caregiver_sharing",
  ]) {
    const record = consents.find(
      (consent) =>
        consent?.consentType === consentType &&
        consent.status === "granted" &&
        !consent.revokedAt,
    );
    if (!record) {
      failures.push(`同一条业务链缺少有效 ${consentType} 授权。`);
    }
  }
}

function verifyPlan(failures, { plan, chain, label }) {
  compareFields(failures, label, plan, {
    id: chain.rehabPlanId,
    patientId: chain.patientId,
    status: "active",
    isCurrent: true,
  });
  const item = Array.isArray(plan.items)
    ? plan.items.find((value) => value?.id === chain.planItemId)
    : null;
  if (!item) {
    failures.push(`${label} 未找到同一条业务链的 planItemId。`);
    return;
  }
  compareFields(failures, `${label}.items`, item, {
    id: chain.planItemId,
    rehabPlanId: chain.rehabPlanId,
    gameContentId: chain.gameContentId,
  });
  const gameContent = item.gameContent ?? {};
  compareFields(failures, `${label}.gameContent`, gameContent, {
    id: chain.gameContentId,
    buildStatus: "released",
    bridgeProtocolVersion: "1.0.0",
  });
  requireString(
    failures,
    gameContent.runtimeType,
    `${label}.gameContent.runtimeType`,
  );
  requireString(
    failures,
    gameContent.gameVersion,
    `${label}.gameContent.gameVersion`,
  );
}

function verifyAssessment(failures, { assessments, chain }) {
  const assessment = assessments.find(
    (item) => item?.id === chain.assessmentId,
  );
  if (!assessment) {
    failures.push("评估列表未找到同一条业务链的 assessmentId。");
    return;
  }
  compareFields(failures, "正式评估", assessment, {
    id: chain.assessmentId,
    patientId: chain.patientId,
  });
  if (!Array.isArray(assessment.riskGrades) || !assessment.riskGrades.length) {
    failures.push("正式评估必须能反查风险评级。");
  }
  if (!Array.isArray(assessment.aiAnalyses) || !assessment.aiAnalyses.length) {
    failures.push("正式评估必须能反查分析记录。");
  }
}

function verifyTrainingRecords(failures, { trainingRecords, chain }) {
  if (!Array.isArray(trainingRecords.sessions)) {
    failures.push("训练记录 API 返回的 sessions 必须是数组。");
    return;
  }
  const session = trainingRecords.sessions.find(
    (item) => item?.id === chain.trainingSessionId,
  );
  if (!session) {
    failures.push("训练记录 API 未找到同一条业务链的 trainingSessionId。");
    return;
  }
  compareFields(failures, "训练会话同一条业务链", session, {
    id: chain.trainingSessionId,
    patientId: chain.patientId,
    rehabPlanId: chain.rehabPlanId,
    planItemId: chain.planItemId,
    gameContentId: chain.gameContentId,
    sessionStatus: "completed",
  });
  const result = session.result;
  if (!result) {
    failures.push("训练会话缺少训练结果。");
    return;
  }
  compareFields(failures, "训练结果同一条业务链", result, {
    id: chain.trainingResultId,
    sessionId: chain.trainingSessionId,
  });
  if (result.reviewStatus !== "reviewed") {
    failures.push("训练结果必须已完成医生复核 reviewStatus=reviewed。");
  }
  requireString(failures, result.reviewConclusion, "训练结果医生复核结论");
  requireString(failures, result.reviewedByUserId, "训练结果医生复核人");
  requireIsoDate(failures, result.reviewedAt, "训练结果医生复核时间");
  verifyMotionMetrics(failures, session.motionMetrics);
}

function verifyMotionMetrics(failures, motionMetrics) {
  if (!Array.isArray(motionMetrics) || motionMetrics.length === 0) {
    failures.push("训练记录必须包含结构化动作指标。");
    return;
  }
  for (const metricType of [
    "reaction_time_ms",
    "target_hit_rate",
    "arm_raise_accuracy",
  ]) {
    const metric = motionMetrics.find(
      (item) => item?.metricType === metricType,
    );
    if (!metric) {
      failures.push(`训练记录缺少正式动作指标 ${metricType}。`);
      continue;
    }
    requireNumber(
      failures,
      metric.metricValue,
      `训练记录动作指标 ${metricType}.metricValue`,
    );
    if (
      metric.confidence !== undefined &&
      (typeof metric.confidence !== "number" ||
        metric.confidence < 0 ||
        metric.confidence > 1)
    ) {
      failures.push(
        `训练记录动作指标 ${metricType}.confidence 必须在 0 到 1 之间。`,
      );
    }
  }
}

function verifyCaregiverSummary(failures, { caregiverSummary, chain }) {
  if (caregiverSummary?.patient?.id !== chain.patientId) {
    failures.push("家属摘要必须返回同一患者。");
  }
  if (
    hasNestedKey(caregiverSummary, "motionMetrics") ||
    hasNestedKey(caregiverSummary, "metricsSummary")
  ) {
    failures.push("家属摘要不得暴露原始动作指标或采集明细。");
  }
  const permissions = caregiverSummary?.permissions;
  if (
    permissions?.rawAssessment !== false ||
    permissions?.planEdit !== false ||
    permissions?.fullMedicalRecord !== false
  ) {
    failures.push("家属摘要必须显式关闭原始评估、方案编辑和完整病历权限。");
  }
  const recentTraining = Array.isArray(caregiverSummary.recentTraining)
    ? caregiverSummary.recentTraining
    : [];
  const matchedTraining = recentTraining.find(
    (item) => item?.id === chain.trainingSessionId,
  );
  if (!matchedTraining) {
    failures.push("家属摘要未展示同一条业务链的训练进展摘要。");
    return;
  }
  compareFields(failures, "家属摘要训练进展", matchedTraining, {
    id: chain.trainingSessionId,
    patientId: chain.patientId,
    rehabPlanId: chain.rehabPlanId,
    planItemId: chain.planItemId,
    gameContentId: chain.gameContentId,
  });
  if (matchedTraining.result?.id !== chain.trainingResultId) {
    failures.push("家属摘要训练进展 result.id 必须属于同一条业务链。");
  }
}

async function verifyAuditLogs(
  failures,
  { apiRoot, client, chain, requiredAuditActions, patient },
) {
  for (const action of requiredAuditActions) {
    const targets = auditTargetsForAction(action, chain, patient);
    for (const target of targets) {
      await verifyAuditTarget(failures, {
        apiRoot,
        client,
        action,
        target,
      });
    }
  }
}

async function verifyAuditTarget(
  failures,
  { apiRoot, client, action, target },
) {
  const url = new URL(`${apiRoot}/admin/audit-logs`);
  url.searchParams.set("action", action);
  url.searchParams.set("targetType", target.targetType);
  url.searchParams.set("targetId", target.targetId);
  url.searchParams.set("result", "success");
  url.searchParams.set("limit", "200");

  const logs = await fetchArray(failures, {
    url: url.toString(),
    client,
    label: `${action} 审计 API`,
  });
  if (!logs) return;
  logs.forEach((log, index) => {
    validateBusinessEvidenceSafe(failures, log, `${action} 审计候选[${index}]`);
  });
  const matched = logs.filter(
    (log) =>
      log?.action === action &&
      log.targetType === target.targetType &&
      log.targetId === target.targetId &&
      log.result === "success",
  );
  if (matched.length !== 1) {
    failures.push(
      `${action} 对应同一条业务链的成功审计日志候选数量必须严格等于 1。`,
    );
    return;
  }
  validateAuditMetadataSafe(failures, matched[0].metadata);
}

function auditTargetsForAction(action, chain, patient) {
  if (action === "consent.grant") {
    return requiredConsentRecords(patient.consents).map((consent) => ({
      targetType: "consent_record",
      targetId: consent.id,
    }));
  }
  if (action === "caregiver_relation.create") {
    const relation = findCaregiverRelation(patient.caregiverRelations, chain);
    return [{ targetType: "caregiver_relation", targetId: relation?.id ?? "" }];
  }
  if (action === "assessment.create") {
    return [{ targetType: "assessment_record", targetId: chain.assessmentId }];
  }
  if (action === "rehab_plan.recommend" || action === "rehab_plan.confirm") {
    return [{ targetType: "rehab_plan", targetId: chain.rehabPlanId }];
  }
  if (
    action === "training_session.start" ||
    action === "training_result.submit"
  ) {
    return [
      { targetType: "training_session", targetId: chain.trainingSessionId },
    ];
  }
  if (action === "training_result.review") {
    return [
      { targetType: "training_result", targetId: chain.trainingResultId },
    ];
  }
  if (action === "caregiver.summary.view") {
    return [{ targetType: "patient_profile", targetId: chain.patientId }];
  }
  return [];
}

function requiredConsentRecords(consents) {
  if (!Array.isArray(consents)) return [];
  return [
    "privacy_policy",
    "ai_processing",
    "camera_capture",
    "caregiver_sharing",
  ]
    .map((consentType) =>
      consents.find(
        (consent) =>
          consent?.consentType === consentType &&
          consent.status === "granted" &&
          !consent.revokedAt,
      ),
    )
    .filter(Boolean);
}

function findCaregiverRelation(relations, chain) {
  if (!Array.isArray(relations)) return null;
  return relations.find(
    (relation) =>
      relation?.caregiverUserId === chain.caregiverUserId ||
      relation?.caregiver?.id === chain.caregiverUserId,
  );
}

async function fetchArray(failures, request) {
  const failureCount = failures.length;
  const value = await fetchJson(failures, request);
  if (failures.length > failureCount) return null;
  if (!Array.isArray(value)) {
    failures.push(
      `${request.label} 返回值必须是数组，不能是 2xx 空体、null 或其他错误 shape。`,
    );
    return null;
  }
  return value;
}

function requireObjectResponse(failures, value, label) {
  if (isObject(value)) return value;
  failures.push(
    `${label} 返回值必须是对象，不能是 2xx 空体、null 或其他错误 shape。`,
  );
  return null;
}

async function fetchJson(failures, { url, client, label }) {
  try {
    return await client.request(url, {
      headers: {
        Accept: "application/json",
      },
    });
  } catch (error) {
    const status = readHttpStatus(error);
    if (status) {
      failures.push(
        `${label} 返回 HTTP ${status}：响应体已隐藏，避免泄露凭据、密钥、病历或训练载荷。`,
      );
    } else {
      failures.push(`${label} 请求失败。`);
    }
    return null;
  }
}

function readHttpStatus(error) {
  return /^HTTP (\d{3})\b/.exec(String(error?.message ?? ""))?.[1];
}

function validateAuditMetadataSafe(failures, metadata) {
  if (metadata === null || metadata === undefined) return;
  if (!isObject(metadata)) {
    failures.push("正式业务链审计 metadata 必须是对象或空值。");
    return;
  }
  const unsafePaths = [];
  collectUnsafeMetadataPaths(metadata, "正式业务链审计 metadata", unsafePaths);
  for (const path of unsafePaths) {
    failures.push(
      `${path} 包含敏感字段、演示/手工标记或原始载荷，不能作为正式业务链审计记录。`,
    );
  }
}

function collectUnsafeMetadataPaths(value, path, paths) {
  collectUnsafeValuePaths(value, path, paths);
}

function validateBusinessEvidenceSafe(failures, value, label) {
  const unsafePaths = [];
  collectUnsafeValuePaths(value, label, unsafePaths);
  for (const path of unsafePaths) {
    failures.push(
      `${path} 包含敏感字段、演示/手工标记或原始载荷，不能作为正式业务链验收证据。`,
    );
  }
}

function collectUnsafeValuePaths(value, path, paths) {
  if (typeof value === "string") {
    if (isUnsafeText(value)) paths.push(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectUnsafeValuePaths(item, `${path}[${index}]`, paths),
    );
    return;
  }
  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (isSafeHashMetadataField(key, nested)) continue;
    if (sensitiveMetadataKeys.has(normalizeKey(key))) {
      paths.push(nestedPath);
      continue;
    }
    collectUnsafeValuePaths(nested, nestedPath, paths);
  }
}

function isSafeHashMetadataField(key, value) {
  return (
    /hash$/i.test(normalizeKey(key)) &&
    typeof value === "string" &&
    isHashDigestText(value)
  );
}

function compareFields(failures, label, actual, expected) {
  for (const [field, expectedValue] of Object.entries(expected)) {
    const actualValue = actual?.[field];
    if (!valuesEqual(actualValue, expectedValue)) {
      failures.push(`${label}.${field} 与预期不一致，不能证明同一条业务链。`);
    }
  }
}

function findPlan(plans, rehabPlanId) {
  if (!Array.isArray(plans)) return null;
  return plans.find((plan) => plan?.id === rehabPlanId);
}

function hasNestedKey(value, key) {
  if (Array.isArray(value))
    return value.some((item) => hasNestedKey(item, key));
  if (!isObject(value)) return false;
  return Object.entries(value).some(
    ([nestedKey, nestedValue]) =>
      nestedKey === key || hasNestedKey(nestedValue, key),
  );
}

function requireObject(failures, value, message) {
  if (!isObject(value)) {
    failures.push(message);
    return null;
  }
  return value;
}

function requireString(failures, value, label) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${label} 必须显式提供非空文本。`);
  }
}

function requireNumber(failures, value, label) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    failures.push(`${label} 必须是有效数字。`);
  }
}

function requireIsoDate(failures, value, label) {
  requireString(failures, value, label);
  if (typeof value !== "string" || !value.trim()) return;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    failures.push(`${label} 必须是 ISO 8601 UTC 时间。`);
  }
}

function requireHttpsUrl(failures, value, label) {
  requireString(failures, value, label);
  if (typeof value !== "string" || !value.trim()) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      failures.push(`${label} 必须使用正式 HTTPS 地址。`);
    }
  } catch {
    failures.push(`${label} 必须是有效 URL。`);
  }
  if (typeof value === "string" && forbiddenMarkerPattern.test(value)) {
    failures.push(
      `${label} 不能包含 mock/demo/seed/fallback/fixed/manual 标记。`,
    );
  }
}

function valuesEqual(actual, expected) {
  return actual === expected;
}

function normalizeApiRoot(apiBaseUrl) {
  return apiBaseUrl.replace(/\/+$/, "");
}

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isUnsafeText(value) {
  if (isHashDigestText(value)) return false;
  return (
    forbiddenMarkerPattern.test(value) ||
    /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/i.test(value) ||
    /\b(?:sk|ak|api[_-]?key|secret|token)[_-]?[A-Za-z0-9._~+/=-]{8,}\b/i.test(
      value,
    ) ||
    /(?:[A-Za-z0-9+/]{40,}={0,2})/g.test(value)
  );
}

function isHashDigestText(value) {
  return /^(?:sha1|sha256|sha384|sha512):[a-f0-9]{40,128}$/i.test(value);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJsonFile(path) {
  try {
    return { value: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { error };
  }
}

async function cli() {
  const configPath = process.argv.slice(2).find((arg) => arg !== "--");

  if (!configPath) {
    console.error("缺少正式业务链验收配置文件路径。请显式传入 JSON 文件路径。");
    process.exitCode = 1;
    return;
  }

  const absolutePath = resolve(process.cwd(), configPath);
  if (!existsSync(absolutePath)) {
    console.error(`配置文件不存在：${absolutePath}`);
    process.exitCode = 1;
    return;
  }

  const readResult = readJsonFile(absolutePath);
  if (readResult.error) {
    console.error(`配置文件不是有效 JSON：${readResult.error.message}`);
    process.exitCode = 1;
    return;
  }

  const result = await verifyFormalAcceptanceChain(readResult.value);
  if (result.failures.length) {
    console.error("正式业务链只读验真失败：");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("正式业务链只读验真通过。");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await cli();
}
