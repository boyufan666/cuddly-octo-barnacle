import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { verifyMultiConditionDataCapture } from "../verify-multi-condition-data-capture.mjs";

const execFileAsync = promisify(execFile);

function validEvidence(overrides = {}) {
  return deepMerge(
    {
      evidenceVersion: "multi-condition-data-capture/v1",
      acceptance: {
        acceptedAt: "2026-06-01T08:00:00.000Z",
        testerName: "验收员",
        siteName: "试点诊室",
        environment: "trial",
      },
      patient: {
        patientId: "patient-real-001",
        patientExportId: "patient-export-001",
      },
      expectedMetricTypes: [
        "trajectory_summary",
        "reaction_time_ms",
        "target_hit_rate",
        "pose_visibility_avg",
        "arm_raise_accuracy",
        "motion_intensity",
        "duration_seconds",
      ],
      physiologicalMetricsStatus: "customer-gated",
      conditions: [
        conditionEvidence({
          conditionCode: "clinic_light_standing_a",
          batchId: "collection-batch-a",
          sessionId: "session-a",
          resultId: "result-a",
          gameRunId: "run-a",
          deviceCode: "camera-a",
          lighting: "standard_clinic",
          distanceMeters: 1.5,
          poseVisibility: 0.9,
        }),
        conditionEvidence({
          conditionCode: "clinic_low_light_standing_b",
          batchId: "collection-batch-b",
          sessionId: "session-b",
          resultId: "result-b",
          gameRunId: "run-b",
          deviceCode: "camera-b",
          lighting: "low_light",
          distanceMeters: 1.8,
          poseVisibility: 0.82,
        }),
      ],
    },
    overrides,
  );
}

function conditionEvidence({
  conditionCode,
  batchId,
  sessionId,
  resultId,
  gameRunId,
  deviceCode,
  lighting,
  distanceMeters,
  poseVisibility,
}) {
  return {
    label: conditionCode,
    collectionCondition: {
      conditionId: `${conditionCode}-id`,
      code: conditionCode,
      name: `采集条件 ${conditionCode}`,
      environment: {
        lighting,
        posture: "standing",
        distanceMeters,
      },
      deviceRequirements: {
        camera: "front_rgb",
        minResolution: "720p",
      },
      taskParameters: {
        bodyScope: "upper_body",
        expectedDurationSeconds: 180,
      },
      qualityRules: {
        minPoseVisibility: 0.8,
      },
    },
    collectionProtocol: {
      protocolId: `${conditionCode}-protocol-id`,
      code: `${conditionCode}_protocol`,
      version: "1.0.0",
      runtimeType: "browser_pose_canvas",
      requiredInputModes: ["camera_pose"],
      requiredMetrics: [
        { metricType: "trajectory_summary", unit: "summary" },
        { metricType: "reaction_time_ms", unit: "ms" },
        { metricType: "target_hit_rate", unit: "ratio" },
        { metricType: "pose_visibility_avg", unit: "ratio" },
        { metricType: "arm_raise_accuracy", unit: "ratio" },
        { metricType: "motion_intensity", unit: "level" },
        { metricType: "duration_seconds", unit: "s" },
      ],
      samplingConfig: {
        sampleRateHz: 30,
        windowSeconds: 180,
      },
      qualityGate: {
        minPoseVisibility: 0.8,
      },
    },
    collectionBatch: {
      batchId,
      status: "ready",
      protocolVersion: "1.0.0",
    },
    gameContent: {
      gameContentId: "browser-pose-game-id",
      runtimeType: "browser_pose_canvas",
      gameVersion: "1.0.0",
      bridgeProtocolVersion: "1.0.0",
      buildStatus: "released",
      releaseChannel: "production",
    },
    rehabPlan: {
      rehabPlanId: "plan-real-001",
      planItemId: "plan-item-real-001",
    },
    trainingSession: {
      sessionId,
      gameRunId,
      deviceCode,
      sessionStatus: "completed",
      syncStatus: "synced",
      calibrationStatus: "checked",
      clientStartedAt: "2026-06-01T08:00:00.000Z",
      clientEndedAt: "2026-06-01T08:03:00.000Z",
    },
    trainingResult: {
      resultId,
      source: "browser_pose_canvas",
      qualityFlag: "valid",
      abnormalFlag: false,
      score: 88,
      completionRate: 0.9,
      durationSeconds: 180,
      reactionTimeMs: 760,
      motionAccuracy: 0.84,
      exerciseIntensity: "moderate",
      rawPayloadHash: `sha256:${"a".repeat(64)}`,
      metricsSummary: {
        trajectorySummary: {
          pathLengthMeters: 4.2,
          dominantPlane: "frontal",
          sampleCount: 120,
        },
        dynamicDifficultyEvidence: {
          events: [
            {
              triggerReason: "accuracy_high",
              safetyClampReason: "clinician_limit:no_change",
            },
          ],
        },
        physiologicalMetricsStatus: "customer-gated",
      },
    },
    motionMetrics: [
      metric("trajectory_summary", 4.2, "summary", gameRunId, poseVisibility),
      metric("reaction_time_ms", 760, "ms", gameRunId, poseVisibility),
      metric("target_hit_rate", 0.82, "ratio", gameRunId, poseVisibility),
      metric("pose_visibility_avg", poseVisibility, "ratio", gameRunId, poseVisibility),
      metric("arm_raise_accuracy", 0.84, "ratio", gameRunId, poseVisibility),
      metric("motion_intensity", 2, "level", gameRunId, poseVisibility),
      metric("duration_seconds", 180, "s", gameRunId, poseVisibility),
    ],
    auditEvidence: {
      auditLogIds: [`audit-start-${sessionId}`, `audit-result-${sessionId}`],
      requiredActions: ["training_session.start", "training_result.submit"],
      checkedAt: "2026-06-01T08:05:00.000Z",
    },
  };
}

