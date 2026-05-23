import type {
  GameContent,
  TrainingResult,
  TrainingSession,
} from "../types/api";

export const browserPoseEvidenceVersion =
  "browser-pose-field-acceptance/v1" as const;

const expectedRuntimeType = "browser_pose_game";
const expectedBridgeProtocolVersion = "1.0.0";
const requiredMotionMetricTypes = [
  "reaction_time_ms",
  "target_hit_rate",
  "pose_visibility_avg",
  "arm_raise_accuracy",
] as const;
const requiredAuditActions = [
  "training_session.start",
  "training_result.submit",
] as const;

export type BrowserPoseEvidenceMetric = {
  metricType: string;
  metricValue: number;
  unit: string;
  sampleCount: number;
  confidence: number;
  qualityFlag: string;
  windowStartedAt: string;
  windowEndedAt: string;
};

export type BrowserPoseEvidenceInput = {
  acceptance: {
    acceptedAt: string;
    testerName: string;
    siteName: string;
    environment: string;
  };
  browser: {
    name: string;
    version: string;
    userAgent: string;
    pageUrl: string;
  };
  device: {
    deviceCode: string;
    cameraLabel: string;
    cameraDeviceIdHash: string;
    resolution: string;
  };
  poseRuntime: {
    runtimeType: typeof expectedRuntimeType;
    modelName: string;
    modelVersion: string;
    poseLandmarkCount: number;
    checkedAt: string;
    averageVisibility: number;
  };
  patient: {
    patientId: string;
    patientExportId: string;
  };
  gameContent: {
    gameContentId: string;
    code: string;
    name: string;
    runtimeType: GameContent["runtimeType"];
    gameVersion: string;
    bridgeProtocolVersion: string;
    releaseChannel: GameContent["releaseChannel"];
    buildStatus: GameContent["buildStatus"];
  };
  rehabPlan: {
    rehabPlanId: string;
    planItemId: string;
    confirmedByDoctorId: string;
    confirmedAt: string;
  };
  trainingSession: {
    sessionId: string;
    gameRunId: string;
    deviceCode: string;
    sessionStatus: string;
    syncStatus: string;
    calibrationStatus: string;
    clientStartedAt: string;
    clientEndedAt: string;
  };
  trainingResult: {
    resultId: string;
    source: string;
    gameRunId: string;
    gameVersion: string;
    bridgeProtocolVersion: string;
    rawPayloadHash: string;
    submittedAt: string;
    qualityFlag: string;
    abnormalFlag: boolean;
    score: number;
    completionRate: number;
    durationSeconds: number;
    reactionTimeMs: number;
    motionAccuracy: number;
    exerciseIntensity: string;
  };
  motionMetrics: BrowserPoseEvidenceMetric[];
  auditEvidence: {
    auditLogIds: string[];
    requiredActions: string[];
    checkedAt: string;
  };
  artifacts: {
    screenshots: Array<{
      label: string;
      path: string;
      capturedAt: string;
    }>;
    recordings: Array<{
      label: string;
      path: string;
      capturedAt: string;
    }>;
  };
};

export type BrowserPoseEvidence = BrowserPoseEvidenceInput & {
  evidenceVersion: typeof browserPoseEvidenceVersion;
};

export type BuildBrowserPoseEvidenceResult =
  | { ok: true; evidence: BrowserPoseEvidence }
  | { ok: false; error: string; failures: string[] };

export function buildBrowserPoseEvidence(
  input: BrowserPoseEvidenceInput,
): BuildBrowserPoseEvidenceResult {
  const evidence: BrowserPoseEvidence = {
    evidenceVersion: browserPoseEvidenceVersion,
    ...input,
  };
  const failures = validateBrowserPoseEvidenceInput(evidence);
  if (failures.length) {
    return {
      ok: false,
      error: failures.join("；"),
      failures,
    };
  }
  return { ok: true, evidence };
}

