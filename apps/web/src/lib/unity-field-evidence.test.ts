import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUnityFieldEvidence,
  buildUnityFieldEvidenceInputFromRecord,
  unityFieldAcceptanceCommand,
  type UnityFieldEvidenceInput,
} from "./unity-field-evidence.ts";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

function validInput(overrides: DeepPartial<UnityFieldEvidenceInput> = {}) {
  const input: UnityFieldEvidenceInput = {
    acceptance: {
      acceptedAt: "2026-05-24T10:00:00.000Z",
      testerName: "现场验收员",
      siteName: "康复中心试点现场",
      environment: "trial",
    },
    browser: {
      name: "Chrome",
      version: "126.0.0.0",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
      pageUrl: "https://rehab.example.com/training/unity",
    },
    device: {
      deviceCode: "trial-room-a-unity-01",
      deviceType: "desktop_web",
      inputMode: "keyboard_mouse",
      calibrationStatus: "checked",
      resolution: "1920x1080",
    },
    unityRuntime: {
      runtimeType: "unity_webgl",
      manifestUrl:
        "https://rehab.example.com/unity/rhythm_reach_3d/0.1.0/manifest.json",
      buildBaseUrl: "https://rehab.example.com/unity/rhythm_reach_3d/0.1.0",
      gameVersion: "0.1.0",
      bridgeProtocolVersion: "1.0.0",
      loaderLoadedAt: "2026-05-24T09:58:00.000Z",
      unityInstanceStartedAt: "2026-05-24T09:58:20.000Z",
      canvasResolution: "1280x720",
      devicePixelRatio: 2,
    },
    patient: {
      patientId: "patient_real_001",
      patientExportId: "patient_export_8a72",
    },
    gameContent: {
      gameContentId: "game_unity_rhythm_reach_001",
      code: "rhythm_reach_3d",
      name: "节律触达 3D",
      runtimeType: "unity_webgl",
      gameVersion: "0.1.0",
      bridgeProtocolVersion: "1.0.0",
      releaseChannel: "production",
      buildStatus: "released",
      manifestUrl:
        "https://rehab.example.com/unity/rhythm_reach_3d/0.1.0/manifest.json",
      buildBaseUrl: "https://rehab.example.com/unity/rhythm_reach_3d/0.1.0",
    },
    rehabPlan: {
      rehabPlanId: "plan_real_001",
      planItemId: "plan_item_real_001",
      durationMinutes: 3,
      confirmedByDoctorId: "doctor_real_001",
      confirmedAt: "2026-05-23T08:00:00.000Z",
    },
    trainingSession: {
      sessionId: "session_unity_real_001",
      collectionBatchId: "collection_batch_real_001",
      gameRunId: "run_unity_real_001",
      deviceCode: "trial-room-a-unity-01",
      sessionStatus: "completed",
      syncStatus: "synced",
      calibrationStatus: "checked",
      clientStartedAt: "2026-05-24T09:59:00.000Z",
      clientEndedAt: "2026-05-24T10:02:00.000Z",
      runtimeConfigSnapshot: {
        runtimeType: "unity_webgl",
        manifestUrl:
          "https://rehab.example.com/unity/rhythm_reach_3d/0.1.0/manifest.json",
        buildBaseUrl: "https://rehab.example.com/unity/rhythm_reach_3d/0.1.0",
        gameVersion: "0.1.0",
        bridgeProtocolVersion: "1.0.0",
        resultContractVersion: "rehab-unity-result-v2",
        collectionBatchId: "collection_batch_real_001",
        durationSeconds: 180,
        releaseChannel: "production",
      },
    },
    bridgeEvent: {
      type: "training_result",
      action: "training_result",
      protocolVersion: "1.0.0",
      resultContractVersion: "rehab-unity-result-v2",
      sessionId: "session_unity_real_001",
      collectionBatchId: "collection_batch_real_001",
      gameRunId: "run_unity_real_001",
      gameVersion: "0.1.0",
      clientGeneratedAt: "2026-05-24T10:02:00.000Z",
      rawPayloadHash: "sha256:7f83b1657ff1fc53b92dc18148a1d65dfa1355f7e",
      durationSeconds: 180,
      metricsSummary: {
        source: "unity_webgl",
        resultContractVersion: "rehab-unity-result-v2",
        collectionBatchId: "collection_batch_real_001",
        gameRunId: "run_unity_real_001",
        gameVersion: "0.1.0",
        protocolVersion: "1.0.0",
        clientGeneratedAt: "2026-05-24T10:02:00.000Z",
        rawPayloadHash: "sha256:7f83b1657ff1fc53b92dc18148a1d65dfa1355f7e",
        dynamicDifficultyEvidence: dynamicDifficultyEvidence(),
      },
    },
    trainingResult: {
      resultId: "result_unity_real_001",
      collectionBatchId: "collection_batch_real_001",
      source: "unity_webgl",
      gameRunId: "run_unity_real_001",
      gameVersion: "0.1.0",
      bridgeProtocolVersion: "1.0.0",
      clientGeneratedAt: "2026-05-24T10:02:00.000Z",
      rawPayloadHash: "sha256:7f83b1657ff1fc53b92dc18148a1d65dfa1355f7e",
      submittedAt: "2026-05-24T10:02:08.000Z",
      qualityFlag: "valid",
      abnormalFlag: false,
      score: 86,
      completionRate: 0.92,
      durationSeconds: 180,
      reactionTimeMs: 720,
      motionAccuracy: 0.88,
      exerciseIntensity: "moderate",
    },
    motionMetrics: [
      metric("reaction_time_ms", 720, "ms", 120, 0.94),
      metric("target_hit_rate", 0.92, "ratio", 120, 0.94),
      metric("arm_raise_accuracy", 0.88, "ratio", 120, 0.94),
      metric("duration_seconds", 180, "seconds", 120, 1),
      metric("difficulty_level", 2, "level", 120, 1),
    ],
    auditEvidence: {
      auditLogIds: ["audit_session_start_001", "audit_result_submit_001"],
      requiredActions: ["training_session.start", "training_result.submit"],
      checkedAt: "2026-05-24T10:05:00.000Z",
    },
    artifacts: {
      screenshots: [
        {
          label: "Unity 训练完成页",
          path: "evidence/unity/session-real-001-complete.png",
          capturedAt: "2026-05-24T10:03:00.000Z",
        },
      ],
      recordings: [
        {
          label: "Unity 训练过程录屏",
          path: "evidence/unity/session-real-001-recording.mp4",
          capturedAt: "2026-05-24T10:03:30.000Z",
        },
      ],
    },
  };

  return deepMerge(input, overrides);
}

