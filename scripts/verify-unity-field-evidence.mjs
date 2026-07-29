#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const expectedEvidenceVersion = "unity-field-acceptance/v1";
const expectedRuntimeType = "unity_webgl";
const expectedBridgeProtocolVersion = "1.0.0";
const expectedResultContractVersion = "rehab-unity-result-v2";
const expectedDynamicDifficultySchemaVersion = "1.0.0";
const allowedStartingLevelSources = [
  "clinician_approved_plan",
  "clinician_approved_assessment",
];
const allowedDynamicDifficultyTriggerReasons = [
  "prior_assessment",
  "reaction_slow",
  "accuracy_high",
  "accuracy_low",
  "fatigue_risk",
  "clinician_limit",
];
const requiredAuditActions = [
  "training_session.start",
  "training_result.submit",
];
const forbiddenMarkers = [
  "mock",
  "demo",
  "seed",
  "fallback",
  "fixed",
  "manual",
];
const sensitiveEvidenceKeys = new Set([
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

export function validateUnityFieldEvidence(evidence) {
  const failures = [];

  if (!isObject(evidence)) {
    return { failures: ["证据文件必须是 JSON 对象。"] };
  }

  requireEqual(
    failures,
    evidence.evidenceVersion,
    expectedEvidenceVersion,
    "evidenceVersion 必须使用 unity-field-acceptance/v1。",
  );

  validateAcceptance(failures, evidence.acceptance);
  validateBrowser(failures, evidence.browser);
  validateDevice(failures, evidence.device);
  validateUnityRuntime(failures, evidence.unityRuntime);
  validatePatient(failures, evidence.patient);
  validateGameContent(failures, evidence.gameContent);
  validateRehabPlan(failures, evidence.rehabPlan);
  validateTrainingSession(failures, evidence.trainingSession);
  validateBridgeEvent(failures, evidence.bridgeEvent);
  validateTrainingResult(failures, evidence.trainingResult);
  validateMotionMetrics(failures, evidence.motionMetrics);
  validateAuditEvidence(failures, evidence.auditEvidence);
  validateArtifacts(failures, evidence.artifacts);
  validateCrossReferences(failures, evidence);
  validateNoDemoMarkers(failures, evidence);
  validateNoSensitiveEvidence(failures, evidence);
  validateNoPlaceholders(failures, evidence);

  return { failures };
}

function validateAcceptance(failures, acceptance) {
  requireObject(failures, acceptance, "acceptance 必须是对象。");
  if (!isObject(acceptance)) return;
  requireIsoDate(failures, acceptance.acceptedAt, "acceptance.acceptedAt");
  requireString(failures, acceptance.testerName, "acceptance.testerName");
  requireString(failures, acceptance.siteName, "acceptance.siteName");
  requireString(failures, acceptance.environment, "acceptance.environment");
}

function validateBrowser(failures, browser) {
  requireObject(failures, browser, "browser 必须是对象。");
  if (!isObject(browser)) return;
  requireString(failures, browser.name, "browser.name");
  requireString(failures, browser.version, "browser.version");
  requireString(failures, browser.userAgent, "browser.userAgent");
  requireString(failures, browser.pageUrl, "browser.pageUrl");
  if (
    typeof browser.pageUrl === "string" &&
    browser.pageUrl.trim() &&
    !browser.pageUrl.startsWith("https://")
  ) {
    failures.push("browser.pageUrl 必须是正式 HTTPS 页面地址。");
  }
}

function validateDevice(failures, device) {
  requireObject(failures, device, "device 必须是对象。");
  if (!isObject(device)) return;
  requireString(failures, device.deviceCode, "device.deviceCode");
  requireString(failures, device.deviceType, "device.deviceType");
  requireString(failures, device.inputMode, "device.inputMode");
  requireString(failures, device.calibrationStatus, "device.calibrationStatus");
  requireString(failures, device.resolution, "device.resolution");
}

function validateUnityRuntime(failures, unityRuntime) {
  requireObject(failures, unityRuntime, "unityRuntime 必须是对象。");
  if (!isObject(unityRuntime)) return;
  requireEqual(
    failures,
    unityRuntime.runtimeType,
    expectedRuntimeType,
    "unityRuntime.runtimeType 必须是 unity_webgl。",
  );
  requireHttpsUrl(
    failures,
    unityRuntime.manifestUrl,
    "unityRuntime.manifestUrl",
  );
  requireHttpsUrl(
    failures,
    unityRuntime.buildBaseUrl,
    "unityRuntime.buildBaseUrl",
  );
  requireString(failures, unityRuntime.gameVersion, "unityRuntime.gameVersion");
  requireEqual(
    failures,
    unityRuntime.bridgeProtocolVersion,
    expectedBridgeProtocolVersion,
    "unityRuntime.bridgeProtocolVersion 必须是 1.0.0。",
  );
  requireIsoDate(
    failures,
    unityRuntime.loaderLoadedAt,
    "unityRuntime.loaderLoadedAt",
  );
  requireIsoDate(
    failures,
    unityRuntime.unityInstanceStartedAt,
    "unityRuntime.unityInstanceStartedAt",
  );
  requireString(
    failures,
    unityRuntime.canvasResolution,
    "unityRuntime.canvasResolution",
  );
  requirePositiveNumber(
    failures,
    unityRuntime.devicePixelRatio,
    "unityRuntime.devicePixelRatio",
  );
  requireManifestUnderBase(
    failures,
    unityRuntime.manifestUrl,
    unityRuntime.buildBaseUrl,
    "unityRuntime.manifestUrl",
  );
}

function validatePatient(failures, patient) {
  requireObject(failures, patient, "patient 必须是对象。");
  if (!isObject(patient)) return;
  requireString(failures, patient.patientId, "patient.patientId");
  requireString(failures, patient.patientExportId, "patient.patientExportId");
}

function validateGameContent(failures, gameContent) {
  requireObject(failures, gameContent, "gameContent 必须是对象。");
  if (!isObject(gameContent)) return;
  requireString(
    failures,
    gameContent.gameContentId,
    "gameContent.gameContentId",
  );
  requireString(failures, gameContent.code, "gameContent.code");
  requireString(failures, gameContent.name, "gameContent.name");
  requireEqual(
    failures,
    gameContent.runtimeType,
    expectedRuntimeType,
    "gameContent.runtimeType 必须是 unity_webgl。",
  );
  requireString(failures, gameContent.gameVersion, "gameContent.gameVersion");
  requireEqual(
    failures,
    gameContent.bridgeProtocolVersion,
    expectedBridgeProtocolVersion,
    "gameContent.bridgeProtocolVersion 必须是 1.0.0。",
  );
  requireEqual(
    failures,
    gameContent.releaseChannel,
    "production",
    "gameContent.releaseChannel 必须是 production。",
  );
  requireEqual(
    failures,
    gameContent.buildStatus,
    "released",
    "gameContent.buildStatus 必须是 released。",
  );
  requireHttpsUrl(failures, gameContent.manifestUrl, "gameContent.manifestUrl");
  requireHttpsUrl(
    failures,
    gameContent.buildBaseUrl,
    "gameContent.buildBaseUrl",
  );
  requireManifestUnderBase(
    failures,
    gameContent.manifestUrl,
    gameContent.buildBaseUrl,
    "gameContent.manifestUrl",
  );
}

function validateRehabPlan(failures, rehabPlan) {
  requireObject(failures, rehabPlan, "rehabPlan 必须是对象。");
  if (!isObject(rehabPlan)) return;
  requireString(failures, rehabPlan.rehabPlanId, "rehabPlan.rehabPlanId");
  requireString(failures, rehabPlan.planItemId, "rehabPlan.planItemId");
  requirePositiveInteger(
    failures,
    rehabPlan.durationMinutes,
    "rehabPlan.durationMinutes",
  );
  requireString(
    failures,
    rehabPlan.confirmedByDoctorId,
    "rehabPlan.confirmedByDoctorId",
  );
  requireIsoDate(failures, rehabPlan.confirmedAt, "rehabPlan.confirmedAt");
}

function validateTrainingSession(failures, trainingSession) {
  requireObject(failures, trainingSession, "trainingSession 必须是对象。");
  if (!isObject(trainingSession)) return;
  requireString(
    failures,
    trainingSession.sessionId,
    "trainingSession.sessionId",
  );
  requireString(
    failures,
    trainingSession.collectionBatchId,
    "trainingSession.collectionBatchId",
  );
  requireString(
    failures,
    trainingSession.gameRunId,
    "trainingSession.gameRunId",
  );
  requireString(
    failures,
    trainingSession.deviceCode,
    "trainingSession.deviceCode",
  );
  requireEqual(
    failures,
    trainingSession.sessionStatus,
    "completed",
    "trainingSession.sessionStatus 必须是 completed。",
  );
  requireEqual(
    failures,
    trainingSession.syncStatus,
    "synced",
    "trainingSession.syncStatus 必须是 synced。",
  );
  requireString(
    failures,
    trainingSession.calibrationStatus,
    "trainingSession.calibrationStatus",
  );
  requireIsoDate(
    failures,
    trainingSession.clientStartedAt,
    "trainingSession.clientStartedAt",
  );
  requireIsoDate(
    failures,
    trainingSession.clientEndedAt,
    "trainingSession.clientEndedAt",
  );
  validateRuntimeConfigSnapshot(
    failures,
    trainingSession.runtimeConfigSnapshot,
  );
}

function validateRuntimeConfigSnapshot(failures, snapshot) {
  requireObject(
    failures,
    snapshot,
    "trainingSession.runtimeConfigSnapshot 必须是对象。",
  );
  if (!isObject(snapshot)) return;
  requireEqual(
    failures,
    snapshot.runtimeType,
    expectedRuntimeType,
    "trainingSession.runtimeConfigSnapshot.runtimeType 必须是 unity_webgl。",
  );
  requireHttpsUrl(
    failures,
    snapshot.manifestUrl,
    "trainingSession.runtimeConfigSnapshot.manifestUrl",
  );
  requireHttpsUrl(
    failures,
    snapshot.buildBaseUrl,
    "trainingSession.runtimeConfigSnapshot.buildBaseUrl",
  );
  requireString(
    failures,
    snapshot.gameVersion,
    "trainingSession.runtimeConfigSnapshot.gameVersion",
  );
  requireEqual(
    failures,
    snapshot.bridgeProtocolVersion,
    expectedBridgeProtocolVersion,
    "trainingSession.runtimeConfigSnapshot.bridgeProtocolVersion 必须是 1.0.0。",
  );
  requireEqual(
    failures,
    snapshot.resultContractVersion,
    expectedResultContractVersion,
    `trainingSession.runtimeConfigSnapshot.resultContractVersion 必须是 ${expectedResultContractVersion}。`,
  );
  requireString(
    failures,
    snapshot.collectionBatchId,
    "trainingSession.runtimeConfigSnapshot.collectionBatchId",
  );
  requirePositiveInteger(
    failures,
    snapshot.durationSeconds,
    "trainingSession.runtimeConfigSnapshot.durationSeconds",
  );
  requireEqual(
    failures,
    snapshot.releaseChannel,
    "production",
    "trainingSession.runtimeConfigSnapshot.releaseChannel 必须是 production。",
  );
}

function validateBridgeEvent(failures, bridgeEvent) {
  requireObject(failures, bridgeEvent, "bridgeEvent 必须是对象。");
  if (!isObject(bridgeEvent)) return;
  requireEqual(
    failures,
    bridgeEvent.type,
    "training_result",
    "bridgeEvent.type 必须是 training_result。",
  );
  requireEqual(
    failures,
    bridgeEvent.action,
    "training_result",
    "bridgeEvent.action 必须是 training_result。",
  );
  requireEqual(
    failures,
    bridgeEvent.protocolVersion,
    expectedBridgeProtocolVersion,
    "bridgeEvent.protocolVersion 必须是 1.0.0。",
  );
  requireEqual(
    failures,
    bridgeEvent.resultContractVersion,
    expectedResultContractVersion,
    `bridgeEvent.resultContractVersion 必须是 ${expectedResultContractVersion}。`,
  );
  requireString(failures, bridgeEvent.sessionId, "bridgeEvent.sessionId");
  requireString(
    failures,
    bridgeEvent.collectionBatchId,
    "bridgeEvent.collectionBatchId",
  );
  requireString(failures, bridgeEvent.gameRunId, "bridgeEvent.gameRunId");
  requireString(failures, bridgeEvent.gameVersion, "bridgeEvent.gameVersion");
  requireIsoDate(
    failures,
    bridgeEvent.clientGeneratedAt,
    "bridgeEvent.clientGeneratedAt",
  );
  requireString(
    failures,
    bridgeEvent.rawPayloadHash,
    "bridgeEvent.rawPayloadHash",
  );
  requirePositiveInteger(
    failures,
    bridgeEvent.durationSeconds,
    "bridgeEvent.durationSeconds",
  );
  validateBridgeMetricsSummary(failures, bridgeEvent.metricsSummary);
}

function validateBridgeMetricsSummary(failures, metricsSummary) {
  requireObject(
    failures,
    metricsSummary,
    "bridgeEvent.metricsSummary 必须是对象。",
  );
  if (!isObject(metricsSummary)) return;
  requireEqual(
    failures,
    metricsSummary.source,
    expectedRuntimeType,
    "bridgeEvent.metricsSummary.source 必须是 unity_webgl。",
  );
  requireEqual(
    failures,
    metricsSummary.resultContractVersion,
    expectedResultContractVersion,
    `bridgeEvent.metricsSummary.resultContractVersion 必须是 ${expectedResultContractVersion}。`,
  );
  requireString(
    failures,
    metricsSummary.collectionBatchId,
    "bridgeEvent.metricsSummary.collectionBatchId",
  );
  requireString(
    failures,
    metricsSummary.gameRunId,
    "bridgeEvent.metricsSummary.gameRunId",
  );
  requireString(
    failures,
    metricsSummary.gameVersion,
    "bridgeEvent.metricsSummary.gameVersion",
  );
  requireEqual(
    failures,
    metricsSummary.protocolVersion,
    expectedBridgeProtocolVersion,
    "bridgeEvent.metricsSummary.protocolVersion 必须是 1.0.0。",
  );
  requireIsoDate(
    failures,
    metricsSummary.clientGeneratedAt,
    "bridgeEvent.metricsSummary.clientGeneratedAt",
  );
  requireString(
    failures,
    metricsSummary.rawPayloadHash,
    "bridgeEvent.metricsSummary.rawPayloadHash",
  );
  validateDynamicDifficultyEvidence(
    failures,
    metricsSummary.dynamicDifficultyEvidence,
  );
}

function validateDynamicDifficultyEvidence(failures, evidence) {
  requireObject(
    failures,
    evidence,
    "bridgeEvent.metricsSummary.dynamicDifficultyEvidence 必须是对象。",
  );
  if (!isObject(evidence)) return;
  requireEqual(
    failures,
    evidence.schemaVersion,
    expectedDynamicDifficultySchemaVersion,
    "dynamicDifficultyEvidence.schemaVersion 必须是 1.0.0。",
  );
  if (!Array.isArray(evidence.events) || evidence.events.length === 0) {
    failures.push("dynamicDifficultyEvidence.events 必须是非空数组。");
    return;
  }
  evidence.events.forEach((event, index) =>
    validateDynamicDifficultyEvent(failures, event, index),
  );
}

function validateDynamicDifficultyEvent(failures, event, index) {
  const label = `dynamicDifficultyEvidence.events[${index}]`;
  requireObject(failures, event, `${label} 必须是对象。`);
  if (!isObject(event)) return;
  requireIntegerRange(
    failures,
    event.startingLevel,
    1,
    3,
    `${label}.startingLevel`,
  );
  requireOneOf(
    failures,
    event.startingLevelSource,
    allowedStartingLevelSources,
    `${label}.startingLevelSource`,
  );
  requireString(
    failures,
    event.approvedPlanItemId,
    `${label}.approvedPlanItemId`,
  );
  requireString(
    failures,
    event.assessmentSourceId,
    `${label}.assessmentSourceId`,
  );
  requireOneOf(
    failures,
    event.triggerReason,
    allowedDynamicDifficultyTriggerReasons,
    `${label}.triggerReason`,
  );
  validateDifficultySnapshot(failures, event.before, `${label}.before`);
  validateDifficultySnapshot(failures, event.after, `${label}.after`);
  requireIsoDate(failures, event.adjustedAt, `${label}.adjustedAt`);
  requireString(failures, event.runtimeFrameId, `${label}.runtimeFrameId`);
  requireString(failures, event.runtimeWindowId, `${label}.runtimeWindowId`);
  if (event.safetyClampReason !== undefined) {
    requireString(
      failures,
      event.safetyClampReason,
      `${label}.safetyClampReason`,
    );
  }
  if (
    isObject(event.before) &&
    isObject(event.after) &&
    event.before.speed === event.after.speed &&
    event.before.complexityLevel === event.after.complexityLevel
  ) {
    requireString(
      failures,
      event.safetyClampReason,
      `${label}.safetyClampReason`,
    );
  }
}

function validateDifficultySnapshot(failures, snapshot, label) {
  requireObject(failures, snapshot, `${label} 必须是对象。`);
  if (!isObject(snapshot)) return;
  requirePositiveNumber(failures, snapshot.speed, `${label}.speed`);
  requireIntegerRange(
    failures,
    snapshot.complexityLevel,
    1,
    3,
    `${label}.complexityLevel`,
  );
}

function validateTrainingResult(failures, trainingResult) {
  requireObject(failures, trainingResult, "trainingResult 必须是对象。");
  if (!isObject(trainingResult)) return;
  requireString(failures, trainingResult.resultId, "trainingResult.resultId");
  requireString(
    failures,
    trainingResult.collectionBatchId,
    "trainingResult.collectionBatchId",
  );
  requireEqual(
    failures,
    trainingResult.source,
    expectedRuntimeType,
    "trainingResult.source 必须是 unity_webgl。",
  );
  if (containsForbiddenMarker(String(trainingResult.source ?? ""))) {
    failures.push(
      "trainingResult.source 不能包含 mock/demo/seed/fallback/fixed/manual。",
    );
  }
  requireString(failures, trainingResult.gameRunId, "trainingResult.gameRunId");
  requireString(
    failures,
    trainingResult.gameVersion,
    "trainingResult.gameVersion",
  );
  requireEqual(
    failures,
    trainingResult.bridgeProtocolVersion,
    expectedBridgeProtocolVersion,
    "trainingResult.bridgeProtocolVersion 必须是 1.0.0。",
  );
  requireIsoDate(
    failures,
    trainingResult.clientGeneratedAt,
    "trainingResult.clientGeneratedAt",
  );
  requireString(
    failures,
    trainingResult.rawPayloadHash,
    "trainingResult.rawPayloadHash",
  );
  requireIsoDate(
    failures,
    trainingResult.submittedAt,
    "trainingResult.submittedAt",
  );
  requireEqual(
    failures,
    trainingResult.qualityFlag,
    "valid",
    "trainingResult.qualityFlag 必须显式为 valid。",
  );
  requireEqual(
    failures,
    trainingResult.abnormalFlag,
    false,
    "trainingResult.abnormalFlag 必须显式为 false。",
  );
  requireScore(failures, trainingResult.score, "trainingResult.score");
  requireRatio(
    failures,
    trainingResult.completionRate,
    "trainingResult.completionRate",
  );
  requirePositiveInteger(
    failures,
    trainingResult.durationSeconds,
    "trainingResult.durationSeconds",
  );
  requirePositiveInteger(
    failures,
    trainingResult.reactionTimeMs,
    "trainingResult.reactionTimeMs",
  );
  requireRatio(
    failures,
    trainingResult.motionAccuracy,
    "trainingResult.motionAccuracy",
  );
  requireString(
    failures,
    trainingResult.exerciseIntensity,
    "trainingResult.exerciseIntensity",
  );
}

function validateMotionMetrics(failures, motionMetrics) {
  if (!Array.isArray(motionMetrics) || motionMetrics.length === 0) {
    failures.push("motionMetrics 必须是非空数组。");
    return;
  }

  for (const metric of motionMetrics) {
    if (!isObject(metric)) {
      failures.push("motionMetrics 每一项都必须是对象。");
      continue;
    }
    requireString(failures, metric.metricType, "motionMetrics.metricType");
    requireNumber(
      failures,
      metric.metricValue,
      `${metric.metricType}.metricValue`,
    );
    requireString(failures, metric.unit, `${metric.metricType}.unit`);
    requireRatio(
      failures,
      metric.confidence,
      `${metric.metricType}.confidence`,
    );
    requirePositiveInteger(
      failures,
      metric.sampleCount,
      `${metric.metricType}.sampleCount`,
    );
    requireEqual(
      failures,
      metric.qualityFlag,
      "valid",
      `${metric.metricType}.qualityFlag 必须显式为 valid。`,
    );
    requireIsoDate(
      failures,
      metric.windowStartedAt,
      `${metric.metricType}.windowStartedAt`,
    );
    requireIsoDate(
      failures,
      metric.windowEndedAt,
      `${metric.metricType}.windowEndedAt`,
    );
  }
}

function validateAuditEvidence(failures, auditEvidence) {
  requireObject(failures, auditEvidence, "auditEvidence 必须是对象。");
  if (!isObject(auditEvidence)) return;
  requireStringArray(
    failures,
    auditEvidence.auditLogIds,
    "auditEvidence.auditLogIds",
  );
  requireStringArray(
    failures,
    auditEvidence.requiredActions,
    "auditEvidence.requiredActions",
  );
  requireIsoDate(failures, auditEvidence.checkedAt, "auditEvidence.checkedAt");

  if (
    Array.isArray(auditEvidence.auditLogIds) &&
    (auditEvidence.auditLogIds.length !== 2 ||
      new Set(auditEvidence.auditLogIds).size !== 2)
  ) {
    failures.push("auditEvidence.auditLogIds 必须恰好两个且唯一。");
  }

  if (Array.isArray(auditEvidence.requiredActions)) {
    for (const action of requiredAuditActions) {
      if (!auditEvidence.requiredActions.includes(action)) {
        failures.push(`auditEvidence.requiredActions 缺少 ${action}。`);
      }
    }
    const extraActions = auditEvidence.requiredActions.filter(
      (action) => !requiredAuditActions.includes(action),
    );
    if (
      extraActions.length ||
      auditEvidence.requiredActions.length !== requiredAuditActions.length ||
      new Set(auditEvidence.requiredActions).size !==
        requiredAuditActions.length
    ) {
      failures.push(
        `auditEvidence.requiredActions 必须恰好包含且唯一：${requiredAuditActions.join("、")}；只能包含这两个动作；多余动作：${
          extraActions.join("、") || "重复或数量不一致"
        }。`,
      );
    }
    if (auditEvidence.requiredActions.includes("training_result.review")) {
      failures.push(
        "正式 Unity WebGL 现场验收只接受 valid 且无异常训练结果；training_result.review 属于异常训练复核契约，请使用 pnpm verify:contracts 验收。",
      );
    }
  }
}

function validateArtifacts(failures, artifacts) {
  requireObject(failures, artifacts, "artifacts 必须是对象。");
  if (!isObject(artifacts)) return;
  if (
    !Array.isArray(artifacts.screenshots) ||
    artifacts.screenshots.length === 0
  ) {
    failures.push("artifacts.screenshots 至少需要一张现场验收截图。");
  } else {
    artifacts.screenshots.forEach((item, index) =>
      validateArtifact(failures, item, `artifacts.screenshots[${index}]`),
    );
  }

  if (
    !Array.isArray(artifacts.recordings) ||
    artifacts.recordings.length === 0
  ) {
    failures.push("artifacts.recordings 至少需要一份现场训练录屏或录像。");
  } else {
    artifacts.recordings.forEach((item, index) =>
      validateArtifact(failures, item, `artifacts.recordings[${index}]`),
    );
  }
}

function validateArtifact(failures, artifact, path) {
  requireObject(failures, artifact, `${path} 必须是对象。`);
  if (!isObject(artifact)) return;
  requireString(failures, artifact.label, `${path}.label`);
  requireString(failures, artifact.path, `${path}.path`);
  requireIsoDate(failures, artifact.capturedAt, `${path}.capturedAt`);
}

function validateCrossReferences(failures, evidence) {
  const session = evidence.trainingSession;
  const result = evidence.trainingResult;
  const gameContent = evidence.gameContent;
  const device = evidence.device;
  const runtime = evidence.unityRuntime;
  const bridgeEvent = evidence.bridgeEvent;
  const snapshot = session?.runtimeConfigSnapshot;
  const metricsSummary = bridgeEvent?.metricsSummary;
  const dynamicDifficultyEvents =
    metricsSummary?.dynamicDifficultyEvidence?.events;

  compareWhenPresent(
    failures,
    session?.gameRunId,
    result?.gameRunId,
    "trainingSession.gameRunId 与 trainingResult.gameRunId 必须一致。",
  );
  compareWhenPresent(
    failures,
    session?.deviceCode,
    device?.deviceCode,
    "trainingSession.deviceCode 与 device.deviceCode 必须一致。",
  );
  compareWhenPresent(
    failures,
    gameContent?.gameVersion,
    result?.gameVersion,
    "gameContent.gameVersion 与 trainingResult.gameVersion 必须一致。",
  );
  compareWhenPresent(
    failures,
    gameContent?.bridgeProtocolVersion,
    result?.bridgeProtocolVersion,
    "gameContent.bridgeProtocolVersion 与 trainingResult.bridgeProtocolVersion 必须一致。",
  );
  compareWhenPresent(
    failures,
    gameContent?.runtimeType,
    runtime?.runtimeType,
    "gameContent.runtimeType 与 unityRuntime.runtimeType 必须一致。",
  );
  compareWhenPresent(
    failures,
    gameContent?.manifestUrl,
    runtime?.manifestUrl,
    "gameContent.manifestUrl 与 unityRuntime.manifestUrl 必须一致。",
  );
  compareWhenPresent(
    failures,
    gameContent?.buildBaseUrl,
    runtime?.buildBaseUrl,
    "gameContent.buildBaseUrl 与 unityRuntime.buildBaseUrl 必须一致。",
  );
  compareWhenPresent(
    failures,
    bridgeEvent?.sessionId,
    session?.sessionId,
    "bridgeEvent.sessionId 与 trainingSession.sessionId 必须一致。",
  );
  compareWhenPresent(
    failures,
    bridgeEvent?.gameRunId,
    result?.gameRunId,
    "bridgeEvent.gameRunId 与 trainingResult.gameRunId 必须一致。",
  );
  compareWhenPresent(
    failures,
    bridgeEvent?.gameVersion,
    result?.gameVersion,
    "bridgeEvent.gameVersion 与 trainingResult.gameVersion 必须一致。",
  );
  compareWhenPresent(
    failures,
    bridgeEvent?.protocolVersion,
    result?.bridgeProtocolVersion,
    "bridgeEvent.protocolVersion 与 trainingResult.bridgeProtocolVersion 必须一致。",
  );
  compareWhenPresent(
    failures,
    bridgeEvent?.clientGeneratedAt,
    result?.clientGeneratedAt,
    "bridgeEvent.clientGeneratedAt 与 trainingResult.clientGeneratedAt 必须一致。",
  );
  compareWhenPresent(
    failures,
    bridgeEvent?.rawPayloadHash,
    result?.rawPayloadHash,
    "bridgeEvent.rawPayloadHash 与 trainingResult.rawPayloadHash 必须一致。",
  );
  compareWhenPresent(
    failures,
    session?.collectionBatchId,
    snapshot?.collectionBatchId,
    "trainingSession.collectionBatchId 与 trainingSession.runtimeConfigSnapshot.collectionBatchId 必须一致。",
  );
  compareWhenPresent(
    failures,
    session?.collectionBatchId,
    bridgeEvent?.collectionBatchId,
    "trainingSession.collectionBatchId 与 bridgeEvent.collectionBatchId 必须一致。",
  );
  compareWhenPresent(
    failures,
    session?.collectionBatchId,
    result?.collectionBatchId,
    "trainingSession.collectionBatchId 与 trainingResult.collectionBatchId 必须一致。",
  );
  compareWhenPresent(
    failures,
    bridgeEvent?.resultContractVersion,
    snapshot?.resultContractVersion,
    "bridgeEvent.resultContractVersion 与 trainingSession.runtimeConfigSnapshot.resultContractVersion 必须一致。",
  );

  for (const [field, bridgeValue] of Object.entries({
    resultContractVersion: bridgeEvent?.resultContractVersion,
    collectionBatchId: bridgeEvent?.collectionBatchId,
    gameRunId: bridgeEvent?.gameRunId,
    gameVersion: bridgeEvent?.gameVersion,
    protocolVersion: bridgeEvent?.protocolVersion,
    clientGeneratedAt: bridgeEvent?.clientGeneratedAt,
    rawPayloadHash: bridgeEvent?.rawPayloadHash,
  })) {
    compareWhenPresent(
      failures,
      metricsSummary?.[field],
      bridgeValue,
      `bridgeEvent.metricsSummary.${field} 与 bridgeEvent.${field} 必须一致。`,
    );
  }

  if (Number.isInteger(evidence.rehabPlan?.durationMinutes)) {
    const prescribedDurationSeconds = evidence.rehabPlan.durationMinutes * 60;
    compareRequiredNumber(
      failures,
      prescribedDurationSeconds,
      snapshot?.durationSeconds,
      "rehabPlan.durationMinutes 与 trainingSession.runtimeConfigSnapshot.durationSeconds 必须严格一致。",
    );
    compareRequiredNumber(
      failures,
      prescribedDurationSeconds,
      bridgeEvent?.durationSeconds,
      "rehabPlan.durationMinutes 与 bridgeEvent.durationSeconds 必须严格一致。",
    );
    compareRequiredNumber(
      failures,
      prescribedDurationSeconds,
      result?.durationSeconds,
      "rehabPlan.durationMinutes 与 trainingResult.durationSeconds 必须严格一致。",
    );
  }

  if (Array.isArray(dynamicDifficultyEvents)) {
    dynamicDifficultyEvents.forEach((event, index) => {
      compareWhenPresent(
        failures,
        event?.approvedPlanItemId,
        evidence.rehabPlan?.planItemId,
        `dynamicDifficultyEvidence.events[${index}].approvedPlanItemId 与 rehabPlan.planItemId 必须一致。`,
      );
      if (
        typeof event?.runtimeFrameId === "string" &&
        typeof session?.gameRunId === "string" &&
        !event.runtimeFrameId.startsWith(`${session.gameRunId}:`)
      ) {
        failures.push(
          `dynamicDifficultyEvidence.events[${index}].runtimeFrameId 必须属于当前 gameRunId。`,
        );
      }
      if (
        typeof event?.runtimeWindowId === "string" &&
        typeof session?.gameRunId === "string" &&
        !event.runtimeWindowId.startsWith(`${session.gameRunId}:`)
      ) {
        failures.push(
          `dynamicDifficultyEvidence.events[${index}].runtimeWindowId 必须属于当前 gameRunId。`,
        );
      }
    });
  }

  for (const [field, runtimeValue] of Object.entries({
    runtimeType: runtime?.runtimeType,
    manifestUrl: runtime?.manifestUrl,
    buildBaseUrl: runtime?.buildBaseUrl,
    gameVersion: runtime?.gameVersion,
    bridgeProtocolVersion: runtime?.bridgeProtocolVersion,
  })) {
    compareWhenPresent(
      failures,
      snapshot?.[field],
      runtimeValue,
      `trainingSession.runtimeConfigSnapshot.${field} 与 unityRuntime.${field} 必须一致。`,
    );
  }
}

function validateNoPlaceholders(failures, evidence) {
  const paths = [];
  collectPlaceholderPaths(evidence, "$", paths);
  for (const path of paths) {
    failures.push(`${path} 仍包含占位符，必须替换为现场实机证据。`);
  }
}

function validateNoDemoMarkers(failures, evidence) {
  const paths = [];
  collectDemoMarkerPaths(evidence, "$", paths);
  for (const path of paths) {
    failures.push(
      `${path} 包含 mock/demo/seed/fallback/fixed/manual 标记，不能作为正式 Unity 验收证据。`,
    );
  }
}

function collectDemoMarkerPaths(value, path, paths) {
  if (typeof value === "string") {
    if (containsForbiddenMarker(value)) {
      paths.push(path);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectDemoMarkerPaths(item, `${path}[${index}]`, paths),
    );
    return;
  }

  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    collectDemoMarkerPaths(nested, `${path}.${key}`, paths);
  }
}

function validateNoSensitiveEvidence(failures, evidence) {
  const paths = [];
  collectSensitiveEvidencePaths(evidence, "$", paths);
  for (const path of paths) {
    failures.push(
      `${path} 包含敏感字段或原始载荷，不能写入正式 Unity evidence。`,
    );
  }
}

function collectSensitiveEvidencePaths(value, path, paths) {
  if (typeof value === "string") {
    if (isUnsafeEvidenceText(value)) paths.push(path);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectSensitiveEvidencePaths(item, `${path}[${index}]`, paths),
    );
    return;
  }

  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (sensitiveEvidenceKeys.has(normalizeKey(key))) {
      paths.push(nestedPath);
      continue;
    }
    collectSensitiveEvidencePaths(nested, nestedPath, paths);
  }
}