function metric(metricType, metricValue, unit, gameRunId, confidence) {
  return {
    metricType,
    metricValue,
    unit,
    gameRunId,
    source: "browser_pose_canvas",
    confidence,
    sampleCount: 120,
    qualityFlag: "valid",
    windowStartedAt: "2026-06-01T08:00:00.000Z",
    windowEndedAt: "2026-06-01T08:03:00.000Z",
  };
}

test("multi-condition data capture accepts two independent collection conditions with traceable batches", async () => {
  const apiData = createApiData(validEvidence());
  const result = await runMultiConditionVerification(validEvidence(), apiData);

  assert.deepEqual(result.failures, []);
});

test("multi-condition data capture logs in with isolated cookie sessions and CSRF without runtime bearer auth", async () => {
  const evidence = validEvidence();
  const apiData = createApiData(evidence);
  const boundary = createCookieSessionFetchImpl(apiData);

  const result = await withGlobalFetch(boundary.fetchImpl, () =>
    verifyMultiConditionDataCapture(cookieSessionConfig(evidence)),
  );

  assert.deepEqual(result.failures, []);
  assert.deepEqual(
    boundary.events
      .filter((event) => event.path === "/auth/login")
      .map((event) => event.account),
    ["review-account", "audit-account"],
  );
  for (const event of boundary.events) {
    assert.equal(event.authorization, null);
    if (event.path === "/auth/login") {
      assert.equal(event.method, "POST");
      assert.equal(event.csrf, event.cookies.rehab_csrf);
    }
  }
});

test("multi-condition data capture hard-fails the first rejected cookie login without protected reads", async () => {
  const evidence = validEvidence();
  const apiData = createApiData(evidence);
  const boundary = createCookieSessionFetchImpl(apiData, {
    rejectedAccount: "review-account",
  });

  const result = await withGlobalFetch(boundary.fetchImpl, () =>
    verifyMultiConditionDataCapture(cookieSessionConfig(evidence)),
  );
  assert.match(result.failures.join("\n"), /复核.*登录.*HTTP 401/);
  assert.deepEqual(
    boundary.events.map(({ method, path }) => `${method} ${path}`),
    ["GET /auth/csrf", "POST /auth/login"],
  );
  assert.equal(apiData.calls.trainingRecords, 0);
});

test("multi-condition data capture keeps malicious Bearer evidence detection", async () => {
  const evidence = validEvidence({
    acceptance: {
      ...validEvidence().acceptance,
      externalEvidence: "Bearer malicious-runtime-secret-123",
    },
  });
  const boundary = createCookieSessionFetchImpl(createApiData(evidence));

  const result = await withGlobalFetch(boundary.fetchImpl, () =>
    verifyMultiConditionDataCapture(cookieSessionConfig(evidence)),
  );

  assert.match(result.failures.join("\n"), /多条件采集证据.*敏感字段/);
});

test("multi-condition data capture rejects legacy token-only config before API calls", async () => {
  const evidence = validEvidence();
  const config = cookieSessionConfig(evidence);
  delete config.reviewAccount;
  delete config.reviewPassword;
  delete config.auditAccount;
  delete config.auditPassword;
  Object.assign(config, {
    reviewToken: "review-token",
    auditToken: "audit-token",
    accessToken: "Bearer malicious-legacy-access-token",
  });

  const result = await verifyMultiConditionDataCapture(config);

  assert.match(result.failures.join("\n"), /reviewAccount|reviewPassword/);
  assert.match(result.failures.join("\n"), /auditAccount|auditPassword/);
});