function metric(
  metricType: string,
  metricValue: number,
  unit: string,
  sampleCount: number,
  confidence: number,
) {
  return {
    metricType,
    metricValue,
    unit,
    sampleCount,
    confidence,
    qualityFlag: "valid",
    windowStartedAt: "2026-05-24T09:59:00.000Z",
    windowEndedAt: "2026-05-24T10:02:00.000Z",
  };
}

function dynamicDifficultyEvidence() {
  return {
    schemaVersion: "1.0.0",
    events: [
      {
        startingLevel: 2,
        startingLevelSource: "clinician_approved_plan",
        approvedPlanItemId: "plan_item_real_001",
        assessmentSourceId: "assessment_real_001",
        triggerReason: "prior_assessment",
        before: { speed: 1, complexityLevel: 2 },
        after: { speed: 1, complexityLevel: 2 },
        adjustedAt: "2026-05-24T10:01:00.000Z",
        runtimeFrameId: "run_unity_real_001:frame:7200",
        runtimeWindowId:
          "run_unity_real_001:runtime-window:0:2026-05-24T09:59:00.000Z-2026-05-24T10:01:00.000Z",
        safetyClampReason: "clinician_limit:no_runtime_change",
      },
    ],
  };
}

function deepMerge<T>(base: T, overrides: DeepPartial<T>): T {
  const result = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    const current = result[key];
    result[key] =
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current &&
      typeof current === "object" &&
      !Array.isArray(current)
        ? deepMerge(current, value as Record<string, unknown>)
        : value;
  }
  return result as T;
}

