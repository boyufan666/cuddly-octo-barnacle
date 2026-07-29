#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CookieSessionClient } from "./local-contract-cookie-session.mjs";
import { validateBrowserPoseEvidence } from "./verify-browser-pose-evidence.mjs";

const requiredAuditQueries = [
  { action: "training_session.start" },
  { action: "training_result.submit" },
];
const forbiddenMarkers = [
  "mock",
  "demo",
  "seed",
  "fallback",
  "fixed",
  "manual",
];
const sensitiveMetadataKeys = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "audiobase64",
  "contentbase64",
  "imagebase64",
  "key",
  "payload",
  "raw",
  "rawpayload",
  "rawpayloadbase64",
  "requestbody",
  "responsebody",
  "secret",
  "token",
]);

export async function verifyBrowserPoseFieldAcceptance({
  evidence,
  evidencePath,
  apiBaseUrl,
  patientAccount,
  patientPassword,
  auditAccount,
  auditPassword,
} = {}) {
  const failures = [];
  const staticResult = validateBrowserPoseEvidence(evidence);
  failures.push(...staticResult.failures);

  if (!evidencePath || typeof evidencePath !== "string") {
    failures.push("evidencePath 必须显式提供证据 JSON 文件路径。");
  }
  const apiBaseUrlValidation = validateHttpsUrl(apiBaseUrl);
  if (!apiBaseUrl || typeof apiBaseUrl !== "string") {
    failures.push("apiBaseUrl 必须显式提供正式 API 地址。");
  } else if (!apiBaseUrlValidation.valid) {
    failures.push("apiBaseUrl 必须使用正式 HTTPS 地址。");
  } else if (containsForbiddenMarker(apiBaseUrl)) {
    failures.push(
      "apiBaseUrl 不能包含 mock/demo/seed/fallback/fixed/manual 标记。",
    );
  }
  requireCredential(
    failures,
    patientAccount,
    "patientAccount",
    "训练记录读取账号",
  );
  requireCredential(
    failures,
    patientPassword,
    "patientPassword",
    "训练记录读取账号密码",
  );
  requireCredential(failures, auditAccount, "auditAccount", "审计读取账号");
  requireCredential(
    failures,
    auditPassword,
    "auditPassword",
    "审计读取账号密码",
  );

  if (!evidence || staticResult.failures.length) {
    return { failures };
  }

  if (!evidencePath || typeof evidencePath !== "string") {
    return { failures };
  }

  verifyArtifactFiles(failures, evidence, evidencePath);

  if (
    failures.some((failure) =>
      /apiBaseUrl|patientAccount|patientPassword|auditAccount|auditPassword/.test(
        failure,
      ),
    )
  ) {
    return { failures };
  }

  const apiRoot = normalizeApiRoot(apiBaseUrl);
  const patientClient = new CookieSessionClient(apiBaseUrl);
  const auditClient = new CookieSessionClient(apiBaseUrl);
  if (
    !(await loginReadSession(failures, {
      client: patientClient,
      account: patientAccount,
      password: patientPassword,
      label: "训练记录读取账号",
    }))
  ) {
    return { failures };
  }
  if (
    !(await loginReadSession(failures, {
      client: auditClient,
      account: auditAccount,
      password: auditPassword,
      label: "审计读取账号",
    }))
  ) {
    return { failures };
  }
  await verifyTrainingRecords(failures, {
    evidence,
    apiRoot,
    client: patientClient,
  });
  await verifyAuditLogs(failures, {
    evidence,
    apiRoot,
    client: auditClient,
  });

  return { failures };
}

