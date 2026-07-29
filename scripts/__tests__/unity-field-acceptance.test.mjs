import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { execFile, execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { verifyUnityFieldAcceptance as verifyUnityFieldAcceptanceRuntime } from "../verify-unity-field-acceptance.mjs";
import { CookieSessionClient } from "../local-contract-cookie-session.mjs";

const execFileAsync = promisify(execFile);
const readSessionCredentials = {
  patientAccount: "field-patient",
  patientPassword: "patient-password",
  auditAccount: "field-auditor",
  auditPassword: "audit-password",
};
const formalPayloadHash = `sha256:${"a".repeat(64)}`;

async function verifyUnityFieldAcceptance(options) {
  const { fetchImpl = createFetchImpl(options.evidence), ...runtimeOptions } =
    options;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await verifyUnityFieldAcceptanceRuntime({
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
          releaseChannel: "production",
          resultContractVersion: "rehab-unity-result-v2",
          collectionBatchId: "collection_batch_real_001",
          durationSeconds: 180,
          approvedPlanItemId: "plan_item_real_001",
          assessmentSourceId: "assessment_real_001",
          startingLevelSource: "clinician_approved_plan",
          startingDifficultyLevel: 2,
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
        rawPayloadHash: formalPayloadHash,
        durationSeconds: 180,
        metricsSummary: {
          source: "unity_webgl",
          resultContractVersion: "rehab-unity-result-v2",
          collectionBatchId: "collection_batch_real_001",
          gameRunId: "run_unity_real_001",
          gameVersion: "0.1.0",
          protocolVersion: "1.0.0",
          clientGeneratedAt: "2026-05-24T10:02:00.000Z",
          rawPayloadHash: formalPayloadHash,
          dynamicDifficultyEvidence: {
            schemaVersion: "1.0.0",
            events: [
              {
                startingLevel: 2,
                startingLevelSource: "clinician_approved_plan",
                approvedPlanItemId: "plan_item_real_001",
                assessmentSourceId: "assessment_real_001",
                triggerReason: "accuracy_high",
                before: { speed: 1, complexityLevel: 2 },
                after: { speed: 1.2, complexityLevel: 3 },
                adjustedAt: "2026-05-24T10:01:00.000Z",
                runtimeFrameId: "run_unity_real_001:frame:1800",
                runtimeWindowId:
                  "run_unity_real_001:runtime-window:0:2026-05-24T09:59:00.000Z-2026-05-24T10:01:00.000Z",
              },
            ],
          },
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
        rawPayloadHash: formalPayloadHash,
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
        metric("difficulty_level", 3, "level", 120, 1),
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
            path: "artifacts/session-real-001-complete.png",
            capturedAt: "2026-05-24T10:03:00.000Z",
          },
        ],
        recordings: [
          {
            label: "Unity 训练过程录屏",
            path: "artifacts/session-real-001-recording.mp4",
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

test("Unity verifier authenticates isolated read sessions with cookies and automatic login CSRF", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const fetchImpl = createCookieSessionFetch(evidence);
  const result = await verifyUnityFieldAcceptance({
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
  const collectionBatchRead = fetchImpl.events.find((event) =>
    event.path.endsWith("/collection-batches"),
  );
  assert.match(
    collectionBatchRead.cookie,
    /rehab_session=field-patient-session/,
  );
  const auditReads = fetchImpl.events.filter(
    (event) => event.path === "/api/admin/audit-logs",
  );
  assert.equal(auditReads.length, 2);
  for (const event of auditReads) {
    assert.match(event.cookie, /rehab_session=field-auditor-session/);
    assert.doesNotMatch(event.cookie, /field-patient-session/);
  }
});

test("Unity verifier hard-fails on mismatched CSRF body and cookie before login or business reads", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const fetchImpl = createCookieSessionFetch(
    evidence,
    createApiData(evidence),
    {
      mismatchFirstCsrf: true,
    },
  );

  const result = await verifyUnityFieldAcceptance({
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

test("Unity verifier hard-fails when audit login returns 401 or 403 after patient login", async () => {
  for (const auditLoginStatus of [401, 403]) {
    const { evidence, evidencePath } = await prepareEvidencePackage();
    const fetchImpl = createCookieSessionFetch(
      evidence,
      createApiData(evidence),
      {
        auditLoginStatus,
      },
    );

    const result = await verifyUnityFieldAcceptance({
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

test("Unity verifier hard-fails when authenticated login omits rehab_session", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const fetchImpl = createCookieSessionFetch(
    evidence,
    createApiData(evidence),
    {
      missingPatientSession: true,
    },
  );

  const result = await verifyUnityFieldAcceptance({
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

test("Unity runtime source has no legacy token input or Bearer request path while retaining security scans", async () => {
  const source = await readFile(
    new URL("../verify-unity-field-acceptance.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /CookieSessionClient/);
  assert.match(source, /"accesstoken"/);
  assert.match(source, /function bearerTokenPattern\(\)/);
  assert.doesNotMatch(source, /\bpatientToken\b|\bauditToken\b/);
  assert.doesNotMatch(source, /UNITY_FIELD_(?:PATIENT|AUDIT)_TOKEN/);
  assert.doesNotMatch(
    source,
    /resolveCredentialTokens|--patient-token|--audit-token/,
  );
  assert.doesNotMatch(source, /Authorization\s*:/);
  assert.equal(source.match(/Bearer/g)?.length, 1);
});

test("Unity field redactor classifies non-HTTP login errors without exposing sensitive values", async (t) => {
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
    const result = await verifyUnityFieldAcceptance({
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

test("Unity runbook shell blocks use single-quoted assignments and pass zsh syntax", async () => {
  const runbook = await readFile(
    new URL("../../docs/unity-field-acceptance-runbook.md", import.meta.url),
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

test("Unity field acceptance verifier accepts matching artifacts, training API data, runtime snapshot, and audit logs", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const result = await verifyUnityFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com/api",
    fetchImpl: createFetchImpl(evidence),
  });

  assert.deepEqual(result.failures, []);
});

test("Unity field acceptance verifier resolves strict API Unity paths against the evidence page origin", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  const manifestPath = "/unity/rhythm_reach_3d/0.1.0/manifest.json";
  const buildBasePath = "/unity/rhythm_reach_3d/0.1.0";
  apiData.training.sessions[0].runtimeConfigSnapshot.manifestUrl = manifestPath;
  apiData.training.sessions[0].runtimeConfigSnapshot.buildBaseUrl =
    buildBasePath;
  apiData.training.sessions[0].gameContent.manifestUrl = manifestPath;
  apiData.training.sessions[0].gameContent.buildBaseUrl = buildBasePath;

  const result = await verifyUnityFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com/api",
    fetchImpl: createFetchImpl(evidence, apiData),
  });

  assert.deepEqual(result.failures, []);
});

test("Unity field acceptance verifier rejects unsafe API Unity URL forms", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  for (const manifestUrl of [
    "https://cdn.example.com/unity/rhythm_reach_3d/0.1.0/manifest.json",
    "//rehab.example.com/unity/rhythm_reach_3d/0.1.0/manifest.json",
    "unity/rhythm_reach_3d/0.1.0/manifest.json",
  ]) {
    const apiData = createApiData(evidence);
    apiData.training.sessions[0].runtimeConfigSnapshot.manifestUrl =
      manifestUrl;
    const result = await verifyUnityFieldAcceptance({
      evidence,
      evidencePath,
      apiBaseUrl: "https://rehab.example.com/api",
      fetchImpl: createFetchImpl(evidence, apiData),
    });
    assert.match(result.failures.join("\n"), /验收页面同源/);
  }
});

test("Unity field acceptance verifier rejects API runtime snapshot mismatches", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.training.sessions[0].runtimeConfigSnapshot.manifestUrl =
    "/unity/other/manifest.json";

  const result = await verifyUnityFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });

  assert.match(
    result.failures.join("\n"),
    /runtimeConfigSnapshot\.manifestUrl/,
  );
});

test("Unity field acceptance verifier rejects API game content outside production release channel", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.training.sessions[0].gameContent.releaseChannel = "staging";

  const result = await verifyUnityFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });

  assert.match(result.failures.join("\n"), /gameContent\.releaseChannel/);
});

test("Unity field acceptance verifier rejects API metrics summary that does not match bridge event evidence", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.training.sessions[0].result.metricsSummary.rawPayloadHash =
    "sha256:different";

  const result = await verifyUnityFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });

  assert.match(result.failures.join("\n"), /rawPayloadHash/);
});

test("Unity field acceptance verifier rejects every broken collection batch link", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const scenarios = [
    {
      mutate: (apiData) => {
        apiData.training.sessions[0].collectionBatchId = "other-batch";
      },
      expected: /trainingSession\.collectionBatchId/,
    },
    {
      mutate: (apiData) => {
        apiData.training.sessions[0].runtimeConfigSnapshot.collectionBatch.id =
          "other-batch";
      },
      expected: /runtimeConfigSnapshot\.collectionBatch\.id/,
    },
    {
      mutate: (apiData) => {
        apiData.training.sessions[0].result.collectionBatchId = "other-batch";
      },
      expected: /trainingResult\.collectionBatchId/,
    },
    {
      mutate: (apiData) => {
        apiData.training.sessions[0].result.metricsSummary.collectionBatchId =
          "other-batch";
      },
      expected: /trainingResult\.metricsSummary\.collectionBatchId/,
    },
    {
      mutate: (apiData) => {
        apiData.training.sessions[0].motionMetrics[0].collectionBatchId =
          "other-batch";
      },
      expected: /motionMetrics\.reaction_time_ms\.collectionBatchId/,
    },
    {
      mutate: (apiData) => {
        apiData.collectionBatches[0].planItemId = "other-plan-item";
      },
      expected: /collectionBatch\.planItemId/,
    },
  ];

  for (const scenario of scenarios) {
    const result = await verifyWithApiMutation({
      evidence,
      evidencePath,
      mutate: scenario.mutate,
    });
    assert.match(result.failures.join("\n"), scenario.expected);
  }
});

test("Unity field acceptance verifier rejects contract, prescription duration, and dynamic difficulty mismatches", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const scenarios = [
    {
      mutate: (apiData) => {
        apiData.training.sessions[0].result.metricsSummary.resultContractVersion =
          "rehab-unity-result-v1";
      },
      expected: /resultContractVersion/,
    },
    {
      mutate: (apiData) => {
        apiData.training.sessions[0].runtimeConfigSnapshot.prescribedDurationSeconds = 181;
      },
      expected: /prescribedDurationSeconds/,
    },
    {
      mutate: (apiData) => {
        apiData.training.sessions[0].result.durationSeconds = 181;
      },
      expected: /trainingResult\.durationSeconds/,
    },
    {
      mutate: (apiData) => {
        apiData.training.sessions[0].result.metricsSummary.dynamicDifficultyEvidence.events[0].runtimeFrameId =
          "other-run:frame:1800";
      },
      expected: /dynamicDifficultyEvidence/,
    },
  ];

  for (const scenario of scenarios) {
    const result = await verifyWithApiMutation({
      evidence,
      evidencePath,
      mutate: scenario.mutate,
    });
    assert.match(result.failures.join("\n"), scenario.expected);
  }

  const invalidDynamicPackage = await prepareEvidencePackage({
    evidenceOverrides: {
      bridgeEvent: {
        metricsSummary: {
          dynamicDifficultyEvidence: {
            events: [
              {
                ...evidence.bridgeEvent.metricsSummary.dynamicDifficultyEvidence
                  .events[0],
                runtimeFrameId: "other-run:frame:1800",
              },
            ],
          },
        },
      },
    },
  });
  const invalidDynamicResult = await verifyUnityFieldAcceptance({
    ...invalidDynamicPackage,
    apiBaseUrl: "https://rehab.example.com/api",
    fetchImpl: createFetchImpl(invalidDynamicPackage.evidence),
  });
  assert.match(
    invalidDynamicResult.failures.join("\n"),
    /runtimeFrameId.*gameRunId|运行帧身份/,
  );
});

test("Unity field acceptance verifier requires one complete persisted metric for every Unity metric contract", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const scenarios = [
    {
      mutate: (apiData) => {
        apiData.training.sessions[0].motionMetrics =
          apiData.training.sessions[0].motionMetrics.filter(
            (metric) => metric.metricType !== "target_hit_rate",
          );
      },
      expected: /target_hit_rate.*数量必须严格等于 1/,
    },
    {
      mutate: (apiData) => {
        apiData.training.sessions[0].motionMetrics.push({
          ...apiData.training.sessions[0].motionMetrics[0],
        });
      },
      expected: /reaction_time_ms.*数量必须严格等于 1/,
    },
    {
      mutate: (apiData) => {
        apiData.training.sessions[0].motionMetrics[2].qualityFlag =
          "suspicious";
      },
      expected: /arm_raise_accuracy\.qualityFlag/,
    },
    {
      mutate: (apiData) => {
        apiData.training.sessions[0].motionMetrics[3].sampleCount = null;
      },
      expected: /duration_seconds\.sampleCount/,
    },
    {
      mutate: (apiData) => {
        apiData.training.sessions[0].motionMetrics[4].windowEndedAt =
          "2026-05-24T10:01:59.000Z";
      },
      expected: /difficulty_level\.windowEndedAt/,
    },
    {
      mutate: (apiData) => {
        apiData.training.sessions[0].motionMetrics[1].unit = "percent";
      },
      expected: /target_hit_rate\.unit/,
    },
  ];

  for (const scenario of scenarios) {
    const result = await verifyWithApiMutation({
      evidence,
      evidencePath,
      mutate: scenario.mutate,
    });
    assert.match(result.failures.join("\n"), scenario.expected);
  }
});

test("Unity field acceptance verifier binds audit actor, createdAt, and metadata to the same training chain", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const scenarios = [
    {
      mutate: (apiData) => {
        apiData.audit["training_session.start"][0].actorUserId = "other-user";
      },
      expected: /training_session\.start 审计\.actorUserId/,
    },
    {
      mutate: (apiData) => {
        apiData.audit["training_session.start"][0].actor = null;
      },
      expected: /training_session\.start 审计 actor/,
    },
    {
      mutate: (apiData) => {
        apiData.audit["training_result.submit"][0].createdAt =
          "2026-05-24T10:01:59.000Z";
      },
      expected: /training_result\.submit 审计 createdAt.*时间窗口/,
    },
    {
      mutate: (apiData) => {
        apiData.audit["training_result.submit"][0].metadata.collectionBatchId =
          "other-batch";
      },
      expected: /training_result\.submit 审计 metadata\.collectionBatchId/,
    },
    {
      mutate: (apiData) => {
        Reflect.deleteProperty(
          apiData.audit["training_result.submit"][0].metadata,
          "trainingResultId",
        );
      },
      expected: /training_result\.submit 审计 metadata\.trainingResultId/,
    },
  ];

  for (const scenario of scenarios) {
    const result = await verifyWithApiMutation({
      evidence,
      evidencePath,
      mutate: scenario.mutate,
    });
    assert.match(result.failures.join("\n"), scenario.expected);
  }
});

test("Unity field acceptance verifier rejects 2xx empty training and audit responses", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  for (const value of [null, []]) {
    const emptyTraining = createApiData(evidence);
    emptyTraining.training = value;
    const trainingResult = await verifyUnityFieldAcceptance({
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
    const auditResult = await verifyUnityFieldAcceptance({
      evidence,
      evidencePath,
      apiBaseUrl: "https://rehab.example.com",
      fetchImpl: createFetchImpl(evidence, emptyAudit),
    });
    assert.match(auditResult.failures.join("\n"), /审计 API.*错误 shape/);
  }
});

test("Unity field acceptance verifier requires one audit candidate and scans every duplicate", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  const original = apiData.audit["training_result.submit"][0];
  apiData.audit["training_result.submit"].push({
    ...original,
    metadata: { rawPayload: "patient-secret-token-123456" },
  });

  const result = await verifyUnityFieldAcceptance({
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

test("Unity field acceptance verifier hides sensitive mismatch values", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.training.sessions[0].deviceCode = "patient-secret-token-123456";

  const result = await verifyUnityFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });
  const failures = result.failures.join("\n");

  assert.match(failures, /deviceCode/);
  assert.doesNotMatch(failures, /patient-secret-token-123456/);
  assert.doesNotMatch(failures, /trial-room-a-unity-01/);
});

test("Unity field acceptance verifier rejects missing artifact files and symlinks outside evidence directory", async () => {
  const evidence = validEvidence();
  const dir = await mkdtemp(join(tmpdir(), "unity-field-symlink-"));
  await mkdir(join(dir, "artifacts"), { recursive: true });
  const outsideFile = `${dir}-outside.png`;
  await writeFile(outsideFile, "outside");
  await symlink(outsideFile, join(dir, evidence.artifacts.screenshots[0].path));
  const evidencePath = join(dir, "evidence.json");
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));

  const result = await verifyUnityFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence),
  });

  assert.match(
    result.failures.join("\n"),
    /真实路径必须位于 evidence JSON 所在目录/,
  );
  assert.match(result.failures.join("\n"), /附件文件不存在/);
});

test("Unity field acceptance verifier rejects missing API URL and cookie-session credentials before API calls", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();

  const result = await verifyUnityFieldAcceptance({
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

test("Unity field acceptance verifier rejects mock demo or manual API URLs", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();

  const result = await verifyUnityFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://manual-demo-unity.example.com",
    fetchImpl: createFetchImpl(evidence),
  });

  assert.match(
    result.failures.join("\n"),
    /mock|demo|fallback|fixed|seed|manual/i,
  );
});

test("Unity field acceptance verifier rejects concatenated or encoded fake API URL markers", async () => {
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
    const result = await verifyUnityFieldAcceptance({
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

test("Unity field acceptance verifier rejects audit metadata containing sensitive or demo payloads", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.audit["training_result.submit"][0].metadata = {
    mode: "manual-demo-unity-result",
    token: "patient-secret-token",
    note: "Bearer malicious-review-secret-123456",
    rawPayloadBase64:
      "Zm9ybWFsLXVuaXR5LXJhdw==Zm9ybWFsLXVuaXR5LXJhdw==Zm9ybWFsLXVuaXR5LXJhdw==",
  };

  const result = await verifyUnityFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });

  assert.match(result.failures.join("\n"), /审计 metadata|敏感|manual|demo/i);
});

test("Unity field acceptance verifier rejects audit metadata sensitive key variants", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.audit["training_result.submit"][0].metadata = {
    requestBody: { score: 86 },
    responseBody: { accepted: true },
    accessToken: "short-token",
    imageBase64:
      "Zm9ybWFsLXVuaXR5LXJhdw==Zm9ybWFsLXVuaXR5LXJhdw==Zm9ybWFsLXVuaXR5LXJhdw==",
    nested: {
      payload: "short-payload",
      raw: "short-raw",
    },
  };

  const result = await verifyUnityFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });
  const failures = result.failures.join("\n");

  assert.match(failures, /requestBody/);
  assert.match(failures, /responseBody/);
  assert.match(failures, /accessToken/);
  assert.match(failures, /imageBase64/);
  assert.match(failures, /payload/);
  assert.match(failures, /raw/);
  assert.doesNotMatch(failures, /short-token|short-payload|short-raw/);
});