export function buildBrowserPoseEvidenceInputFromRecord({
  acceptance,
  browser,
  device,
  poseRuntime,
  patient,
  gameContent,
  rehabPlan,
  trainingSession,
  trainingResult,
  motionMetrics,
  auditEvidence,
  artifacts,
}: {
  acceptance: BrowserPoseEvidenceInput["acceptance"];
  browser: BrowserPoseEvidenceInput["browser"];
  device: BrowserPoseEvidenceInput["device"];
  poseRuntime: BrowserPoseEvidenceInput["poseRuntime"];
  patient: BrowserPoseEvidenceInput["patient"];
  gameContent: Pick<
    GameContent,
    | "id"
    | "code"
    | "name"
    | "runtimeType"
    | "gameVersion"
    | "bridgeProtocolVersion"
    | "releaseChannel"
    | "buildStatus"
  >;
  rehabPlan: BrowserPoseEvidenceInput["rehabPlan"];
  trainingSession: Pick<
    TrainingSession,
    | "id"
    | "gameRunId"
    | "deviceCode"
    | "sessionStatus"
    | "syncStatus"
    | "calibrationStatus"
    | "clientStartedAt"
    | "clientEndedAt"
  >;
  trainingResult: Pick<
    TrainingResult,
    | "id"
    | "source"
    | "gameRunId"
    | "gameVersion"
    | "bridgeProtocolVersion"
    | "rawPayloadHash"
    | "submittedAt"
    | "qualityFlag"
    | "abnormalFlag"
    | "score"
    | "completionRate"
    | "durationSeconds"
    | "reactionTimeMs"
    | "motionAccuracy"
    | "exerciseIntensity"
  >;
  motionMetrics: unknown[];
  auditEvidence: BrowserPoseEvidenceInput["auditEvidence"];
  artifacts: BrowserPoseEvidenceInput["artifacts"];
}): BuildBrowserPoseEvidenceResult {
  return buildBrowserPoseEvidence({
    acceptance,
    browser,
    device,
    poseRuntime,
    patient,
    gameContent: {
      gameContentId: gameContent.id,
      code: gameContent.code,
      name: gameContent.name,
      runtimeType: gameContent.runtimeType,
      gameVersion: gameContent.gameVersion ?? "",
      bridgeProtocolVersion: gameContent.bridgeProtocolVersion,
      releaseChannel: gameContent.releaseChannel,
      buildStatus: gameContent.buildStatus,
    },
    rehabPlan,
    trainingSession: {
      sessionId: trainingSession.id,
      gameRunId: trainingSession.gameRunId ?? "",
      deviceCode: trainingSession.deviceCode ?? "",
      sessionStatus: trainingSession.sessionStatus,
      syncStatus: trainingSession.syncStatus,
      calibrationStatus: trainingSession.calibrationStatus,
      clientStartedAt: trainingSession.clientStartedAt ?? "",
      clientEndedAt: trainingSession.clientEndedAt ?? "",
    },
    trainingResult: {
      resultId: trainingResult.id,
      source: trainingResult.source,
      gameRunId: trainingResult.gameRunId,
      gameVersion: trainingResult.gameVersion,
      bridgeProtocolVersion: trainingResult.bridgeProtocolVersion,
      rawPayloadHash: trainingResult.rawPayloadHash,
      submittedAt: trainingResult.submittedAt,
      qualityFlag: trainingResult.qualityFlag,
      abnormalFlag: trainingResult.abnormalFlag,
      score: trainingResult.score,
      completionRate: trainingResult.completionRate,
      durationSeconds: trainingResult.durationSeconds,
      reactionTimeMs: trainingResult.reactionTimeMs,
      motionAccuracy: trainingResult.motionAccuracy,
      exerciseIntensity: trainingResult.exerciseIntensity,
    },
    motionMetrics: normalizeBrowserPoseEvidenceMotionMetrics(motionMetrics),
    auditEvidence,
    artifacts,
  });
}

