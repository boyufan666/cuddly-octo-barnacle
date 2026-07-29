#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CookieSessionClient } from "./local-contract-cookie-session.mjs";
import { validateUnityFieldEvidence } from "./verify-unity-field-evidence.mjs";

const requiredAuditQueries = [
  { action: "training_session.start" },
  { action: "training_result.submit" },
];
const unityResultContractVersion = "rehab-unity-result-v2";
const requiredUnityMetricTypes = [
  "reaction_time_ms",
  "target_hit_rate",
  "arm_raise_accuracy",
  "duration_seconds",
  "difficulty_level",
];
const dynamicDifficultyTriggerReasons = new Set([
  "prior_assessment",
  "reaction_slow",
  "accuracy_high",
  "accuracy_low",
  "fatigue_risk",
  "clinician_limit",
]);
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

export async function verifyUnityFieldAcceptance({
  evidence,
  evidencePath,
  apiBaseUrl,
  patientAccount,
  patientPassword,
  auditAccount,
  auditPassword,
} = {}) {
  const failures = [];
  const staticResult = validateUnityFieldEvidence(evidence);
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
  const trainingChain = await verifyTrainingRecords(failures, {
    evidence,
    apiRoot,
    client: patientClient,
  });
  if (trainingChain) {
    await verifyAuditLogs(failures, {
      evidence,
      apiRoot,
      client: auditClient,
      trainingChain,
    });
  }

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
  verifyEvidenceUnityResultChain(failures, evidence);
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
    return null;
  }

  if (!Array.isArray(trainingData.sessions)) {
    failures.push("训练记录 API 返回的 sessions 必须是数组。");
    return null;
  }
  const session = trainingData.sessions.find(
    (item) => item?.id === evidence.trainingSession.sessionId,
  );
  if (!session) {
    failures.push(
      `训练记录 API 未找到 sessionId=${evidence.trainingSession.sessionId} 的记录。`,
    );
    return null;
  }

  compareFields(failures, "trainingSession", session, {
    patientId,
    rehabPlanId: evidence.rehabPlan.rehabPlanId,
    planItemId: evidence.rehabPlan.planItemId,
    gameContentId: evidence.gameContent.gameContentId,
    collectionBatchId: evidence.trainingSession.collectionBatchId,
    gameRunId: evidence.trainingSession.gameRunId,
    deviceCode: evidence.trainingSession.deviceCode,
    calibrationStatus: evidence.trainingSession.calibrationStatus,
    sessionStatus: evidence.trainingSession.sessionStatus,
    syncStatus: evidence.trainingSession.syncStatus,
    clientStartedAt: evidence.trainingSession.clientStartedAt,
    clientEndedAt: evidence.trainingSession.clientEndedAt,
  });

  compareFields(
    failures,
    "trainingSession.runtimeConfigSnapshot",
    normalizeApiUnityWebUrls(
      failures,
      session.runtimeConfigSnapshot,
      evidence.browser.pageUrl,
      "trainingSession.runtimeConfigSnapshot",
    ),
    {
      runtimeType: evidence.trainingSession.runtimeConfigSnapshot.runtimeType,
      manifestUrl: evidence.trainingSession.runtimeConfigSnapshot.manifestUrl,
      buildBaseUrl: evidence.trainingSession.runtimeConfigSnapshot.buildBaseUrl,
      gameVersion: evidence.trainingSession.runtimeConfigSnapshot.gameVersion,
      bridgeProtocolVersion:
        evidence.trainingSession.runtimeConfigSnapshot.bridgeProtocolVersion,
      releaseChannel:
        evidence.trainingSession.runtimeConfigSnapshot.releaseChannel,
      prescribedDurationSeconds: evidence.rehabPlan.durationMinutes * 60,
    },
  );

  compareFields(
    failures,
    "trainingSession.runtimeConfigSnapshot.collectionBatch",
    session.runtimeConfigSnapshot?.collectionBatch,
    {
      id: evidence.trainingSession.collectionBatchId,
    },
  );

  compareFields(
    failures,
    "gameContent",
    normalizeApiUnityWebUrls(
      failures,
      session.gameContent,
      evidence.browser.pageUrl,
      "gameContent",
    ),
    {
      id: evidence.gameContent.gameContentId,
      code: evidence.gameContent.code,
      name: evidence.gameContent.name,
      runtimeType: evidence.gameContent.runtimeType,
      gameVersion: evidence.gameContent.gameVersion,
      bridgeProtocolVersion: evidence.gameContent.bridgeProtocolVersion,
      releaseChannel: evidence.gameContent.releaseChannel,
      buildStatus: evidence.gameContent.buildStatus,
      manifestUrl: evidence.gameContent.manifestUrl,
      buildBaseUrl: evidence.gameContent.buildBaseUrl,
    },
  );

  const result = session.result;
  if (!result) {
    failures.push("训练记录 API 中缺少 trainingResult。");
    return null;
  }

  compareFields(failures, "trainingResult", result, {
    id: evidence.trainingResult.resultId,
    sessionId: evidence.trainingSession.sessionId,
    collectionBatchId: evidence.trainingSession.collectionBatchId,
    source: evidence.trainingResult.source,
    gameRunId: evidence.trainingResult.gameRunId,
    gameVersion: evidence.trainingResult.gameVersion,
    bridgeProtocolVersion: evidence.trainingResult.bridgeProtocolVersion,
    clientGeneratedAt: evidence.trainingResult.clientGeneratedAt,
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

  if (!isObject(result.metricsSummary)) {
    failures.push("训练记录 API 中 trainingResult.metricsSummary 必须是对象。");
  } else {
    compareFields(
      failures,
      "trainingResult.metricsSummary",
      result.metricsSummary,
      {
        source: evidence.trainingResult.source,
        resultContractVersion: unityResultContractVersion,
        collectionBatchId: evidence.trainingSession.collectionBatchId,
        gameRunId: evidence.bridgeEvent.gameRunId,
        gameVersion: evidence.bridgeEvent.gameVersion,
        protocolVersion: evidence.bridgeEvent.protocolVersion,
        clientGeneratedAt: evidence.bridgeEvent.clientGeneratedAt,
        rawPayloadHash: evidence.bridgeEvent.rawPayloadHash,
        dynamicDifficultyEvidence:
          evidence.bridgeEvent.metricsSummary.dynamicDifficultyEvidence,
      },
    );
  }

  verifyDynamicDifficultyEvidence(failures, {
    evidence,
    runtimeConfigSnapshot: session.runtimeConfigSnapshot,
    apiEvidence: result.metricsSummary?.dynamicDifficultyEvidence,
  });
  verifyMotionMetrics(failures, evidence, session.motionMetrics);
  const collectionBatch = await verifyCollectionBatch(failures, {
    evidence,
    apiRoot,
    client,
    runtimeConfigSnapshot: session.runtimeConfigSnapshot,
  });

  return { session, result, collectionBatch };
}

function verifyEvidenceUnityResultChain(failures, evidence) {
  const collectionBatchId = evidence.trainingSession.collectionBatchId;
  const durationMinutes = evidence.rehabPlan.durationMinutes;
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    failures.push(
      "rehabPlan.durationMinutes 必须是已批准处方中的正整数分钟数。",
    );
    return;
  }
  const prescribedDurationSeconds = durationMinutes * 60;

  compareFields(
    failures,
    "trainingSession.runtimeConfigSnapshot",
    evidence.trainingSession.runtimeConfigSnapshot,
    {
      resultContractVersion: unityResultContractVersion,
      collectionBatchId,
      durationSeconds: prescribedDurationSeconds,
    },
  );
  compareFields(failures, "bridgeEvent", evidence.bridgeEvent, {
    resultContractVersion: unityResultContractVersion,
    collectionBatchId,
    durationSeconds: prescribedDurationSeconds,
  });
  compareFields(
    failures,
    "bridgeEvent.metricsSummary",
    evidence.bridgeEvent.metricsSummary,
    {
      source: "unity_webgl",
      resultContractVersion: unityResultContractVersion,
      collectionBatchId,
      gameRunId: evidence.trainingSession.gameRunId,
      gameVersion: evidence.gameContent.gameVersion,
      protocolVersion: evidence.gameContent.bridgeProtocolVersion,
      clientGeneratedAt: evidence.trainingResult.clientGeneratedAt,
      rawPayloadHash: evidence.trainingResult.rawPayloadHash,
    },
  );
  compareFields(failures, "trainingResult", evidence.trainingResult, {
    collectionBatchId,
    durationSeconds: prescribedDurationSeconds,
  });
}

