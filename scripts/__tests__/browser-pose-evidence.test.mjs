import test from "node:test";
import assert from "node:assert/strict";
import { validateBrowserPoseEvidence } from "../verify-browser-pose-evidence.mjs";

function validEvidence(overrides = {}) {
  return {
    evidenceVersion: "browser-pose-field-acceptance/v1",
    acceptance: {
      acceptedAt: "2026-05-23T10:00:00.000Z",
      testerName: "现场验收员",
      siteName: "康复中心试点现场",
      environment: "trial",
    },
    browser: {
      name: "Chrome",
      version: "126.0.0.0",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
      pageUrl: "https://rehab.example.com/training",
    },
    device: {
      deviceCode: "trial-room-a-camera-01",
      cameraLabel: "Logitech HD Webcam C920",
      cameraDeviceIdHash:
        "sha256:7f83b1657ff1fc53b92dc18148a1d65dfa1355f7e",
      resolution: "1280x720",
    },
    poseRuntime: {
      runtimeType: "browser_pose_canvas",
      modelName: "MediaPipe PoseLandmarker",
      modelVersion: "0.10.0",
      poseLandmarkCount: 33,
      checkedAt: "2026-05-23T09:58:00.000Z",
      averageVisibility: 0.86,
    },
    patient: {
      patientId: "patient_real_001",
      patientExportId: "patient_export_8a72",
    },
    gameContent: {
      gameContentId: "game_real_browser_pose_001",
      code: "upper-limb-reach-v1",
      name: "上肢触达反应训练",
      runtimeType: "browser_pose_canvas",
      gameVersion: "1.0.0",
      bridgeProtocolVersion: "1.0.0",
      releaseChannel: "production",
      buildStatus: "released",
    },
    rehabPlan: {
      rehabPlanId: "plan_real_001",
      planItemId: "plan_item_real_001",
      confirmedByDoctorId: "doctor_real_001",
      confirmedAt: "2026-05-22T08:00:00.000Z",
    },
    trainingSession: {
      sessionId: "session_real_001",
      gameRunId: "run_real_001",
      collectionBatchId: "batch_real_001",
      deviceCode: "trial-room-a-camera-01",
      sessionStatus: "completed",
      syncStatus: "synced",
      calibrationStatus: "checked",
      clientStartedAt: "2026-05-23T09:59:00.000Z",
      clientEndedAt: "2026-05-23T10:02:00.000Z",
    },
    trainingResult: {
      resultId: "result_real_001",
      source: "browser_pose_canvas",
      gameRunId: "run_real_001",
      collectionBatchId: "batch_real_001",
      gameVersion: "1.0.0",
      bridgeProtocolVersion: "1.0.0",
      rawPayloadHash:
        "sha256:7f83b1657ff1fc53b92dc18148a1d65dfa1355f7e",
      submittedAt: "2026-05-23T10:02:08.000Z",
      qualityFlag: "valid",
      abnormalFlag: false,
      score: 82,
      completionRate: 0.91,
      durationSeconds: 180,
      reactionTimeMs: 760,
      motionAccuracy: 0.84,
      exerciseIntensity: "moderate",
    },
    motionMetrics: [
      metric("reaction_time_ms", 760, "ms", 24, 0.91),
      metric("target_hit_rate", 0.88, "ratio", 24, 0.89),
      metric("pose_visibility_avg", 0.86, "ratio", 1200, 0.93),
      metric("arm_raise_accuracy", 0.82, "ratio", 24, 0.87),
    ],
    auditEvidence: {
      auditLogIds: ["audit_session_start_001", "audit_result_submit_001"],
      requiredActions: ["training_session.start", "training_result.submit"],
      checkedAt: "2026-05-23T10:05:00.000Z",
    },
    artifacts: {
      screenshots: [
        {
          label: "训练完成页",
          path: "evidence/browser-pose/session-real-001-complete.png",
          capturedAt: "2026-05-23T10:03:00.000Z",
        },
      ],
      recordings: [
        {
          label: "训练过程录屏",
          path: "evidence/browser-pose/session-real-001-recording.mp4",
          capturedAt: "2026-05-23T10:03:30.000Z",
        },
      ],
    },
    ...overrides,
  };
}

