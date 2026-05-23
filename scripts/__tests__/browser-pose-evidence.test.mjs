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
      runtimeType: "browser_pose_game",
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
      runtimeType: "browser_pose_game",
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
      deviceCode: "trial-room-a-camera-01",
      sessionStatus: "completed",
      syncStatus: "synced",
      calibrationStatus: "checked",
      clientStartedAt: "2026-05-23T09:59:00.000Z",
      clientEndedAt: "2026-05-23T10:02:00.000Z",
    },
    trainingResult: {
      resultId: "result_real_001",
      source: "browser_pose_game",
      gameRunId: "run_real_001",
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
      source: "browser_pose_game_mock",
    },
  });

  const result = validateBrowserPoseEvidence(evidence);

  assert.match(result.failures.join("\n"), /demo\/mock/);
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
