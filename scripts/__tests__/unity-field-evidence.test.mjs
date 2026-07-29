import test from "node:test";
import assert from "node:assert/strict";
import { validateUnityFieldEvidence } from "../verify-unity-field-evidence.mjs";

function validEvidence(overrides = {}) {
  return deepMerge(
    {
      evidenceVersion: "unity-field-acceptance/v1",
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
        metric("arm_raise_accuracy", 0.88, "ratio", 120, 0.94),
        metric("reaction_stability", 0.82, "ratio", 120, 0.91),
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
    },
    overrides,
  );
}

function metric(metricType, metricValue, unit, sampleCount, confidence) {
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
        adjustedAt: "2026-05-24T10:02:00.000Z",
        runtimeFrameId: "run_unity_real_001:frame:7200",
        runtimeWindowId: "run_unity_real_001:window:session",
        safetyClampReason: "clinician_limit:no_runtime_change",
      },
    ],
  };
}

test("Unity field evidence accepts complete real WebGL acceptance data", () => {
  const result = validateUnityFieldEvidence(validEvidence());

  assert.deepEqual(result.failures, []);
});

test("Unity field evidence rejects non Unity runtime and demo sources", () => {
  const evidence = validEvidence({
    gameContent: {
      runtimeType: "browser_pose_canvas",
    },
    trainingResult: {
      source: "unity_webgl_mock",
    },
  });

  const result = validateUnityFieldEvidence(evidence);
  const failures = result.failures.join("\n");

  assert.match(failures, /unity_webgl/);
  assert.match(failures, /mock\/demo\/seed\/fallback\/fixed\/manual/);
  assert.doesNotMatch(failures, /不能包含 demo\/mock。/);
});

test("Unity field evidence rejects demo, mock, seed, fallback, fixed, and manual markers anywhere", () => {
  const evidence = validEvidence({
    patient: {
      patientId: "patient_seed_001",
    },
    gameContent: {
      code: "unity_demo_manual_training",
    },
    trainingSession: {
      gameRunId: "run_mock_fixed_001",
    },
    artifacts: {
      screenshots: [
        {
          label: "fallback screenshot",
          path: "evidence/unity/session-real-001-complete.png",
          capturedAt: "2026-05-24T10:03:00.000Z",
        },
      ],
    },
  });

  const result = validateUnityFieldEvidence(evidence);

  assert.match(
    result.failures.join("\n"),
    /mock\/demo\/seed\/fallback\/fixed\/manual/,
  );
});

test("Unity field evidence rejects sensitive fields and raw payload material anywhere", () => {
  const evidence = validEvidence({
    bridgeEvent: {
      extra: {
        accessToken: "short-token",
        responseBody: { accepted: true },
        raw: "short-raw",
        payload: "short-payload",
        imageBase64:
          "Zm9ybWFsLXVuaXR5LXJhdw==Zm9ybWFsLXVuaXR5LXJhdw==Zm9ybWFsLXVuaXR5LXJhdw==",
      },
    },
  });

  const result = validateUnityFieldEvidence(evidence);
  const failures = result.failures.join("\n");

  assert.match(failures, /accessToken/);
  assert.match(failures, /responseBody/);
  assert.match(failures, /raw/);
  assert.match(failures, /payload/);
  assert.match(failures, /imageBase64/);
  assert.doesNotMatch(failures, /short-token|short-raw|short-payload/);
});

test("Unity field evidence requires manifest under build base URL and production release", () => {
  const evidence = validEvidence({
    unityRuntime: {
      manifestUrl: "https://cdn.example.com/other/manifest.json",
    },
    gameContent: {
      buildStatus: "pending_assets",
      releaseChannel: "development",
    },
  });

  const result = validateUnityFieldEvidence(evidence);

  assert.match(result.failures.join("\n"), /manifestUrl/);
  assert.match(result.failures.join("\n"), /released/);
  assert.match(result.failures.join("\n"), /production/);
});

test("Unity field evidence requires bridge event and result identity to match", () => {
  const evidence = validEvidence({
    bridgeEvent: {
      gameRunId: "different_run",
    },
  });

  const result = validateUnityFieldEvidence(evidence);

  assert.match(result.failures.join("\n"), /bridgeEvent\.gameRunId/);
});

test("Unity field evidence rejects review audit actions from formal field acceptance", () => {
  const evidence = validEvidence({
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
      checkedAt: "2026-05-24T10:05:00.000Z",
    },
  });

  const result = validateUnityFieldEvidence(evidence);
  const failures = result.failures.join("\n");

  assert.match(failures, /training_result\.review/);
  assert.match(failures, /verify:contracts/);
});

