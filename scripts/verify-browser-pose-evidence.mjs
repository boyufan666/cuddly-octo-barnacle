#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const expectedEvidenceVersion = "browser-pose-field-acceptance/v1";
const expectedRuntimeType = "browser_pose_game";
const expectedBridgeProtocolVersion = "1.0.0";
const requiredMetricTypes = [
  "reaction_time_ms",
  "target_hit_rate",
  "pose_visibility_avg",
  "arm_raise_accuracy",
];
const requiredAuditActions = [
  "training_session.start",
  "training_result.submit",
];

export function validateBrowserPoseEvidence(evidence) {
  const failures = [];

  if (!isObject(evidence)) {
    return { failures: ["证据文件必须是 JSON 对象。"] };
  }

  requireEqual(
    failures,
    evidence.evidenceVersion,
    expectedEvidenceVersion,
    "evidenceVersion 必须使用 browser-pose-field-acceptance/v1。",
  );

  validateAcceptance(failures, evidence.acceptance);
  validateBrowser(failures, evidence.browser);
  validateDevice(failures, evidence.device);
  validatePoseRuntime(failures, evidence.poseRuntime);
  validatePatient(failures, evidence.patient);
  validateGameContent(failures, evidence.gameContent);
  validateRehabPlan(failures, evidence.rehabPlan);
  validateTrainingSession(failures, evidence.trainingSession);
  validateTrainingResult(failures, evidence.trainingResult);
  validateMotionMetrics(failures, evidence.motionMetrics);
  validateAuditEvidence(failures, evidence.auditEvidence);
  validateArtifacts(failures, evidence.artifacts);
  validateCrossReferences(failures, evidence);
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
  requireString(failures, device.cameraLabel, "device.cameraLabel");
  requireString(
    failures,
    device.cameraDeviceIdHash,
    "device.cameraDeviceIdHash",
  );
  requireString(failures, device.resolution, "device.resolution");
}