test("multi-condition data capture rejects evidence with fewer than two distinct conditions", async () => {
  const evidence = validEvidence({
    conditions: [validEvidence().conditions[0]],
  });
  const result = await verifyMultiConditionDataCapture(
    cookieSessionConfig(evidence),
  );

  assert.match(result.failures.join("\n"), /至少两组不同采集条件/);
});

test("multi-condition data capture rejects reused condition code or batch id", async () => {
  const evidence = validEvidence();
  evidence.conditions[1].collectionCondition.code =
    evidence.conditions[0].collectionCondition.code;
  evidence.conditions[1].collectionBatch.batchId =
    evidence.conditions[0].collectionBatch.batchId;
  const result = await verifyMultiConditionDataCapture(
    cookieSessionConfig(evidence),
  );

  assert.match(result.failures.join("\n"), /采集条件 code 必须不同|collectionBatchId 必须不同/);
});

test("multi-condition data capture rejects API records whose collection batch chain is inconsistent", async () => {
  const evidence = validEvidence();
  const apiData = createApiData(evidence);
  apiData.trainingRecords.sessions[1].result.collectionBatchId = "other-batch";
  const result = await runMultiConditionVerification(evidence, apiData);

  assert.match(result.failures.join("\n"), /collectionBatchId|不一致/);
});

test("multi-condition data capture rejects missing required motion metrics", async () => {
  const evidence = validEvidence();
  const apiData = createApiData(evidence);
  apiData.trainingRecords.sessions[0].motionMetrics = apiData.trainingRecords.sessions[0].motionMetrics.filter(
    (metricItem) => metricItem.metricType !== "pose_visibility_avg",
  );
  const result = await runMultiConditionVerification(evidence, apiData);

  assert.match(result.failures.join("\n"), /pose_visibility_avg/);
});

test("multi-condition data capture rejects physiological metrics unless customer wearable evidence is supplied", async () => {
  const evidence = validEvidence({
    expectedMetricTypes: [
      ...validEvidence().expectedMetricTypes,
      "heart_rate_bpm",
    ],
    physiologicalMetricsStatus: "collected",
  });
  evidence.conditions[0].motionMetrics.push(
    metric("heart_rate_bpm", 78, "bpm", "run-a", 0.9),
  );
  const result = await verifyMultiConditionDataCapture(
    cookieSessionConfig(evidence),
  );

  assert.match(result.failures.join("\n"), /physiological|customer-gated|穿戴/);
});

test("multi-condition data capture rejects demo markers and sensitive raw metadata", async () => {
  const evidence = validEvidence({
    acceptance: {
      ...validEvidence().acceptance,
      siteName: "demo room",
    },
  });
  evidence.conditions[0].trainingResult.rawPayload = "secret raw payload";
  const result = await verifyMultiConditionDataCapture(
    cookieSessionConfig(evidence),
  );

  assert.match(result.failures.join("\n"), /demo|敏感字段|原始载荷/);
});

test("multi-condition data capture rejects non-HTTPS or marker API URLs before API calls", async () => {
  const apiData = createApiData(validEvidence());
  const result = await verifyMultiConditionDataCapture(
    cookieSessionConfig(validEvidence(), {
      apiBaseUrl: "http://demo.example.com/api",
    }),
  );

  assert.match(result.failures.join("\n"), /HTTPS|mock\/demo/);
  assert.equal(apiData.calls.trainingRecords, 0);
});