test("Unity field evidence rejects extra audit actions from formal field acceptance", () => {
  const evidence = validEvidence({
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
      checkedAt: "2026-05-24T10:05:00.000Z",
    },
  });

  const result = validateUnityFieldEvidence(evidence);
  const failures = result.failures.join("\n");

  assert.match(failures, /requiredActions/);
  assert.match(failures, /只能包含/);
  assert.match(failures, /training_result\.approve/);
});

test("Unity field evidence requires exactly two unique audit IDs and exactly the two unique actions", () => {
  const duplicateIds = validateUnityFieldEvidence(
    validEvidence({
      auditEvidence: {
        auditLogIds: ["audit_session_start_001", "audit_session_start_001"],
      },
    }),
  );
  assert.match(duplicateIds.failures.join("\n"), /auditLogIds.*恰好两个且唯一/);

  const duplicateActions = validateUnityFieldEvidence(
    validEvidence({
      auditEvidence: {
        requiredActions: ["training_session.start", "training_session.start"],
      },
    }),
  );
  assert.match(
    duplicateActions.failures.join("\n"),
    /requiredActions.*恰好包含且唯一/,
  );

  const extraId = validateUnityFieldEvidence(
    validEvidence({
      auditEvidence: {
        auditLogIds: [
          "audit_session_start_001",
          "audit_result_submit_001",
          "audit_unrelated_001",
        ],
      },
    }),
  );
  assert.match(extraId.failures.join("\n"), /auditLogIds.*恰好两个且唯一/);
});

test("Unity field evidence requires result contract and collection batch identity everywhere", () => {
  const evidence = validEvidence({
    trainingSession: {
      runtimeConfigSnapshot: {
        resultContractVersion: "rehab-unity-result-v1",
      },
    },
    bridgeEvent: {
      collectionBatchId: "collection_batch_other",
      metricsSummary: {
        resultContractVersion: "rehab-unity-result-v1",
      },
    },
  });

  const result = validateUnityFieldEvidence(evidence);
  const failures = result.failures.join("\n");

  assert.match(failures, /resultContractVersion 必须是 rehab-unity-result-v2/);
  assert.match(failures, /collectionBatchId.*必须一致/);
});

test("Unity field evidence requires complete dynamic difficulty facts", () => {
  const evidence = validEvidence();
  delete evidence.bridgeEvent.metricsSummary.dynamicDifficultyEvidence.events[0]
    .safetyClampReason;
  evidence.bridgeEvent.metricsSummary.dynamicDifficultyEvidence.events[0].runtimeFrameId =
    "different_run:frame:1";

  const result = validateUnityFieldEvidence(evidence);
  const failures = result.failures.join("\n");

  assert.match(failures, /safetyClampReason/);
  assert.match(failures, /runtimeFrameId.*gameRunId/);
});

test("Unity field evidence requires explicit metric quality fields", () => {
  const evidence = validEvidence();
  delete evidence.motionMetrics[0].confidence;
  delete evidence.motionMetrics[0].sampleCount;
  delete evidence.motionMetrics[0].qualityFlag;

  const result = validateUnityFieldEvidence(evidence);
  const failures = result.failures.join("\n");

  assert.match(failures, /arm_raise_accuracy\.confidence/);
  assert.match(failures, /arm_raise_accuracy\.sampleCount/);
  assert.match(failures, /arm_raise_accuracy\.qualityFlag/);
});

test("Unity field evidence binds plan minutes to every runtime duration fact", () => {
  const evidence = validEvidence({
    trainingSession: {
      runtimeConfigSnapshot: { durationSeconds: 179 },
    },
    bridgeEvent: { durationSeconds: 181 },
    trainingResult: { durationSeconds: 182 },
  });

  const result = validateUnityFieldEvidence(evidence);
  const failures = result.failures.join("\n");

  assert.match(
    failures,
    /durationMinutes.*runtimeConfigSnapshot\.durationSeconds/,
  );
  assert.match(failures, /durationMinutes.*bridgeEvent\.durationSeconds/);
  assert.match(failures, /durationMinutes.*trainingResult\.durationSeconds/);
});

test("Unity field evidence rejects unresolved placeholders", () => {
  const evidence = validEvidence({
    unityRuntime: {
      manifestUrl: "https://rehab.example.com/unity/<game-code>/manifest.json",
    },
  });

  const result = validateUnityFieldEvidence(evidence);

  assert.match(result.failures.join("\n"), /占位符/);
});

function deepMerge(base, overrides) {
  if (!isPlainObject(base) || !isPlainObject(overrides))
    return overrides ?? base;
  const output = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    output[key] = deepMerge(base[key], value);
  }
  return output;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
