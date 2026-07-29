import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { execFile, execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { verifyBrowserPoseFieldAcceptance as verifyBrowserPoseFieldAcceptanceRuntime } from "../verify-browser-pose-field-acceptance.mjs";
import { CookieSessionClient } from "../local-contract-cookie-session.mjs";

const execFileAsync = promisify(execFile);
const readSessionCredentials = {
  patientAccount: "field-patient",
  patientPassword: "patient-password",
  auditAccount: "field-auditor",
  auditPassword: "audit-password",
};

async function verifyBrowserPoseFieldAcceptance(options) {
  const { fetchImpl = createFetchImpl(options.evidence), ...runtimeOptions } =
    options;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await verifyBrowserPoseFieldAcceptanceRuntime({
      ...readSessionCredentials,
      ...runtimeOptions,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

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
        cameraDeviceIdHash: "sha256:7f83b1657ff1fc53b92dc18148a1d65dfa1355f7e",
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
        rawPayloadHash: "sha256:7f83b1657ff1fc53b92dc18148a1d65dfa1355f7e",
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

test("Browser Pose verifier authenticates isolated read sessions with cookies and automatic login CSRF", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const fetchImpl = createCookieSessionFetch(evidence);
  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com/api",
    patientAccount: "field-patient",
    patientPassword: "patient-password",
    auditAccount: "field-auditor",
    auditPassword: "audit-password",
    fetchImpl,
  });

  assert.deepEqual(result.failures, []);
  assert.equal(
    fetchImpl.events.some((event) => event.authorization !== null),
    false,
  );
  const loginEvents = fetchImpl.events.filter(
    (event) => event.method === "POST" && event.path === "/auth/login",
  );
  assert.deepEqual(
    loginEvents.map((event) => event.body.account),
    ["field-patient", "field-auditor"],
  );
  for (const event of loginEvents) {
    assert.match(event.cookie, /rehab_csrf=/);
    assert.equal(event.csrf, parseCookies(event.cookie).rehab_csrf);
  }
  const trainingRead = fetchImpl.events.find((event) =>
    event.path.endsWith("/training-records"),
  );
  assert.match(trainingRead.cookie, /rehab_session=field-patient-session/);
  assert.doesNotMatch(trainingRead.cookie, /field-auditor-session/);
  const auditReads = fetchImpl.events.filter(
    (event) => event.path === "/api/admin/audit-logs",
  );
  assert.equal(auditReads.length, 2);
  for (const event of auditReads) {
    assert.match(event.cookie, /rehab_session=field-auditor-session/);
    assert.doesNotMatch(event.cookie, /field-patient-session/);
  }
});

test("Browser Pose verifier hard-fails on mismatched CSRF body and cookie before login or business reads", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const fetchImpl = createCookieSessionFetch(
    evidence,
    createApiData(evidence),
    {
      mismatchFirstCsrf: true,
    },
  );

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com/api",
    fetchImpl,
  });

  assert.match(result.failures.join("\n"), /Cookie\/CSRF 会话无效/);
  assert.deepEqual(
    fetchImpl.events.map((event) => `${event.method} ${event.path}`),
    ["GET /auth/csrf"],
  );
  assertNoBusinessRequests(fetchImpl.events);
  assert.equal(
    fetchImpl.events.some((event) => event.authorization),
    false,
  );
});

test("Browser Pose verifier hard-fails when audit login returns 401 or 403 after patient login", async () => {
  for (const auditLoginStatus of [401, 403]) {
    const { evidence, evidencePath } = await prepareEvidencePackage();
    const fetchImpl = createCookieSessionFetch(
      evidence,
      createApiData(evidence),
      {
        auditLoginStatus,
      },
    );

    const result = await verifyBrowserPoseFieldAcceptance({
      evidence,
      evidencePath,
      apiBaseUrl: "https://rehab.example.com/api",
      fetchImpl,
    });

    assert.match(
      result.failures.join("\n"),
      new RegExp(`HTTP ${auditLoginStatus}`),
    );
    assert.equal(
      fetchImpl.events.filter((event) => event.path === "/auth/login").length,
      2,
    );
    assertNoBusinessRequests(fetchImpl.events);
    assert.equal(
      fetchImpl.events.some((event) => event.authorization),
      false,
    );
  }
});