function metric(metricType, metricValue, unit, sampleCount, confidence) {
  return {
    metricType,
    collectionBatchId: "batch_real_001",
    metricValue,
    unit,
    sampleCount,
    confidence,
    qualityFlag: "valid",
    windowStartedAt: "2026-05-23T09:59:00.000Z",
    windowEndedAt: "2026-05-23T10:02:00.000Z",
  };
}

test("browser pose field evidence accepts complete real acceptance data", () => {
  const result = validateBrowserPoseEvidence(validEvidence());
  assert.deepEqual(result.failures, []);
});

test("browser pose field evidence rejects demo or mock result sources", () => {
  const evidence = validEvidence({
    trainingResult: {
      ...validEvidence().trainingResult,
      source: "browser_pose_canvas_mock",
    },
  });

  const result = validateBrowserPoseEvidence(evidence);
  const failures = result.failures.join("\n");

  assert.match(
    failures,
    /mock\/demo\/seed\/fallback\/fixed\/manual/,
  );
  assert.doesNotMatch(failures, /不能包含 demo\/mock。/);
});

test("browser pose field evidence rejects demo seed fallback fixed and manual markers anywhere", () => {
  const evidence = validEvidence({
    patient: {
      patientId: "patient_seed_001",
    },
    gameContent: {
      code: "manual_browser_pose_training",
    },
    trainingSession: {
      gameRunId: "run_fixed_001",
    },
    artifacts: {
      screenshots: [
        {
          label: "fallback screenshot",
          path: "evidence/browser/session-real-001-complete.png",
          capturedAt: "2026-05-23T10:03:00.000Z",
        },
      ],
    },
  });

  const result = validateBrowserPoseEvidence(evidence);

  assert.match(result.failures.join("\n"), /mock\/demo\/seed\/fallback\/fixed\/manual/);
});

test("browser pose field evidence rejects sensitive fields and raw payload material anywhere", () => {
  const evidence = validEvidence({
    trainingResult: {
      ...validEvidence().trainingResult,
      extra: {
        accessToken: "short-token",
        requestBody: { score: 82 },
        raw: "short-raw",
        payload: "short-payload",
        audioBase64:
          "Zm9ybWFsLXBvc2UtcmF3LXBheWxvYWRzZm9ybWFsLXBvc2UtcmF3LXBheWxvYWRz",
      },
    },
  });

  const result = validateBrowserPoseEvidence(evidence);
  const failures = result.failures.join("\n");

  assert.match(failures, /accessToken/);
  assert.match(failures, /requestBody/);
  assert.match(failures, /raw/);
  assert.match(failures, /payload/);
  assert.match(failures, /audioBase64/);
  assert.doesNotMatch(failures, /short-token|short-raw|short-payload/);
});

test("browser pose field evidence rejects generic camera authorization labels", () => {
  const evidence = validEvidence({
    device: {
      ...validEvidence().device,
      cameraLabel: "已授权摄像头",
    },
  });

  const result = validateBrowserPoseEvidence(evidence);

  assert.match(result.failures.join("\n"), /cameraLabel/);
  assert.match(result.failures.join("\n"), /真实摄像头/);
});

test("browser pose field evidence requires all four formal motion metrics", () => {
  const evidence = validEvidence({
    motionMetrics: validEvidence().motionMetrics.filter(
      (item) => item.metricType !== "arm_raise_accuracy",
    ),
  });

  const result = validateBrowserPoseEvidence(evidence);

  assert.match(result.failures.join("\n"), /arm_raise_accuracy/);
});