test("buildUnityFieldEvidence returns a complete Unity field evidence document", () => {
  const result = buildUnityFieldEvidence(validInput());

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evidence.evidenceVersion, "unity-field-acceptance/v1");
  assert.equal(result.evidence.unityRuntime.runtimeType, "unity_webgl");
  assert.equal(result.evidence.trainingResult.source, "unity_webgl");
});

test("buildUnityFieldEvidenceInputFromRecord maps a stored Unity training record into evidence input", () => {
  const input = validInput();
  const result = buildUnityFieldEvidenceInputFromRecord({
    acceptance: input.acceptance,
    browser: input.browser,
    device: input.device,
    unityRuntime: {
      ...input.unityRuntime,
      manifestUrl: "/unity/rhythm_reach_3d/0.1.0/manifest.json",
      buildBaseUrl: "/unity/rhythm_reach_3d/0.1.0",
    },
    patient: input.patient,
    gameContent: {
      id: input.gameContent.gameContentId,
      code: input.gameContent.code,
      name: input.gameContent.name,
      runtimeType: input.gameContent.runtimeType,
      gameVersion: input.gameContent.gameVersion,
      bridgeProtocolVersion: input.gameContent.bridgeProtocolVersion,
      releaseChannel: input.gameContent.releaseChannel,
      buildStatus: input.gameContent.buildStatus,
      manifestUrl: "/unity/rhythm_reach_3d/0.1.0/manifest.json",
      buildBaseUrl: "/unity/rhythm_reach_3d/0.1.0",
    },
    rehabPlan: input.rehabPlan,
    trainingSession: {
      id: input.trainingSession.sessionId,
      collectionBatchId: input.trainingSession.collectionBatchId,
      gameRunId: input.trainingSession.gameRunId,
      deviceCode: input.trainingSession.deviceCode,
      sessionStatus: input.trainingSession.sessionStatus,
      syncStatus: input.trainingSession.syncStatus,
      calibrationStatus: input.trainingSession.calibrationStatus,
      clientStartedAt: input.trainingSession.clientStartedAt,
      clientEndedAt: input.trainingSession.clientEndedAt,
      runtimeConfigSnapshot: {
        ...input.trainingSession.runtimeConfigSnapshot,
        manifestUrl: "/unity/rhythm_reach_3d/0.1.0/manifest.json",
        buildBaseUrl: "/unity/rhythm_reach_3d/0.1.0",
      },
    },
    bridgeEvent: input.bridgeEvent,
    trainingResult: {
      id: input.trainingResult.resultId,
      collectionBatchId: input.trainingResult.collectionBatchId,
      source: input.trainingResult.source,
      gameRunId: input.trainingResult.gameRunId,
      gameVersion: input.trainingResult.gameVersion,
      bridgeProtocolVersion: input.trainingResult.bridgeProtocolVersion,
      clientGeneratedAt: input.trainingResult.clientGeneratedAt,
      rawPayloadHash: input.trainingResult.rawPayloadHash,
      submittedAt: input.trainingResult.submittedAt,
      qualityFlag: input.trainingResult.qualityFlag,
      abnormalFlag: input.trainingResult.abnormalFlag,
      score: input.trainingResult.score,
      completionRate: input.trainingResult.completionRate,
      durationSeconds: input.trainingResult.durationSeconds,
      reactionTimeMs: input.trainingResult.reactionTimeMs,
      motionAccuracy: input.trainingResult.motionAccuracy,
      exerciseIntensity: input.trainingResult.exerciseIntensity,
    },
    motionMetrics: input.motionMetrics,
    auditEvidence: input.auditEvidence,
    artifacts: input.artifacts,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    result.evidence.gameContent.gameContentId,
    input.gameContent.gameContentId,
  );
  const expectedBuildBaseUrl =
    "https://rehab.example.com/unity/rhythm_reach_3d/0.1.0";
  const expectedManifestUrl = `${expectedBuildBaseUrl}/manifest.json`;
  assert.equal(result.evidence.unityRuntime.manifestUrl, expectedManifestUrl);
  assert.equal(result.evidence.unityRuntime.buildBaseUrl, expectedBuildBaseUrl);
  assert.equal(result.evidence.gameContent.manifestUrl, expectedManifestUrl);
  assert.equal(result.evidence.gameContent.buildBaseUrl, expectedBuildBaseUrl);
  assert.equal(
    result.evidence.trainingSession.runtimeConfigSnapshot.manifestUrl,
    expectedManifestUrl,
  );
  assert.equal(
    result.evidence.trainingSession.runtimeConfigSnapshot.buildBaseUrl,
    expectedBuildBaseUrl,
  );
  assert.equal(
    result.evidence.bridgeEvent.rawPayloadHash,
    input.trainingResult.rawPayloadHash,
  );
});

test("buildUnityFieldEvidenceInputFromRecord rejects non-array stored motion metrics without throwing", () => {
  const input = validInput();
  const result = buildUnityFieldEvidenceInputFromRecord({
    acceptance: input.acceptance,
    browser: input.browser,
    device: input.device,
    unityRuntime: input.unityRuntime,
    patient: input.patient,
    gameContent: {
      id: input.gameContent.gameContentId,
      code: input.gameContent.code,
      name: input.gameContent.name,
      runtimeType: input.gameContent.runtimeType,
      gameVersion: input.gameContent.gameVersion,
      bridgeProtocolVersion: input.gameContent.bridgeProtocolVersion,
      releaseChannel: input.gameContent.releaseChannel,
      buildStatus: input.gameContent.buildStatus,
      manifestUrl: input.gameContent.manifestUrl,
      buildBaseUrl: input.gameContent.buildBaseUrl,
    },
    rehabPlan: input.rehabPlan,
    trainingSession: {
      id: input.trainingSession.sessionId,
      collectionBatchId: input.trainingSession.collectionBatchId,
      gameRunId: input.trainingSession.gameRunId,
      deviceCode: input.trainingSession.deviceCode,
      sessionStatus: input.trainingSession.sessionStatus,
      syncStatus: input.trainingSession.syncStatus,
      calibrationStatus: input.trainingSession.calibrationStatus,
      clientStartedAt: input.trainingSession.clientStartedAt,
      clientEndedAt: input.trainingSession.clientEndedAt,
      runtimeConfigSnapshot: input.trainingSession.runtimeConfigSnapshot,
    },
    bridgeEvent: input.bridgeEvent,
    trainingResult: {
      id: input.trainingResult.resultId,
      collectionBatchId: input.trainingResult.collectionBatchId,
      source: input.trainingResult.source,
      gameRunId: input.trainingResult.gameRunId,
      gameVersion: input.trainingResult.gameVersion,
      bridgeProtocolVersion: input.trainingResult.bridgeProtocolVersion,
      clientGeneratedAt: input.trainingResult.clientGeneratedAt,
      rawPayloadHash: input.trainingResult.rawPayloadHash,
      submittedAt: input.trainingResult.submittedAt,
      qualityFlag: input.trainingResult.qualityFlag,
      abnormalFlag: input.trainingResult.abnormalFlag,
      score: input.trainingResult.score,
      completionRate: input.trainingResult.completionRate,
      durationSeconds: input.trainingResult.durationSeconds,
      reactionTimeMs: input.trainingResult.reactionTimeMs,
      motionAccuracy: input.trainingResult.motionAccuracy,
      exerciseIntensity: input.trainingResult.exerciseIntensity,
    },
    motionMetrics: { not: "array" } as unknown as unknown[],
    auditEvidence: input.auditEvidence,
    artifacts: input.artifacts,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /motionMetrics/);
});

test("buildUnityFieldEvidence keeps abnormal review audits out of formal field acceptance", () => {
  const result = buildUnityFieldEvidence(
    validInput({
      auditEvidence: {
        auditLogIds: [
          "audit_session_start_001",
          "audit_result_submit_001",
          "audit_result_review_001",
        ],
        requiredActions: [
          "training_session.start",
          "training_result.submit",
          "training_result.review",
        ],
      },
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /training_result\.review/);
  assert.match(result.error, /verify:contracts/);
});

test("buildUnityFieldEvidence rejects extra audit actions from formal field acceptance", () => {
  const result = buildUnityFieldEvidence(
    validInput({
      auditEvidence: {
        auditLogIds: [
          "audit_session_start_001",
          "audit_result_submit_001",
          "audit_result_approve_001",
        ],
        requiredActions: [
          "training_session.start",
          "training_result.submit",
          "training_result.approve",
        ],
      },
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /requiredActions/);
  assert.match(result.error, /只能包含/);
  assert.match(result.error, /training_result\.approve/);
});

test("buildUnityFieldEvidence rejects formal fake data markers anywhere", () => {
  const result = buildUnityFieldEvidence(
    validInput({
      patient: { patientId: "patient_seed_001" },
      gameContent: { code: "unity_demo_manual_training" },
      trainingSession: { gameRunId: "run_mock_fixed_001" },
      artifacts: {
        screenshots: [
          {
            label: "fallback screenshot",
            path: "evidence/unity/session-real-001-complete.png",
            capturedAt: "2026-05-24T10:03:00.000Z",
          },
        ],
      },
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /mock\/demo\/seed\/fallback\/fixed\/manual/);
});

test("buildUnityFieldEvidence rejects sensitive fields and raw payload material", () => {
  const result = buildUnityFieldEvidence(
    validInput({
      bridgeEvent: {
        extra: {
          accessToken: "short-token",
          responseBody: { accepted: true },
          raw: "short-raw",
          payload: "short-payload",
          imageBase64:
            "Zm9ybWFsLXVuaXR5LXJhdw==Zm9ybWFsLXVuaXR5LXJhdw==Zm9ybWFsLXVuaXR5LXJhdw==",
        },
      } as DeepPartial<UnityFieldEvidenceInput["bridgeEvent"]>,
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /accessToken/);
  assert.match(result.error, /responseBody/);
  assert.match(result.error, /raw/);
  assert.match(result.error, /payload/);
  assert.match(result.error, /imageBase64/);
  assert.doesNotMatch(result.error, /short-token|short-raw|short-payload/);
});

test("buildUnityFieldEvidence rejects runtime and bridge mismatches", () => {
  const result = buildUnityFieldEvidence(
    validInput({
      unityRuntime: {
        manifestUrl: "https://rehab.example.com/unity/other/manifest.json",
      },
      bridgeEvent: {
        gameRunId: "different-run",
      },
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /manifestUrl/);
  assert.match(result.error, /bridgeEvent\.gameRunId/);
});

test("buildUnityFieldEvidence rejects broken v2 contract, batch, and prescription chains", () => {
  const result = buildUnityFieldEvidence(
    validInput({
      rehabPlan: { durationMinutes: 4 },
      trainingSession: {
        collectionBatchId: "other_collection_batch",
        runtimeConfigSnapshot: {
          resultContractVersion: "rehab-unity-result-v1",
        },
      },
      bridgeEvent: {
        durationSeconds: 120,
      },
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /resultContractVersion/);
  assert.match(result.error, /collectionBatchId/);
  assert.match(result.error, /durationMinutes/);
});

test("buildUnityFieldEvidence rejects Unity URLs outside the acceptance page origin", () => {
  const result = buildUnityFieldEvidence(
    validInput({
      unityRuntime: {
        manifestUrl:
          "https://cdn.example.com/unity/rhythm_reach_3d/0.1.0/manifest.json",
        buildBaseUrl: "https://cdn.example.com/unity/rhythm_reach_3d/0.1.0",
      },
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /验收页面同源/);
});

test("buildUnityFieldEvidence rejects placeholders, non-production content, unsynced sessions, and missing artifacts", () => {
  const result = buildUnityFieldEvidence(
    validInput({
      browser: { pageUrl: "http://rehab.example.com/training/unity" },
      acceptance: { testerName: "<现场验收员>" },
      gameContent: {
        releaseChannel: "staging",
        buildStatus: "validating",
      },
      trainingSession: {
        sessionStatus: "running",
        syncStatus: "pending",
      },
      artifacts: {
        screenshots: [],
        recordings: [],
      },
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /HTTPS/);
  assert.match(result.error, /占位符/);
  assert.match(result.error, /releaseChannel/);
  assert.match(result.error, /buildStatus/);
  assert.match(result.error, /sessionStatus/);
  assert.match(result.error, /syncStatus/);
  assert.match(result.error, /screenshots/);
  assert.match(result.error, /recordings/);
});

test("buildUnityFieldEvidence rejects runtime snapshot, timestamp, and hash mismatches", () => {
  const result = buildUnityFieldEvidence(
    validInput({
      trainingSession: {
        runtimeConfigSnapshot: {
          gameVersion: "0.2.0",
        },
      },
      bridgeEvent: {
        clientGeneratedAt: "2026-05-24T10:02:01.000Z",
        rawPayloadHash: "sha256:8f83b1657ff1fc53b92dc18148a1d65dfa1355f7e",
      },
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /runtimeConfigSnapshot\.gameVersion/);
  assert.match(result.error, /bridgeEvent\.clientGeneratedAt/);
  assert.match(result.error, /bridgeEvent\.rawPayloadHash/);
});

test("buildUnityFieldEvidence rejects invalid numeric ranges and metric quality", () => {
  const result = buildUnityFieldEvidence(
    validInput({
      unityRuntime: { devicePixelRatio: 0 },
      trainingResult: {
        score: 101,
        completionRate: 1.2,
        durationSeconds: 0,
        reactionTimeMs: -1,
        motionAccuracy: -0.1,
      },
      motionMetrics: [
        {
          ...metric("reaction_stability", Number.NaN, "ratio", 0, 1.5),
          qualityFlag: "suspect",
        },
      ],
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /devicePixelRatio/);
  assert.match(result.error, /score/);
  assert.match(result.error, /completionRate/);
  assert.match(result.error, /durationSeconds/);
  assert.match(result.error, /reactionTimeMs/);
  assert.match(result.error, /motionAccuracy/);
  assert.match(result.error, /metricValue/);
  assert.match(result.error, /confidence/);
  assert.match(result.error, /sampleCount/);
  assert.match(result.error, /qualityFlag/);
});

test("buildUnityFieldEvidence returns structured failures for malformed runtime input instead of throwing", () => {
  const result = buildUnityFieldEvidence({
    ...validInput(),
    acceptance: undefined,
    browser: "not-browser-object",
    motionMetrics: "not-motion-metric-array",
    artifacts: undefined,
  } as unknown as UnityFieldEvidenceInput);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /acceptance/);
  assert.match(result.error, /browser/);
  assert.match(result.error, /motionMetrics/);
  assert.match(result.error, /artifacts/);
});

test("unity field acceptance command includes JSON self-check and read-only API verification", () => {
  const command = unityFieldAcceptanceCommand("<evidence-json-path>");

  assert.match(command, /pnpm verify:unity-field-evidence/);
  assert.match(command, /pnpm verify:unity-field-acceptance/);
  assert.match(command, /--api-base-url <正式 API 地址>/);
  assert.match(command, /UNITY_FIELD_PATIENT_ACCOUNT='<训练记录读取账号>'/);
  assert.match(command, /UNITY_FIELD_PATIENT_PASSWORD='<训练记录读取密码>'/);
  assert.match(command, /UNITY_FIELD_AUDIT_ACCOUNT='<审计读取账号>'/);
  assert.match(command, /UNITY_FIELD_AUDIT_PASSWORD='<审计读取密码>'/);
  assert.doesNotMatch(command, /--patient-token|--audit-token/);
});