test("Browser Pose verifier hard-fails when authenticated login omits rehab_session", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const fetchImpl = createCookieSessionFetch(
    evidence,
    createApiData(evidence),
    {
      missingPatientSession: true,
    },
  );

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com/api",
    fetchImpl,
  });

  assert.match(result.failures.join("\n"), /登录缺少 rehab_session cookie/);
  assert.equal(
    fetchImpl.events.filter((event) => event.path === "/auth/login").length,
    1,
  );
  assertNoBusinessRequests(fetchImpl.events);
  assert.equal(
    fetchImpl.events.some((event) => event.authorization),
    false,
  );
});

test("Browser Pose runtime source has no legacy token input or Bearer request path while retaining security scans", async () => {
  const source = await readFile(
    new URL("../verify-browser-pose-field-acceptance.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /CookieSessionClient/);
  assert.match(source, /"accesstoken"/);
  assert.match(source, /function bearerTokenPattern\(\)/);
  assert.doesNotMatch(source, /\bpatientToken\b|\bauditToken\b/);
  assert.doesNotMatch(source, /BROWSER_POSE_(?:PATIENT|AUDIT)_TOKEN/);
  assert.doesNotMatch(
    source,
    /resolveCredentialTokens|--patient-token|--audit-token/,
  );
  assert.doesNotMatch(source, /Authorization\s*:/);
  assert.equal(source.match(/Bearer/g)?.length, 1);
});

test("Browser Pose field redactor classifies non-HTTP login errors without exposing sensitive values", async (t) => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const sensitiveValues = [
    "field-account-sensitive",
    "field-password-sensitive",
    "field-response-sensitive",
  ];
  const scenarios = [
    {
      message: `password_reset_required ${sensitiveValues.join(" ")}`,
      expected: /password_reset_required.*人工完成密码重置/,
    },
    {
      message: `Cookie 会话登录响应格式无效。 ${sensitiveValues.join(" ")}`,
      expected: /登录响应格式无效/,
    },
    {
      message: `Cookie 会话登录缺少 rehab_session cookie。 ${sensitiveValues.join(" ")}`,
      expected: /登录缺少 rehab_session cookie/,
    },
    {
      message: `malicious Error ${sensitiveValues.join(" ")}`,
      expected: /错误详情已隐藏/,
    },
  ];
  let currentError;
  t.mock.method(CookieSessionClient.prototype, "login", async () => {
    throw currentError;
  });

  for (const scenario of scenarios) {
    currentError = new Error(scenario.message);
    const result = await verifyBrowserPoseFieldAcceptance({
      evidence,
      evidencePath,
      apiBaseUrl: "https://rehab.example.com/api",
    });
    const failures = result.failures.join("\n");

    assert.match(failures, scenario.expected);
    for (const sensitiveValue of sensitiveValues) {
      assert.equal(failures.includes(sensitiveValue), false);
    }
  }
});

test("Browser Pose runbook shell blocks use single-quoted assignments and pass zsh syntax", async () => {
  const runbook = await readFile(
    new URL(
      "../../docs/browser-pose-field-acceptance-runbook.md",
      import.meta.url,
    ),
    "utf8",
  );
  const shellBlocks = [...runbook.matchAll(/```bash\n([\s\S]*?)\n```/g)].map(
    (match) => match[1],
  );

  assert.ok(shellBlocks.length > 0);
  for (const shellBlock of shellBlocks) {
    assert.doesNotMatch(
      shellBlock,
      /^[A-Z][A-Z0-9_]*=(?!')[^\n]*/m,
      "all runbook shell assignments must start with a single-quoted value",
    );
    execFileSync("zsh", ["-n"], { input: shellBlock, encoding: "utf8" });
  }
});

test("field acceptance verifier accepts evidence that matches real artifact files, training API data, and audit API data", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com/api",
    fetchImpl: createFetchImpl(evidence),
  });

  assert.deepEqual(result.failures, []);
});

test("field acceptance verifier uses the provided API base URL without inventing an api prefix", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const seenPaths = [];
  const sessionFetch = createFetchImpl(evidence);
  const fetchImpl = async (url, options) => {
    const pathname = new URL(url).pathname;
    if (!pathname.startsWith("/auth/")) seenPaths.push(pathname);
    return sessionFetch(url, options);
  };

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
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
    fetchImpl: createFetchImpl(evidence, apiData),
  });

  assert.match(result.failures.join("\n"), /submittedAt/);
});