async function verifyCollectionBatch(
  failures,
  { evidence, apiRoot, client, runtimeConfigSnapshot },
) {
  const patientId = evidence.patient.patientId;
  const collectionBatchId = evidence.trainingSession.collectionBatchId;
  const batches = await fetchJson(failures, {
    url: `${apiRoot}/patients/${encodeURIComponent(patientId)}/collection-batches`,
    client,
    label: "采集批次 API",
  });
  if (!Array.isArray(batches)) {
    failures.push(
      "采集批次 API 返回值必须是数组，不能是 2xx 空体、null 或其他错误 shape。",
    );
    return null;
  }

  const matches = batches.filter((batch) => batch?.id === collectionBatchId);
  if (matches.length !== 1) {
    failures.push("采集批次 API 中 collectionBatchId 匹配数量必须严格等于 1。");
    return null;
  }
  const batch = matches[0];
  compareFields(failures, "collectionBatch", batch, {
    id: collectionBatchId,
    patientId,
    rehabPlanId: evidence.rehabPlan.rehabPlanId,
    planItemId: evidence.rehabPlan.planItemId,
    gameContentId: evidence.gameContent.gameContentId,
  });

  if (!isObject(runtimeConfigSnapshot?.collectionBatch)) {
    failures.push(
      "trainingSession.runtimeConfigSnapshot.collectionBatch 必须是服务端保存的采集批次快照对象。",
    );
    return batch;
  }
  compareFields(
    failures,
    "trainingSession.runtimeConfigSnapshot.collectionBatch",
    runtimeConfigSnapshot.collectionBatch,
    {
      id: batch.id,
      status: batch.status,
      protocolId: batch.protocolId,
      protocolVersion: batch.protocolVersion,
      conditionId: batch.conditionId,
      conditionSnapshot: batch.conditionSnapshot,
      protocolSnapshot: batch.protocolSnapshot,
      consentSnapshot: batch.consentSnapshot,
    },
  );
  return batch;
}