test("browser pose field evidence requires matching session and result run identity", () => {
  const evidence = validEvidence({
    trainingResult: {
      ...validEvidence().trainingResult,
      gameRunId: "different_run",
    },
  });

  const result = validateBrowserPoseEvidence(evidence);

  assert.match(result.failures.join("\n"), /gameRunId/);
});

test("browser pose field evidence requires explicit collection batch ids on session result and metrics", () => {
  const base = validEvidence();
  const { collectionBatchId: _sessionBatchId, ...trainingSession } =
    base.trainingSession;
  const { collectionBatchId: _resultBatchId, ...trainingResult } =
    base.trainingResult;
  const motionMetrics = base.motionMetrics.map(
    ({ collectionBatchId: _metricBatchId, ...metricItem }) => metricItem,
  );
  const evidence = validEvidence({
    trainingSession,
    trainingResult,
    motionMetrics,
  });

  const result = validateBrowserPoseEvidence(evidence);
  const failures = result.failures.join("\n");

  assert.match(failures, /trainingSession\.collectionBatchId/);
  assert.match(failures, /trainingResult\.collectionBatchId/);
  assert.match(failures, /motionMetrics\.collectionBatchId/);
});

test("browser pose field evidence rejects inconsistent collection batch ids", () => {
  const base = validEvidence();
  const evidence = validEvidence({
    trainingResult: {
      ...base.trainingResult,
      collectionBatchId: "batch_other_result",
    },
    motionMetrics: base.motionMetrics.map((metricItem, index) =>
      index === 0
        ? { ...metricItem, collectionBatchId: "batch_other_metric" }
        : metricItem,
    ),
  });

  const result = validateBrowserPoseEvidence(evidence);
  const failures = result.failures.join("\n");

  assert.match(failures, /collectionBatchId/);
});

test("browser pose field evidence rejects missing screenshots and audit actions", () => {
  const evidence = validEvidence({
    artifacts: { screenshots: [], recordings: [] },
    auditEvidence: {
      auditLogIds: ["audit_result_submit_001"],
      requiredActions: ["training_result.submit"],
      checkedAt: "2026-05-23T10:05:00.000Z",
    },
  });

  const result = validateBrowserPoseEvidence(evidence);

  assert.match(result.failures.join("\n"), /截图/);
  assert.match(result.failures.join("\n"), /training_session.start/);
});

test("browser pose field evidence rejects review audit actions from formal field acceptance", () => {
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
      checkedAt: "2026-05-23T10:05:00.000Z",
    },
  });

  const result = validateBrowserPoseEvidence(evidence);
  const failures = result.failures.join("\n");

  assert.match(failures, /training_result\.review/);
  assert.match(failures, /verify:contracts/);
});

test("browser pose field evidence rejects extra audit actions from formal field acceptance", () => {
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
      checkedAt: "2026-05-23T10:05:00.000Z",
    },
  });

  const result = validateBrowserPoseEvidence(evidence);
  const failures = result.failures.join("\n");

  assert.match(failures, /requiredActions/);
  assert.match(failures, /只能包含/);
  assert.match(failures, /training_result\.approve/);
});

test("browser pose field evidence rejects non-production game content", () => {
  const evidence = validEvidence({
    gameContent: {
      ...validEvidence().gameContent,
      releaseChannel: "staging",
    },
  });

  const result = validateBrowserPoseEvidence(evidence);
  const failures = result.failures.join("\n");

  assert.match(failures, /releaseChannel/);
  assert.match(failures, /production/);
});

test("browser pose field evidence rejects unresolved placeholders", () => {
  const evidence = validEvidence({
    device: {
      ...validEvidence().device,
      cameraDeviceIdHash: "sha256:<camera-device-id-hash>",
    },
  });

  const result = validateBrowserPoseEvidence(evidence);

  assert.match(result.failures.join("\n"), /占位符/);
});