test("field acceptance verifier rejects API collection batch ids that do not match evidence", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.training.sessions[0].collectionBatchId = "batch_other_session";
  apiData.training.sessions[0].result.collectionBatchId = "batch_other_result";
  apiData.training.sessions[0].result.metricsSummary.collectionBatchId =
    "batch_other_summary";
  apiData.training.sessions[0].motionMetrics[0].collectionBatchId =
    "batch_other_metric";

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });
  const failures = result.failures.join("\n");

  assert.match(failures, /trainingSession\.collectionBatchId/);
  assert.match(failures, /trainingResult\.collectionBatchId/);
  assert.match(failures, /trainingResult\.metricsSummary\.collectionBatchId/);
  assert.match(failures, /motionMetrics\.reaction_time_ms\.collectionBatchId/);
});

test("field acceptance verifier matches sessions results and metrics by collection batch id", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  const similarEvidence = validEvidence({
    trainingSession: {
      sessionId: "session_other_001",
      gameRunId: "run_other_001",
      collectionBatchId: "batch_other_001",
    },
    trainingResult: {
      resultId: "result_other_001",
      gameRunId: "run_other_001",
      collectionBatchId: "batch_other_001",
    },
    motionMetrics: evidence.motionMetrics.map((metricItem) => ({
      ...metricItem,
      collectionBatchId: "batch_other_001",
    })),
  });
  apiData.training.sessions.unshift(createTrainingSession(similarEvidence));
  apiData.training.sessions[1].motionMetrics.unshift({
    ...apiData.training.sessions[1].motionMetrics[0],
    collectionBatchId: "batch_other_001",
  });

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });

  assert.deepEqual(result.failures, []);
});

test("field acceptance verifier rejects API game content outside production release channel", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.training.sessions[0].gameContent.releaseChannel = "staging";

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });

  assert.match(result.failures.join("\n"), /gameContent\.releaseChannel/);
});

test("field acceptance verifier hides sensitive mismatch values", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.training.sessions[0].deviceCode = "patient-secret-token-123456";

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });
  const failures = result.failures.join("\n");

  assert.match(failures, /deviceCode/);
  assert.doesNotMatch(failures, /patient-secret-token-123456/);
  assert.doesNotMatch(failures, /trial-room-a-camera-01/);
});

test("field acceptance verifier rejects API training response whose sessions field is not an array", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.training.sessions = {};

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });

  assert.match(result.failures.join("\n"), /sessions 必须是数组/);
});

test("field acceptance verifier rejects 2xx empty training and audit responses", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  for (const value of [null, []]) {
    const emptyTraining = createApiData(evidence);
    emptyTraining.training = value;
    const trainingResult = await verifyBrowserPoseFieldAcceptance({
      evidence,
      evidencePath,
      apiBaseUrl: "https://rehab.example.com",
      fetchImpl: createFetchImpl(evidence, emptyTraining),
    });
    assert.match(
      trainingResult.failures.join("\n"),
      /训练记录 API.*错误 shape/,
    );
  }

  for (const value of [null, {}]) {
    const emptyAudit = createApiData(evidence);
    emptyAudit.audit["training_result.submit"] = value;
    const auditResult = await verifyBrowserPoseFieldAcceptance({
      evidence,
      evidencePath,
      apiBaseUrl: "https://rehab.example.com",
      fetchImpl: createFetchImpl(evidence, emptyAudit),
    });
    assert.match(auditResult.failures.join("\n"), /审计 API.*错误 shape/);
  }
});

test("field acceptance verifier requires one audit candidate and scans every duplicate", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  const original = apiData.audit["training_result.submit"][0];
  apiData.audit["training_result.submit"].push({
    ...original,
    metadata: { rawPayload: "patient-secret-token-123456" },
  });

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });
  const failures = result.failures.join("\n");
  assert.match(failures, /候选数量必须严格等于 1/);
  assert.match(failures, /敏感字段|原始载荷/);
  assert.doesNotMatch(failures, /patient-secret-token-123456/);
});