function verifyDynamicDifficultyEvidence(
  failures,
  { evidence, runtimeConfigSnapshot, apiEvidence },
) {
  const dynamicEvidence =
    evidence.bridgeEvent.metricsSummary.dynamicDifficultyEvidence;
  if (!isObject(dynamicEvidence)) {
    failures.push(
      "bridgeEvent.metricsSummary.dynamicDifficultyEvidence 必须是对象。",
    );
    return;
  }
  if (!valuesEqual(apiEvidence, dynamicEvidence)) {
    failures.push(
      "trainingResult.metricsSummary.dynamicDifficultyEvidence 与 evidence 不一致：值已隐藏，避免泄露训练载荷。",
    );
  }
  if (dynamicEvidence.schemaVersion !== "1.0.0") {
    failures.push(
      "dynamicDifficultyEvidence.schemaVersion 必须严格等于 1.0.0。",
    );
  }
  if (
    !Array.isArray(dynamicEvidence.events) ||
    dynamicEvidence.events.length === 0
  ) {
    failures.push("dynamicDifficultyEvidence.events 必须是非空数组。");
    return;
  }
  if (!isObject(runtimeConfigSnapshot)) {
    failures.push("训练记录 API 中 runtimeConfigSnapshot 必须是对象。");
    return;
  }
  compareFields(
    failures,
    "trainingSession.runtimeConfigSnapshot",
    runtimeConfigSnapshot,
    {
      approvedPlanItemId: evidence.rehabPlan.planItemId,
    },
  );

  const sessionStartedAt = strictIsoTimestamp(
    evidence.trainingSession.clientStartedAt,
  );
  const resultCompletedAt = strictIsoTimestamp(
    evidence.trainingResult.clientGeneratedAt,
  );
  dynamicEvidence.events.forEach((event, index) => {
    const label = `dynamicDifficultyEvidence.events[${index}]`;
    if (!isObject(event)) {
      failures.push(`${label} 必须是对象。`);
      return;
    }
    compareFields(failures, label, event, {
      startingLevel: runtimeConfigSnapshot.startingDifficultyLevel,
      startingLevelSource: runtimeConfigSnapshot.startingLevelSource,
      approvedPlanItemId: evidence.rehabPlan.planItemId,
      assessmentSourceId: runtimeConfigSnapshot.assessmentSourceId,
    });
    if (
      !Number.isInteger(event.startingLevel) ||
      event.startingLevel < 1 ||
      event.startingLevel > 3
    ) {
      failures.push(`${label}.startingLevel 必须是 1 到 3 的整数。`);
    }
    if (!dynamicDifficultyTriggerReasons.has(event.triggerReason)) {
      failures.push(
        `${label}.triggerReason 不是受支持的正式动态难度触发原因。`,
      );
    }
    validateDifficultySnapshot(failures, event.before, `${label}.before`);
    validateDifficultySnapshot(failures, event.after, `${label}.after`);
    const adjustedAt = strictIsoTimestamp(event.adjustedAt);
    if (adjustedAt === null) {
      failures.push(`${label}.adjustedAt 必须是严格 UTC ISO 时间。`);
    } else if (
      sessionStartedAt === null ||
      resultCompletedAt === null ||
      adjustedAt < sessionStartedAt ||
      adjustedAt > resultCompletedAt
    ) {
      failures.push(`${label}.adjustedAt 必须位于本次训练时间窗口内。`);
    }
    if (
      typeof event.runtimeFrameId !== "string" ||
      !event.runtimeFrameId.startsWith(
        `${evidence.trainingSession.gameRunId}:frame:`,
      )
    ) {
      failures.push(
        `${label}.runtimeFrameId 必须严格属于当前 gameRunId 的运行帧。`,
      );
    }
    if (
      typeof event.runtimeWindowId !== "string" ||
      !event.runtimeWindowId.startsWith(
        `${evidence.trainingSession.gameRunId}:runtime-window:`,
      )
    ) {
      failures.push(
        `${label}.runtimeWindowId 必须严格属于当前 gameRunId 的难度窗口。`,
      );
    }
    if (isObject(event.before) && isObject(event.after)) {
      const unchanged =
        event.before.speed === event.after.speed &&
        event.before.complexityLevel === event.after.complexityLevel;
      if (
        unchanged &&
        (typeof event.safetyClampReason !== "string" ||
          !event.safetyClampReason.trim())
      ) {
        failures.push(
          `${label}.safetyClampReason 在难度未变化时必须显式提供。`,
        );
      }
      if (!unchanged && event.safetyClampReason !== undefined) {
        failures.push(`${label}.safetyClampReason 在难度已变化时不得存在。`);
      }
    }
  });
}