test("multi-condition data capture CLI hides failed response body details", async () => {
  const dir = await mkdtemp(join(tmpdir(), "multi-condition-"));
  const evidencePath = join(dir, "evidence.json");
  await writeFile(evidencePath, JSON.stringify(validEvidence()), "utf8");
  const fetchFixturePath = join(dir, "fetch-fixture.mjs");
  await writeFile(
    fetchFixturePath,
    [
      "let csrfSequence = 0;",
      "const makeResponse = (url, status, body, setCookie = []) => ({",
      "  ok: status >= 200 && status < 300,",
      "  status,",
      "  statusText: status === 502 ? 'Bad Gateway' : 'OK',",
      "  url: String(url),",
      "  headers: { getSetCookie: () => setCookie },",
      "  text: async () => typeof body === 'string' ? body : JSON.stringify(body),",
      "});",
      "globalThis.fetch = async (input) => {",
      "  const url = new URL(input);",
      "  if (url.pathname === '/auth/csrf') {",
      "    const csrf = `csrf-${++csrfSequence}-${'c'.repeat(32)}`;",
      "    return makeResponse(url, 200, { csrfToken: csrf }, [`rehab_csrf=${csrf}; Path=/`]);",
      "  }",
      "  return makeResponse(url, 502, 'secret-response-body');",
      "};",
      "",
    ].join("\n"),
    "utf8",
  );

  let stderr = "";
  await assert.rejects(
    async () =>
      execFileAsync(
        "node",
        [
          "--import",
          fetchFixturePath,
          "scripts/verify-multi-condition-data-capture.mjs",
          evidencePath,
          "--api-base-url",
          "https://rehab.example.com/api",
          "--review-account",
          "review-account",
          "--review-password",
          "review-password-secret",
          "--audit-account",
          "audit-account",
          "--audit-password",
          "audit-password-secret",
        ],
        { cwd: rootDir() },
      ),
    (error) => {
      stderr = error.stderr;
      return true;
    },
  );

  assert.match(stderr, /响应体已隐藏|请求失败/);
  assert.doesNotMatch(
    stderr,
    /secret-response-body|review-password-secret|audit-password-secret/,
  );
});

function createApiData(evidence) {
  return {
    calls: {
      trainingRecords: 0,
      auditLogs: 0,
    },
    trainingRecords: {
      sessions: evidence.conditions.map((condition) => trainingSessionFromEvidence(evidence, condition)),
    },
    auditLogs: evidence.conditions.flatMap((condition) => [
      auditLog(condition, "training_session.start"),
      auditLog(condition, "training_result.submit"),
    ]),
  };
}

function trainingSessionFromEvidence(evidence, condition) {
  return {
    id: condition.trainingSession.sessionId,
    patientId: evidence.patient.patientId,
    rehabPlanId: condition.rehabPlan.rehabPlanId,
    planItemId: condition.rehabPlan.planItemId,
    gameContentId: condition.gameContent.gameContentId,
    collectionBatchId: condition.collectionBatch.batchId,
    gameRunId: condition.trainingSession.gameRunId,
    deviceCode: condition.trainingSession.deviceCode,
    sessionStatus: condition.trainingSession.sessionStatus,
    syncStatus: condition.trainingSession.syncStatus,
    calibrationStatus: condition.trainingSession.calibrationStatus,
    clientStartedAt: condition.trainingSession.clientStartedAt,
    clientEndedAt: condition.trainingSession.clientEndedAt,
    runtimeConfigSnapshot: {
      collectionBatch: {
        id: condition.collectionBatch.batchId,
        status: condition.collectionBatch.status,
        protocolId: condition.collectionProtocol.protocolId,
        protocolVersion: condition.collectionProtocol.version,
        conditionId: condition.collectionCondition.conditionId,
        conditionSnapshot: condition.collectionCondition,
        protocolSnapshot: condition.collectionProtocol,
      },
    },
    gameContent: {
      id: condition.gameContent.gameContentId,
      runtimeType: condition.gameContent.runtimeType,
      gameVersion: condition.gameContent.gameVersion,
      bridgeProtocolVersion: condition.gameContent.bridgeProtocolVersion,
      buildStatus: condition.gameContent.buildStatus,
      releaseChannel: condition.gameContent.releaseChannel,
    },
    result: {
      id: condition.trainingResult.resultId,
      collectionBatchId: condition.collectionBatch.batchId,
      source: condition.trainingResult.source,
      qualityFlag: condition.trainingResult.qualityFlag,
      abnormalFlag: condition.trainingResult.abnormalFlag,
      score: condition.trainingResult.score,
      completionRate: condition.trainingResult.completionRate,
      durationSeconds: condition.trainingResult.durationSeconds,
      reactionTimeMs: condition.trainingResult.reactionTimeMs,
      motionAccuracy: condition.trainingResult.motionAccuracy,
      exerciseIntensity: condition.trainingResult.exerciseIntensity,
      rawPayloadHash: condition.trainingResult.rawPayloadHash,
      metricsSummary: {
        ...condition.trainingResult.metricsSummary,
        collectionBatchId: condition.collectionBatch.batchId,
        source: condition.trainingResult.source,
        gameRunId: condition.trainingSession.gameRunId,
        rawPayloadHash: condition.trainingResult.rawPayloadHash,
      },
    },
    motionMetrics: condition.motionMetrics.map((metricItem) => ({
      ...metricItem,
      collectionBatchId: condition.collectionBatch.batchId,
    })),
  };
}