test("field acceptance verifier rejects artifact paths outside the evidence package directory", async () => {
  const evidence = validEvidence();
  const dir = await mkdtemp(join(tmpdir(), "browser-pose-field-outside-"));
  await mkdir(join(dir, "artifacts"), { recursive: true });
  const outsideFile = `${dir}-outside.png`;
  await writeFile(outsideFile, "outside");
  evidence.artifacts.screenshots[0].path =
    "../" + outsideFile.split("/").at(-1);
  await writeFile(join(dir, evidence.artifacts.recordings[0].path), "mp4");
  const evidencePath = join(dir, "evidence.json");
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
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
    fetchImpl: createFetchImpl(evidence),
  });

  assert.match(
    result.failures.join("\n"),
    /真实路径必须位于 evidence JSON 所在目录/,
  );
});

test("field acceptance verifier rejects audit logs whose ids, actions, target, and result do not match the evidence", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.audit["training_result.submit"][0].id = "audit_different";

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com/api",
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
    fetchImpl: createFetchImpl(evidence),
  });

  assert.deepEqual(result.failures, []);
});

test("field acceptance verifier requires explicit API URL and cookie-session credentials", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    patientAccount: undefined,
    patientPassword: undefined,
    auditAccount: undefined,
    auditPassword: undefined,
    fetchImpl: createFetchImpl(evidence),
  });

  assert.match(result.failures.join("\n"), /apiBaseUrl/);
  assert.match(result.failures.join("\n"), /patientAccount/);
  assert.match(result.failures.join("\n"), /patientPassword/);
  assert.match(result.failures.join("\n"), /auditAccount/);
  assert.match(result.failures.join("\n"), /auditPassword/);
});

test("field acceptance verifier rejects blank session credentials and invalid API URL before calling API", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://[invalid",
    patientAccount: "   ",
    patientPassword: "\t",
    auditAccount: "   ",
    auditPassword: "\t",
    fetchImpl: createFetchImpl(evidence),
  });

  assert.match(result.failures.join("\n"), /apiBaseUrl/);
  assert.match(result.failures.join("\n"), /patientAccount/);
  assert.match(result.failures.join("\n"), /patientPassword/);
  assert.match(result.failures.join("\n"), /auditAccount/);
  assert.match(result.failures.join("\n"), /auditPassword/);
});

test("field acceptance verifier rejects mock demo or manual API URLs", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://manual-demo-rehab.example.com",
    fetchImpl: createFetchImpl(evidence),
  });

  assert.match(
    result.failures.join("\n"),
    /mock|demo|fallback|fixed|seed|manual/i,
  );
});

test("field acceptance verifier rejects concatenated or encoded fake API URL markers", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();

  for (const apiBaseUrl of [
    "https://mockapi.rehab.example.com",
    "https://demoapi.rehab.example.com",
    "https://seeddata.rehab.example.com",
    "https://fallbackserver.rehab.example.com",
    "https://fixedscore.rehab.example.com",
    "https://manualentry.rehab.example.com",
    "https://mo%63k-api.rehab.example.com",
  ]) {
    const result = await verifyBrowserPoseFieldAcceptance({
      evidence,
      evidencePath,
      apiBaseUrl,
      fetchImpl: createFetchImpl(evidence),
    });

    assert.match(
      result.failures.join("\n"),
      /mock\/demo\/seed\/fallback\/fixed\/manual/,
    );
  }
});

test("field acceptance verifier rejects audit metadata containing sensitive or demo payloads", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.audit["training_result.submit"][0].metadata = {
    mode: "manual-demo-result",
    token: "patient-secret-token",
    note: "Bearer malicious-review-secret-123456",
    rawPayloadBase64:
      "Zm9ybWFsLXBvc2UtcmF3LXBheWxvYWRzZm9ybWFsLXBvc2UtcmF3LXBheWxvYWRz",
  };

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });

  assert.match(result.failures.join("\n"), /审计 metadata|敏感|manual|demo/i);
});