function requireCredential(failures, value, field, label) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${field} 必须显式提供${label}。`);
  }
}

async function loginReadSession(
  failures,
  { client, account, password, label },
) {
  try {
    await client.login(account, password);
    return true;
  } catch (error) {
    failures.push(`${label} Cookie 会话登录失败：${redactRequestError(error)}`);
    return false;
  }
}

function redactRequestError(error) {
  const message = readErrorMessage(error);
  const status = /^HTTP (\d+)/.exec(message)?.[1];
  if (status) {
    return `HTTP ${status}：响应体已隐藏，避免泄露密钥或训练载荷。`;
  }
  if (/password_reset_required/i.test(message)) {
    return "password_reset_required，需先人工完成密码重置。";
  }
  if (/登录响应格式无效/.test(message)) {
    return "Cookie 会话登录响应格式无效。";
  }
  if (/登录缺少 rehab_session cookie/.test(message)) {
    return "Cookie 会话登录缺少 rehab_session cookie。";
  }
  if (/csrf|rehab_csrf/i.test(message)) {
    return "Cookie/CSRF 会话无效。";
  }
  return "错误详情已隐藏，避免泄露账号口令、cookie、密钥或训练载荷。";
}

function readErrorMessage(error) {
  try {
    return typeof error?.message === "string" ? error.message : "";
  } catch {
    return "";
  }
}

function verifyArtifactFiles(failures, evidence, evidencePath) {
  const evidenceDir = dirname(resolve(process.cwd(), evidencePath));
  const realEvidenceDir = realpathSync(evidenceDir);
  const artifacts = [
    ...(evidence.artifacts?.screenshots ?? []),
    ...(evidence.artifacts?.recordings ?? []),
  ];

  for (const artifact of artifacts) {
    const rawPath = artifact?.path;
    if (typeof rawPath !== "string" || !rawPath.trim()) continue;
    const absolutePath = isAbsolute(rawPath)
      ? rawPath
      : resolve(evidenceDir, rawPath);
    if (!isPathInsideDirectory(absolutePath, evidenceDir)) {
      failures.push(`附件路径必须位于 evidence JSON 所在目录内：${rawPath}`);
      continue;
    }
    if (!existsSync(absolutePath)) {
      failures.push(`附件文件不存在：${rawPath}`);
      continue;
    }
    const realArtifactPath = realpathSync(absolutePath);
    if (!isPathInsideDirectory(realArtifactPath, realEvidenceDir)) {
      failures.push(
        `附件真实路径必须位于 evidence JSON 所在目录内：${rawPath}`,
      );
      continue;
    }
    const stats = statSync(absolutePath);
    if (!stats.isFile()) {
      failures.push(`附件路径不是文件：${rawPath}`);
      continue;
    }
    if (stats.size <= 0) {
      failures.push(`附件文件为空：${rawPath}`);
    }
  }
}

async function verifyTrainingRecords(failures, { evidence, apiRoot, client }) {
  const patientId = evidence.patient.patientId;
  const trainingData = await fetchJson(failures, {
    url: `${apiRoot}/patients/${encodeURIComponent(patientId)}/training-records`,
    client,
    label: "训练记录 API",
  });
  if (!isObject(trainingData)) {
    failures.push(
      "训练记录 API 返回值必须是对象，不能是 2xx 空体、null 或其他错误 shape。",
    );
    return;
  }

  if (!Array.isArray(trainingData.sessions)) {
    failures.push("训练记录 API 返回的 sessions 必须是数组。");
    return;
  }
  const sessions = trainingData.sessions;
  const session = sessions.find(
    (item) => item?.id === evidence.trainingSession.sessionId,
  );
  if (!session) {
    failures.push(
      `训练记录 API 未找到 sessionId=${evidence.trainingSession.sessionId} 的记录。`,
    );
    return;
  }

  compareFields(failures, "trainingSession", session, {
    patientId,
    rehabPlanId: evidence.rehabPlan.rehabPlanId,
    planItemId: evidence.rehabPlan.planItemId,
    gameContentId: evidence.gameContent.gameContentId,
    gameRunId: evidence.trainingSession.gameRunId,
    collectionBatchId: evidence.trainingSession.collectionBatchId,
    deviceCode: evidence.trainingSession.deviceCode,
    calibrationStatus: evidence.trainingSession.calibrationStatus,
    sessionStatus: evidence.trainingSession.sessionStatus,
    syncStatus: evidence.trainingSession.syncStatus,
    clientStartedAt: evidence.trainingSession.clientStartedAt,
    clientEndedAt: evidence.trainingSession.clientEndedAt,
  });

  compareFields(failures, "gameContent", session.gameContent ?? {}, {
    id: evidence.gameContent.gameContentId,
    code: evidence.gameContent.code,
    name: evidence.gameContent.name,
    runtimeType: evidence.gameContent.runtimeType,
    gameVersion: evidence.gameContent.gameVersion,
    bridgeProtocolVersion: evidence.gameContent.bridgeProtocolVersion,
    releaseChannel: evidence.gameContent.releaseChannel,
    buildStatus: evidence.gameContent.buildStatus,
  });

  const result = session.result;
  if (!result) {
    failures.push("训练记录 API 中缺少 trainingResult。");
  } else {
    compareFields(failures, "trainingResult", result, {
      id: evidence.trainingResult.resultId,
      source: evidence.trainingResult.source,
      gameRunId: evidence.trainingResult.gameRunId,
      collectionBatchId: evidence.trainingResult.collectionBatchId,
      gameVersion: evidence.trainingResult.gameVersion,
      bridgeProtocolVersion: evidence.trainingResult.bridgeProtocolVersion,
      rawPayloadHash: evidence.trainingResult.rawPayloadHash,
      submittedAt: evidence.trainingResult.submittedAt,
      qualityFlag: evidence.trainingResult.qualityFlag,
      abnormalFlag: evidence.trainingResult.abnormalFlag,
      score: evidence.trainingResult.score,
      completionRate: evidence.trainingResult.completionRate,
      durationSeconds: evidence.trainingResult.durationSeconds,
      reactionTimeMs: evidence.trainingResult.reactionTimeMs,
      motionAccuracy: evidence.trainingResult.motionAccuracy,
      exerciseIntensity: evidence.trainingResult.exerciseIntensity,
    });

    compareFields(
      failures,
      "trainingResult.metricsSummary",
      result.metricsSummary ?? {},
      {
        source: evidence.trainingResult.source,
        gameRunId: evidence.trainingResult.gameRunId,
        collectionBatchId: evidence.trainingResult.collectionBatchId,
        gameVersion: evidence.trainingResult.gameVersion,
        protocolVersion: evidence.trainingResult.bridgeProtocolVersion,
        rawPayloadHash: evidence.trainingResult.rawPayloadHash,
      },
    );
  }

  verifyMotionMetrics(failures, evidence, session.motionMetrics);
}

function verifyMotionMetrics(failures, evidence, apiMetrics) {
  if (!Array.isArray(apiMetrics)) {
    failures.push("训练记录 API 中 motionMetrics 必须是数组。");
    return;
  }

  for (const metric of evidence.motionMetrics) {
    const apiMetric = apiMetrics.find(
      (item) =>
        item?.metricType === metric.metricType &&
        item?.collectionBatchId === metric.collectionBatchId,
    );
    if (!apiMetric) {
      failures.push(
        `motionMetrics.${metric.metricType}.collectionBatchId 与 evidence 不一致或缺少同批次动作指标。`,
      );
      continue;
    }
    compareFields(failures, `motionMetrics.${metric.metricType}`, apiMetric, {
      gameRunId: evidence.trainingSession.gameRunId,
      collectionBatchId: metric.collectionBatchId,
      source: evidence.trainingResult.source,
      metricValue: metric.metricValue,
      unit: metric.unit,
      confidence: metric.confidence,
      sampleCount: metric.sampleCount,
      qualityFlag: metric.qualityFlag,
      windowStartedAt: metric.windowStartedAt,
      windowEndedAt: metric.windowEndedAt,
    });
  }
}

async function verifyAuditLogs(failures, { evidence, apiRoot, client }) {
  for (const query of requiredAuditQueries) {
    const url = new URL(`${apiRoot}/admin/audit-logs`);
    url.searchParams.set("action", query.action);
    url.searchParams.set("targetType", "training_session");
    url.searchParams.set("targetId", evidence.trainingSession.sessionId);
    url.searchParams.set("result", "success");
    url.searchParams.set("limit", "200");

    const logs = await fetchJson(failures, {
      url: url.toString(),
      client,
      label: `${query.action} 审计 API`,
    });
    if (!Array.isArray(logs)) {
      failures.push(
        `${query.action} 审计 API 返回值必须是数组，不能是 2xx 空体、null 或其他错误 shape。`,
      );
      continue;
    }

    logs.forEach((log, index) => {
      validateAuditMetadataSafe(
        failures,
        log?.metadata,
        `${query.action} 审计候选[${index}].metadata`,
      );
    });

    const expectedIds = new Set(evidence.auditEvidence.auditLogIds);
    const matched = logs.filter(
      (log) =>
        expectedIds.has(log?.id) &&
        log.action === query.action &&
        log.targetType === "training_session" &&
        log.targetId === evidence.trainingSession.sessionId &&
        log.result === "success",
    );
    if (matched.length !== 1) {
      failures.push(
        `auditEvidence.auditLogIds 匹配到的 ${query.action} 成功审计日志候选数量必须严格等于 1。`,
      );
    }
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
    failures.push(`${label} 请求失败：${redactRequestError(error)}`);
    return null;
  }
}

function compareFields(failures, label, actual, expected) {
  for (const [field, expectedValue] of Object.entries(expected)) {
    const actualValue = actual?.[field];
    if (!valuesEqual(actualValue, expectedValue)) {
      failures.push(
        formatMismatchMessage({ label, field, actualValue, expectedValue }),
      );
    }
  }
}

function validateAuditMetadataSafe(
  failures,
  metadata,
  label = "审计 metadata",
) {
  if (metadata === null || metadata === undefined) return;
  if (!isObject(metadata)) {
    failures.push("审计 metadata 必须是对象或空值。");
    return;
  }
  const unsafePaths = [];
  collectUnsafeMetadataPaths(metadata, label, unsafePaths);
  for (const path of unsafePaths) {
    failures.push(
      `${path} 包含敏感字段、演示/手工标记或原始载荷，不能作为正式体感验收审计记录。`,
    );
  }
}

function collectUnsafeMetadataPaths(value, path, paths) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectUnsafeMetadataPaths(item, `${path}[${index}]`, paths),
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
    if (typeof nested === "string" && isUnsafeText(nested)) {
      paths.push(nestedPath);
      continue;
    }
    collectUnsafeMetadataPaths(nested, nestedPath, paths);
  }
}

function isSafeHashMetadataField(key, value) {
  return (
    /hash$/i.test(normalizeKey(key)) &&
    typeof value === "string" &&
    isHashDigestText(value)
  );
}

function formatMismatchMessage({ label, field, actualValue, expectedValue }) {
  return `${label}.${field} 与 evidence 不一致：值已隐藏，避免泄露 token、密钥、身份标识或训练载荷。`;
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

function isHashDigestText(value) {
  return /^(?:sha1|sha256|sha384|sha512):[a-f0-9]{40,128}$/i.test(value);
}

function containsForbiddenMarker(value) {
  const normalized = normalizeTextForMarkerScan(value);
  return forbiddenMarkers.some((marker) => normalized.includes(marker));
}

function normalizeTextForMarkerScan(value) {
  return decodeTextRepeatedly(String(value ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
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

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
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

function valuesEqual(actual, expected) {
  if (typeof expected === "number" && typeof actual === "number") {
    return Math.abs(actual - expected) < 0.000001;
  }
  return actual === expected;
}

function normalizeApiRoot(apiBaseUrl) {
  return apiBaseUrl.replace(/\/+$/, "");
}

function validateHttpsUrl(value) {
  if (typeof value !== "string" || !value.trim()) return { valid: false };
  try {
    const url = new URL(value);
    return { valid: url.protocol === "https:" };
  } catch {
    return { valid: false };
  }
}

function isPathInsideDirectory(filePath, directoryPath) {
  const relativePath = relative(directoryPath, filePath);
  return (
    Boolean(relativePath) &&
    !relativePath.startsWith("..") &&
    !isAbsolute(relativePath)
  );
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
  const options = { failures: [] };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--api-base-url") {
      options.apiBaseUrl = argv[++index];
      continue;
    }
    if (arg.startsWith("--")) {
      options.failures.push(`不支持的参数：${arg}`);
      if (argv[index + 1] && !argv[index + 1].startsWith("--")) index += 1;
      continue;
    }
    positional.push(arg);
  }
  options.evidencePath = positional[0];
  return options;
}

async function cli() {
  const options = readCliOptions(process.argv.slice(2));
  if (options.failures.length) {
    console.error("浏览器体感实机只读验真失败：");
    for (const failure of options.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  const evidencePath =
    options.evidencePath ?? process.env.BROWSER_POSE_EVIDENCE_FILE;

  if (!evidencePath) {
    console.error(
      "缺少证据文件路径。请传入 JSON 文件路径，或设置 BROWSER_POSE_EVIDENCE_FILE。",
    );
    process.exitCode = 1;
    return;
  }

  const absolutePath = resolve(process.cwd(), evidencePath);
  if (!existsSync(absolutePath)) {
    console.error(`证据文件不存在：${absolutePath}`);
    process.exitCode = 1;
    return;
  }

  const readResult = readEvidenceFile(absolutePath);
  if (readResult.error) {
    console.error(`证据文件不是有效 JSON：${readResult.error.message}`);
    process.exitCode = 1;
    return;
  }

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence: readResult.evidence,
    evidencePath: absolutePath,
    apiBaseUrl: options.apiBaseUrl ?? process.env.BROWSER_POSE_API_BASE_URL,
    patientAccount: process.env.BROWSER_POSE_PATIENT_ACCOUNT,
    patientPassword: process.env.BROWSER_POSE_PATIENT_PASSWORD,
    auditAccount: process.env.BROWSER_POSE_AUDIT_ACCOUNT,
    auditPassword: process.env.BROWSER_POSE_AUDIT_PASSWORD,
  });

  if (result.failures.length) {
    console.error("浏览器体感实机只读验真失败：");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("浏览器体感实机只读验真通过。");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await cli();
}
