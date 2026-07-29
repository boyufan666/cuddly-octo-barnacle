#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { CookieSessionClient } from "./local-contract-cookie-session.mjs";

const forbiddenMarkers = ["mock", "demo", "seed", "fallback", "fixed", "manual"];
const sensitiveKeys = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "contentbase64",
  "imagebase64",
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
const requiredAuditActions = [
  "training_session.start",
  "training_result.submit",
];
const requiredCaptureMetricTypes = [
  "trajectory_summary",
  "reaction_time_ms",
  "target_hit_rate",
  "pose_visibility_avg",
  "arm_raise_accuracy",
  "motion_intensity",
  "duration_seconds",
];
const physiologicalMetricPatterns = [
  /heart[_-]?rate/i,
  /blood[_-]?oxygen/i,
  /spo2/i,
  /blood[_-]?pressure/i,
  /respiratory[_-]?rate/i,
  /body[_-]?temperature/i,
  /ecg|electrocardiogram/i,
];

export async function verifyMultiConditionDataCapture({
  evidence,
  apiBaseUrl,
  reviewAccount,
  reviewPassword,
  auditAccount,
  auditPassword,
} = {}) {
  const failures = [];

  validateConfig(failures, {
    evidence,
    apiBaseUrl,
    reviewAccount,
    reviewPassword,
    auditAccount,
    auditPassword,
  });
  if (failures.length) return { failures };

  const apiRoot = normalizeApiRoot(apiBaseUrl);
  const reviewClient = new CookieSessionClient(apiBaseUrl);
  const auditClient = new CookieSessionClient(apiBaseUrl);
  if (
    !(await loginClient(failures, {
      client: reviewClient,
      account: reviewAccount,
      password: reviewPassword,
      label: "复核账号",
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

  const trainingRecords = await fetchJson(failures, {
    url: `${apiRoot}/patients/${encodeURIComponent(
      evidence.patient.patientId,
    )}/training-records`,
    client: reviewClient,
    label: "训练记录复核 API",
  });
  if (!trainingRecords) return { failures };
  validateEvidenceSafe(failures, trainingRecords, "训练记录 API");
  if (!Array.isArray(trainingRecords.sessions)) {
    failures.push("训练记录 API 返回的 sessions 必须是数组。");
    return { failures };
  }

  for (const condition of evidence.conditions) {
    verifyConditionTrainingRecord(failures, {
      evidence,
      condition,
      sessions: trainingRecords.sessions,
    });
  }
  if (failures.length) return { failures };

  for (const condition of evidence.conditions) {
    await verifyAuditLogs(failures, {
      apiRoot,
      client: auditClient,
      condition,
    });
  }

  return { failures };
}

function validateConfig(
  failures,
  {
    evidence,
    apiBaseUrl,
    reviewAccount,
    reviewPassword,
    auditAccount,
    auditPassword,
  },
) {
  validateHttpsApiBaseUrl(failures, apiBaseUrl);
  requireString(failures, reviewAccount, "reviewAccount");
  requireString(failures, reviewPassword, "reviewPassword");
  requireString(failures, auditAccount, "auditAccount");
  requireString(failures, auditPassword, "auditPassword");
  validateEvidence(failures, evidence);
}

async function loginClient(failures, { client, account, password, label }) {
  try {
    await client.login(account, password);
    return true;
  } catch (error) {
    const status = readHttpStatus(error);
    if (status) {
      failures.push(`${label}登录返回 HTTP ${status}：响应体已隐藏，未执行后续验收。`);
      return false;
    }
    const message = String(error?.message ?? "");
    if (/password_reset_required/i.test(message)) {
      failures.push(`${label}登录失败：password_reset_required，未执行后续验收。`);
    } else if (/csrf|rehab_csrf/i.test(message)) {
      failures.push(`${label}登录失败：Cookie/CSRF 会话无效，未执行后续验收。`);
    } else {
      failures.push(`${label}登录失败：错误详情已隐藏，未执行后续验收。`);
    }
    return false;
  }
}

function validateEvidence(failures, evidence) {
  if (!requireObject(failures, evidence, "evidence 必须是对象。")) return;
  if (evidence.evidenceVersion !== "multi-condition-data-capture/v1") {
    failures.push("evidenceVersion 必须是 multi-condition-data-capture/v1。");
  }
  requireObject(failures, evidence.acceptance, "acceptance 必须是对象。");
  if (requireObject(failures, evidence.patient, "patient 必须是对象。")) {
    requireString(failures, evidence.patient.patientId, "patient.patientId");
  }
  if (!Array.isArray(evidence.expectedMetricTypes) || !evidence.expectedMetricTypes.length) {
    failures.push("expectedMetricTypes 必须是非空数组。");
  } else {
    for (const metricType of requiredCaptureMetricTypes) {
      if (!evidence.expectedMetricTypes.includes(metricType)) {
        failures.push(`expectedMetricTypes 缺少 DOCX 采集指标 ${metricType}。`);
      }
    }
  }
  validatePhysiologicalBoundary(failures, evidence);
  if (!Array.isArray(evidence.conditions) || evidence.conditions.length < 2) {
    failures.push("多条件采集验收至少两组不同采集条件。");
    return;
  }
  validateEvidenceSafe(failures, evidence, "多条件采集证据");
  verifyDistinctConditionIdentity(failures, evidence.conditions);
  for (const condition of evidence.conditions) {
    validateConditionEvidence(failures, condition, evidence.expectedMetricTypes);
  }
}

function validatePhysiologicalBoundary(failures, evidence) {
  const expectedMetricTypes = Array.isArray(evidence.expectedMetricTypes)
    ? evidence.expectedMetricTypes
    : [];
  const physiologicalMetricTypes = expectedMetricTypes.filter(isPhysiologicalMetricType);
  const conditionMetrics = Array.isArray(evidence.conditions)
    ? evidence.conditions.flatMap((condition) =>
        Array.isArray(condition?.motionMetrics) ? condition.motionMetrics : [],
      )
    : [];
  const physiologicalMotionMetrics = conditionMetrics.filter((metric) =>
    isPhysiologicalMetricType(metric?.metricType),
  );
  if (!physiologicalMetricTypes.length && !physiologicalMotionMetrics.length) {
    if (evidence.physiologicalMetricsStatus !== "customer-gated") {
      failures.push(
        "physiologicalMetricsStatus 必须标记为 customer-gated，除非客户提供穿戴设备证据。",
      );
    }
    return;
  }

  const wearableEvidence = evidence.wearableEvidence;
  if (!hasCompleteWearableEvidence(wearableEvidence)) {
    failures.push(
      "physiological metrics 必须保持 customer-gated：缺少客户提供的穿戴设备型号、SDK/API/协议、采样规则、阈值范围、授权范围和现场证据。",
    );
  }
}

function validateConditionEvidence(failures, condition, expectedMetricTypes) {
  if (!requireObject(failures, condition, "conditions[] 必须是对象。")) return;
  for (const [path, objectValue] of [
    ["collectionCondition", condition.collectionCondition],
    ["collectionProtocol", condition.collectionProtocol],
    ["collectionBatch", condition.collectionBatch],
    ["gameContent", condition.gameContent],
    ["rehabPlan", condition.rehabPlan],
    ["trainingSession", condition.trainingSession],
    ["trainingResult", condition.trainingResult],
    ["auditEvidence", condition.auditEvidence],
  ]) {
    requireObject(failures, objectValue, `conditions[].${path} 必须是对象。`);
  }
  requireString(failures, condition.collectionCondition?.conditionId, "collectionCondition.conditionId");
  requireString(failures, condition.collectionCondition?.code, "collectionCondition.code");
  requireString(failures, condition.collectionProtocol?.protocolId, "collectionProtocol.protocolId");
  requireString(failures, condition.collectionProtocol?.version, "collectionProtocol.version");
  requireString(failures, condition.collectionBatch?.batchId, "collectionBatch.batchId");
  requireString(failures, condition.trainingSession?.sessionId, "trainingSession.sessionId");
  requireString(failures, condition.trainingSession?.gameRunId, "trainingSession.gameRunId");
  requireString(failures, condition.trainingResult?.resultId, "trainingResult.resultId");
  if (!Array.isArray(condition.motionMetrics)) {
    failures.push("conditions[].motionMetrics 必须是数组。");
    return;
  }
  for (const metricType of expectedMetricTypes ?? []) {
    if (!condition.motionMetrics.some((metric) => metric?.metricType === metricType)) {
      failures.push(`conditions[].motionMetrics 缺少 ${metricType}。`);
    }
  }
  const metricsSummary = condition.trainingResult?.metricsSummary;
  if (requireObject(failures, metricsSummary, "trainingResult.metricsSummary 必须是对象。")) {
    requireObject(
      failures,
      metricsSummary.trajectorySummary,
      "trainingResult.metricsSummary.trajectorySummary 必须是对象。",
    );
    requireObject(
      failures,
      metricsSummary.dynamicDifficultyEvidence,
      "trainingResult.metricsSummary.dynamicDifficultyEvidence 必须是对象。",
    );
    if (metricsSummary.physiologicalMetricsStatus !== "customer-gated") {
      failures.push("trainingResult.metricsSummary.physiologicalMetricsStatus 必须是 customer-gated。");
    }
  }
}

function verifyDistinctConditionIdentity(failures, conditions) {
  requireDistinctValues(
    failures,
    conditions.map((condition) => condition?.collectionCondition?.code),
    "采集条件 code 必须不同。",
  );
  requireDistinctValues(
    failures,
    conditions.map((condition) => condition?.collectionBatch?.batchId),
    "collectionBatchId 必须不同，不能复用同一采集批次证明不同条件。",
  );
  requireDistinctValues(
    failures,
    conditions.map((condition) => condition?.trainingSession?.sessionId),
    "trainingSession.sessionId 必须不同。",
  );
}

function verifyConditionTrainingRecord(
  failures,
  { evidence, condition, sessions },
) {
  const session = sessions.find(
    (item) => item?.id === condition.trainingSession.sessionId,
  );
  if (!session) {
    failures.push(`训练记录 API 未找到 sessionId=${condition.trainingSession.sessionId}。`);
    return;
  }

  const batchId = condition.collectionBatch.batchId;
  compareFields(failures, "trainingSession", session, {
    patientId: evidence.patient.patientId,
    rehabPlanId: condition.rehabPlan.rehabPlanId,
    planItemId: condition.rehabPlan.planItemId,
    gameContentId: condition.gameContent.gameContentId,
    collectionBatchId: batchId,
    gameRunId: condition.trainingSession.gameRunId,
    deviceCode: condition.trainingSession.deviceCode,
    sessionStatus: condition.trainingSession.sessionStatus,
    syncStatus: condition.trainingSession.syncStatus,
    calibrationStatus: condition.trainingSession.calibrationStatus,
    clientStartedAt: condition.trainingSession.clientStartedAt,
    clientEndedAt: condition.trainingSession.clientEndedAt,
  });
  compareFields(failures, "runtimeConfigSnapshot.collectionBatch", session.runtimeConfigSnapshot?.collectionBatch ?? {}, {
    id: batchId,
    status: condition.collectionBatch.status,
    protocolId: condition.collectionProtocol.protocolId,
    protocolVersion: condition.collectionProtocol.version,
    conditionId: condition.collectionCondition.conditionId,
  });
  compareFields(failures, "runtimeConfigSnapshot.collectionBatch.conditionSnapshot", session.runtimeConfigSnapshot?.collectionBatch?.conditionSnapshot ?? {}, {
    code: condition.collectionCondition.code,
  });
  compareFields(failures, "gameContent", session.gameContent ?? {}, {
    id: condition.gameContent.gameContentId,
    runtimeType: condition.gameContent.runtimeType,
    gameVersion: condition.gameContent.gameVersion,
    bridgeProtocolVersion: condition.gameContent.bridgeProtocolVersion,
    buildStatus: condition.gameContent.buildStatus,
    releaseChannel: condition.gameContent.releaseChannel,
  });
  verifyTrainingResult(failures, { condition, result: session.result, batchId });
  verifyMotionMetrics(failures, {
    condition,
    apiMetrics: session.motionMetrics,
    expectedMetricTypes: evidence.expectedMetricTypes,
    batchId,
  });
}

function verifyTrainingResult(failures, { condition, result, batchId }) {
  if (!result) {
    failures.push("训练记录 API 中缺少 trainingResult。");
    return;
  }
  compareFields(failures, "trainingResult", result, {
    id: condition.trainingResult.resultId,
    collectionBatchId: batchId,
    source: condition.trainingResult.source,
    qualityFlag: condition.trainingResult.qualityFlag,
    abnormalFlag: condition.trainingResult.abnormalFlag,
    score: condition.trainingResult.score,
    completionRate: condition.trainingResult.completionRate,
    durationSeconds: condition.trainingResult.durationSeconds,
    reactionTimeMs: condition.trainingResult.reactionTimeMs,
    motionAccuracy: condition.trainingResult.motionAccuracy,
    exerciseIntensity: condition.trainingResult.exerciseIntensity,
    rawPayloadHash: condition.trainingResult.rawPayloadHash,
  });
  compareFields(failures, "trainingResult.metricsSummary", result.metricsSummary ?? {}, {
    collectionBatchId: batchId,
    source: condition.trainingResult.source,
    gameRunId: condition.trainingSession.gameRunId,
    rawPayloadHash: condition.trainingResult.rawPayloadHash,
    physiologicalMetricsStatus: "customer-gated",
  });
  compareNestedObjectPresence(
    failures,
    "trainingResult.metricsSummary.trajectorySummary",
    result.metricsSummary?.trajectorySummary,
  );
  compareNestedObjectPresence(
    failures,
    "trainingResult.metricsSummary.dynamicDifficultyEvidence",
    result.metricsSummary?.dynamicDifficultyEvidence,
  );
}

function compareNestedObjectPresence(failures, label, value) {
  if (!isObject(value)) {
    failures.push(`${label} 缺失或不是对象。`);
  }
}

function verifyMotionMetrics(
  failures,
  { condition, apiMetrics, expectedMetricTypes, batchId },
) {
  if (!Array.isArray(apiMetrics)) {
    failures.push("训练记录 API 中 motionMetrics 必须是数组。");
    return;
  }
  const byType = new Map(apiMetrics.map((metric) => [metric?.metricType, metric]));
  for (const metricType of expectedMetricTypes) {
    const evidenceMetric = condition.motionMetrics.find(
      (metric) => metric.metricType === metricType,
    );
    const apiMetric = byType.get(metricType);
    if (!evidenceMetric || !apiMetric) {
      failures.push(`训练记录 API 缺少动作指标 ${metricType}。`);
      continue;
    }
    compareFields(failures, `motionMetrics.${metricType}`, apiMetric, {
      collectionBatchId: batchId,
      gameRunId: condition.trainingSession.gameRunId,
      source: evidenceMetric.source,
      metricValue: evidenceMetric.metricValue,
      unit: evidenceMetric.unit,
      confidence: evidenceMetric.confidence,
      sampleCount: evidenceMetric.sampleCount,
      qualityFlag: evidenceMetric.qualityFlag,
      windowStartedAt: evidenceMetric.windowStartedAt,
      windowEndedAt: evidenceMetric.windowEndedAt,
    });
  }
}

async function verifyAuditLogs(failures, { apiRoot, client, condition }) {
  for (const action of requiredAuditActions) {
    const url = new URL(`${apiRoot}/admin/audit-logs`);
    url.searchParams.set("action", action);
    url.searchParams.set("targetType", "training_session");
    url.searchParams.set("targetId", condition.trainingSession.sessionId);
    url.searchParams.set("result", "success");
    url.searchParams.set("limit", "200");

    const logs = await fetchJson(failures, {
      url: url.toString(),
      client,
      label: `${action} 审计 API`,
    });
    if (!logs) continue;
    if (!Array.isArray(logs)) {
      failures.push(`${action} 审计 API 返回值必须是数组。`);
      continue;
    }
    const expectedIds = new Set(condition.auditEvidence.auditLogIds);
    const matched = logs.find(
      (log) =>
        expectedIds.has(log?.id) &&
        log.action === action &&
        log.targetType === "training_session" &&
        log.targetId === condition.trainingSession.sessionId &&
        log.result === "success",
    );
    if (!matched) {
      failures.push(`${action} 未匹配到本次采集条件的成功审计日志。`);
      continue;
    }
    validateEvidenceSafe(failures, matched.metadata, `${action} 审计 metadata`);
  }
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
        `${label} 返回 HTTP ${status}：响应体已隐藏，避免泄露凭据、密钥或训练载荷。`,
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

function validateEvidenceSafe(failures, value, label) {
  const unsafePaths = [];
  collectUnsafePaths(value, label, unsafePaths);
  for (const path of unsafePaths) {
    failures.push(`${path} 包含敏感字段、演示/手工标记或原始载荷，不能作为正式多条件采集验收证据。`);
  }
}

function collectUnsafePaths(value, path, paths) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUnsafePaths(item, `${path}[${index}]`, paths));
    return;
  }
  if (!isObject(value)) {
    if (typeof value === "string" && isUnsafeText(value)) {
      paths.push(path);
    }
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (isSafeHashField(key, nested)) continue;
    if (sensitiveKeys.has(normalizeKey(key))) {
      paths.push(nestedPath);
      continue;
    }
    collectUnsafePaths(nested, nestedPath, paths);
  }
}

function compareFields(failures, label, actual, expected) {
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (!valuesEqual(actual?.[field], expectedValue)) {
      failures.push(`${label}.${field} 与 evidence 不一致：值已隐藏，避免泄露身份标识或训练载荷。`);
    }
  }
}

function validateHttpsApiBaseUrl(failures, value) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push("apiBaseUrl 必须显式提供正式 API 地址。");
    return;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      failures.push("apiBaseUrl 必须使用正式 HTTPS 地址。");
    }
  } catch {
    failures.push("apiBaseUrl 必须是有效 URL。");
    return;
  }
  if (containsForbiddenMarker(value)) {
    failures.push("apiBaseUrl 不能包含 mock/demo/seed/fallback/fixed/manual 标记。");
  }
}