test("field acceptance verifier rejects audit metadata sensitive key variants", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.audit["training_result.submit"][0].metadata = {
    requestBody: { score: 82 },
    responseBody: { accepted: true },
    accessToken: "short-token",
    audioBase64:
      "Zm9ybWFsLXBvc2UtcmF3LXBheWxvYWRzZm9ybWFsLXBvc2UtcmF3LXBheWxvYWRz",
    nested: {
      payload: "short-payload",
      raw: "short-raw",
    },
  };

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });
  const failures = result.failures.join("\n");

  assert.match(failures, /requestBody/);
  assert.match(failures, /responseBody/);
  assert.match(failures, /accessToken/);
  assert.match(failures, /audioBase64/);
  assert.match(failures, /payload/);
  assert.match(failures, /raw/);
  assert.doesNotMatch(failures, /short-token|short-payload|short-raw/);
});

test("field acceptance verifier allows audit metadata hash digest summaries", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.audit["training_result.submit"][0].metadata = {
    rawPayloadHash: "sha256:7f83b1657ff1fc53b92dc18148a1d65dfa1355f7e",
    payloadHash: "sha256:7f83b1657ff1fc53b92dc18148a1d65dfa1355f7e",
  };

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });

  assert.deepEqual(result.failures, []);
});

test("field acceptance verifier hides short identifier mismatch values by default", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.training.sessions[0].deviceCode = "dev-02";

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });
  const failures = result.failures.join("\n");

  assert.match(failures, /deviceCode/);
  assert.doesNotMatch(failures, /dev-02/);
  assert.doesNotMatch(failures, /trial-room-a-camera-01/);
});

test("field acceptance CLI hides failed response body details", async () => {
  const { evidencePath } = await prepareEvidencePackage();
  const dir = await mkdtemp(join(tmpdir(), "browser-pose-field-fetch-"));
  const fetchFixturePath = join(dir, "fetch-fixture.mjs");
  await writeFile(
    fetchFixturePath,
    [
      "globalThis.fetch = async (url) => ({",
      "  ok: false,",
      "  status: 502,",
      "  statusText: 'Bad Gateway',",
      "  url: String(url),",
      "  headers: { getSetCookie() { return []; } },",
      "  async text() {",
      "    return 'detail=patient-secret-token rawPayload=敏感训练载荷 key=real-key';",
      "  }",
      "});",
      "",
    ].join("\n"),
  );

  await assert.rejects(
    () =>
      execFileAsync(
        "node",
        [
          "--import",
          fetchFixturePath,
          "scripts/verify-browser-pose-field-acceptance.mjs",
          evidencePath,
          "--api-base-url",
          "https://rehab.example.com",
        ],
        { env: { ...process.env, ...browserPoseCredentialEnv() } },
      ),
    (error) => {
      assert.match(error.stderr, /HTTP 502/);
      assert.match(error.stderr, /响应体已隐藏/);
      assert.doesNotMatch(error.stderr, /patient-secret-token/);
      assert.doesNotMatch(error.stderr, /敏感训练载荷/);
      assert.doesNotMatch(error.stderr, /real-key/);
      return true;
    },
  );
});