function validatePoseRuntime(failures, poseRuntime) {
  requireObject(failures, poseRuntime, "poseRuntime 必须是对象。");
  if (!isObject(poseRuntime)) return;
  requireEqual(
    failures,
    poseRuntime.runtimeType,
    expectedRuntimeType,
    "poseRuntime.runtimeType 必须是 browser_pose_game。",
  );
  requireString(failures, poseRuntime.modelName, "poseRuntime.modelName");
  requireString(failures, poseRuntime.modelVersion, "poseRuntime.modelVersion");
  requirePositiveInteger(
    failures,
    poseRuntime.poseLandmarkCount,
    "poseRuntime.poseLandmarkCount",
  );
  requireIsoDate(failures, poseRuntime.checkedAt, "poseRuntime.checkedAt");
  requireRatio(
    failures,
    poseRuntime.averageVisibility,
    "poseRuntime.averageVisibility",
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
  requireString(failures, gameContent.gameContentId, "gameContent.gameContentId");
  requireString(failures, gameContent.code, "gameContent.code");
  requireString(failures, gameContent.name, "gameContent.name");
  requireEqual(
    failures,
    gameContent.runtimeType,
    expectedRuntimeType,
    "gameContent.runtimeType 必须是 browser_pose_game。",
  );
  requireString(failures, gameContent.gameVersion, "gameContent.gameVersion");
  requireEqual(
    failures,
    gameContent.bridgeProtocolVersion,
    expectedBridgeProtocolVersion,
    "gameContent.bridgeProtocolVersion 必须是 1.0.0。",
  );
  requireString(failures, gameContent.releaseChannel, "gameContent.releaseChannel");
  requireEqual(
    failures,
    gameContent.buildStatus,
    "released",
    "gameContent.buildStatus 必须是 released。",
  );
}

function validateRehabPlan(failures, rehabPlan) {
  requireObject(failures, rehabPlan, "rehabPlan 必须是对象。");
  if (!isObject(rehabPlan)) return;
  requireString(failures, rehabPlan.rehabPlanId, "rehabPlan.rehabPlanId");
  requireString(failures, rehabPlan.planItemId, "rehabPlan.planItemId");
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
  requireString(failures, trainingSession.sessionId, "trainingSession.sessionId");
  requireString(failures, trainingSession.gameRunId, "trainingSession.gameRunId");
  requireString(failures, trainingSession.deviceCode, "trainingSession.deviceCode");
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
}

function validateTrainingResult(failures, trainingResult) {
  requireObject(failures, trainingResult, "trainingResult 必须是对象。");
  if (!isObject(trainingResult)) return;
  requireString(failures, trainingResult.resultId, "trainingResult.resultId");
  requireEqual(
    failures,
    trainingResult.source,
    expectedRuntimeType,
    "trainingResult.source 必须是 browser_pose_game。",
  );
  if (/demo|mock/i.test(String(trainingResult.source ?? ""))) {
    failures.push("trainingResult.source 不能包含 demo/mock。");
  }
  requireString(failures, trainingResult.gameRunId, "trainingResult.gameRunId");
  requireString(failures, trainingResult.gameVersion, "trainingResult.gameVersion");
  requireEqual(
    failures,
    trainingResult.bridgeProtocolVersion,
    expectedBridgeProtocolVersion,
    "trainingResult.bridgeProtocolVersion 必须是 1.0.0。",
  );
  requireString(
    failures,
    trainingResult.rawPayloadHash,
    "trainingResult.rawPayloadHash",
  );
  requireIsoDate(failures, trainingResult.submittedAt, "trainingResult.submittedAt");
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
  requirePositiveNumber(failures, trainingResult.score, "trainingResult.score", {
    allowZero: true,
  });
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

  const byType = new Map();
  for (const metric of motionMetrics) {
    if (!isObject(metric)) {
      failures.push("motionMetrics 每一项都必须是对象。");
      continue;
    }
    requireString(failures, metric.metricType, "motionMetrics.metricType");
    if (typeof metric.metricType === "string") {
      byType.set(metric.metricType, metric);
    }
    requireNumber(failures, metric.metricValue, `${metric.metricType}.metricValue`);
    requireString(failures, metric.unit, `${metric.metricType}.unit`);
    requireRatio(failures, metric.confidence, `${metric.metricType}.confidence`);
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

  for (const metricType of requiredMetricTypes) {
    if (!byType.has(metricType)) {
      failures.push(`motionMetrics 缺少正式动作指标 ${metricType}。`);
    }
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

  if (Array.isArray(auditEvidence.requiredActions)) {
    for (const action of requiredAuditActions) {
      if (!auditEvidence.requiredActions.includes(action)) {
        failures.push(`auditEvidence.requiredActions 缺少 ${action}。`);
      }
    }
  }
}

function validateArtifacts(failures, artifacts) {
  requireObject(failures, artifacts, "artifacts 必须是对象。");
  if (!isObject(artifacts)) return;
  if (!Array.isArray(artifacts.screenshots) || artifacts.screenshots.length === 0) {
    failures.push("artifacts.screenshots 至少需要一张现场验收截图。");
  } else {
    artifacts.screenshots.forEach((item, index) =>
      validateArtifact(failures, item, `artifacts.screenshots[${index}]`),
    );
  }

  if (!Array.isArray(artifacts.recordings) || artifacts.recordings.length === 0) {
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
  const poseRuntime = evidence.poseRuntime;

  if (isObject(session) && isObject(result)) {
    if (session.gameRunId && result.gameRunId && session.gameRunId !== result.gameRunId) {
      failures.push("trainingSession.gameRunId 与 trainingResult.gameRunId 必须一致。");
    }
    if (
      session.deviceCode &&
      isObject(device) &&
      device.deviceCode &&
      session.deviceCode !== device.deviceCode
    ) {
      failures.push("trainingSession.deviceCode 与 device.deviceCode 必须一致。");
    }
  }

  if (isObject(gameContent) && isObject(result)) {
    if (
      gameContent.gameVersion &&
      result.gameVersion &&
      gameContent.gameVersion !== result.gameVersion
    ) {
      failures.push("gameContent.gameVersion 与 trainingResult.gameVersion 必须一致。");
    }
    if (
      gameContent.bridgeProtocolVersion &&
      result.bridgeProtocolVersion &&
      gameContent.bridgeProtocolVersion !== result.bridgeProtocolVersion
    ) {
      failures.push(
        "gameContent.bridgeProtocolVersion 与 trainingResult.bridgeProtocolVersion 必须一致。",
      );
    }
  }

  if (
    isObject(gameContent) &&
    isObject(poseRuntime) &&
    gameContent.runtimeType &&
    poseRuntime.runtimeType &&
    gameContent.runtimeType !== poseRuntime.runtimeType
  ) {
    failures.push("gameContent.runtimeType 与 poseRuntime.runtimeType 必须一致。");
  }
}

function validateNoPlaceholders(failures, evidence) {
  const paths = [];
  collectPlaceholderPaths(evidence, "$", paths);
  for (const path of paths) {
    failures.push(`${path} 仍包含占位符，必须替换为现场实机证据。`);
  }
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

function requirePositiveNumber(failures, value, label, options = {}) {
  requireNumber(failures, value, label);
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  const minimum = options.allowZero ? 0 : Number.MIN_VALUE;
  if (value < minimum) {
    failures.push(`${label} 不能小于 ${options.allowZero ? "0" : "等于 0"}。`);
  }
}

function requirePositiveInteger(failures, value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    failures.push(`${label} 必须是大于 0 的整数。`);
  }
}

function requireRatio(failures, value, label) {
  requireNumber(failures, value, label);
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  if (value < 0 || value > 1) {
    failures.push(`${label} 必须在 0 到 1 之间。`);
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
    process.env.BROWSER_POSE_EVIDENCE_FILE;

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

  const result = validateBrowserPoseEvidence(readEvidenceFile(absolutePath));
  if (result.failures.length) {
    console.error("浏览器体感实机验收证据校验失败：");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("浏览器体感实机验收证据校验通过。");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}