function validateDifficultySnapshot(failures, snapshot, label) {
  if (!isObject(snapshot)) {
    failures.push(`${label} 必须是对象。`);
    return;
  }
  if (
    typeof snapshot.speed !== "number" ||
    !Number.isFinite(snapshot.speed) ||
    snapshot.speed <= 0
  ) {
    failures.push(`${label}.speed 必须是大于 0 的有限数字。`);
  }
  if (
    !Number.isInteger(snapshot.complexityLevel) ||
    snapshot.complexityLevel < 1 ||
    snapshot.complexityLevel > 3
  ) {
    failures.push(`${label}.complexityLevel 必须是 1 到 3 的整数。`);
  }
}

function normalizeApiUnityWebUrls(failures, value, pageUrl, label) {
  const record = isObject(value) ? value : {};
  return {
    ...record,
    manifestUrl: canonicalApiUnityWebUrl(
      failures,
      record.manifestUrl,
      pageUrl,
      `${label}.manifestUrl`,
      true,
    ),
    buildBaseUrl: canonicalApiUnityWebUrl(
      failures,
      record.buildBaseUrl,
      pageUrl,
      `${label}.buildBaseUrl`,
      false,
    ),
  };
}

function canonicalApiUnityWebUrl(failures, value, pageUrl, label, manifest) {
  try {
    const page = new URL(pageUrl);
    if (page.protocol !== "https:") throw new Error("page protocol");
    if (typeof value !== "string" || !value.trim()) throw new Error("value");
    const raw = value.trim();
    if (raw.startsWith("//")) throw new Error("protocol relative");
    const url = raw.startsWith("/") ? new URL(raw, page.origin) : new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.origin !== page.origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith("/unity/") ||
      (manifest
        ? !url.pathname.endsWith("/manifest.json")
        : url.pathname.endsWith("/"))
    ) {
      throw new Error("invalid Unity URL");
    }
    return url.toString();
  } catch {
    failures.push(`${label} 必须是验收页面同源的正式 Unity HTTPS 地址。`);
    return "";
  }
}