test("field acceptance CLI logs in with isolated cookie sessions and never sends Authorization", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const dir = await mkdtemp(join(tmpdir(), "browser-pose-field-credentials-"));
  const fetchFixturePath = join(dir, "fetch-fixture.mjs");
  await writeFile(
    fetchFixturePath,
    [
      `const apiData = ${JSON.stringify(createApiData(evidence))};`,
      "const sessions = new Map();",
      "let csrfSequence = 0;",
      "function parseCookies(header = '') {",
      "  return Object.fromEntries(header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => { const separator = part.indexOf('='); return [part.slice(0, separator), part.slice(separator + 1)]; }));",
      "}",
      "function response(url, status, body, cookies = []) {",
      "  return { ok: status >= 200 && status < 300, status, statusText: status >= 200 && status < 300 ? 'OK' : 'Error', url: String(url), headers: { getSetCookie() { return cookies; } }, async text() { return JSON.stringify(body); } };",
      "}",
      "globalThis.fetch = async (url, options = {}) => {",
      "  const parsed = new URL(url);",
      "  const headers = new Headers(options.headers);",
      "  const method = (options.method ?? 'GET').toUpperCase();",
      "  const cookies = parseCookies(headers.get('cookie') ?? '');",
      "  if (headers.has('authorization')) return response(url, 400, { message: 'authorization forbidden' });",
      "  if (method === 'GET' && parsed.pathname === '/auth/csrf') {",
      "    const csrfToken = `${String(++csrfSequence).padStart(2, '0')}${'c'.repeat(41)}`;",
      "    return response(url, 200, { csrfToken }, [`rehab_csrf=${csrfToken}; Path=/; SameSite=Lax`]);",
      "  }",
      "  if (method === 'POST' && parsed.pathname === '/auth/login') {",
      "    const body = JSON.parse(options.body);",
      "    if (!headers.get('x-csrf-token') || headers.get('x-csrf-token') !== cookies.rehab_csrf) return response(url, 403, { message: 'invalid csrf' });",
      "    const session = `${body.account}-session`;",
      "    sessions.set(body.account, session);",
      "    const csrfToken = `${String(++csrfSequence).padStart(2, '0')}${'c'.repeat(41)}`;",
      "    return response(url, 201, { status: 'authenticated', user: { id: `${body.account}-user` }, context: { primaryRole: body.account } }, [`rehab_session=${session}; Path=/; HttpOnly`, `rehab_csrf=${csrfToken}; Path=/; SameSite=Lax`]);",
      "  }",
      "  if (parsed.pathname.endsWith('/training-records')) {",
      "    return cookies.rehab_session === sessions.get('field-patient') ? response(url, 200, apiData.training) : response(url, 401, { message: 'wrong patient session' });",
      "  }",
      "  if (parsed.pathname.endsWith('/admin/audit-logs')) {",
      "    return cookies.rehab_session === sessions.get('field-auditor') ? response(url, 200, apiData.audit[parsed.searchParams.get('action') ?? ''] ?? []) : response(url, 401, { message: 'wrong audit session' });",
      "  }",
      "  return response(url, 404, { message: 'not found' });",
      "};",
      "",
    ].join("\n"),
  );

  const { stdout } = await execFileAsync(
    "node",
    [
      "--import",
      fetchFixturePath,
      "scripts/verify-browser-pose-field-acceptance.mjs",
      evidencePath,
      "--api-base-url",
      "https://rehab.example.com/api",
    ],
    { env: { ...process.env, ...browserPoseCredentialEnv() } },
  );

  assert.match(stdout, /浏览器体感实机只读验真通过/);
});

test("field acceptance verifier reports missing evidence path instead of throwing while checking artifacts", async () => {
  const evidence = validEvidence();

  const result = await verifyBrowserPoseFieldAcceptance({
    evidence,
    apiBaseUrl: "https://rehab.example.com",
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
      ]),
    (error) => {
      assert.match(error.stderr, /证据文件不是有效 JSON/);
      assert.doesNotMatch(error.stderr, /SyntaxError|at JSON\.parse/);
      return true;
    },
  );
});

test("field acceptance CLI rejects legacy runtime credential arguments", async () => {
  const { evidencePath } = await prepareEvidencePackage();

  await assert.rejects(
    () =>
      execFileAsync(
        "node",
        [
          "scripts/verify-browser-pose-field-acceptance.mjs",
          evidencePath,
          "--api-base-url",
          "https://rehab.example.com",
          "--access-token",
          "legacy-secret",
        ],
        { env: { ...process.env, ...browserPoseCredentialEnv() } },
      ),
    (error) => {
      assert.match(error.stderr, /不支持的参数/);
      assert.doesNotMatch(error.stderr, /legacy-secret/);
      return true;
    },
  );
});

function browserPoseCredentialEnv() {
  return {
    BROWSER_POSE_PATIENT_ACCOUNT: readSessionCredentials.patientAccount,
    BROWSER_POSE_PATIENT_PASSWORD: readSessionCredentials.patientPassword,
    BROWSER_POSE_AUDIT_ACCOUNT: readSessionCredentials.auditAccount,
    BROWSER_POSE_AUDIT_PASSWORD: readSessionCredentials.auditPassword,
  };
}

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
  return createCookieSessionFetch(evidence, apiData);
}