test("Unity field acceptance verifier allows audit metadata hash digest summaries", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.audit["training_result.submit"][0].metadata = {
    ...apiData.audit["training_result.submit"][0].metadata,
    rawPayloadHash: formalPayloadHash,
    payloadHash: formalPayloadHash,
  };

  const result = await verifyUnityFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });

  assert.deepEqual(result.failures, []);
});

test("Unity field acceptance verifier hides short identifier mismatch values by default", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const apiData = createApiData(evidence);
  apiData.training.sessions[0].deviceCode = "dev-02";

  const result = await verifyUnityFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com",
    fetchImpl: createFetchImpl(evidence, apiData),
  });
  const failures = result.failures.join("\n");

  assert.match(failures, /deviceCode/);
  assert.doesNotMatch(failures, /dev-02/);
  assert.doesNotMatch(failures, /trial-room-a-unity-01/);
});

test("Unity field acceptance CLI hides failed response body details", async () => {
  const { evidencePath } = await prepareEvidencePackage();
  const dir = await mkdtemp(join(tmpdir(), "unity-field-fetch-"));
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
      "    return 'detail=patient-secret-token rawPayload=敏感Unity载荷 key=real-key';",
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
          "scripts/verify-unity-field-acceptance.mjs",
          evidencePath,
          "--api-base-url",
          "https://rehab.example.com",
        ],
        { env: { ...process.env, ...unityCredentialEnv() } },
      ),
    (error) => {
      assert.match(error.stderr, /HTTP 502/);
      assert.match(error.stderr, /响应体已隐藏/);
      assert.doesNotMatch(error.stderr, /patient-secret-token/);
      assert.doesNotMatch(error.stderr, /敏感Unity载荷/);
      assert.doesNotMatch(error.stderr, /real-key/);
      return true;
    },
  );
});

