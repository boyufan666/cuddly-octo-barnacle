export const unityFieldEvidenceVersion = "unity-field-acceptance/v1" as const;

const expectedRuntimeType = "unity_webgl" as const;
const expectedBridgeProtocolVersion = "1.0.0" as const;
const expectedResultContractVersion = "rehab-unity-result-v2" as const;
const expectedDynamicDifficultySchemaVersion = "1.0.0" as const;
const allowedStartingLevelSources = [
  "clinician_approved_plan",
  "clinician_approved_assessment",
] as const;
const allowedDynamicDifficultyTriggerReasons = [
  "prior_assessment",
  "reaction_slow",
  "accuracy_high",
  "accuracy_low",
  "fatigue_risk",
  "clinician_limit",
] as const;
const requiredUnityMetricTypes = [
  "reaction_time_ms",
  "target_hit_rate",
  "arm_raise_accuracy",
  "duration_seconds",
  "difficulty_level",
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

export type UnityFieldEvidenceMetric = {
  metricType: string;
  metricValue: number;
  unit: string;
  sampleCount: number;
  confidence: number;
  qualityFlag: string;
  windowStartedAt: string;
  windowEndedAt: string;
};

export type UnityFieldEvidenceInput = {
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
    deviceType: string;
    inputMode: string;
    calibrationStatus: string;
    resolution: string;
  };
  unityRuntime: {
    runtimeType: string;
    manifestUrl: string;
    buildBaseUrl: string;
    gameVersion: string;
    bridgeProtocolVersion: string;
    loaderLoadedAt: string;
    unityInstanceStartedAt: string;
    canvasResolution: string;
    devicePixelRatio: number;
  };
  patient: {
    patientId: string;
    patientExportId: string;
  };
  gameContent: {
    gameContentId: string;
    code: string;
    name: string;
    runtimeType: string;
    gameVersion: string;
    bridgeProtocolVersion: string;
    releaseChannel: string;
    buildStatus: string;
    manifestUrl: string;
    buildBaseUrl: string;
  };
  rehabPlan: {
    rehabPlanId: string;
    planItemId: string;
    durationMinutes: number;
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
    runtimeConfigSnapshot: {
      runtimeType: string;
      manifestUrl: string;
      buildBaseUrl: string;
      gameVersion: string;
      bridgeProtocolVersion: string;
      resultContractVersion: string;
      collectionBatchId: string;
      durationSeconds: number;
      releaseChannel: string;
    };
  };
  bridgeEvent: {
    type: string;
    action: string;
    protocolVersion: string;
    resultContractVersion: string;
    sessionId: string;
    collectionBatchId: string;
    gameRunId: string;
    gameVersion: string;
    clientGeneratedAt: string;
    rawPayloadHash: string;
    durationSeconds: number;
    metricsSummary: Record<string, unknown>;
  };
  trainingResult: {
    resultId: string;
    collectionBatchId: string;
    source: string;
    gameRunId: string;
    gameVersion: string;
    bridgeProtocolVersion: string;
    clientGeneratedAt: string;
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
  motionMetrics: UnityFieldEvidenceMetric[];
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

export type UnityFieldEvidence = UnityFieldEvidenceInput & {
  evidenceVersion: typeof unityFieldEvidenceVersion;
};

export type BuildUnityFieldEvidenceResult =
  | { ok: true; evidence: UnityFieldEvidence }
  | { ok: false; error: string; failures: string[] };

export function unityFieldAcceptanceCommand(evidencePath: string) {
  return [
    `pnpm verify:unity-field-evidence -- ${evidencePath}`,
    "UNITY_FIELD_PATIENT_ACCOUNT='<训练记录读取账号>' \\",
    "UNITY_FIELD_PATIENT_PASSWORD='<训练记录读取密码>' \\",
    "UNITY_FIELD_AUDIT_ACCOUNT='<审计读取账号>' \\",
    "UNITY_FIELD_AUDIT_PASSWORD='<审计读取密码>' \\",
    "pnpm verify:unity-field-acceptance -- \\",
    `  ${evidencePath} \\`,
    "  --api-base-url <正式 API 地址>",
  ].join("\n");
}

export function buildUnityFieldEvidence(
  input: UnityFieldEvidenceInput,
): BuildUnityFieldEvidenceResult {
  const evidence: UnityFieldEvidence = {
    evidenceVersion: unityFieldEvidenceVersion,
    ...(isPlainObject(input) ? input : {}),
  } as UnityFieldEvidence;
  const failures = validateUnityFieldEvidenceInput(evidence);

  if (failures.length) {
    return {
      ok: false,
      error: failures.join("；"),
      failures,
    };
  }

  return { ok: true, evidence };
}

export function buildUnityFieldEvidenceInputFromRecord({
  acceptance,
  browser,
  device,
  unityRuntime,
  patient,
  gameContent,
  rehabPlan,
  trainingSession,
  bridgeEvent,
  trainingResult,
  motionMetrics,
  auditEvidence,
  artifacts,
}: {
  acceptance: UnityFieldEvidenceInput["acceptance"];
  browser: UnityFieldEvidenceInput["browser"];
  device: UnityFieldEvidenceInput["device"];
  unityRuntime: UnityFieldEvidenceInput["unityRuntime"];
  patient: UnityFieldEvidenceInput["patient"];
  gameContent: {
    id: string;
    code: string;
    name: string;
    runtimeType: string;
    gameVersion?: string | null;
    bridgeProtocolVersion: string;
    releaseChannel: string;
    buildStatus: string;
    manifestUrl?: string | null;
    buildBaseUrl?: string | null;
  };
  rehabPlan: UnityFieldEvidenceInput["rehabPlan"];
  trainingSession: {
    id: string;
    collectionBatchId?: string | null;
    gameRunId?: string | null;
    deviceCode?: string | null;
    sessionStatus: string;
    syncStatus: string;
    calibrationStatus: string;
    clientStartedAt?: string | null;
    clientEndedAt?: string | null;
    runtimeConfigSnapshot?: unknown;
  };
  bridgeEvent: UnityFieldEvidenceInput["bridgeEvent"];
  trainingResult: {
    id: string;
    collectionBatchId?: string | null;
    source: string;
    gameRunId: string;
    gameVersion: string;
    bridgeProtocolVersion: string;
    clientGeneratedAt?: string | null;
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
  motionMetrics: unknown;
  auditEvidence: UnityFieldEvidenceInput["auditEvidence"];
  artifacts: UnityFieldEvidenceInput["artifacts"];
}): BuildUnityFieldEvidenceResult {
  const normalizedUrls = normalizeStoredUnityEvidenceUrls({
    pageUrl: browser.pageUrl,
    unityRuntime,
    gameContent,
    runtimeConfigSnapshot: trainingSession.runtimeConfigSnapshot,
  });
  if (!normalizedUrls.ok) {
    return {
      ok: false,
      error: normalizedUrls.failures.join("；"),
      failures: normalizedUrls.failures,
    };
  }

  return buildUnityFieldEvidence({
    acceptance,
    browser,
    device,
    unityRuntime: {
      ...unityRuntime,
      manifestUrl: normalizedUrls.unityRuntimeManifestUrl,
      buildBaseUrl: normalizedUrls.unityRuntimeBuildBaseUrl,
    },
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
      manifestUrl: normalizedUrls.gameContentManifestUrl,
      buildBaseUrl: normalizedUrls.gameContentBuildBaseUrl,
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
      runtimeConfigSnapshot: normalizeUnityRuntimeConfigSnapshot(
        trainingSession.runtimeConfigSnapshot,
        normalizedUrls.runtimeSnapshotManifestUrl,
        normalizedUrls.runtimeSnapshotBuildBaseUrl,
      ),
    },
    bridgeEvent,
    trainingResult: {
      resultId: trainingResult.id,
      collectionBatchId: trainingResult.collectionBatchId ?? "",
      source: trainingResult.source,
      gameRunId: trainingResult.gameRunId,
      gameVersion: trainingResult.gameVersion,
      bridgeProtocolVersion: trainingResult.bridgeProtocolVersion,
      clientGeneratedAt: trainingResult.clientGeneratedAt ?? "",
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
    motionMetrics: normalizeUnityFieldEvidenceMotionMetrics(motionMetrics),
    auditEvidence,
    artifacts,
  });
}

export function normalizeUnityFieldEvidenceMotionMetrics(
  motionMetrics: unknown,
): UnityFieldEvidenceMetric[] {
  if (!Array.isArray(motionMetrics)) return [];
  return motionMetrics.map((item) => {
    const metric = isPlainObject(item) ? item : {};
    return {
      metricType: readString(metric.metricType),
      metricValue: readNumber(metric.metricValue),
      unit: readString(metric.unit),
      sampleCount: readNumber(metric.sampleCount),
      confidence: readNumber(metric.confidence),
      qualityFlag: readString(metric.qualityFlag),
      windowStartedAt: readString(metric.windowStartedAt),
      windowEndedAt: readString(metric.windowEndedAt),
    };
  });
}

function normalizeUnityRuntimeConfigSnapshot(
  value: unknown,
  manifestUrl: string,
  buildBaseUrl: string,
): UnityFieldEvidenceInput["trainingSession"]["runtimeConfigSnapshot"] {
  const snapshot = isPlainObject(value) ? value : {};
  return {
    runtimeType: readString(snapshot.runtimeType),
    manifestUrl,
    buildBaseUrl,
    gameVersion: readString(snapshot.gameVersion),
    bridgeProtocolVersion: readString(snapshot.bridgeProtocolVersion),
    resultContractVersion: readString(snapshot.resultContractVersion),
    collectionBatchId: readString(snapshot.collectionBatchId),
    durationSeconds: readNumber(snapshot.durationSeconds),
    releaseChannel: readString(snapshot.releaseChannel),
  };
}

function normalizeStoredUnityEvidenceUrls({
  pageUrl,
  unityRuntime,
  gameContent,
  runtimeConfigSnapshot,
}: {
  pageUrl: string;
  unityRuntime: UnityFieldEvidenceInput["unityRuntime"];
  gameContent: { manifestUrl?: string | null; buildBaseUrl?: string | null };
  runtimeConfigSnapshot: unknown;
}):
  | {
      ok: true;
      unityRuntimeManifestUrl: string;
      unityRuntimeBuildBaseUrl: string;
      gameContentManifestUrl: string;
      gameContentBuildBaseUrl: string;
      runtimeSnapshotManifestUrl: string;
      runtimeSnapshotBuildBaseUrl: string;
    }
  | { ok: false; failures: string[] } {
  const failures: string[] = [];
  const snapshot = isPlainObject(runtimeConfigSnapshot)
    ? runtimeConfigSnapshot
    : {};
  const fields = {
    unityRuntimeManifestUrl: canonicalUnityEvidenceUrl(
      failures,
      unityRuntime.manifestUrl,
      pageUrl,
      "unityRuntime.manifestUrl",
      true,
    ),
    unityRuntimeBuildBaseUrl: canonicalUnityEvidenceUrl(
      failures,
      unityRuntime.buildBaseUrl,
      pageUrl,
      "unityRuntime.buildBaseUrl",
      false,
    ),
    gameContentManifestUrl: canonicalUnityEvidenceUrl(
      failures,
      gameContent.manifestUrl,
      pageUrl,
      "gameContent.manifestUrl",
      true,
    ),
    gameContentBuildBaseUrl: canonicalUnityEvidenceUrl(
      failures,
      gameContent.buildBaseUrl,
      pageUrl,
      "gameContent.buildBaseUrl",
      false,
    ),
    runtimeSnapshotManifestUrl: canonicalUnityEvidenceUrl(
      failures,
      readString(snapshot.manifestUrl),
      pageUrl,
      "trainingSession.runtimeConfigSnapshot.manifestUrl",
      true,
    ),
    runtimeSnapshotBuildBaseUrl: canonicalUnityEvidenceUrl(
      failures,
      readString(snapshot.buildBaseUrl),
      pageUrl,
      "trainingSession.runtimeConfigSnapshot.buildBaseUrl",
      false,
    ),
  };
  return failures.length ? { ok: false, failures } : { ok: true, ...fields };
}

function canonicalUnityEvidenceUrl(
  failures: string[],
  value: unknown,
  pageUrl: string,
  label: string,
  manifest: boolean,
) {
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
    failures.push(`${label} 必须是验收页面同源的正式 Unity HTTPS 地址`);
    return "";
  }
}

function validateUnityFieldEvidenceInput(evidence: UnityFieldEvidence) {
  const failures: string[] = [];

  if (evidence.evidenceVersion !== unityFieldEvidenceVersion) {
    failures.push("evidenceVersion 必须使用 unity-field-acceptance/v1");
  }

  validateAcceptance(failures, evidence);
  validateBrowser(failures, evidence);
  validateDevice(failures, evidence);
  validateUnityRuntime(failures, evidence);
  validatePatient(failures, evidence);
  validateGameContent(failures, evidence);
  validateRehabPlan(failures, evidence);
  validateTrainingSession(failures, evidence);
  validateUnityEvidenceWebUrls(failures, evidence);
  validateBridgeEvent(failures, evidence);
  validateTrainingResult(failures, evidence);
  validateMotionMetrics(failures, evidence.motionMetrics);
  validateAuditEvidence(failures, evidence.auditEvidence);
  validateArtifacts(failures, evidence.artifacts);
  validateCrossReferences(failures, evidence);
  validateNoPlaceholders(failures, evidence);
  validateNoFakeDataMarkers(failures, evidence);
  validateNoSensitiveEvidence(failures, evidence);

  return failures;
}

function validateUnityEvidenceWebUrls(
  failures: string[],
  evidence: UnityFieldEvidence,
) {
  const pageUrl = evidence.browser?.pageUrl;
  canonicalUnityEvidenceUrl(
    failures,
    evidence.unityRuntime?.manifestUrl,
    pageUrl,
    "unityRuntime.manifestUrl",
    true,
  );
  canonicalUnityEvidenceUrl(
    failures,
    evidence.unityRuntime?.buildBaseUrl,
    pageUrl,
    "unityRuntime.buildBaseUrl",
    false,
  );
  canonicalUnityEvidenceUrl(
    failures,
    evidence.gameContent?.manifestUrl,
    pageUrl,
    "gameContent.manifestUrl",
    true,
  );
  canonicalUnityEvidenceUrl(
    failures,
    evidence.gameContent?.buildBaseUrl,
    pageUrl,
    "gameContent.buildBaseUrl",
    false,
  );
  canonicalUnityEvidenceUrl(
    failures,
    evidence.trainingSession?.runtimeConfigSnapshot?.manifestUrl,
    pageUrl,
    "trainingSession.runtimeConfigSnapshot.manifestUrl",
    true,
  );
  canonicalUnityEvidenceUrl(
    failures,
    evidence.trainingSession?.runtimeConfigSnapshot?.buildBaseUrl,
    pageUrl,
    "trainingSession.runtimeConfigSnapshot.buildBaseUrl",
    false,
  );
}

function validateAcceptance(failures: string[], evidence: UnityFieldEvidence) {
  const acceptance = requireRecord(failures, evidence.acceptance, "acceptance");
  if (!acceptance) return;
  requireText(failures, acceptance.acceptedAt, "acceptance.acceptedAt");
  requireText(failures, acceptance.testerName, "acceptance.testerName");
  requireText(failures, acceptance.siteName, "acceptance.siteName");
  requireText(failures, acceptance.environment, "acceptance.environment");
  requireUtcIso(failures, acceptance.acceptedAt, "acceptance.acceptedAt");
}

function validateBrowser(failures: string[], evidence: UnityFieldEvidence) {
  const browser = requireRecord(failures, evidence.browser, "browser");
  if (!browser) return;
  requireText(failures, browser.name, "browser.name");
  requireText(failures, browser.version, "browser.version");
  requireText(failures, browser.userAgent, "browser.userAgent");
  requireText(failures, browser.pageUrl, "browser.pageUrl");
  requireHttpsUrl(failures, browser.pageUrl, "browser.pageUrl");
}

function validateDevice(failures: string[], evidence: UnityFieldEvidence) {
  const device = requireRecord(failures, evidence.device, "device");
  if (!device) return;
  requireText(failures, device.deviceCode, "device.deviceCode");
  requireText(failures, device.deviceType, "device.deviceType");
  requireText(failures, device.inputMode, "device.inputMode");
  requireText(failures, device.calibrationStatus, "device.calibrationStatus");
  requireText(failures, device.resolution, "device.resolution");
}

function validateUnityRuntime(
  failures: string[],
  evidence: UnityFieldEvidence,
) {
  const unityRuntime = requireRecord(
    failures,
    evidence.unityRuntime,
    "unityRuntime",
  );
  if (!unityRuntime) return;
  if (unityRuntime.runtimeType !== expectedRuntimeType) {
    failures.push("unityRuntime.runtimeType 必须是 unity_webgl");
  }
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
  requireText(failures, unityRuntime.gameVersion, "unityRuntime.gameVersion");
  if (unityRuntime.bridgeProtocolVersion !== expectedBridgeProtocolVersion) {
    failures.push("unityRuntime.bridgeProtocolVersion 必须是 1.0.0");
  }
  requireUtcIso(
    failures,
    unityRuntime.loaderLoadedAt,
    "unityRuntime.loaderLoadedAt",
  );
  requireUtcIso(
    failures,
    unityRuntime.unityInstanceStartedAt,
    "unityRuntime.unityInstanceStartedAt",
  );
  requireText(
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

function validatePatient(failures: string[], evidence: UnityFieldEvidence) {
  const patient = requireRecord(failures, evidence.patient, "patient");
  if (!patient) return;
  requireText(failures, patient.patientId, "patient.patientId");
  requireText(failures, patient.patientExportId, "patient.patientExportId");
}

function validateGameContent(failures: string[], evidence: UnityFieldEvidence) {
  const gameContent = requireRecord(
    failures,
    evidence.gameContent,
    "gameContent",
  );
  if (!gameContent) return;
  requireText(failures, gameContent.gameContentId, "gameContent.gameContentId");
  requireText(failures, gameContent.code, "gameContent.code");
  requireText(failures, gameContent.name, "gameContent.name");
  if (gameContent.runtimeType !== expectedRuntimeType) {
    failures.push("gameContent.runtimeType 必须是 unity_webgl");
  }
  requireText(failures, gameContent.gameVersion, "gameContent.gameVersion");
  if (gameContent.bridgeProtocolVersion !== expectedBridgeProtocolVersion) {
    failures.push("gameContent.bridgeProtocolVersion 必须是 1.0.0");
  }
  if (gameContent.releaseChannel !== "production") {
    failures.push("gameContent.releaseChannel 必须是 production");
  }
  if (gameContent.buildStatus !== "released") {
    failures.push("gameContent.buildStatus 必须是 released");
  }
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

function validateRehabPlan(failures: string[], evidence: UnityFieldEvidence) {
  const rehabPlan = requireRecord(failures, evidence.rehabPlan, "rehabPlan");
  if (!rehabPlan) return;
  requireText(failures, rehabPlan.rehabPlanId, "rehabPlan.rehabPlanId");
  requireText(failures, rehabPlan.planItemId, "rehabPlan.planItemId");
  requirePositiveInteger(
    failures,
    rehabPlan.durationMinutes,
    "rehabPlan.durationMinutes",
  );
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
  evidence: UnityFieldEvidence,
) {
  const trainingSession = requireRecord(
    failures,
    evidence.trainingSession,
    "trainingSession",
  );
  if (!trainingSession) return;
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
  if (trainingSession.sessionStatus !== "completed") {
    failures.push("trainingSession.sessionStatus 必须是 completed");
  }
  if (trainingSession.syncStatus !== "synced") {
    failures.push("trainingSession.syncStatus 必须是 synced");
  }
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
  validateRuntimeConfigSnapshot(
    failures,
    trainingSession.runtimeConfigSnapshot,
  );
}

function validateRuntimeConfigSnapshot(failures: string[], value: unknown) {
  const snapshot = requireRecord(
    failures,
    value,
    "trainingSession.runtimeConfigSnapshot",
  );
  if (!snapshot) return;
  if (snapshot.runtimeType !== expectedRuntimeType) {
    failures.push(
      "trainingSession.runtimeConfigSnapshot.runtimeType 必须是 unity_webgl",
    );
  }
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
  requireText(
    failures,
    snapshot.gameVersion,
    "trainingSession.runtimeConfigSnapshot.gameVersion",
  );
  if (snapshot.bridgeProtocolVersion !== expectedBridgeProtocolVersion) {
    failures.push(
      "trainingSession.runtimeConfigSnapshot.bridgeProtocolVersion 必须是 1.0.0",
    );
  }
  if (snapshot.resultContractVersion !== expectedResultContractVersion) {
    failures.push(
      `trainingSession.runtimeConfigSnapshot.resultContractVersion 必须是 ${expectedResultContractVersion}`,
    );
  }
  requireText(
    failures,
    snapshot.collectionBatchId,
    "trainingSession.runtimeConfigSnapshot.collectionBatchId",
  );
  requirePositiveInteger(
    failures,
    snapshot.durationSeconds,
    "trainingSession.runtimeConfigSnapshot.durationSeconds",
  );
  if (snapshot.releaseChannel !== "production") {
    failures.push(
      "trainingSession.runtimeConfigSnapshot.releaseChannel 必须是 production",
    );
  }
}

function validateBridgeEvent(failures: string[], evidence: UnityFieldEvidence) {
  const bridgeEvent = requireRecord(
    failures,
    evidence.bridgeEvent,
    "bridgeEvent",
  );
  if (!bridgeEvent) return;
  if (bridgeEvent.type !== "training_result") {
    failures.push("bridgeEvent.type 必须是 training_result");
  }
  if (bridgeEvent.action !== "training_result") {
    failures.push("bridgeEvent.action 必须是 training_result");
  }
  if (bridgeEvent.protocolVersion !== expectedBridgeProtocolVersion) {
    failures.push("bridgeEvent.protocolVersion 必须是 1.0.0");
  }
  if (bridgeEvent.resultContractVersion !== expectedResultContractVersion) {
    failures.push(
      `bridgeEvent.resultContractVersion 必须是 ${expectedResultContractVersion}`,
    );
  }
  requireText(failures, bridgeEvent.sessionId, "bridgeEvent.sessionId");
  requireText(
    failures,
    bridgeEvent.collectionBatchId,
    "bridgeEvent.collectionBatchId",
  );
  requireText(failures, bridgeEvent.gameRunId, "bridgeEvent.gameRunId");
  requireText(failures, bridgeEvent.gameVersion, "bridgeEvent.gameVersion");
  requireUtcIso(
    failures,
    bridgeEvent.clientGeneratedAt,
    "bridgeEvent.clientGeneratedAt",
  );
  requireText(
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

function validateBridgeMetricsSummary(failures: string[], value: unknown) {
  const summary = requireRecord(
    failures,
    value,
    "bridgeEvent.metricsSummary",
  );
  if (!summary) return;
  if (summary.source !== expectedRuntimeType) {
    failures.push("bridgeEvent.metricsSummary.source 必须是 unity_webgl");
  }
  if (summary.resultContractVersion !== expectedResultContractVersion) {
    failures.push(
      `bridgeEvent.metricsSummary.resultContractVersion 必须是 ${expectedResultContractVersion}`,
    );
  }
  requireText(
    failures,
    summary.collectionBatchId,
    "bridgeEvent.metricsSummary.collectionBatchId",
  );
  requireText(
    failures,
    summary.gameRunId,
    "bridgeEvent.metricsSummary.gameRunId",
  );
  requireText(
    failures,
    summary.gameVersion,
    "bridgeEvent.metricsSummary.gameVersion",
  );
  if (summary.protocolVersion !== expectedBridgeProtocolVersion) {
    failures.push("bridgeEvent.metricsSummary.protocolVersion 必须是 1.0.0");
  }
  requireUtcIso(
    failures,
    summary.clientGeneratedAt,
    "bridgeEvent.metricsSummary.clientGeneratedAt",
  );
  requireText(
    failures,
    summary.rawPayloadHash,
    "bridgeEvent.metricsSummary.rawPayloadHash",
  );
  validateUnityDynamicDifficultyEvidence(
    failures,
    summary.dynamicDifficultyEvidence,
  );
}

function validateUnityDynamicDifficultyEvidence(
  failures: string[],
  value: unknown,
) {
  const evidence = requireRecord(
    failures,
    value,
    "bridgeEvent.metricsSummary.dynamicDifficultyEvidence",
  );
  if (!evidence) return;
  if (evidence.schemaVersion !== expectedDynamicDifficultySchemaVersion) {
    failures.push("dynamicDifficultyEvidence.schemaVersion 必须是 1.0.0");
  }
  if (!Array.isArray(evidence.events) || !evidence.events.length) {
    failures.push("dynamicDifficultyEvidence.events 必须是非空数组");
    return;
  }
  for (const [index, item] of evidence.events.entries()) {
    const label = `dynamicDifficultyEvidence.events[${index}]`;
    const event = requireRecord(failures, item, label);
    if (!event) continue;
    requireIntegerRange(failures, event.startingLevel, 1, 3, `${label}.startingLevel`);
    requireOneOf(
      failures,
      event.startingLevelSource,
      allowedStartingLevelSources,
      `${label}.startingLevelSource`,
    );
    requireText(failures, event.approvedPlanItemId, `${label}.approvedPlanItemId`);
    requireText(failures, event.assessmentSourceId, `${label}.assessmentSourceId`);
    requireOneOf(
      failures,
      event.triggerReason,
      allowedDynamicDifficultyTriggerReasons,
      `${label}.triggerReason`,
    );
    validateUnityDifficultySnapshot(failures, event.before, `${label}.before`);
    validateUnityDifficultySnapshot(failures, event.after, `${label}.after`);
    requireUtcIso(failures, event.adjustedAt, `${label}.adjustedAt`);
    requireText(failures, event.runtimeFrameId, `${label}.runtimeFrameId`);
    requireText(failures, event.runtimeWindowId, `${label}.runtimeWindowId`);
    const before = isPlainObject(event.before) ? event.before : undefined;
    const after = isPlainObject(event.after) ? event.after : undefined;
    const unchanged =
      before &&
      after &&
      before.speed === after.speed &&
      before.complexityLevel === after.complexityLevel;
    if (unchanged) {
      requireText(failures, event.safetyClampReason, `${label}.safetyClampReason`);
    } else if (event.safetyClampReason !== undefined) {
      failures.push(`${label}.safetyClampReason 在难度已变化时不得存在`);
    }
  }
}

function validateUnityDifficultySnapshot(
  failures: string[],
  value: unknown,
  label: string,
) {
  const snapshot = requireRecord(failures, value, label);
  if (!snapshot) return;
  requirePositiveNumber(failures, snapshot.speed, `${label}.speed`);
  requireIntegerRange(
    failures,
    snapshot.complexityLevel,
    1,
    3,
    `${label}.complexityLevel`,
  );
}

function validateTrainingResult(
  failures: string[],
  evidence: UnityFieldEvidence,
) {
  const trainingResult = requireRecord(
    failures,
    evidence.trainingResult,
    "trainingResult",
  );
  if (!trainingResult) return;
  requireText(failures, trainingResult.resultId, "trainingResult.resultId");
  requireText(
    failures,
    trainingResult.collectionBatchId,
    "trainingResult.collectionBatchId",
  );
  if (trainingResult.source !== expectedRuntimeType) {
    failures.push("trainingResult.source 必须是 unity_webgl");
  }
  requireText(failures, trainingResult.gameRunId, "trainingResult.gameRunId");
  requireText(
    failures,
    trainingResult.gameVersion,
    "trainingResult.gameVersion",
  );
  if (trainingResult.bridgeProtocolVersion !== expectedBridgeProtocolVersion) {
    failures.push("trainingResult.bridgeProtocolVersion 必须是 1.0.0");
  }
  requireUtcIso(
    failures,
    trainingResult.clientGeneratedAt,
    "trainingResult.clientGeneratedAt",
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
  if (trainingResult.qualityFlag !== "valid") {
    failures.push("trainingResult.qualityFlag 必须显式为 valid");
  }
  if (trainingResult.abnormalFlag !== false) {
    failures.push("trainingResult.abnormalFlag 必须显式为 false");
  }
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
  requireText(
    failures,
    trainingResult.exerciseIntensity,
    "trainingResult.exerciseIntensity",
  );
}

function validateMotionMetrics(failures: string[], motionMetrics: unknown) {
  if (!Array.isArray(motionMetrics) || !motionMetrics.length) {
    failures.push("motionMetrics 必须是非空数组");
    return;
  }

  const metricCounts = new Map<string, number>();
  for (const [index, value] of motionMetrics.entries()) {
    const metric = requireRecord(failures, value, `motionMetrics[${index}]`);
    if (!metric) continue;
    requireText(failures, metric.metricType, "motionMetrics.metricType");
    if (typeof metric.metricType === "string") {
      metricCounts.set(
        metric.metricType,
        (metricCounts.get(metric.metricType) ?? 0) + 1,
      );
    }
    requireNumber(
      failures,
      metric.metricValue,
      `${metric.metricType}.metricValue`,
    );
    requireText(failures, metric.unit, `${metric.metricType}.unit`);
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
  }
  for (const metricType of requiredUnityMetricTypes) {
    if (metricCounts.get(metricType) !== 1) {
      failures.push(`motionMetrics.${metricType} 必须恰好存在一项`);
    }
  }
  if (
    motionMetrics.length !== requiredUnityMetricTypes.length ||
    [...metricCounts.keys()].some(
      (metricType) => !requiredUnityMetricTypes.includes(metricType as never),
    )
  ) {
    failures.push("motionMetrics 必须精确包含五项 Unity 正式指标");
  }
}

function validateAuditEvidence(failures: string[], value: unknown) {
  const auditEvidence = requireRecord(failures, value, "auditEvidence");
  if (!auditEvidence) return;
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

  if (
    Array.isArray(auditEvidence.auditLogIds) &&
    (auditEvidence.auditLogIds.length !== 2 ||
      new Set(auditEvidence.auditLogIds).size !== 2)
  ) {
    failures.push("auditEvidence.auditLogIds 必须恰好两个且唯一");
  }

  for (const action of requiredAuditActions) {
    if (
      !Array.isArray(auditEvidence.requiredActions) ||
      !auditEvidence.requiredActions.includes(action)
    ) {
      failures.push(`auditEvidence.requiredActions 缺少 ${action}`);
    }
  }
  if (Array.isArray(auditEvidence.requiredActions)) {
    const extraActions = auditEvidence.requiredActions.filter(
      (action) => !requiredAuditActions.includes(action as never),
    );
    if (
      extraActions.length ||
      auditEvidence.requiredActions.length !== requiredAuditActions.length ||
      new Set(auditEvidence.requiredActions).size !== requiredAuditActions.length
    ) {
      failures.push(
        `auditEvidence.requiredActions 只能包含 ${requiredAuditActions.join("、")}；多余动作：${
          extraActions.join("、") || "重复或数量不一致"
        }`,
      );
    }
  }
  if (
    Array.isArray(auditEvidence.requiredActions) &&
    auditEvidence.requiredActions.includes("training_result.review")
  ) {
    failures.push(
      "正式 Unity WebGL 现场验收只接受 valid 且无异常训练结果；training_result.review 属于异常训练复核契约，请使用 pnpm verify:contracts 验收。",
    );
  }
}

function validateArtifacts(failures: string[], value: unknown) {
  const artifacts = requireRecord(failures, value, "artifacts");
  if (!artifacts) return;
  if (!Array.isArray(artifacts.screenshots) || !artifacts.screenshots.length) {
    failures.push("artifacts.screenshots 至少需要一张现场验收截图");
  }
  if (!Array.isArray(artifacts.recordings) || !artifacts.recordings.length) {
    failures.push("artifacts.recordings 至少需要一份现场训练录屏或录像");
  }

  if (Array.isArray(artifacts.screenshots)) {
    for (const [index, value] of artifacts.screenshots.entries()) {
      const screenshot = requireRecord(
        failures,
        value,
        `artifacts.screenshots[${index}]`,
      );
      if (!screenshot) continue;
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
  }

  if (Array.isArray(artifacts.recordings)) {
    for (const [index, value] of artifacts.recordings.entries()) {
      const recording = requireRecord(
        failures,
        value,
        `artifacts.recordings[${index}]`,
      );
      if (!recording) continue;
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
}

function validateCrossReferences(
  failures: string[],
  evidence: UnityFieldEvidence,
) {
  const bridgeEvent = asRecord(evidence.bridgeEvent);
  const device = asRecord(evidence.device);
  const gameContent = asRecord(evidence.gameContent);
  const trainingResult = asRecord(evidence.trainingResult);
  const trainingSession = asRecord(evidence.trainingSession);
  const unityRuntime = asRecord(evidence.unityRuntime);
  const snapshot = asRecord(trainingSession?.runtimeConfigSnapshot);
  const rehabPlan = asRecord(evidence.rehabPlan);
  const metricsSummary = asRecord(bridgeEvent?.metricsSummary);
  const dynamicDifficultyEvidence = asRecord(
    metricsSummary?.dynamicDifficultyEvidence,
  );
  const dynamicDifficultyEvents = Array.isArray(dynamicDifficultyEvidence?.events)
    ? dynamicDifficultyEvidence.events
    : [];

  compareWhenPresent(
    failures,
    trainingSession?.gameRunId,
    trainingResult?.gameRunId,
    "trainingSession.gameRunId 与 trainingResult.gameRunId 必须一致",
  );
  compareWhenPresent(
    failures,
    trainingSession?.deviceCode,
    device?.deviceCode,
    "trainingSession.deviceCode 与 device.deviceCode 必须一致",
  );
  compareWhenPresent(
    failures,
    gameContent?.gameVersion,
    trainingResult?.gameVersion,
    "gameContent.gameVersion 与 trainingResult.gameVersion 必须一致",
  );
  compareWhenPresent(
    failures,
    gameContent?.bridgeProtocolVersion,
    trainingResult?.bridgeProtocolVersion,
    "gameContent.bridgeProtocolVersion 与 trainingResult.bridgeProtocolVersion 必须一致",
  );
  compareWhenPresent(
    failures,
    gameContent?.runtimeType,
    unityRuntime?.runtimeType,
    "gameContent.runtimeType 与 unityRuntime.runtimeType 必须一致",
  );
  compareWhenPresent(
    failures,
    gameContent?.manifestUrl,
    unityRuntime?.manifestUrl,
    "gameContent.manifestUrl 与 unityRuntime.manifestUrl 必须一致",
  );
  compareWhenPresent(
    failures,
    gameContent?.buildBaseUrl,
    unityRuntime?.buildBaseUrl,
    "gameContent.buildBaseUrl 与 unityRuntime.buildBaseUrl 必须一致",
  );
  compareWhenPresent(
    failures,
    bridgeEvent?.sessionId,
    trainingSession?.sessionId,
    "bridgeEvent.sessionId 与 trainingSession.sessionId 必须一致",
  );
  compareWhenPresent(
    failures,
    bridgeEvent?.gameRunId,
    trainingResult?.gameRunId,
    "bridgeEvent.gameRunId 与 trainingResult.gameRunId 必须一致",
  );
  compareWhenPresent(
    failures,
    bridgeEvent?.gameVersion,
    trainingResult?.gameVersion,
    "bridgeEvent.gameVersion 与 trainingResult.gameVersion 必须一致",
  );
  compareWhenPresent(
    failures,
    bridgeEvent?.protocolVersion,
    trainingResult?.bridgeProtocolVersion,
    "bridgeEvent.protocolVersion 与 trainingResult.bridgeProtocolVersion 必须一致",
  );
  compareWhenPresent(
    failures,
    bridgeEvent?.clientGeneratedAt,
    trainingResult?.clientGeneratedAt,
    "bridgeEvent.clientGeneratedAt 与 trainingResult.clientGeneratedAt 必须一致",
  );
  compareWhenPresent(
    failures,
    bridgeEvent?.rawPayloadHash,
    trainingResult?.rawPayloadHash,
    "bridgeEvent.rawPayloadHash 与 trainingResult.rawPayloadHash 必须一致",
  );
  compareWhenPresent(
    failures,
    trainingSession?.collectionBatchId,
    snapshot?.collectionBatchId,
    "trainingSession.collectionBatchId 与 trainingSession.runtimeConfigSnapshot.collectionBatchId 必须一致",
  );
  compareWhenPresent(
    failures,
    trainingSession?.collectionBatchId,
    bridgeEvent?.collectionBatchId,
    "trainingSession.collectionBatchId 与 bridgeEvent.collectionBatchId 必须一致",
  );
  compareWhenPresent(
    failures,
    trainingSession?.collectionBatchId,
    trainingResult?.collectionBatchId,
    "trainingSession.collectionBatchId 与 trainingResult.collectionBatchId 必须一致",
  );
  compareWhenPresent(
    failures,
    bridgeEvent?.resultContractVersion,
    snapshot?.resultContractVersion,
    "bridgeEvent.resultContractVersion 与训练会话结果合同必须一致",
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
      `bridgeEvent.metricsSummary.${field} 与 bridgeEvent.${field} 必须一致`,
    );
  }

  if (
    typeof rehabPlan?.durationMinutes === "number" &&
    Number.isInteger(rehabPlan.durationMinutes)
  ) {
    const durationSeconds = rehabPlan.durationMinutes * 60;
    compareRequiredNumber(
      failures,
      durationSeconds,
      snapshot?.durationSeconds,
      "rehabPlan.durationMinutes 与训练会话处方秒数必须严格一致",
    );
    compareRequiredNumber(
      failures,
      durationSeconds,
      bridgeEvent?.durationSeconds,
      "rehabPlan.durationMinutes 与 Bridge 训练秒数必须严格一致",
    );
    compareRequiredNumber(
      failures,
      durationSeconds,
      trainingResult?.durationSeconds,
      "rehabPlan.durationMinutes 与训练结果秒数必须严格一致",
    );
  }

  for (const [index, item] of dynamicDifficultyEvents.entries()) {
    const event = asRecord(item);
    compareWhenPresent(
      failures,
      event?.approvedPlanItemId,
      rehabPlan?.planItemId,
      `dynamicDifficultyEvidence.events[${index}].approvedPlanItemId 与方案项目必须一致`,
    );
    if (
      typeof event?.runtimeFrameId === "string" &&
      typeof trainingSession?.gameRunId === "string" &&
      !event.runtimeFrameId.startsWith(`${trainingSession.gameRunId}:frame:`)
    ) {
      failures.push(
        `dynamicDifficultyEvidence.events[${index}].runtimeFrameId 必须属于当前 gameRunId`,
      );
    }
    if (
      typeof event?.runtimeWindowId === "string" &&
      typeof trainingSession?.gameRunId === "string" &&
      !event.runtimeWindowId.startsWith(
        `${trainingSession.gameRunId}:runtime-window:`,
      )
    ) {
      failures.push(
        `dynamicDifficultyEvidence.events[${index}].runtimeWindowId 必须属于当前 gameRunId 的 Unity 运行窗口`,
      );
    }
    if (
      typeof event?.adjustedAt === "string" &&
      typeof trainingSession?.clientStartedAt === "string" &&
      typeof trainingResult?.clientGeneratedAt === "string" &&
      (Date.parse(event.adjustedAt) < Date.parse(trainingSession.clientStartedAt) ||
        Date.parse(event.adjustedAt) > Date.parse(trainingResult.clientGeneratedAt))
    ) {
      failures.push(
        `dynamicDifficultyEvidence.events[${index}].adjustedAt 必须位于训练时间窗内`,
      );
    }
  }

  const finalDifficultyEvent = asRecord(
    dynamicDifficultyEvents[dynamicDifficultyEvents.length - 1],
  );
  const finalDifficulty = asRecord(finalDifficultyEvent?.after);
  const expectedMetricValues: Record<string, { value: unknown; unit: string }> = {
    reaction_time_ms: { value: trainingResult?.reactionTimeMs, unit: "ms" },
    target_hit_rate: { value: trainingResult?.completionRate, unit: "ratio" },
    arm_raise_accuracy: { value: trainingResult?.motionAccuracy, unit: "ratio" },
    duration_seconds: { value: trainingResult?.durationSeconds, unit: "seconds" },
    difficulty_level: { value: finalDifficulty?.complexityLevel, unit: "level" },
  };
  const motionMetrics = Array.isArray(evidence.motionMetrics)
    ? evidence.motionMetrics
    : [];
  for (const metricType of requiredUnityMetricTypes) {
    const metric = motionMetrics.find(
      (item) => item.metricType === metricType,
    );
    if (!metric) continue;
    if (
      metric.metricValue !== expectedMetricValues[metricType].value ||
      metric.unit !== expectedMetricValues[metricType].unit
    ) {
      failures.push(`motionMetrics.${metricType} 的值或单位与正式结果合同不一致`);
    }
    if (metric.windowStartedAt !== trainingSession?.clientStartedAt) {
      failures.push(
        `motionMetrics.${metricType}.windowStartedAt 必须等于训练开始时间`,
      );
    }
    if (metric.windowEndedAt !== trainingResult?.clientGeneratedAt) {
      failures.push(
        `motionMetrics.${metricType}.windowEndedAt 必须等于结果生成时间`,
      );
    }
  }

  compareWhenPresent(
    failures,
    snapshot?.runtimeType,
    unityRuntime?.runtimeType,
    "trainingSession.runtimeConfigSnapshot.runtimeType 与 unityRuntime.runtimeType 必须一致",
  );
  compareWhenPresent(
    failures,
    snapshot?.manifestUrl,
    unityRuntime?.manifestUrl,
    "trainingSession.runtimeConfigSnapshot.manifestUrl 与 unityRuntime.manifestUrl 必须一致",
  );
  compareWhenPresent(
    failures,
    snapshot?.buildBaseUrl,
    unityRuntime?.buildBaseUrl,
    "trainingSession.runtimeConfigSnapshot.buildBaseUrl 与 unityRuntime.buildBaseUrl 必须一致",
  );
  compareWhenPresent(
    failures,
    snapshot?.gameVersion,
    unityRuntime?.gameVersion,
    "trainingSession.runtimeConfigSnapshot.gameVersion 与 unityRuntime.gameVersion 必须一致",
  );
  compareWhenPresent(
    failures,
    snapshot?.bridgeProtocolVersion,
    unityRuntime?.bridgeProtocolVersion,
    "trainingSession.runtimeConfigSnapshot.bridgeProtocolVersion 与 unityRuntime.bridgeProtocolVersion 必须一致",
  );
}

function validateNoPlaceholders(
  failures: string[],
  evidence: UnityFieldEvidence,
) {
  const paths: string[] = [];
  collectPlaceholderPaths(evidence, "$", paths);
  for (const path of paths) {
    failures.push(`${path} 仍包含占位符，必须替换为现场实机证据`);
  }
}

function validateNoFakeDataMarkers(
  failures: string[],
  evidence: UnityFieldEvidence,
) {
  const paths: string[] = [];
  collectFakeDataMarkerPaths(evidence, "$", paths);
  for (const path of paths) {
    failures.push(
      `${path} 包含 mock/demo/seed/fallback/fixed/manual 标记，不能作为正式 Unity 验收证据`,
    );
  }
}

function validateNoSensitiveEvidence(
  failures: string[],
  evidence: UnityFieldEvidence,
) {
  const paths: string[] = [];
  collectSensitiveEvidencePaths(evidence, "$", paths);
  for (const path of paths) {
    failures.push(
      `${path} 包含敏感字段或原始载荷，不能写入正式 Unity evidence`,
    );
  }
}

function collectPlaceholderPaths(
  value: unknown,
  path: string,
  paths: string[],
) {
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
  if (!isPlainObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    collectPlaceholderPaths(nested, `${path}.${key}`, paths);
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

function compareWhenPresent(
  failures: string[],
  left: unknown,
  right: unknown,
  message: string,
) {
  if (
    typeof left === "string" &&
    typeof right === "string" &&
    left.trim() &&
    right.trim() &&
    left !== right
  ) {
    failures.push(message);
  }
}

function requireRecord(
  failures: string[],
  value: unknown,
  label: string,
): Record<string, unknown> | null {
  if (!isPlainObject(value)) {
    failures.push(`${label} 必须是对象`);
    return null;
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" ? value : Number.NaN;
}

function requireText(failures: string[], value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${label} 必须显式提供非空文本`);
  }
}

function requireTextArray(failures: string[], value: unknown, label: string) {
  if (!Array.isArray(value) || !value.length) {
    failures.push(`${label} 必须是非空文本数组`);
    return;
  }
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) {
      failures.push(`${label} 只能包含非空文本`);
      return;
    }
  }
}

function requireUtcIso(failures: string[], value: unknown, label: string) {
  requireText(failures, value, label);
  if (typeof value !== "string") return;
  if (!value.trim()) return;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    failures.push(`${label} 必须是 ISO 8601 UTC 时间`);
  }
}

function requireNumber(failures: string[], value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    failures.push(`${label} 必须是数字`);
  }
}

function requirePositiveNumber(
  failures: string[],
  value: unknown,
  label: string,
) {
  requireNumber(failures, value, label);
  if (typeof value === "number" && Number.isFinite(value) && value <= 0) {
    failures.push(`${label} 必须大于 0`);
  }
}

function requirePositiveInteger(
  failures: string[],
  value: unknown,
  label: string,
) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    failures.push(`${label} 必须是大于 0 的整数`);
  }
}

function requireIntegerRange(
  failures: string[],
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    failures.push(`${label} 必须是 ${minimum} 到 ${maximum} 之间的整数`);
  }
}

function requireOneOf(
  failures: string[],
  value: unknown,
  allowedValues: readonly string[],
  label: string,
) {
  if (typeof value !== "string" || !allowedValues.includes(value)) {
    failures.push(`${label} 必须是 ${allowedValues.join("、")} 之一`);
  }
}

function compareRequiredNumber(
  failures: string[],
  expected: number,
  actual: unknown,
  message: string,
) {
  if (typeof actual !== "number" || !Number.isFinite(actual) || actual !== expected) {
    failures.push(message);
  }
}

function requireScore(failures: string[], value: unknown, label: string) {
  requireNumber(failures, value, label);
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (value < 0 || value > 100)
  ) {
    failures.push(`${label} 必须在 0 到 100 之间`);
  }
}

function requireRatio(failures: string[], value: unknown, label: string) {
  requireNumber(failures, value, label);
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (value < 0 || value > 1)
  ) {
    failures.push(`${label} 必须在 0 到 1 之间`);
  }
}

function requireHttpsUrl(failures: string[], value: unknown, label: string) {
  requireText(failures, value, label);
  if (typeof value !== "string") return;
  if (!value.trim()) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      failures.push(`${label} 必须是正式 HTTPS 地址`);
    }
  } catch {
    failures.push(`${label} 必须是有效 URL`);
  }
}

function requireManifestUnderBase(
  failures: string[],
  manifestUrl: unknown,
  buildBaseUrl: unknown,
  label: string,
) {
  if (typeof manifestUrl !== "string" || typeof buildBaseUrl !== "string") {
    return;
  }
  if (!manifestUrl.trim() || !buildBaseUrl.trim()) return;
  const normalizedBase = buildBaseUrl.replace(/\/+$/, "");
  if (!manifestUrl.startsWith(`${normalizedBase}/`)) {
    failures.push(`${label} 必须位于 buildBaseUrl 目录下`);
  }
}