function isUnsafeEvidenceText(value) {
  if (isHashDigestText(value)) return false;
  return (
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

function collectPlaceholderPaths(value, path, paths) {
  if (typeof value === "string") {
    if (/<[^>]+>/.test(value)) paths.push(path);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectPlaceholderPaths(item, `${path}[${index}]`, paths),
    );
    return;
  }

  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    collectPlaceholderPaths(nested, `${path}.${key}`, paths);
  }
}

function compareWhenPresent(failures, left, right, message) {
  if (left && right && left !== right) failures.push(message);
}

function compareRequiredNumber(failures, expected, actual, message) {
  if (
    typeof actual === "number" &&
    Number.isFinite(actual) &&
    actual !== expected
  ) {
    failures.push(message);
  }
}

function requireObject(failures, value, message) {
  if (!isObject(value)) failures.push(message);
}

function requireString(failures, value, label) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${label} 必须显式提供非空文本。`);
  }
}

function requireStringArray(failures, value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    failures.push(`${label} 必须是非空文本数组。`);
    return;
  }

  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) {
      failures.push(`${label} 只能包含非空文本。`);
      return;
    }
  }
}

function requireEqual(failures, value, expected, message) {
  if (value !== expected) failures.push(message);
}

function requireIsoDate(failures, value, label) {
  requireString(failures, value, label);
  if (typeof value !== "string" || !value.trim()) return;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    failures.push(`${label} 必须是 ISO 8601 UTC 时间。`);
  }
}

function requireNumber(failures, value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    failures.push(`${label} 必须是数字。`);
  }
}

function requirePositiveNumber(failures, value, label) {
  requireNumber(failures, value, label);
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  if (value <= 0) {
    failures.push(`${label} 必须大于 0。`);
  }
}

function requirePositiveInteger(failures, value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    failures.push(`${label} 必须是大于 0 的整数。`);
  }
}

function requireIntegerRange(failures, value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    failures.push(`${label} 必须是 ${minimum} 到 ${maximum} 之间的整数。`);
  }
}

function requireOneOf(failures, value, allowedValues, label) {
  if (!allowedValues.includes(value)) {
    failures.push(`${label} 必须是 ${allowedValues.join("、")} 之一。`);
  }
}

function requireScore(failures, value, label) {
  requireNumber(failures, value, label);
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  if (value < 0 || value > 100) {
    failures.push(`${label} 必须在 0 到 100 之间。`);
  }
}

function requireRatio(failures, value, label) {
  requireNumber(failures, value, label);
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  if (value < 0 || value > 1) {
    failures.push(`${label} 必须在 0 到 1 之间。`);
  }
}

function requireHttpsUrl(failures, value, label) {
  requireString(failures, value, label);
  if (typeof value !== "string" || !value.trim()) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      failures.push(`${label} 必须是正式 HTTPS 地址。`);
    }
  } catch {
    failures.push(`${label} 必须是有效 URL。`);
  }
}

function requireManifestUnderBase(failures, manifestUrl, buildBaseUrl, label) {
  if (typeof manifestUrl !== "string" || typeof buildBaseUrl !== "string")
    return;
  if (!manifestUrl.trim() || !buildBaseUrl.trim()) return;
  const normalizedBase = buildBaseUrl.replace(/\/+$/, "");
  if (!manifestUrl.startsWith(`${normalizedBase}/`)) {
    failures.push(`${label} 必须位于 buildBaseUrl 目录下。`);
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readEvidenceFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function cli() {
  const evidencePath =
    process.argv.slice(2).find((arg) => arg !== "--") ??
    process.env.UNITY_FIELD_EVIDENCE_FILE;

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

  const result = validateUnityFieldEvidence(readEvidenceFile(absolutePath));
  if (result.failures.length) {
    console.error("Unity WebGL 实机验收证据校验失败：");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Unity WebGL 实机验收证据校验通过。");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}
