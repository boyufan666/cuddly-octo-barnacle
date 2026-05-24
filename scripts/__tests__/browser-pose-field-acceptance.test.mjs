import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { verifyBrowserPoseFieldAcceptance } from "../verify-browser-pose-field-acceptance.mjs";

const execFileAsync = promisify(execFile);

function validEvidence(overrides = {}) {
  return deepMerge(
    {
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
            path: "artifacts/session-real-001-complete.png",
            capturedAt: "2026-05-23T10:03:00.000Z",
          },
        ],
        recordings: [
          {
            label: "训练过程录屏",
            path: "artifacts/session-real-001-recording.mp4",
            capturedAt: "2026-05-23T10:03:30.000Z",
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
    windowStartedAt: "2026-05-23T09:59:00.000Z",
    windowEndedAt: "2026-05-23T10:02:00.000Z",
  };
}

test("field acceptance verifier accepts evidence that matches real artifact files, training API data, and audit API data", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com/api",
    patientToken: "patient-or-doctor-token",
    auditToken: "admin-audit-token",
    fetchImpl: createFetchImpl(evidence),
  });

  assert.deepEqual(result.failures, []);
});

test("field acceptance verifier uses the provided API base URL without inventing an api prefix", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const seenPaths = [];
  const fetchImpl = async (url, options) => {
    seenPaths.push(new URL(url).pathname);
    return createFetchImpl(evidence)(url, options);
  };

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    patientToken: "patient-or-doctor-token",
    auditToken: "admin-audit-token",
    fetchImpl,
  });

  assert.deepEqual(result.failures, []);
  assert.deepEqual(seenPaths, [
    `/patients/${evidence.patient.patientId}/training-records`,
    "/admin/audit-logs",
    "/admin/audit-logs",
  ]);
});

test("field acceptance verifier rejects missing or empty artifact files", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage({
    emptyRecording: true,
  });
  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com/api",
    patientToken: "patient-or-doctor-token",
    auditToken: "admin-audit-token",
    fetchImpl: createFetchImpl(evidence),
  });

  assert.match(result.failures.join("\n"), /附件文件为空/);
});

test("field acceptance verifier rejects API training records that do not match the evidence session and result", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.training.sessions[0].result.rawPayloadHash = "sha256:different";

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com/api",
    patientToken: "patient-or-doctor-token",
    auditToken: "admin-audit-token",
    fetchImpl: createFetchImpl(evidence, apiData),
  });

  assert.match(result.failures.join("\n"), /rawPayloadHash/);
});

test("field acceptance verifier rejects API result submittedAt that does not match evidence", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.training.sessions[0].result.submittedAt = "2026-05-23T10:04:08.000Z";

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    patientToken: "patient-or-doctor-token",
    auditToken: "admin-audit-token",
    fetchImpl: createFetchImpl(evidence, apiData),
  });

  assert.match(result.failures.join("\n"), /submittedAt/);
});

test("field acceptance verifier rejects API training response whose sessions field is not an array", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.training.sessions = {};

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    patientToken: "patient-or-doctor-token",
    auditToken: "admin-audit-token",
    fetchImpl: createFetchImpl(evidence, apiData),
  });

  assert.match(result.failures.join("\n"), /sessions 必须是数组/);
});

test("field acceptance verifier rejects artifact paths outside the evidence package directory", async () => {
  const evidence = validEvidence();
  const dir = await mkdtemp(join(tmpdir(), "browser-pose-field-outside-"));
  await mkdir(join(dir, "artifacts"), { recursive: true });
  const outsideFile = `${dir}-outside.png`;
  await writeFile(outsideFile, "outside");
  evidence.artifacts.screenshots[0].path = "../" + outsideFile.split("/").at(-1);
  await writeFile(join(dir, evidence.artifacts.recordings[0].path), "mp4");
  const evidencePath = join(dir, "evidence.json");
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    patientToken: "patient-or-doctor-token",
    auditToken: "admin-audit-token",
    fetchImpl: createFetchImpl(evidence),
  });

  assert.match(result.failures.join("\n"), /必须位于 evidence JSON 所在目录/);
});