function requireString(failures, value, label) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${label} 必须是非空字符串。`);
    return false;
  }
  return true;
}

function requireObject(failures, value, label) {
  if (!isObject(value)) {
    failures.push(label);
    return false;
  }
  return true;
}

function requireDistinctValues(failures, values, message) {
  const normalized = values.filter((value) => typeof value === "string" && value.trim());
  if (new Set(normalized).size !== normalized.length) {
    failures.push(message);
  }
}

function isPhysiologicalMetricType(value) {
  if (typeof value !== "string") return false;
  return physiologicalMetricPatterns.some((pattern) => pattern.test(value));
}

function hasCompleteWearableEvidence(value) {
  if (!isObject(value)) return false;
  return [
    "deviceModel",
    "sdkOrProtocol",
    "samplingRules",
    "thresholdRanges",
    "consentScope",
    "fieldEvidence",
  ].every((field) => {
    const fieldValue = value[field];
    if (typeof fieldValue === "string") return Boolean(fieldValue.trim());
    if (Array.isArray(fieldValue)) return fieldValue.length > 0;
    return isObject(fieldValue) && Object.keys(fieldValue).length > 0;
  });
}

function isUnsafeText(value) {
  if (isHashDigestText(value)) return false;
  return (
    containsForbiddenMarker(value) ||
    bearerTokenPattern().test(value) ||
    secretLikePattern().test(value) ||
    base64LikePattern().test(value)
  );
}

function containsForbiddenMarker(value) {
  const normalized = decodeTextRepeatedly(String(value ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return forbiddenMarkers.some((marker) => normalized.includes(marker));
}

function decodeTextRepeatedly(value) {
  let current = value;
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) return current;
      current = decoded;
    } catch {
      return current;
    }
  }
  return current;
}

function isSafeHashField(key, value) {
  return /hash$/i.test(normalizeKey(key)) && typeof value === "string" && isHashDigestText(value);
}

function isHashDigestText(value) {
  return /^(?:sha1|sha256|sha384|sha512):[a-f0-9]{40,128}$/i.test(value);
}

function base64LikePattern() {
  return /(?:[A-Za-z0-9+/]{40,}={0,2})/g;
}

function bearerTokenPattern() {
  return /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/i;
}

function secretLikePattern() {
  return /\b(?:sk|ak|api[_-]?key|secret|token)[_-]?[A-Za-z0-9._~+/=-]{8,}\b/i;
}

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function valuesEqual(actual, expected) {
  if (typeof expected === "number" && typeof actual === "number") {
    return Math.abs(actual - expected) < 0.000001;
  }
  return actual === expected;
}

function normalizeApiRoot(apiBaseUrl) {
  return apiBaseUrl.replace(/\/+$/, "");
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readEvidenceFile(path) {
  try {
    return { evidence: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { error };
  }
}

function readCliOptions(argv) {
  const options = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--api-base-url") {
      options.apiBaseUrl = argv[++index];
      continue;
    }
    if (arg === "--review-account") {
      options.reviewAccount = argv[++index];
      continue;
    }
    if (arg === "--review-password") {
      options.reviewPassword = argv[++index];
      continue;
    }
    if (arg === "--audit-account") {
      options.auditAccount = argv[++index];
      continue;
    }
    if (arg === "--audit-password") {
      options.auditPassword = argv[++index];
      continue;
    }
    positional.push(arg);
  }
  options.evidencePath = positional[0];
  return options;
}

async function cli() {
  const options = readCliOptions(process.argv.slice(2));
  const evidencePath =
    options.evidencePath ?? process.env.MULTI_CONDITION_CAPTURE_EVIDENCE_FILE;
  if (!evidencePath) {
    console.error(
      "缺少证据文件路径。请传入 JSON 文件路径，或设置 MULTI_CONDITION_CAPTURE_EVIDENCE_FILE。",
    );
    process.exitCode = 1;
    return;
  }
  if (!existsSync(evidencePath)) {
    console.error(`证据文件不存在：${evidencePath}`);
    process.exitCode = 1;
    return;
  }
  const readResult = readEvidenceFile(evidencePath);
  if (readResult.error) {
    console.error(`证据文件不是有效 JSON：${readResult.error.message}`);
    process.exitCode = 1;
    return;
  }
  const result = await verifyMultiConditionDataCapture({
    evidence: readResult.evidence,
    apiBaseUrl:
      options.apiBaseUrl ?? process.env.MULTI_CONDITION_CAPTURE_API_BASE_URL,
    reviewAccount:
      options.reviewAccount ?? process.env.MULTI_CONDITION_CAPTURE_REVIEW_ACCOUNT,
    reviewPassword:
      options.reviewPassword ??
      process.env.MULTI_CONDITION_CAPTURE_REVIEW_PASSWORD,
    auditAccount:
      options.auditAccount ?? process.env.MULTI_CONDITION_CAPTURE_AUDIT_ACCOUNT,
    auditPassword:
      options.auditPassword ?? process.env.MULTI_CONDITION_CAPTURE_AUDIT_PASSWORD,
  });
  if (result.failures.length) {
    console.error("多采集条件数据只读验真失败：");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log("多采集条件数据只读验真通过。");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await cli();
}