function createCookieSessionFetch(
  evidence,
  apiData = createApiData(evidence),
  authBehavior = {},
) {
  const events = [];
  const sessions = new Map();
  let csrfSequence = 0;

  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const headers = new Headers(options.headers);
    const method = (options.method ?? "GET").toUpperCase();
    const cookie = headers.get("cookie") ?? "";
    const event = {
      method,
      path: parsed.pathname,
      cookie,
      csrf: headers.get("x-csrf-token"),
      authorization: headers.get("authorization"),
    };
    events.push(event);

    if (method === "GET" && parsed.pathname === "/auth/csrf") {
      const csrfToken = `${String(++csrfSequence).padStart(2, "0")}${"c".repeat(41)}`;
      const bodyToken =
        authBehavior.mismatchFirstCsrf && csrfSequence === 1
          ? `${"m".repeat(43)}`
          : csrfToken;
      return sessionResponse(url, 200, { csrfToken: bodyToken }, [
        `rehab_csrf=${csrfToken}; Path=/; SameSite=Lax`,
      ]);
    }

    if (method === "POST" && parsed.pathname === "/auth/login") {
      event.body = JSON.parse(options.body);
      const cookies = parseCookies(cookie);
      if (!event.csrf || event.csrf !== cookies.rehab_csrf) {
        return sessionResponse(url, 403, { message: "invalid csrf" });
      }
      if (
        event.body.account === "field-auditor" &&
        [401, 403].includes(authBehavior.auditLoginStatus)
      ) {
        return sessionResponse(url, authBehavior.auditLoginStatus, {
          message: "audit login rejected",
        });
      }
      const session = `${event.body.account}-session`;
      sessions.set(event.body.account, session);
      const nextCsrf = `${String(++csrfSequence).padStart(2, "0")}${"c".repeat(41)}`;
      return sessionResponse(
        url,
        201,
        {
          status: "authenticated",
          user: { id: `${event.body.account}-user` },
          context: { primaryRole: event.body.account },
        },
        [
          ...(authBehavior.missingPatientSession &&
          event.body.account === "field-patient"
            ? []
            : [`rehab_session=${session}; Path=/; HttpOnly`]),
          `rehab_csrf=${nextCsrf}; Path=/; SameSite=Lax`,
        ],
      );
    }

    const cookies = parseCookies(cookie);
    if (
      method === "GET" &&
      parsed.pathname.endsWith(
        `/patients/${evidence.patient.patientId}/training-records`,
      )
    ) {
      return sessionResponse(
        url,
        cookies.rehab_session === sessions.get("field-patient") ? 200 : 401,
        cookies.rehab_session === sessions.get("field-patient")
          ? apiData.training
          : { message: "wrong patient session" },
      );
    }

    if (method === "GET" && parsed.pathname.endsWith("/admin/audit-logs")) {
      return sessionResponse(
        url,
        cookies.rehab_session === sessions.get("field-auditor") ? 200 : 401,
        cookies.rehab_session === sessions.get("field-auditor")
          ? apiData.audit[parsed.searchParams.get("action") ?? ""]
          : { message: "wrong audit session" },
      );
    }

    return sessionResponse(url, 404, { message: "not found" });
  };
  fetchImpl.events = events;
  return fetchImpl;
}

function assertNoBusinessRequests(events) {
  assert.equal(
    events.some(
      (event) =>
        event.path.endsWith("/training-records") ||
        event.path.endsWith("/admin/audit-logs"),
    ),
    false,
  );
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return [part.slice(0, separator), part.slice(separator + 1)];
      }),
  );
}

function sessionResponse(url, status, body, cookies = []) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    url: String(url),
    headers: { getSetCookie: () => cookies },
    async text() {
      return JSON.stringify(body);
    },
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
        createAuditLog(
          evidence,
          "audit_session_start_001",
          "training_session.start",
        ),
      ],
      "training_result.submit": [
        createAuditLog(
          evidence,
          "audit_result_submit_001",
          "training_result.submit",
        ),
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
    collectionBatchId: evidence.trainingSession.collectionBatchId,
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
      collectionBatchId: evidence.trainingResult.collectionBatchId,
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
        collectionBatchId: evidence.trainingResult.collectionBatchId,
        gameVersion: evidence.trainingResult.gameVersion,
        protocolVersion: evidence.trainingResult.bridgeProtocolVersion,
        rawPayloadHash: evidence.trainingResult.rawPayloadHash,
      },
    },
    motionMetrics: evidence.motionMetrics.map((item) => ({
      ...item,
      trainingSessionId: evidence.trainingSession.sessionId,
      gameRunId: evidence.trainingSession.gameRunId,
      collectionBatchId: item.collectionBatchId,
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
