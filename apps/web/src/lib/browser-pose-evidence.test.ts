import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBrowserPoseEvidence,
  browserPoseFieldAcceptanceCommand,
  type BrowserPoseEvidenceInput,
} from "./browser-pose-evidence.ts";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

function validInput(overrides: DeepPartial<BrowserPoseEvidenceInput> = {}) {
  const input: BrowserPoseEvidenceInput = {
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
      cameraDeviceIdHash: "fnv1a-12345678",
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
      rawPayloadHash: "fnv1a-abcdef12",
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
    windowStartedAt: "2026-05-23T09:59:00.000Z",
    windowEndedAt: "2026-05-23T10:02:00.000Z",
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

test("buildBrowserPoseEvidence returns a complete field evidence document", () => {
  const result = buildBrowserPoseEvidence(validInput());

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evidence.evidenceVersion, "browser-pose-field-acceptance/v1");
  assert.equal(result.evidence.trainingResult.source, "browser_pose_game");
  assert.equal(result.evidence.trainingSession.gameRunId, "run_real_001");
  assert.equal(result.evidence.motionMetrics.length, 4);
});

test("buildBrowserPoseEvidence rejects missing explicit site evidence", () => {
  const result = buildBrowserPoseEvidence(
    validInput({
      acceptance: { siteName: "" },
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /siteName/);
});

test("buildBrowserPoseEvidence rejects missing required motion metric", () => {
  const result = buildBrowserPoseEvidence(
    validInput({
      motionMetrics: [
        metric("reaction_time_ms", 760, "ms", 24, 0.91),
        metric("target_hit_rate", 0.88, "ratio", 24, 0.89),
        metric("pose_visibility_avg", 0.86, "ratio", 1200, 0.93),
      ],
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /arm_raise_accuracy/);
});

test("buildBrowserPoseEvidence rejects session and result run mismatch", () => {
  const result = buildBrowserPoseEvidence(
    validInput({
      trainingResult: { gameRunId: "different-run" },
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /gameRunId/);
});

test("browser pose field acceptance command includes JSON self-check and read-only API verification", () => {
  const command = browserPoseFieldAcceptanceCommand("<evidence-json-path>");

  assert.match(command, /pnpm verify:browser-pose-evidence/);
  assert.match(command, /pnpm verify:browser-pose-field-acceptance/);
  assert.match(command, /--api-base-url <正式 API 地址>/);
  assert.match(command, /--patient-token <训练记录读取 token>/);
  assert.match(command, /--audit-token <审计读取 token>/);
});