function verifyMotionMetrics(failures, evidence, apiMetrics) {
  if (!Array.isArray(apiMetrics)) {
    failures.push("训练记录 API 中 motionMetrics 必须是数组。");
    return;
  }

  const prescribedDurationSeconds = evidence.rehabPlan.durationMinutes * 60;
  const finalDifficultyLevel = readFinalDifficultyLevel(evidence);
  const expectedMetricContracts = {
    reaction_time_ms: {
      unit: "ms",
      metricValue: evidence.trainingResult.reactionTimeMs,
    },
    target_hit_rate: {
      unit: "ratio",
      metricValue: evidence.trainingResult.completionRate,
    },
    arm_raise_accuracy: {
      unit: "ratio",
      metricValue: evidence.trainingResult.motionAccuracy,
    },
    duration_seconds: {
      unit: "seconds",
      metricValue: prescribedDurationSeconds,
    },
    difficulty_level: {
      unit: "level",
      metricValue: finalDifficultyLevel,
    },
  };
  for (const metricType of requiredUnityMetricTypes) {
    const evidenceMatches = evidence.motionMetrics.filter(
      (metric) => metric?.metricType === metricType,
    );
    if (evidenceMatches.length !== 1) {
      failures.push(
        `evidence.motionMetrics 中必需动作指标 ${metricType} 的数量必须严格等于 1。`,
      );
      continue;
    }
    const apiMatches = apiMetrics.filter(
      (metric) => metric?.metricType === metricType,
    );
    if (apiMatches.length !== 1) {
      failures.push(
        `训练记录 API 中必需动作指标 ${metricType} 的数量必须严格等于 1。`,
      );
      continue;
    }

    const metric = evidenceMatches[0];
    verifyRequiredMetricEvidence(failures, metric, metricType, evidence);
    compareFields(
      failures,
      `motionMetrics.${metricType}`,
      metric,
      expectedMetricContracts[metricType],
    );
    compareFields(failures, `motionMetrics.${metricType}`, apiMatches[0], {
      trainingSessionId: evidence.trainingSession.sessionId,
      collectionBatchId: evidence.trainingSession.collectionBatchId,
      gameRunId: evidence.trainingSession.gameRunId,
      source: evidence.trainingResult.source,
      metricType,
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

function readFinalDifficultyLevel(evidence) {
  const events =
    evidence.bridgeEvent.metricsSummary.dynamicDifficultyEvidence.events;
  if (!Array.isArray(events) || events.length === 0) return undefined;
  const lastEvent = events[events.length - 1];
  return isObject(lastEvent?.after)
    ? lastEvent.after.complexityLevel
    : undefined;
}

function verifyRequiredMetricEvidence(failures, metric, metricType, evidence) {
  const label = `motionMetrics.${metricType}`;
  if (metric.qualityFlag !== "valid") {
    failures.push(`${label}.qualityFlag 必须显式为 valid。`);
  }
  if (
    typeof metric.confidence !== "number" ||
    !Number.isFinite(metric.confidence) ||
    metric.confidence < 0 ||
    metric.confidence > 1
  ) {
    failures.push(`${label}.confidence 必须是 0 到 1 的有限数字。`);
  }
  if (!Number.isInteger(metric.sampleCount) || metric.sampleCount <= 0) {
    failures.push(`${label}.sampleCount 必须是正整数。`);
  }
  if (metric.windowStartedAt !== evidence.trainingSession.clientStartedAt) {
    failures.push(
      `${label}.windowStartedAt 必须严格等于 trainingSession.clientStartedAt。`,
    );
  }
  if (metric.windowEndedAt !== evidence.trainingResult.clientGeneratedAt) {
    failures.push(
      `${label}.windowEndedAt 必须严格等于 trainingResult.clientGeneratedAt。`,
    );
  }
}

async function verifyAuditLogs(
  failures,
  { evidence, apiRoot, client, trainingChain },
) {
  const matchedAuditIds = new Set();
  const matchedLogsByAction = new Map();
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
      continue;
    }

    const log = matched[0];
    matchedAuditIds.add(log.id);
    matchedLogsByAction.set(query.action, log);
    verifyAuditLogChain(failures, {
      action: query.action,
      log,
      evidence,
      trainingChain,
    });
  }

  const expectedAuditIds = evidence.auditEvidence.auditLogIds;
  if (
    expectedAuditIds.length !== matchedAuditIds.size ||
    expectedAuditIds.some((id) => !matchedAuditIds.has(id))
  ) {
    failures.push(
      "auditEvidence.auditLogIds 必须恰好且完整地对应训练开始与结果提交两条审计日志。",
    );
  }

  const startedLog = matchedLogsByAction.get("training_session.start");
  const submittedLog = matchedLogsByAction.get("training_result.submit");
  if (
    startedLog &&
    submittedLog &&
    strictIsoTimestamp(startedLog.createdAt) !== null &&
    strictIsoTimestamp(submittedLog.createdAt) !== null &&
    strictIsoTimestamp(startedLog.createdAt) >
      strictIsoTimestamp(submittedLog.createdAt)
  ) {
    failures.push(
      "training_session.start 审计 createdAt 不能晚于结果提交审计。",
    );
  }
}

function verifyAuditLogChain(
  failures,
  { action, log, evidence, trainingChain },
) {
  const { session, result } = trainingChain;
  const isStart = action === "training_session.start";
  const expectedActorUserId = isStart
    ? session.createdByUserId
    : result.submittedByUserId;
  if (typeof expectedActorUserId !== "string" || !expectedActorUserId.trim()) {
    failures.push(`${action} 无法核对 actor：训练记录 API 缺少动作用户 ID。`);
  } else {
    compareFields(failures, `${action} 审计`, log, {
      actorUserId: expectedActorUserId,
    });
  }
  if (typeof log.actorRole !== "string" || !log.actorRole.trim()) {
    failures.push(`${action} 审计 actorRole 必须显式提供。`);
  }
  if (
    !isObject(log.actor) ||
    typeof log.actor.account !== "string" ||
    !log.actor.account.trim() ||
    typeof log.actor.displayName !== "string" ||
    !log.actor.displayName.trim()
  ) {
    failures.push(`${action} 审计 actor 必须包含真实账号与显示名称。`);
  }

  const createdAt = strictIsoTimestamp(log.createdAt);
  if (createdAt === null) {
    failures.push(`${action} 审计 createdAt 必须是严格 UTC ISO 时间。`);
  } else if (isStart) {
    const sessionCreatedAt = strictIsoTimestamp(session.createdAt);
    verifyTimestampRange(failures, {
      label: `${action} 审计 createdAt`,
      value: createdAt,
      minimum: sessionCreatedAt,
      maximum: sessionCreatedAt,
    });
  } else {
    verifyTimestampRange(failures, {
      label: `${action} 审计 createdAt`,
      value: createdAt,
      minimum: strictIsoTimestamp(result.clientGeneratedAt),
      maximum: strictIsoTimestamp(result.submittedAt),
    });
    const checkedAt = strictIsoTimestamp(evidence.auditEvidence.checkedAt);
    if (checkedAt === null || createdAt > checkedAt) {
      failures.push(
        `${action} 审计 createdAt 必须不晚于 auditEvidence.checkedAt。`,
      );
    }
  }

  const commonMetadata = {
    patientId: evidence.patient.patientId,
    rehabPlanId: evidence.rehabPlan.rehabPlanId,
    planItemId: evidence.rehabPlan.planItemId,
    collectionBatchId: evidence.trainingSession.collectionBatchId,
    gameContentId: evidence.gameContent.gameContentId,
    gameRunId: evidence.trainingSession.gameRunId,
  };
  const expectedMetadata = isStart
    ? commonMetadata
    : {
        abnormalFlag: evidence.trainingResult.abnormalFlag,
        qualityFlag: evidence.trainingResult.qualityFlag,
        qualityReasons: [],
        sessionStatus: evidence.trainingSession.sessionStatus,
        ...commonMetadata,
        trainingResultId: evidence.trainingResult.resultId,
      };
  compareRequiredObjectFields(
    failures,
    `${action} 审计 metadata`,
    log.metadata,
    expectedMetadata,
  );
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

function compareRequiredObjectFields(failures, label, actual, expected) {
  if (!isObject(actual)) {
    failures.push(`${label} 必须是对象。`);
    return;
  }
  compareFields(failures, label, actual, expected);
}

function verifyTimestampRange(failures, { label, value, minimum, maximum }) {
  if (minimum === null || maximum === null) {
    failures.push(
      `${label} 无法与训练链时间核对：训练记录缺少严格 UTC ISO 时间。`,
    );
    return;
  }
  if (value < minimum || value > maximum) {
    failures.push(`${label} 必须位于对应训练动作的服务端时间窗口内。`);
  }
}

function strictIsoTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    return null;
  }
  return parsed.getTime();
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
      `${path} 包含敏感字段、演示/手工标记或原始载荷，不能作为正式 Unity 验收审计记录。`,
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
  if (Object.is(actual, expected)) return true;
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      Array.isArray(expected) &&
      actual.length === expected.length &&
      actual.every((value, index) => valuesEqual(value, expected[index]))
    );
  }
  if (isObject(actual) || isObject(expected)) {
    if (!isObject(actual) || !isObject(expected)) return false;
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    return (
      valuesEqual(actualKeys, expectedKeys) &&
      actualKeys.every((key) => valuesEqual(actual[key], expected[key]))
    );
  }
  return false;
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
    console.error("Unity WebGL 实机只读验真失败：");
    for (const failure of options.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  const evidencePath =
    options.evidencePath ?? process.env.UNITY_FIELD_EVIDENCE_FILE;

  if (!evidencePath) {
    console.error(
      "缺少证据文件路径。请传入 JSON 文件路径，或设置 UNITY_FIELD_EVIDENCE_FILE。",
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

  const result = await verifyUnityFieldAcceptance({
    evidence: readResult.evidence,
    evidencePath: absolutePath,
    apiBaseUrl: options.apiBaseUrl ?? process.env.UNITY_FIELD_API_BASE_URL,
    patientAccount: process.env.UNITY_FIELD_PATIENT_ACCOUNT,
    patientPassword: process.env.UNITY_FIELD_PATIENT_PASSWORD,
    auditAccount: process.env.UNITY_FIELD_AUDIT_ACCOUNT,
    auditPassword: process.env.UNITY_FIELD_AUDIT_PASSWORD,
  });

  if (result.failures.length) {
    console.error("Unity WebGL 实机只读验真失败：");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Unity WebGL 实机只读验真通过。");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await cli();
}