test("Unity field acceptance CLI logs in with isolated cookie sessions and never sends Authorization", async () => {
  const { evidence, evidencePath } = await prepareEvidencePackage();
  const dir = await mkdtemp(join(tmpdir(), "unity-field-credentials-"));
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
      "  if (parsed.pathname.endsWith('/collection-batches')) {",
      "    return cookies.rehab_session === sessions.get('field-patient') ? response(url, 200, apiData.collectionBatches) : response(url, 401, { message: 'wrong patient session' });",
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
      "scripts/verify-unity-field-acceptance.mjs",
      evidencePath,
      "--api-base-url",
      "https://rehab.example.com/api",
    ],
    { env: { ...process.env, ...unityCredentialEnv() } },
  );

  assert.match(stdout, /Unity WebGL 实机只读验真通过/);
});

test("Unity field acceptance CLI reports invalid JSON without printing a stack trace", async () => {
  const dir = await mkdtemp(join(tmpdir(), "unity-field-bad-json-"));
  const evidencePath = join(dir, "bad-evidence.json");
  await writeFile(evidencePath, "{not-json");

  await assert.rejects(
    () =>
      execFileAsync("node", [
        "scripts/verify-unity-field-acceptance.mjs",
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

test("Unity field acceptance CLI rejects legacy runtime credential arguments", async () => {
  const { evidencePath } = await prepareEvidencePackage();

  await assert.rejects(
    () =>
      execFileAsync(
        "node",
        [
          "scripts/verify-unity-field-acceptance.mjs",
          evidencePath,
          "--api-base-url",
          "https://rehab.example.com",
          "--access-token",
          "legacy-secret",
        ],
        { env: { ...process.env, ...unityCredentialEnv() } },
      ),
    (error) => {
      assert.match(error.stderr, /不支持的参数/);
      assert.doesNotMatch(error.stderr, /legacy-secret/);
      return true;
    },
  );
});

function unityCredentialEnv() {
  return {
    UNITY_FIELD_PATIENT_ACCOUNT: readSessionCredentials.patientAccount,
    UNITY_FIELD_PATIENT_PASSWORD: readSessionCredentials.patientPassword,
    UNITY_FIELD_AUDIT_ACCOUNT: readSessionCredentials.auditAccount,
    UNITY_FIELD_AUDIT_PASSWORD: readSessionCredentials.auditPassword,
  };
}

async function prepareEvidencePackage(options = {}) {
  const evidence = validEvidence(options.evidenceOverrides);
  const dir = await mkdtemp(join(tmpdir(), "unity-field-"));
  await mkdir(join(dir, "artifacts"), { recursive: true });
  await writeFile(join(dir, evidence.artifacts.screenshots[0].path), "png");
  await writeFile(join(dir, evidence.artifacts.recordings[0].path), "mp4");
  const evidencePath = join(dir, "evidence.json");
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  return { evidence, evidencePath };
}

async function verifyWithApiMutation({ evidence, evidencePath, mutate }) {
  const apiData = createApiData(evidence);
  mutate(apiData);
  return verifyUnityFieldAcceptance({
    evidence,
    evidencePath,
    apiBaseUrl: "https://rehab.example.com/api",
    fetchImpl: createFetchImpl(evidence, apiData),
  });
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

    if (method === "GET" && parsed.pathname.endsWith("/collection-batches")) {
      return sessionResponse(
        url,
        cookies.rehab_session === sessions.get("field-patient") ? 200 : 401,
        cookies.rehab_session === sessions.get("field-patient")
          ? apiData.collectionBatches
          : { message: "wrong patient session" },
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
        event.path.endsWith("/collection-batches") ||
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
    collectionBatches: [createCollectionBatch(evidence)],
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
  const collectionBatch = createCollectionBatch(evidence);
  return {
    id: evidence.trainingSession.sessionId,
    createdByUserId: "patient-user-real-001",
    patientId: evidence.patient.patientId,
    rehabPlanId: evidence.rehabPlan.rehabPlanId,
    planItemId: evidence.rehabPlan.planItemId,
    gameContentId: evidence.gameContent.gameContentId,
    collectionBatchId: evidence.trainingSession.collectionBatchId,
    gameRunId: evidence.trainingSession.gameRunId,
    clientStartedAt: evidence.trainingSession.clientStartedAt,
    clientEndedAt: evidence.trainingSession.clientEndedAt,
    deviceCode: evidence.trainingSession.deviceCode,
    calibrationStatus: evidence.trainingSession.calibrationStatus,
    sessionStatus: evidence.trainingSession.sessionStatus,
    syncStatus: evidence.trainingSession.syncStatus,
    createdAt: "2026-05-24T09:59:01.000Z",
    startedAt: "2026-05-24T09:59:01.000Z",
    runtimeConfigSnapshot: {
      ...evidence.trainingSession.runtimeConfigSnapshot,
      prescribedDurationSeconds: evidence.rehabPlan.durationMinutes * 60,
      collectionBatch: {
        id: collectionBatch.id,
        status: collectionBatch.status,
        protocolId: collectionBatch.protocolId,
        protocolVersion: collectionBatch.protocolVersion,
        conditionId: collectionBatch.conditionId,
        conditionSnapshot: collectionBatch.conditionSnapshot,
        protocolSnapshot: collectionBatch.protocolSnapshot,
        consentSnapshot: collectionBatch.consentSnapshot,
      },
    },
    gameContent: {
      id: evidence.gameContent.gameContentId,
      code: evidence.gameContent.code,
      name: evidence.gameContent.name,
      runtimeType: evidence.gameContent.runtimeType,
      gameVersion: evidence.gameContent.gameVersion,
      bridgeProtocolVersion: evidence.gameContent.bridgeProtocolVersion,
      releaseChannel: evidence.gameContent.releaseChannel,
      buildStatus: evidence.gameContent.buildStatus,
      manifestUrl: evidence.gameContent.manifestUrl,
      buildBaseUrl: evidence.gameContent.buildBaseUrl,
    },
    result: {
      id: evidence.trainingResult.resultId,
      sessionId: evidence.trainingSession.sessionId,
      collectionBatchId: evidence.trainingSession.collectionBatchId,
      source: evidence.trainingResult.source,
      gameRunId: evidence.trainingResult.gameRunId,
      gameVersion: evidence.trainingResult.gameVersion,
      bridgeProtocolVersion: evidence.trainingResult.bridgeProtocolVersion,
      submittedByUserId: "patient-user-real-001",
      clientGeneratedAt: evidence.trainingResult.clientGeneratedAt,
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
        ...evidence.bridgeEvent.metricsSummary,
      },
    },
    motionMetrics: evidence.motionMetrics.map((item) => ({
      ...item,
      trainingSessionId: evidence.trainingSession.sessionId,
      collectionBatchId: evidence.trainingSession.collectionBatchId,
      gameRunId: evidence.trainingSession.gameRunId,
      source: evidence.trainingResult.source,
    })),
  };
}

function createCollectionBatch(evidence) {
  return {
    id: evidence.trainingSession.collectionBatchId,
    patientId: evidence.patient.patientId,
    rehabPlanId: evidence.rehabPlan.rehabPlanId,
    planItemId: evidence.rehabPlan.planItemId,
    gameContentId: evidence.gameContent.gameContentId,
    protocolId: "protocol_real_001",
    conditionId: "condition_real_001",
    protocolVersion: "1.0.0",
    status: "ready",
    conditionSnapshot: {
      id: "condition_real_001",
      code: "trial_room_a",
      status: "active",
    },
    protocolSnapshot: {
      id: "protocol_real_001",
      code: "unity_rhythm_reach",
      version: "1.0.0",
      runtimeType: "unity_webgl",
      status: "active",
    },
    consentSnapshot: {
      version: "v1.2",
      status: "granted",
      requiredTypes: ["privacy_policy", "camera_capture"],
    },
    createdByUserId: "doctor-user-real-001",
    createdAt: "2026-05-24T09:50:00.000Z",
    updatedAt: "2026-05-24T09:50:00.000Z",
  };
}

function createAuditLog(evidence, id, action) {
  const commonMetadata = {
    patientId: evidence.patient.patientId,
    rehabPlanId: evidence.rehabPlan.rehabPlanId,
    planItemId: evidence.rehabPlan.planItemId,
    collectionBatchId: evidence.trainingSession.collectionBatchId,
    gameContentId: evidence.gameContent.gameContentId,
    gameRunId: evidence.trainingSession.gameRunId,
  };
  return {
    id,
    actorUserId: "patient-user-real-001",
    actorRole: "patient",
    actor: {
      account: "patient-real-001",
      displayName: "现场训练患者",
    },
    action,
    targetType: "training_session",
    targetId: evidence.trainingSession.sessionId,
    result: "success",
    metadata:
      action === "training_session.start"
        ? commonMetadata
        : {
            abnormalFlag: false,
            qualityFlag: "valid",
            qualityReasons: [],
            sessionStatus: "completed",
            ...commonMetadata,
            trainingResultId: evidence.trainingResult.resultId,
          },
    createdAt:
      action === "training_session.start"
        ? "2026-05-24T09:59:01.000Z"
        : "2026-05-24T10:02:08.000Z",
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