test("field acceptance verifier rejects artifact symlinks that resolve outside the evidence package directory", async () => {
  const evidence = validEvidence();
  const dir = await mkdtemp(join(tmpdir(), "browser-pose-field-symlink-"));
  await mkdir(join(dir, "artifacts"), { recursive: true });
  const outsideFile = `${dir}-outside.png`;
  await writeFile(outsideFile, "outside");
  await symlink(outsideFile, join(dir, evidence.artifacts.screenshots[0].path));
  await writeFile(join(dir, evidence.artifacts.recordings[0].path), "mp4");
  const evidencePath = join(dir, "evidence.json");
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    patientToken: "patient-or-doctor-token",
    auditToken: "admin-audit-token",
    fetchImpl: createFetchImpl(evidence),
  });

  assert.match(result.failures.join("\n"), /真实路径必须位于 evidence JSON 所在目录/);
});

test("field acceptance verifier rejects audit logs whose ids, actions, target, and result do not match the evidence", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.audit["training_result.submit"][0].id = "audit_different";

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com/api",
    patientToken: "patient-or-doctor-token",
    auditToken: "admin-audit-token",
    fetchImpl: createFetchImpl(evidence, apiData),
  });

  assert.match(result.failures.join("\n"), /auditLogIds/);
});

test("field acceptance verifier matches audit log ids by action without requiring evidence array order", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage({
    evidenceOverrides: {
      auditEvidence: {
        auditLogIds: ["audit_result_submit_001", "audit_session_start_001"],
      },
    },
  });

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    patientToken: "patient-or-doctor-token",
    auditToken: "admin-audit-token",
    fetchImpl: createFetchImpl(evidence),
  });

  assert.deepEqual(result.failures, []);
});

test("field acceptance verifier requires explicit API URL and read tokens", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    fetchImpl: createFetchImpl(evidence),
  });

  assert.match(result.failures.join("\n"), /apiBaseUrl/);
  assert.match(result.failures.join("\n"), /patientToken/);
  assert.match(result.failures.join("\n"), /auditToken/);
});

test("field acceptance verifier rejects blank tokens and invalid API URL before calling API", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://[invalid",
    patientToken: "   ",
    auditToken: "\t",
    fetchImpl: createFetchImpl(evidence),
  });

  assert.match(result.failures.join("\n"), /apiBaseUrl/);
  assert.match(result.failures.join("\n"), /patientToken/);
  assert.match(result.failures.join("\n"), /auditToken/);
});

test("field acceptance verifier reports missing evidence path instead of throwing while checking artifacts", async () => {
  const evidence = validEvidence();

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    apiBaseUrl: "https://rehab.example.com",
    patientToken: "patient-or-doctor-token",
    auditToken: "admin-audit-token",
    fetchImpl: createFetchImpl(evidence),
  });

  assert.match(result.failures.join("\n"), /evidencePath/);
});

test("field acceptance CLI reports invalid JSON without printing a stack trace", async () => {
  const dir = await mkdtemp(join(tmpdir(), "browser-pose-field-bad-json-"));
  const evidencePath = join(dir, "bad-evidence.json");
  await writeFile(evidencePath, "{not-json");

  await assert.rejects(
    () =>
      execFileAsync("node", [
        "scripts/verify-browser-pose-field-acceptance.mjs",
        evidencePath,
        "--api-base-url",
        "https://rehab.example.com",
        "--patient-token",
        "patient-token",
        "--audit-token",
        "audit-token",
      ]),
    (error) => {
      assert.match(error.stderr, /证据文件不是有效 JSON/);
      assert.doesNotMatch(error.stderr, /SyntaxError|at JSON\.parse/);
      return true;
    },
  );
});

async function prepareEvidencePackage(options = {}) {
  const evidence = validEvidence(options.evidenceOverrides);
  const dir = await mkdtemp(join(tmpdir(), "browser-pose-field-"));
  await mkdir(join(dir, "artifacts"), { recursive: true });
  await writeFile(join(dir, evidence.artifacts.screenshots[0].path), "png");
  await writeFile(
    join(dir, evidence.artifacts.recordings[0].path),
    options.emptyRecording ? "" : "mp4",
  );
  const evidencePath = join(dir, "evidence.json");
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  return { evidence, evidencePath };
}