export function normalizeBrowserPoseEvidenceMotionMetrics(
  motionMetrics: unknown[],
): BrowserPoseEvidenceMetric[] {
  return motionMetrics.map((item) => {
    const metric = item as Partial<BrowserPoseEvidenceMetric>;
    return {
      metricType: typeof metric.metricType === "string" ? metric.metricType : "",
      metricValue:
        typeof metric.metricValue === "number" ? metric.metricValue : Number.NaN,
      unit: typeof metric.unit === "string" ? metric.unit : "",
      sampleCount:
        typeof metric.sampleCount === "number" ? metric.sampleCount : Number.NaN,
      confidence:
        typeof metric.confidence === "number" ? metric.confidence : Number.NaN,
      qualityFlag:
        typeof metric.qualityFlag === "string" ? metric.qualityFlag : "",
      windowStartedAt:
        typeof metric.windowStartedAt === "string" ? metric.windowStartedAt : "",
      windowEndedAt:
        typeof metric.windowEndedAt === "string" ? metric.windowEndedAt : "",
    };
  });
}

function validateBrowserPoseEvidenceInput(evidence: BrowserPoseEvidence) {
  const failures: string[] = [];

  requireText(failures, evidence.acceptance.acceptedAt, "acceptance.acceptedAt");
  requireText(failures, evidence.acceptance.testerName, "acceptance.testerName");
  requireText(failures, evidence.acceptance.siteName, "acceptance.siteName");
  requireText(failures, evidence.acceptance.environment, "acceptance.environment");
  requireUtcIso(failures, evidence.acceptance.acceptedAt, "acceptance.acceptedAt");

  requireText(failures, evidence.browser.name, "browser.name");
  requireText(failures, evidence.browser.version, "browser.version");
  requireText(failures, evidence.browser.userAgent, "browser.userAgent");
  requireText(failures, evidence.browser.pageUrl, "browser.pageUrl");
  if (
    evidence.browser.pageUrl.trim() &&
    !evidence.browser.pageUrl.startsWith("https://")
  ) {
    failures.push("browser.pageUrl 必须是 HTTPS 地址");
  }

  requireText(failures, evidence.device.deviceCode, "device.deviceCode");
  requireText(failures, evidence.device.cameraLabel, "device.cameraLabel");
  requireText(
    failures,
    evidence.device.cameraDeviceIdHash,
    "device.cameraDeviceIdHash",
  );
  requireText(failures, evidence.device.resolution, "device.resolution");

  if (evidence.poseRuntime.runtimeType !== expectedRuntimeType) {
    failures.push("poseRuntime.runtimeType 必须是 browser_pose_game");
  }
  requireText(failures, evidence.poseRuntime.modelName, "poseRuntime.modelName");
  requireText(failures, evidence.poseRuntime.modelVersion, "poseRuntime.modelVersion");
  requirePositiveInteger(
    failures,
    evidence.poseRuntime.poseLandmarkCount,
    "poseRuntime.poseLandmarkCount",
  );
  requireRatio(
    failures,
    evidence.poseRuntime.averageVisibility,
    "poseRuntime.averageVisibility",
  );
  requireUtcIso(failures, evidence.poseRuntime.checkedAt, "poseRuntime.checkedAt");

  requireText(failures, evidence.patient.patientId, "patient.patientId");
  requireText(failures, evidence.patient.patientExportId, "patient.patientExportId");

  validateGameContent(failures, evidence);
  validateRehabPlan(failures, evidence);
  validateTrainingSession(failures, evidence);
  validateTrainingResult(failures, evidence);
  validateMotionMetrics(failures, evidence.motionMetrics);
  validateAuditEvidence(failures, evidence.auditEvidence);
  validateArtifacts(failures, evidence.artifacts);
  validateNoPlaceholders(failures, evidence);

  return failures;
}

function validateGameContent(failures: string[], evidence: BrowserPoseEvidence) {
  const { gameContent } = evidence;
  requireText(failures, gameContent.gameContentId, "gameContent.gameContentId");
  requireText(failures, gameContent.code, "gameContent.code");
  requireText(failures, gameContent.name, "gameContent.name");
  requireText(failures, gameContent.gameVersion, "gameContent.gameVersion");
  if (gameContent.runtimeType !== expectedRuntimeType) {
    failures.push("gameContent.runtimeType 必须是 browser_pose_game");
  }
  if (gameContent.bridgeProtocolVersion !== expectedBridgeProtocolVersion) {
    failures.push("gameContent.bridgeProtocolVersion 必须是 1.0.0");
  }
  if (gameContent.buildStatus !== "released") {
    failures.push("gameContent.buildStatus 必须是 released");
  }
}

