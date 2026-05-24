#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateBrowserPoseEvidence } from "./verify-browser-pose-evidence.mjs";

const requiredAuditQueries = [
  { action: "training_session.start" },
  { action: "training_result.submit" },
];

export async function verifyBrowserPoseFieldAcceptance({
  evidence,
  evidencePath,
  apiBaseUrl,
  patientToken,
  auditToken,
  fetchImpl = globalThis.fetch,
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
  }
  if (!patientToken || typeof patientToken !== "string" || !patientToken.trim()) {
    failures.push("patientToken 必须显式提供具备训练记录读取权限的访问令牌。");
  }
  if (!auditToken || typeof auditToken !== "string" || !auditToken.trim()) {
    failures.push("auditToken 必须显式提供具备审计读取权限的访问令牌。");
  }
  if (typeof fetchImpl !== "function") {
    failures.push("fetchImpl 不可用，无法只读验真 API 数据。");
  }

  if (!evidence || staticResult.failures.length) {
    return { failures };
  }

  if (!evidencePath || typeof evidencePath !== "string") {
    return { failures };
  }

  verifyArtifactFiles(failures, evidence, evidencePath);

  if (
    failures.some((failure) =>
      /apiBaseUrl|patientToken|auditToken|fetchImpl/.test(failure),
    )
  ) {
    return { failures };
  }

  const apiRoot = normalizeApiRoot(apiBaseUrl);
  await verifyTrainingRecords(failures, {
    evidence,
    apiRoot,
    token: patientToken,
    fetchImpl,
  });
  await verifyAuditLogs(failures, {
    evidence,
    apiRoot,
    token: auditToken,
    fetchImpl,
  });

  return { failures };
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
    const absolutePath = isAbsolute(rawPath) ? rawPath : resolve(evidenceDir, rawPath);
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
      failures.push(`附件真实路径必须位于 evidence JSON 所在目录内：${rawPath}`);
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

async function verifyTrainingRecords(failures, { evidence, apiRoot, token, fetchImpl }) {
  const patientId = evidence.patient.patientId;
  const trainingData = await fetchJson(failures, {
    url: `${apiRoot}/patients/${encodeURIComponent(patientId)}/training-records`,
    token,
    fetchImpl,
    label: "训练记录 API",
  });
  if (!trainingData) return;

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

    compareFields(failures, "trainingResult.metricsSummary", result.metricsSummary ?? {}, {
      source: evidence.trainingResult.source,
      gameRunId: evidence.trainingResult.gameRunId,
      gameVersion: evidence.trainingResult.gameVersion,
      protocolVersion: evidence.trainingResult.bridgeProtocolVersion,
      rawPayloadHash: evidence.trainingResult.rawPayloadHash,
    });
  }

  verifyMotionMetrics(failures, evidence, session.motionMetrics);
}

function verifyMotionMetrics(failures, evidence, apiMetrics) {
  if (!Array.isArray(apiMetrics)) {
    failures.push("训练记录 API 中 motionMetrics 必须是数组。");
    return;
  }

  const byType = new Map(apiMetrics.map((metric) => [metric?.metricType, metric]));
  for (const metric of evidence.motionMetrics) {
    const apiMetric = byType.get(metric.metricType);
    if (!apiMetric) {
      failures.push(`训练记录 API 缺少动作指标 ${metric.metricType}。`);
      continue;
    }
    compareFields(failures, `motionMetrics.${metric.metricType}`, apiMetric, {
      gameRunId: evidence.trainingSession.gameRunId,
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

async function verifyAuditLogs(failures, { evidence, apiRoot, token, fetchImpl }) {
  for (const query of requiredAuditQueries) {
    const url = new URL(`${apiRoot}/admin/audit-logs`);
    url.searchParams.set("action", query.action);
    url.searchParams.set("targetType", "training_session");
    url.searchParams.set("targetId", evidence.trainingSession.sessionId);
    url.searchParams.set("result", "success");
    url.searchParams.set("limit", "200");

    const logs = await fetchJson(failures, {
      url: url.toString(),
      token,
      fetchImpl,
      label: `${query.action} 审计 API`,
    });
    if (!logs) continue;
    if (!Array.isArray(logs)) {
      failures.push(`${query.action} 审计 API 返回值必须是数组。`);
      continue;
    }

    const expectedIds = new Set(evidence.auditEvidence.auditLogIds);
    const matched = logs.find(
      (log) =>
        expectedIds.has(log?.id) &&
        log.action === query.action &&
        log.targetType === "training_session" &&
        log.targetId === evidence.trainingSession.sessionId &&
        log.result === "success",
    );
    if (!matched) {
      failures.push(
        `auditEvidence.auditLogIds 未匹配到 ${query.action} 的成功审计日志。`,
      );
    }
  }
}

async function fetchJson(failures, { url, token, fetchImpl, label }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    failures.push(`${label} 请求失败：${error.message}`);
    return null;
  }

  if (!response.ok) {
    const body = await safeReadBody(response);
    failures.push(`${label} 返回 HTTP ${response.status}：${body}`);
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    failures.push(`${label} 返回内容不是有效 JSON：${error.message}`);
    return null;
  }
}

async function safeReadBody(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function compareFields(failures, label, actual, expected) {
  for (const [field, expectedValue] of Object.entries(expected)) {
    const actualValue = actual?.[field];
    if (!valuesEqual(actualValue, expectedValue)) {
      failures.push(
        `${label}.${field} 与 evidence 不一致：API=${formatValue(actualValue)} evidence=${formatValue(expectedValue)}`,
      );
    }
  }
}

function valuesEqual(actual, expected) {
  if (typeof expected === "number" && typeof actual === "number") {
    return Math.abs(actual - expected) < 0.000001;
  }
  return actual === expected;
}

function formatValue(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
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
  return Boolean(relativePath) && !relativePath.startsWith("..") && !isAbsolute(relativePath);
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
    if (arg === "--patient-token") {
      options.patientToken = argv[++index];
      continue;
    }
    if (arg === "--audit-token") {
      options.auditToken = argv[++index];
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
    patientToken: options.patientToken ?? process.env.BROWSER_POSE_PATIENT_TOKEN,
    auditToken: options.auditToken ?? process.env.BROWSER_POSE_AUDIT_TOKEN,
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