function createFetchImpl(evidence, apiData = createApiData(evidence)) {
  return async (url, options = {}) => {
    const parsed = new URL(url);
    const authorization = options.headers?.Authorization;
    if (!authorization?.startsWith("Bearer ")) {
      return response(401, { message: "missing token" });
    }

    if (
      parsed.pathname.endsWith(
        `/patients/${evidence.patient.patientId}/training-records`,
      )
    ) {
      return response(200, apiData.training);
    }

    if (parsed.pathname.endsWith("/admin/audit-logs")) {
      return response(
        200,
        apiData.audit[parsed.searchParams.get("action") ?? ""] ?? [],
      );
    }

    return response(404, { message: "not found" });
  };
}

function createApiData(evidence) {
  return {
    training: {
      sessions: [createTrainingSession(evidence)],
      summary: {
        totalSessions: 1,
        completedSessions: 1,
        averageScore: evidence.trainingResult.score,
        abnormalCount: 0,
      },
    },
    audit: {
      "training_session.start": [
        createAuditLog(evidence, "audit_session_start_001", "training_session.start"),
      ],
      "training_result.submit": [
        createAuditLog(evidence, "audit_result_submit_001", "training_result.submit"),
      ],
    },
  };
}

function createTrainingSession(evidence) {
  return {
    id: evidence.trainingSession.sessionId,
    patientId: evidence.patient.patientId,
    rehabPlanId: evidence.rehabPlan.rehabPlanId,
    planItemId: evidence.rehabPlan.planItemId,
    gameContentId: evidence.gameContent.gameContentId,
    gameRunId: evidence.trainingSession.gameRunId,
    clientStartedAt: evidence.trainingSession.clientStartedAt,
    clientEndedAt: evidence.trainingSession.clientEndedAt,
    deviceCode: evidence.trainingSession.deviceCode,
    calibrationStatus: evidence.trainingSession.calibrationStatus,
    sessionStatus: evidence.trainingSession.sessionStatus,
    syncStatus: evidence.trainingSession.syncStatus,
    gameContent: {
      id: evidence.gameContent.gameContentId,
      code: evidence.gameContent.code,
      name: evidence.gameContent.name,
      runtimeType: evidence.gameContent.runtimeType,
      gameVersion: evidence.gameContent.gameVersion,
      bridgeProtocolVersion: evidence.gameContent.bridgeProtocolVersion,
      releaseChannel: evidence.gameContent.releaseChannel,
      buildStatus: evidence.gameContent.buildStatus,
    },
    result: {
      id: evidence.trainingResult.resultId,
      source: evidence.trainingResult.source,
      gameRunId: evidence.trainingResult.gameRunId,
      gameVersion: evidence.trainingResult.gameVersion,
      bridgeProtocolVersion: evidence.trainingResult.bridgeProtocolVersion,
      rawPayloadHash: evidence.trainingResult.rawPayloadHash,
      submittedAt: evidence.trainingResult.submittedAt,
      qualityFlag: evidence.trainingResult.qualityFlag,
      abnormalFlag: evidence.trainingResult.abnormalFlag,
      score: evidence.trainingResult.score,
      completionRate: evidence.trainingResult.completionRate,
      durationSeconds: evidence.trainingResult.durationSeconds,
      reactionTimeMs: evidence.trainingResult.reactionTimeMs,
      motionAccuracy: evidence.trainingResult.motionAccuracy,
      exerciseIntensity: evidence.trainingResult.exerciseIntensity,
      metricsSummary: {
        source: evidence.trainingResult.source,
        gameRunId: evidence.trainingResult.gameRunId,
        gameVersion: evidence.trainingResult.gameVersion,
        protocolVersion: evidence.trainingResult.bridgeProtocolVersion,
        rawPayloadHash: evidence.trainingResult.rawPayloadHash,
      },
    },
    motionMetrics: evidence.motionMetrics.map((item) => ({
      ...item,
      trainingSessionId: evidence.trainingSession.sessionId,
      gameRunId: evidence.trainingSession.gameRunId,
      source: evidence.trainingResult.source,
    })),
  };
}

function createAuditLog(evidence, id, action) {
  return {
    id,
    action,
    targetType: "training_session",
    targetId: evidence.trainingSession.sessionId,
    result: "success",
  };
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function deepMerge(base, overrides) {
  if (!isPlainObject(base) || !isPlainObject(overrides)) return overrides ?? base;
  const output = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    output[key] = deepMerge(base[key], value);
  }
  return output;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