function validateRehabPlan(failures: string[], evidence: BrowserPoseEvidence) {
  const { rehabPlan } = evidence;
  requireText(failures, rehabPlan.rehabPlanId, "rehabPlan.rehabPlanId");
  requireText(failures, rehabPlan.planItemId, "rehabPlan.planItemId");
  requireText(
    failures,
    rehabPlan.confirmedByDoctorId,
    "rehabPlan.confirmedByDoctorId",
  );
  requireText(failures, rehabPlan.confirmedAt, "rehabPlan.confirmedAt");
  requireUtcIso(failures, rehabPlan.confirmedAt, "rehabPlan.confirmedAt");
}

function validateTrainingSession(
  failures: string[],
  evidence: BrowserPoseEvidence,
) {
  const { trainingSession } = evidence;
  requireText(failures, trainingSession.sessionId, "trainingSession.sessionId");
  requireText(failures, trainingSession.gameRunId, "trainingSession.gameRunId");
  requireText(failures, trainingSession.deviceCode, "trainingSession.deviceCode");
  requireText(
    failures,
    trainingSession.calibrationStatus,
    "trainingSession.calibrationStatus",
  );
  requireUtcIso(
    failures,
    trainingSession.clientStartedAt,
    "trainingSession.clientStartedAt",
  );
  requireUtcIso(
    failures,
    trainingSession.clientEndedAt,
    "trainingSession.clientEndedAt",
  );
  if (trainingSession.sessionStatus !== "completed") {
    failures.push("trainingSession.sessionStatus 必须是 completed");
  }
  if (trainingSession.syncStatus !== "synced") {
    failures.push("trainingSession.syncStatus 必须是 synced");
  }
  if (trainingSession.deviceCode !== evidence.device.deviceCode) {
    failures.push("trainingSession.deviceCode 与 device.deviceCode 必须一致");
  }
}

function validateTrainingResult(
  failures: string[],
  evidence: BrowserPoseEvidence,
) {
  const { trainingResult, trainingSession, gameContent } = evidence;
  requireText(failures, trainingResult.resultId, "trainingResult.resultId");
  requireText(failures, trainingResult.rawPayloadHash, "trainingResult.rawPayloadHash");
  requireUtcIso(failures, trainingResult.submittedAt, "trainingResult.submittedAt");
  if (trainingResult.source !== expectedRuntimeType) {
    failures.push("trainingResult.source 必须是 browser_pose_game");
  }
  if (/demo|mock/i.test(trainingResult.source)) {
    failures.push("trainingResult.source 不能包含 demo/mock");
  }
  if (trainingResult.gameRunId !== trainingSession.gameRunId) {
    failures.push("trainingResult.gameRunId 与 trainingSession.gameRunId 必须一致");
  }
  if (trainingResult.gameVersion !== gameContent.gameVersion) {
    failures.push("trainingResult.gameVersion 与 gameContent.gameVersion 必须一致");
  }
  if (trainingResult.bridgeProtocolVersion !== expectedBridgeProtocolVersion) {
    failures.push("trainingResult.bridgeProtocolVersion 必须是 1.0.0");
  }
  if (trainingResult.qualityFlag !== "valid") {
    failures.push("trainingResult.qualityFlag 必须显式为 valid");
  }
  if (trainingResult.abnormalFlag !== false) {
    failures.push("trainingResult.abnormalFlag 必须显式为 false");
  }
  requireRatio(failures, trainingResult.completionRate, "trainingResult.completionRate");
  requireRatio(failures, trainingResult.motionAccuracy, "trainingResult.motionAccuracy");
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
}