function auditLog(condition, action) {
  return {
    id: condition.auditEvidence.auditLogIds[
      action === "training_session.start" ? 0 : 1
    ],
    action,
    targetType: "training_session",
    targetId: condition.trainingSession.sessionId,
    result: "success",
    metadata: {
      collectionBatchId: condition.collectionBatch.batchId,
      conditionCode: condition.collectionCondition.code,
    },
  };
}

function cookieSessionConfig(evidence, overrides = {}) {
  return deepMerge(
    {
      evidence,
      apiBaseUrl: "https://rehab.example.com/api",
      reviewAccount: "review-account",
      reviewPassword: "review-password",
      auditAccount: "audit-account",
      auditPassword: "audit-password",
    },
    overrides,
  );
}

async function runMultiConditionVerification(evidence, apiData) {
  const boundary = createCookieSessionFetchImpl(apiData);
  return withGlobalFetch(boundary.fetchImpl, () =>
    verifyMultiConditionDataCapture(cookieSessionConfig(evidence)),
  );
}

function createCookieSessionFetchImpl(apiData, { rejectedAccount } = {}) {
  const events = [];
  const sessions = new Map();
  let csrfSequence = 0;

  return {
    events,
    fetchImpl: async (input, options = {}) => {
      const url = new URL(input);
      const headers = new Headers(options.headers);
      const cookies = parseCookies(headers.get("cookie"));
      const event = {
        method: options.method ?? "GET",
        path: url.pathname,
        authorization: headers.get("authorization"),
        csrf: headers.get("x-csrf-token"),
        cookies,
      };
      events.push(event);

      if (event.method === "GET" && event.path === "/auth/csrf") {
        const csrf = `csrf-${++csrfSequence}-${"c".repeat(32)}`;
        return cookieResponse(url, 200, { csrfToken: csrf }, [
          `rehab_csrf=${csrf}; Path=/; SameSite=Lax`,
        ]);
      }

      if (event.method === "POST" && event.path === "/auth/login") {
        const body = JSON.parse(options.body);
        event.account = body.account;
        assert.equal(body.password, `${body.account.split("-")[0]}-password`);
        assert.equal(event.csrf, cookies.rehab_csrf);
        if (body.account === rejectedAccount) {
          return cookieResponse(url, 401, { message: "invalid credentials" });
        }
        const session = `${body.account}-session`;
        const csrf = `csrf-${++csrfSequence}-${"c".repeat(32)}`;
        sessions.set(body.account, session);
        return cookieResponse(
          url,
          201,
          {
            status: "authenticated",
            context: { primaryRole: body.account.split("-")[0] },
            accessToken: "Bearer malicious-legacy-access-token",
          },
          [
            `rehab_session=${session}; Path=/; HttpOnly`,
            `rehab_csrf=${csrf}; Path=/; SameSite=Lax`,
          ],
        );
      }

      const expectedAccount = event.path.endsWith("/admin/audit-logs")
        ? "audit-account"
        : "review-account";
      assert.equal(event.authorization, null);
      assert.equal(cookies.rehab_session, sessions.get(expectedAccount));

      if (event.path.includes("/training-records")) {
        apiData.calls.trainingRecords += 1;
        return cookieResponse(url, 200, apiData.trainingRecords);
      }
      if (event.path.endsWith("/admin/audit-logs")) {
        apiData.calls.auditLogs += 1;
        const action = url.searchParams.get("action");
        const targetId = url.searchParams.get("targetId");
        return cookieResponse(
          url,
          200,
          apiData.auditLogs.filter(
            (log) => log.action === action && log.targetId === targetId,
          ),
        );
      }
      return cookieResponse(url, 404, { message: "not found" });
    },
  };
}

function parseCookies(header = "") {
  return Object.fromEntries(
    (header ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return [part.slice(0, separator), part.slice(separator + 1)];
      }),
  );
}

function cookieResponse(url, status, body, setCookie = []) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 401 ? "Unauthorized" : "OK",
    url: url.toString(),
    headers: {
      getSetCookie() {
        return setCookie;
      },
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

async function withGlobalFetch(fetchImpl, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function deepMerge(target, source) {
  if (Array.isArray(target) || Array.isArray(source)) {
    return source === undefined ? structuredClone(target) : structuredClone(source);
  }
  if (!isObject(target) || !isObject(source)) {
    return source === undefined ? structuredClone(target) : structuredClone(source);
  }
  const merged = { ...target };
  for (const [key, value] of Object.entries(source)) {
    merged[key] = deepMerge(target[key], value);
  }
  return merged;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rootDir() {
  return fileURLToPath(new URL("../..", import.meta.url));
}
