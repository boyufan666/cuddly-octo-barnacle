import type {
  GameContent,
  TrainingResult,
  TrainingSession,
} from "../types/api";

export const browserPoseEvidenceVersion =
  "browser-pose-field-acceptance/v1" as const;

const expectedRuntimeType = "browser_pose_canvas";
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

export type BrowserPoseEvidenceMetric = {
  metricType: string;
  metricValue: number;
  unit: string;
  sampleCount: number;
  confidence: number;
  qualityFlag: string;
  collectionBatchId: string;
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
    collectionBatchId: string;
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
    collectionBatchId: string;
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

export type BrowserPoseEvidenceChecklistItem = {
  key: string;
  label: string;
  ready: boolean;
  detail: string;
  failures: string[];
};

export type BrowserPoseEvidenceChecklist = {
  ready: boolean;
  items: BrowserPoseEvidenceChecklistItem[];
  failures: string[];
};

export function browserPoseFieldAcceptanceCommand(evidencePath: string) {
  return [
    `pnpm verify:browser-pose-evidence -- ${evidencePath}`,
    "BROWSER_POSE_PATIENT_ACCOUNT='<训练记录读取账号>' \\",
    "BROWSER_POSE_PATIENT_PASSWORD='<训练记录读取密码>' \\",
    "BROWSER_POSE_AUDIT_ACCOUNT='<审计读取账号>' \\",
    "BROWSER_POSE_AUDIT_PASSWORD='<审计读取密码>' \\",
    "pnpm verify:browser-pose-field-acceptance -- \\",
    `  ${evidencePath} \\`,
    "  --api-base-url <正式 API 地址>",
  ].join("\n");
}

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

export function buildBrowserPoseEvidenceChecklist(
  input: BrowserPoseEvidenceInput,
): BrowserPoseEvidenceChecklist {
  const evidence: BrowserPoseEvidence = {
    evidenceVersion: browserPoseEvidenceVersion,
    ...input,
  };
  const failures = validateBrowserPoseEvidenceInput(evidence);
  const items = [
    evidenceChecklistItem(
      "acceptance",
      "现场验收信息",
      "验收时间、验收人员、现场名称和环境必须明确。",
      failures,
      ["acceptance."],
    ),
    evidenceChecklistItem(
      "browser",
      "正式 HTTPS 页面",
      "浏览器、版本、userAgent 和页面地址必须来自正式或试点 HTTPS 页面。",
      failures,
      ["browser."],
    ),
    evidenceChecklistItem(
      "device",
      "摄像头设备证据",
      "摄像头标签、设备编号、脱敏哈希和分辨率必须由现场采集。",
      failures,
      ["device."],
    ),
    evidenceChecklistItem(
      "poseRuntime",
      "姿态识别就绪记录",
      "MediaPipe 模型版本、关键点数量、检测时间和平均可见度必须保留。",
      failures,
      ["poseRuntime."],
    ),
    evidenceChecklistItem(
      "patient",
      "患者脱敏关联",
      "保留业务 patientId，同时填写脱敏患者导出 ID 便于交付归档。",
      failures,
      ["patient."],
    ),
    evidenceChecklistItem(
      "gameContent",
      "正式训练内容",
      "训练内容必须是 browser_pose_canvas、production、released、1.0.0 协议。",
      failures,
      ["gameContent."],
    ),
    evidenceChecklistItem(
      "rehabPlan",
      "医师确认方案",
      "必须关联当前康复计划、计划项、确认医师和确认时间。",
      failures,
      ["rehabPlan."],
    ),
    evidenceChecklistItem(
      "trainingSession",
      "训练会话入库",
      "会话必须 completed + synced，且设备编号、gameRunId 与结果一致。",
      failures,
      ["trainingSession."],
    ),
    evidenceChecklistItem(
      "trainingResult",
      "训练结果入库",
      "结果必须来源于 browser_pose_canvas，质量有效且无异常标记。",
      failures,
      ["trainingResult."],
    ),
    evidenceChecklistItem(
      "motionMetrics",
      "四项动作指标",
      "reaction_time_ms、target_hit_rate、pose_visibility_avg、arm_raise_accuracy 必须齐全。",
      failures,
      [
        "motionMetrics",
        "reaction_time_ms.",
        "target_hit_rate.",
        "pose_visibility_avg.",
        "arm_raise_accuracy.",
      ],
    ),
    evidenceChecklistItem(
      "auditEvidence",
      "审计日志 ID",
      "必须填写 training_session.start 与 training_result.submit 两条成功审计日志 ID。",
      failures,
      ["auditEvidence."],
    ),
    evidenceChecklistItem(
      "artifacts",
      "截图与录屏",
      "至少一张训练完成页截图和一份训练过程录屏，文件需与 evidence 放同一目录。",
      failures,
      ["artifacts."],
    ),
    evidenceChecklistItem(
      "safety",
      "敏感信息与演示标记",
      "evidence 不得包含 token、密钥、原始载荷、base64 或 mock/demo/seed/fallback/fixed/manual 标记。",
      failures,
      [
        "证据中仍包含占位符",
        "包含 mock/demo/seed/fallback/fixed/manual",
        "包含敏感字段或原始载荷",
      ],
    ),
  ];

  return {
    ready: failures.length === 0 && items.every((item) => item.ready),
    items,
    failures,
  };
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
    | "collectionBatchId"
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
    | "collectionBatchId"
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
      collectionBatchId: trainingSession.collectionBatchId ?? "",
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
      collectionBatchId: trainingResult.collectionBatchId ?? "",
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

function evidenceChecklistItem(
  key: string,
  label: string,
  detail: string,
  allFailures: string[],
  markers: string[],
): BrowserPoseEvidenceChecklistItem {
  const failures = allFailures.filter((failure) =>
    markers.some((marker) => failure.includes(marker)),
  );
  return {
    key,
    label,
    ready: failures.length === 0,
    detail,
    failures,
  };
}

export function normalizeBrowserPoseEvidenceMotionMetrics(
  motionMetrics: unknown[],
): BrowserPoseEvidenceMetric[] {
  return motionMetrics.map((item) => {
    const metric = item as Partial<BrowserPoseEvidenceMetric>;
    return {
      metricType:
        typeof metric.metricType === "string" ? metric.metricType : "",
      metricValue:
        typeof metric.metricValue === "number"
          ? metric.metricValue
          : Number.NaN,
      unit: typeof metric.unit === "string" ? metric.unit : "",
      sampleCount:
        typeof metric.sampleCount === "number"
          ? metric.sampleCount
          : Number.NaN,
      confidence:
        typeof metric.confidence === "number" ? metric.confidence : Number.NaN,
      qualityFlag:
        typeof metric.qualityFlag === "string" ? metric.qualityFlag : "",
      collectionBatchId:
        typeof metric.collectionBatchId === "string"
          ? metric.collectionBatchId
          : "",
      windowStartedAt:
        typeof metric.windowStartedAt === "string"
          ? metric.windowStartedAt
          : "",
      windowEndedAt:
        typeof metric.windowEndedAt === "string" ? metric.windowEndedAt : "",
    };
  });
}

function validateBrowserPoseEvidenceInput(evidence: BrowserPoseEvidence) {
  const failures: string[] = [];

  requireText(
    failures,
    evidence.acceptance.acceptedAt,
    "acceptance.acceptedAt",
  );
  requireText(
    failures,
    evidence.acceptance.testerName,
    "acceptance.testerName",
  );
  requireText(failures, evidence.acceptance.siteName, "acceptance.siteName");
  requireText(
    failures,
    evidence.acceptance.environment,
    "acceptance.environment",
  );
  requireUtcIso(
    failures,
    evidence.acceptance.acceptedAt,
    "acceptance.acceptedAt",
  );

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
  validateCameraLabel(failures, evidence.device.cameraLabel);
  requireText(
    failures,
    evidence.device.cameraDeviceIdHash,
    "device.cameraDeviceIdHash",
  );
  requireText(failures, evidence.device.resolution, "device.resolution");

  if (evidence.poseRuntime.runtimeType !== expectedRuntimeType) {
    failures.push("poseRuntime.runtimeType 必须是 browser_pose_canvas");
  }
  requireText(
    failures,
    evidence.poseRuntime.modelName,
    "poseRuntime.modelName",
  );
  requireText(
    failures,
    evidence.poseRuntime.modelVersion,
    "poseRuntime.modelVersion",
  );
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
  requireUtcIso(
    failures,
    evidence.poseRuntime.checkedAt,
    "poseRuntime.checkedAt",
  );

  requireText(failures, evidence.patient.patientId, "patient.patientId");
  requireText(
    failures,
    evidence.patient.patientExportId,
    "patient.patientExportId",
  );

  validateGameContent(failures, evidence);
  validateRehabPlan(failures, evidence);
  validateTrainingSession(failures, evidence);
  validateTrainingResult(failures, evidence);
  validateMotionMetrics(
    failures,
    evidence.motionMetrics,
    evidence.trainingSession.collectionBatchId,
  );
  validateCollectionBatchConsistency(failures, evidence);
  validateAuditEvidence(failures, evidence.auditEvidence);
  validateArtifacts(failures, evidence.artifacts);
  validateNoFakeDataMarkers(failures, evidence);
  validateNoSensitiveEvidence(failures, evidence);
  validateNoPlaceholders(failures, evidence);

  return failures;
}

function validateGameContent(
  failures: string[],
  evidence: BrowserPoseEvidence,
) {
  const { gameContent } = evidence;
  requireText(failures, gameContent.gameContentId, "gameContent.gameContentId");
  requireText(failures, gameContent.code, "gameContent.code");
  requireText(failures, gameContent.name, "gameContent.name");
  requireText(failures, gameContent.gameVersion, "gameContent.gameVersion");
  if (gameContent.runtimeType !== expectedRuntimeType) {
    failures.push("gameContent.runtimeType 必须是 browser_pose_canvas");
  }
  if (gameContent.bridgeProtocolVersion !== expectedBridgeProtocolVersion) {
    failures.push("gameContent.bridgeProtocolVersion 必须是 1.0.0");
  }
  if (gameContent.releaseChannel !== "production") {
    failures.push("gameContent.releaseChannel 必须是 production");
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
  requireText(
    failures,
    trainingSession.collectionBatchId,
    "trainingSession.collectionBatchId",
  );
  requireText(failures, trainingSession.gameRunId, "trainingSession.gameRunId");
  requireText(
    failures,
    trainingSession.deviceCode,
    "trainingSession.deviceCode",
  );
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
  requireText(
    failures,
    trainingResult.collectionBatchId,
    "trainingResult.collectionBatchId",
  );
  requireText(
    failures,
    trainingResult.rawPayloadHash,
    "trainingResult.rawPayloadHash",
  );
  requireUtcIso(
    failures,
    trainingResult.submittedAt,
    "trainingResult.submittedAt",
  );
  if (trainingResult.source !== expectedRuntimeType) {
    failures.push("trainingResult.source 必须是 browser_pose_canvas");
  }
  if (containsForbiddenMarker(trainingResult.source)) {
    failures.push(
      "trainingResult.source 不能包含 mock/demo/seed/fallback/fixed/manual",
    );
  }
  if (trainingResult.gameRunId !== trainingSession.gameRunId) {
    failures.push(
      "trainingResult.gameRunId 与 trainingSession.gameRunId 必须一致",
    );
  }
  if (trainingResult.gameVersion !== gameContent.gameVersion) {
    failures.push(
      "trainingResult.gameVersion 与 gameContent.gameVersion 必须一致",
    );
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
  requireRatio(
    failures,
    trainingResult.completionRate,
    "trainingResult.completionRate",
  );
  requireRatio(
    failures,
    trainingResult.motionAccuracy,
    "trainingResult.motionAccuracy",
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
}

function validateCameraLabel(failures: string[], cameraLabel: string) {
  const normalized = cameraLabel.trim();
  if (!normalized) return;
  if (normalized === "已授权摄像头") {
    failures.push(
      "device.cameraLabel 必须是浏览器返回的真实摄像头标签，不能使用通用授权文案",
    );
  }
}

function validateMotionMetrics(
  failures: string[],
  motionMetrics: BrowserPoseEvidenceMetric[],
  expectedCollectionBatchId: string,
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
    requireText(
      failures,
      metric.collectionBatchId,
      `${metric.metricType}.collectionBatchId`,
    );
    requireNumber(
      failures,
      metric.metricValue,
      `${metric.metricType}.metricValue`,
    );
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
    if (metric.qualityFlag !== "valid") {
      failures.push(`${metric.metricType}.qualityFlag 必须显式为 valid`);
    }
    requireUtcIso(
      failures,
      metric.windowStartedAt,
      `${metric.metricType}.windowStartedAt`,
    );
    requireUtcIso(
      failures,
      metric.windowEndedAt,
      `${metric.metricType}.windowEndedAt`,
    );
    if (
      metric.collectionBatchId.trim() &&
      expectedCollectionBatchId.trim() &&
      metric.collectionBatchId !== expectedCollectionBatchId
    ) {
      failures.push(
        `${metric.metricType}.collectionBatchId 与 trainingSession.collectionBatchId 不一致`,
      );
    }
  }
}

function validateCollectionBatchConsistency(
  failures: string[],
  evidence: BrowserPoseEvidence,
) {
  const sessionCollectionBatchId = evidence.trainingSession.collectionBatchId;
  const resultCollectionBatchId = evidence.trainingResult.collectionBatchId;
  if (
    sessionCollectionBatchId.trim() &&
    resultCollectionBatchId.trim() &&
    resultCollectionBatchId !== sessionCollectionBatchId
  ) {
    failures.push(
      "trainingResult.collectionBatchId 与 trainingSession.collectionBatchId 不一致",
    );
  }
}

function validateAuditEvidence(
  failures: string[],
  auditEvidence: BrowserPoseEvidenceInput["auditEvidence"],
) {
  requireTextArray(
    failures,
    auditEvidence.auditLogIds,
    "auditEvidence.auditLogIds",
  );
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
  const extraActions = auditEvidence.requiredActions.filter(
    (action) => !requiredAuditActions.includes(action as never),
  );
  if (
    extraActions.length ||
    auditEvidence.requiredActions.length !== requiredAuditActions.length
  ) {
    failures.push(
      `auditEvidence.requiredActions 只能包含 ${requiredAuditActions.join("、")}；多余动作：${
        extraActions.join("、") || "重复或数量不一致"
      }`,
    );
  }
  if (auditEvidence.requiredActions.includes("training_result.review")) {
    failures.push(
      "正式浏览器体感现场验收只接受 valid 且无异常训练结果；training_result.review 属于异常训练复核契约，请使用 pnpm verify:contracts 验收。",
    );
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
    requireText(
      failures,
      screenshot.label,
      `artifacts.screenshots[${index}].label`,
    );
    requireText(
      failures,
      screenshot.path,
      `artifacts.screenshots[${index}].path`,
    );
    requireUtcIso(
      failures,
      screenshot.capturedAt,
      `artifacts.screenshots[${index}].capturedAt`,
    );
  }
  for (const [index, recording] of artifacts.recordings.entries()) {
    requireText(
      failures,
      recording.label,
      `artifacts.recordings[${index}].label`,
    );
    requireText(
      failures,
      recording.path,
      `artifacts.recordings[${index}].path`,
    );
    requireUtcIso(
      failures,
      recording.capturedAt,
      `artifacts.recordings[${index}].capturedAt`,
    );
  }
}

function validateNoPlaceholders(
  failures: string[],
  evidence: BrowserPoseEvidence,
) {
  const text = JSON.stringify(evidence);
  if (/<[^>]+>/.test(text)) {
    failures.push("证据中仍包含占位符，必须替换为现场实机证据");
  }
}

function validateNoFakeDataMarkers(
  failures: string[],
  evidence: BrowserPoseEvidence,
) {
  const paths: string[] = [];
  collectFakeDataMarkerPaths(evidence, "$", paths);
  for (const path of paths) {
    failures.push(
      `${path} 包含 mock/demo/seed/fallback/fixed/manual 标记，不能作为正式浏览器体感验收证据`,
    );
  }
}

function collectFakeDataMarkerPaths(
  value: unknown,
  path: string,
  paths: string[],
) {
  if (typeof value === "string") {
    if (containsForbiddenMarker(value)) paths.push(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectFakeDataMarkerPaths(item, `${path}[${index}]`, paths),
    );
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    collectFakeDataMarkerPaths(nested, `${path}.${key}`, paths);
  }
}

function validateNoSensitiveEvidence(
  failures: string[],
  evidence: BrowserPoseEvidence,
) {
  const paths: string[] = [];
  collectSensitiveEvidencePaths(evidence, "$", paths);
  for (const path of paths) {
    failures.push(
      `${path} 包含敏感字段或原始载荷，不能写入正式浏览器体感 evidence`,
    );
  }
}

function collectSensitiveEvidencePaths(
  value: unknown,
  path: string,
  paths: string[],
) {
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
  if (!isPlainObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (sensitiveEvidenceKeys.has(normalizeKey(key))) {
      paths.push(nestedPath);
      continue;
    }
    collectSensitiveEvidencePaths(nested, nestedPath, paths);
  }
}

function isUnsafeEvidenceText(value: string) {
  if (isHashDigestText(value)) return false;
  return (
    bearerTokenPattern().test(value) ||
    secretLikePattern().test(value) ||
    base64LikePattern().test(value)
  );
}

function containsForbiddenMarker(value: string) {
  const normalized = normalizeTextForMarkerScan(value);
  return forbiddenMarkers.some((marker) => normalized.includes(marker));
}

function normalizeTextForMarkerScan(value: string) {
  return decodeTextRepeatedly(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function decodeTextRepeatedly(value: string) {
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

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isHashDigestText(value: string) {
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function requirePositiveInteger(
  failures: string[],
  value: number,
  label: string,
) {
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