function validateMotionMetrics(
  failures: string[],
  motionMetrics: BrowserPoseEvidenceMetric[],
) {
  if (!motionMetrics.length) {
    failures.push("motionMetrics 必须包含四项正式动作指标");
    return;
  }
  const metricTypes = new Set(motionMetrics.map((metric) => metric.metricType));
  for (const metricType of requiredMotionMetricTypes) {
    if (!metricTypes.has(metricType)) {
      failures.push(`motionMetrics 缺少 ${metricType}`);
    }
  }
  for (const metric of motionMetrics) {
    requireText(failures, metric.metricType, "motionMetrics.metricType");
    requireText(failures, metric.unit, `${metric.metricType}.unit`);
    requireNumber(failures, metric.metricValue, `${metric.metricType}.metricValue`);
    requireRatio(failures, metric.confidence, `${metric.metricType}.confidence`);
    requirePositiveInteger(
      failures,
      metric.sampleCount,
      `${metric.metricType}.sampleCount`,
    );
    if (metric.qualityFlag !== "valid") {
      failures.push(`${metric.metricType}.qualityFlag 必须显式为 valid`);
    }
    requireUtcIso(failures, metric.windowStartedAt, `${metric.metricType}.windowStartedAt`);
    requireUtcIso(failures, metric.windowEndedAt, `${metric.metricType}.windowEndedAt`);
  }
}

function validateAuditEvidence(
  failures: string[],
  auditEvidence: BrowserPoseEvidenceInput["auditEvidence"],
) {
  requireTextArray(failures, auditEvidence.auditLogIds, "auditEvidence.auditLogIds");
  requireTextArray(
    failures,
    auditEvidence.requiredActions,
    "auditEvidence.requiredActions",
  );
  requireUtcIso(failures, auditEvidence.checkedAt, "auditEvidence.checkedAt");
  for (const action of requiredAuditActions) {
    if (!auditEvidence.requiredActions.includes(action)) {
      failures.push(`auditEvidence.requiredActions 缺少 ${action}`);
    }
  }
}

function validateArtifacts(
  failures: string[],
  artifacts: BrowserPoseEvidenceInput["artifacts"],
) {
  if (!artifacts.screenshots.length) {
    failures.push("artifacts.screenshots 至少需要一张截图");
  }
  if (!artifacts.recordings.length) {
    failures.push("artifacts.recordings 至少需要一份录屏或录像");
  }
  for (const [index, screenshot] of artifacts.screenshots.entries()) {
    requireText(failures, screenshot.label, `artifacts.screenshots[${index}].label`);
    requireText(failures, screenshot.path, `artifacts.screenshots[${index}].path`);
    requireUtcIso(
      failures,
      screenshot.capturedAt,
      `artifacts.screenshots[${index}].capturedAt`,
    );
  }
  for (const [index, recording] of artifacts.recordings.entries()) {
    requireText(failures, recording.label, `artifacts.recordings[${index}].label`);
    requireText(failures, recording.path, `artifacts.recordings[${index}].path`);
    requireUtcIso(
      failures,
      recording.capturedAt,
      `artifacts.recordings[${index}].capturedAt`,
    );
  }
}

function validateNoPlaceholders(failures: string[], evidence: BrowserPoseEvidence) {
  const text = JSON.stringify(evidence);
  if (/<[^>]+>/.test(text)) {
    failures.push("证据中仍包含占位符，必须替换为现场实机证据");
  }
}

function requireText(failures: string[], value: string, label: string) {
  if (!value.trim()) failures.push(`${label} 必须显式提供`);
}

function requireTextArray(failures: string[], value: string[], label: string) {
  if (!value.length) {
    failures.push(`${label} 必须是非空数组`);
    return;
  }
  for (const item of value) {
    if (!item.trim()) {
      failures.push(`${label} 不能包含空值`);
      return;
    }
  }
}

function requireUtcIso(failures: string[], value: string, label: string) {
  if (!value.trim()) return;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    failures.push(`${label} 必须是 UTC ISO 时间`);
  }
}

function requireNumber(failures: string[], value: number, label: string) {
  if (!Number.isFinite(value)) failures.push(`${label} 必须是数字`);
}

function requirePositiveInteger(failures: string[], value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    failures.push(`${label} 必须是大于 0 的整数`);
  }
}

function requireRatio(failures: string[], value: number, label: string) {
  requireNumber(failures, value, label);
  if (Number.isFinite(value) && (value < 0 || value > 1)) {
    failures.push(`${label} 必须在 0 到 1 之间`);
  }
}
