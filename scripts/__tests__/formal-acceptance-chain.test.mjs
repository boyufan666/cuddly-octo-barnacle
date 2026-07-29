import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { verifyFormalAcceptanceChain } from "../verify-formal-acceptance-chain.mjs";

const execFileAsync = promisify(execFile);
const rootDir = fileURLToPath(new URL("../..", import.meta.url));

function validConfig(overrides = {}) {
  return deepMerge(
    {
      apiBaseUrl: "https://rehab.example.com/api",
      doctorAccount: "doctor-account",
      doctorPassword: "doctor-password",
      caregiverAccount: "caregiver-account",
      caregiverPassword: "caregiver-password",
      auditAccount: "audit-account",
      auditPassword: "audit-password",
      chain: {
        patientId: "patient_real_001",
        assessmentId: "assessment_ad8_001",
        rehabPlanId: "plan_real_001",
        planItemId: "plan_item_real_001",
        gameContentId: "game_browser_pose_001",
        trainingSessionId: "session_real_001",
        trainingResultId: "result_real_001",
        caregiverUserId: "caregiver-user-id",
      },
      requiredAuditActions: [
        "consent.grant",
        "caregiver_relation.create",
        "assessment.create",
        "rehab_plan.recommend",
        "rehab_plan.confirm",
        "training_session.start",
        "training_result.submit",
        "training_result.review",
        "caregiver.summary.view",
      ],
    },
    overrides,
  );
}

test("formal acceptance chain verifies assessment, plan, training, review, caregiver summary, and audit logs for one patient", async () => {
  const apiData = createApiData();
  const result = await runFormalVerification(apiData);

  assert.deepEqual(result.failures, []);
  assert.equal(apiData.calls.patientReads, 1);
  assert.equal(apiData.calls.assessmentReads, 1);
  assert.equal(apiData.calls.trainingReads, 1);
  assert.equal(apiData.calls.caregiverSummaryReads, 1);
});

test("formal acceptance chain logs in with isolated cookie sessions and CSRF without runtime bearer auth", async () => {
  const apiData = createApiData();
  const boundary = createCookieSessionFetchImpl(apiData);

  const result = await withGlobalFetch(boundary.fetchImpl, () =>
    verifyFormalAcceptanceChain(cookieSessionConfig()),
  );

  assert.deepEqual(result.failures, []);
  assert.deepEqual(
    boundary.events
      .filter((event) => event.path === "/auth/login")
      .map((event) => event.account),
    ["doctor-account", "caregiver-account", "audit-account"],
  );
  for (const event of boundary.events) {
    assert.equal(event.authorization, null);
    if (event.path === "/auth/login") {
      assert.equal(event.method, "POST");
      assert.equal(event.csrf, event.cookies.rehab_csrf);
    }
  }
  const protectedEvents = boundary.events.filter((event) =>
    event.path.startsWith("/api/"),
  );
  assert.ok(protectedEvents.length > 0);
  assert.equal(
    protectedEvents.every((event) => event.cookies.rehab_session),
    true,
  );
});

test("formal acceptance chain hard-fails the first rejected cookie login without protected reads", async () => {
  const apiData = createApiData();
  const boundary = createCookieSessionFetchImpl(apiData, {
    rejectedAccount: "doctor-account",
  });

  const result = await withGlobalFetch(boundary.fetchImpl, () =>
    verifyFormalAcceptanceChain(cookieSessionConfig()),
  );
  assert.match(result.failures.join("\n"), /医师.*登录.*HTTP 401/);
  assert.deepEqual(
    boundary.events.map(({ method, path }) => `${method} ${path}`),
    ["GET /auth/csrf", "POST /auth/login"],
  );
  assert.equal(apiData.calls.patientReads, 0);
});

test("formal acceptance chain keeps malicious Bearer evidence detection", async () => {
  const apiData = createApiData({
    patient: {
      ...patientDetail(),
      externalEvidence: "Bearer malicious-runtime-secret-123",
    },
  });
  const boundary = createCookieSessionFetchImpl(apiData);

  const result = await withGlobalFetch(boundary.fetchImpl, () =>
    verifyFormalAcceptanceChain(cookieSessionConfig()),
  );

  assert.match(result.failures.join("\n"), /患者详情.*敏感字段/);
});

test("formal acceptance chain rejects IDs that do not belong to the same patient plan and training session", async () => {
  const apiData = createApiData({
    trainingRecords: {
      sessions: [
        {
          ...trainingSession(),
          rehabPlanId: "other-plan-id",
        },
      ],
    },
  });
  const result = await runFormalVerification(apiData);

  assert.match(result.failures.join("\n"), /rehabPlanId|同一条业务链/);
});

test("formal acceptance chain requires a reviewed training result", async () => {
  const apiData = createApiData({
    trainingRecords: {
      sessions: [
        {
          ...trainingSession(),
          result: {
            ...trainingResult(),
            reviewStatus: null,
            reviewConclusion: null,
            reviewedByUserId: null,
            reviewedAt: null,
          },
        },
      ],
    },
  });
  const result = await runFormalVerification(apiData);

  assert.match(result.failures.join("\n"), /医生复核|reviewed/);
});

test("formal acceptance chain rejects caregiver summary that exposes raw metrics or editing permissions", async () => {
  const apiData = createApiData({
    caregiverSummary: {
      ...caregiverSummary(),
      permissions: {
        rawAssessment: true,
        planEdit: true,
        fullMedicalRecord: true,
      },
      recentTraining: [
        {
          id: "session_real_001",
          motionMetrics: [{ metricType: "reaction_time_ms" }],
        },
      ],
    },
  });
  const result = await runFormalVerification(apiData);

  assert.match(result.failures.join("\n"), /家属摘要|原始动作指标|方案编辑/);
});

test("formal acceptance chain rejects missing audit actions", async () => {
  const apiData = createApiData({
    audit: {
      ...auditLogs(),
      "training_result.review": [],
    },
  });
  const result = await runFormalVerification(apiData);

  assert.match(result.failures.join("\n"), /training_result\.review|审计日志/);
});

test("formal acceptance chain rejects missing consent grant and caregiver relation audit logs", async () => {
  const apiData = createApiData({
    audit: {
      ...auditLogs(),
      "consent.grant": [],
      "caregiver_relation.create": [],
    },
  });
  const result = await runFormalVerification(apiData);

  assert.match(
    result.failures.join("\n"),
    /consent\.grant|caregiver_relation\.create|审计日志/,
  );
});

test("formal acceptance chain rejects mock demo markers and sensitive audit metadata", async () => {
  const apiData = createApiData({
    audit: {
      ...auditLogs(),
      "training_result.submit": [
        {
          id: "audit_result_submit_001",
          action: "training_result.submit",
          targetType: "training_session",
          targetId: "session_real_001",
          result: "success",
          metadata: {
            mode: "manual-demo-result",
            rawPayload: "sensitive payload",
          },
        },
      ],
    },
  });
  const result = await runFormalVerification(apiData);

  assert.match(result.failures.join("\n"), /敏感字段|manual|demo|原始载荷/);
});

test("formal acceptance chain rejects unsafe business evidence before declaring acceptance", async () => {
  const apiData = createApiData({
    patient: {
      ...patientDetail(),
      healthMetrics: {
        source: "manual demo import",
      },
    },
    assessments: [
      assessmentRecord({
        rawInputSummary: {
          transcript:
            "raw transcript should not be part of formal acceptance evidence",
        },
      }),
    ],
    trainingRecords: {
      sessions: [
        trainingSession({
          result: trainingResult({
            metricsSummary: {
              rawPayload: "sensitive motion payload",
            },
          }),
        }),
      ],
      summary: { totalSessions: 1, completedSessions: 1, averageScore: 82 },
    },
  });
  const result = await runFormalVerification(apiData);

  assert.match(result.failures.join("\n"), /患者详情|正式评估|训练记录/);
  assert.match(result.failures.join("\n"), /敏感字段|manual|demo|原始载荷/);
});

test("formal acceptance chain hard-fails every required 2xx empty or malformed response", async () => {
  for (const [field, malformed] of [
    ["patient", []],
    ["assessments", {}],
    ["trainingRecords", []],
    ["caregiverSummary", []],
  ]) {
    for (const value of [null, malformed]) {
      const apiData = createApiData();
      apiData[field] = value;
      const result = await runFormalVerification(apiData);
      assert.match(
        result.failures.join("\n"),
        /返回值必须是对象|返回值必须是数组|错误 shape/,
        field,
      );
    }
  }

  for (const value of [null, {}]) {
    const apiData = createApiData();
    apiData.audit["training_result.submit"] = value;
    const result = await runFormalVerification(apiData);
    assert.match(result.failures.join("\n"), /审计 API.*数组|错误 shape/);
  }
});

test("formal acceptance chain requires one audit candidate and scans every duplicate", async () => {
  const apiData = createApiData();
  const original = apiData.audit["training_result.submit"][0];
  apiData.audit["training_result.submit"].push({
    ...original,
    id: "audit_result_submit_duplicate",
    metadata: { rawPayload: "patient-secret-token-123456" },
  });

  const result = await runFormalVerification(apiData);
  const failures = result.failures.join("\n");
  assert.match(failures, /候选数量必须严格等于 1/);
  assert.match(failures, /敏感字段|原始载荷/);
  assert.doesNotMatch(failures, /patient-secret-token-123456/);
});

test("formal acceptance chain rejects legacy token-only config before API calls", async () => {
  const apiData = createApiData();
  const config = validConfig();
  delete config.apiBaseUrl;
  delete config.doctorAccount;
  delete config.doctorPassword;
  delete config.caregiverAccount;
  delete config.caregiverPassword;
  delete config.auditAccount;
  delete config.auditPassword;
  Object.assign(config, {
    doctorToken: "doctor-token",
    caregiverToken: "caregiver-token",
    auditToken: "audit-token",
    accessToken: "Bearer malicious-legacy-access-token",
  });
  const result = await verifyFormalAcceptanceChain(config);

  assert.match(result.failures.join("\n"), /apiBaseUrl/);
  assert.match(result.failures.join("\n"), /doctorAccount|doctorPassword/);
  assert.match(
    result.failures.join("\n"),
    /caregiverAccount|caregiverPassword/,
  );
  assert.match(result.failures.join("\n"), /auditAccount|auditPassword/);
  assert.equal(apiData.calls.patientReads, 0);
});

test("formal acceptance template and verifier expose one six-field cookie credential contract", async () => {
  const template = JSON.parse(
    await readFile(
      join(rootDir, "docs/templates/formal-acceptance-chain.template.json"),
      "utf8",
    ),
  );
  const credentialFields = Object.keys(template)
    .filter((field) => /(Account|Password|Token)$/i.test(field))
    .sort();

  assert.deepEqual(credentialFields, [
    "auditAccount",
    "auditPassword",
    "caregiverAccount",
    "caregiverPassword",
    "doctorAccount",
    "doctorPassword",
  ]);
  assert.doesNotMatch(
    JSON.stringify(template),
    /(?:doctor|caregiver|audit)Token/i,
  );

  const apiData = createApiData();
  const boundary = createCookieSessionFetchImpl(apiData);
  const result = await withGlobalFetch(boundary.fetchImpl, () =>
    verifyFormalAcceptanceChain({
      ...validConfig(),
      doctorToken: "legacy-doctor-token",
      caregiverToken: "legacy-caregiver-token",
      auditToken: "legacy-audit-token",
    }),
  );

  assert.match(result.failures.join("\n"), /doctorToken.*不支持的配置字段/);
  assert.match(result.failures.join("\n"), /caregiverToken.*不支持的配置字段/);
  assert.match(result.failures.join("\n"), /auditToken.*不支持的配置字段/);
  assert.deepEqual(boundary.events, []);
});

test("formal acceptance chain CLI hides failed response body details", async () => {
  const dir = await mkdtemp(join(tmpdir(), "formal-chain-"));
  const configPath = join(dir, "formal-chain.json");
  await writeFile(
    configPath,
    JSON.stringify({
      apiBaseUrl: "https://rehab.example.com/api",
      doctorAccount: validConfig().doctorAccount,
      doctorPassword: validConfig().doctorPassword,
      caregiverAccount: validConfig().caregiverAccount,
      caregiverPassword: validConfig().caregiverPassword,
      auditAccount: validConfig().auditAccount,
      auditPassword: validConfig().auditPassword,
      chain: validConfig().chain,
      requiredAuditActions: validConfig().requiredAuditActions,
    }),
  );
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
      "globalThis.fetch = async (input, options = {}) => {",
      "  const url = new URL(input);",
      "  if (url.pathname === '/auth/csrf') {",
      "    const csrf = `csrf-${++csrfSequence}-${'c'.repeat(32)}`;",
      "    return makeResponse(url, 200, { csrfToken: csrf }, [`rehab_csrf=${csrf}; Path=/`]);",
      "  }",
      "  if (url.pathname === '/auth/login') {",
      "    const csrf = `csrf-${++csrfSequence}-${'c'.repeat(32)}`;",
      "    return makeResponse(url, 201, { status: 'authenticated', context: {} }, [",
      "      `rehab_session=session-${csrfSequence}; Path=/; HttpOnly`,",
      "      `rehab_csrf=${csrf}; Path=/`,",
      "    ]);",
      "  }",
      "  return makeResponse(url, 502, 'token=real-secret-token-123 rawPayload=患者敏感训练载荷');",
      "};",
      "",
    ].join("\n"),
  );

  await assert.rejects(
    () =>
      execFileAsync("node", [
        "--import",
        fetchFixturePath,
        "scripts/verify-formal-acceptance-chain.mjs",
        configPath,
      ]),
    (error) => {
      assert.match(error.stderr, /HTTP 502/);
      assert.match(error.stderr, /响应体已隐藏/);
      assert.doesNotMatch(error.stderr, /real-secret-token-123/);
      assert.doesNotMatch(error.stderr, /患者敏感训练载荷/);
      return true;
    },
  );
});

test("rebuilt role UI keeps formal business actions on real API paths without local substitutes", async () => {
  const webSources = await readFeatureSources([
    "apps/web/src/app/page.tsx",
    "apps/web/src/features/session/useRoleData.ts",
    "apps/web/src/features/patient/patient-training-actions.ts",
    "apps/web/src/features/doctor/doctor-workbench-actions.ts",
    "apps/web/src/features/admin/admin-governance-actions.ts",
  ]);

  const combined = webSources.join("\n");
  assert.doesNotMatch(
    combined,
    /localStorage.*trainingResult|Math\.random\(\).*score|mock|demo|fallback|fixedScore|manualResult/i,
  );
  assert.match(combined, /startTrainingSession/);
  assert.match(combined, /submitTrainingResult/);
  assert.match(combined, /reviewTrainingResult/);
  assert.match(combined, /confirmPlan/);
  assert.match(combined, /exportData/);

  const [patientActions, doctorActions, adminActions, roleWorkspace] =
    await readFeatureSources([
      "apps/web/src/features/patient/patient-training-actions.ts",
      "apps/web/src/features/doctor/doctor-workbench-actions.ts",
      "apps/web/src/features/admin/admin-governance-actions.ts",
      "apps/web/src/features/session/role-workspace.tsx",
    ]);
  assert.match(patientActions, /api\.startTrainingSession/);
  assert.match(patientActions, /api\.submitTrainingResult/);
  assert.match(doctorActions, /api\.confirmPlan/);
  assert.match(doctorActions, /api\.reviewTrainingResult/);
  assert.match(adminActions, /api\.exportData/);
  assert.doesNotMatch(
    roleWorkspace,
    /api\.(startTrainingSession|submitTrainingResult|confirmPlan|reviewTrainingResult|exportData)\b/,
  );
});

async function readFeatureSources(paths) {
  return Promise.all(
    paths.map((path) => readFile(join(rootDir, path), "utf8")),
  );
}

function cookieSessionConfig(overrides = {}) {
  return validConfig(overrides);
}

async function runFormalVerification(apiData, configOverrides = {}) {
  const boundary = createCookieSessionFetchImpl(apiData);
  return withGlobalFetch(boundary.fetchImpl, () =>
    verifyFormalAcceptanceChain(validConfig(configOverrides)),
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

      const expectedAccount = event.path.startsWith("/api/caregiver/")
        ? "caregiver-account"
        : event.path === "/api/admin/audit-logs"
          ? "audit-account"
          : "doctor-account";
      assert.equal(event.authorization, null);
      assert.equal(cookies.rehab_session, sessions.get(expectedAccount));

      const patientId = validConfig().chain.patientId;
      if (event.path.endsWith(`/patients/${patientId}`)) {
        apiData.calls.patientReads += 1;
        return cookieResponse(url, 200, apiData.patient);
      }
      if (event.path.endsWith(`/patients/${patientId}/assessments`)) {
        apiData.calls.assessmentReads += 1;
        return cookieResponse(url, 200, apiData.assessments);
      }
      if (event.path.endsWith(`/patients/${patientId}/training-records`)) {
        apiData.calls.trainingReads += 1;
        return cookieResponse(url, 200, apiData.trainingRecords);
      }
      if (event.path.endsWith(`/caregiver/patients/${patientId}/summary`)) {
        apiData.calls.caregiverSummaryReads += 1;
        return cookieResponse(url, 200, apiData.caregiverSummary);
      }
      if (event.path.endsWith("/admin/audit-logs")) {
        apiData.calls.auditReads += 1;
        return cookieResponse(
          url,
          200,
          apiData.audit[url.searchParams.get("action") ?? ""],
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

function createApiData(overrides = {}) {
  return deepMerge(
    {
      calls: {
        patientReads: 0,
        assessmentReads: 0,
        trainingReads: 0,
        caregiverSummaryReads: 0,
        auditReads: 0,
      },
      patient: patientDetail(),
      assessments: [assessmentRecord()],
      trainingRecords: {
        sessions: [trainingSession()],
        summary: { totalSessions: 1, completedSessions: 1, averageScore: 82 },
      },
      caregiverSummary: caregiverSummary(),
      audit: auditLogs(),
    },
    overrides,
  );
}

function patientDetail() {
  return {
    id: "patient_real_001",
    riskGrades: [{ riskLevel: "moderate", isCurrent: true }],
    rehabPlans: [rehabPlan()],
    consents: [
      consent("privacy_policy", "consent_privacy_policy"),
      consent("ai_processing", "consent_ai_processing"),
      consent("camera_capture", "consent_camera_capture"),
      consent("caregiver_sharing", "consent_caregiver_sharing"),
    ],
    caregiverRelations: [
      {
        id: "caregiver_relation_001",
        caregiverUserId: "caregiver-user-id",
        authorizationStatus: "active",
        revokedAt: null,
      },
    ],
  };
}

function rehabPlan(overrides = {}) {
  return {
    id: "plan_real_001",
    patientId: "patient_real_001",
    status: "active",
    isCurrent: true,
    items: [
      {
        id: "plan_item_real_001",
        rehabPlanId: "plan_real_001",
        gameContentId: "game_browser_pose_001",
        gameContent: {
          id: "game_browser_pose_001",
          runtimeType: "browser_pose_canvas",
          buildStatus: "released",
          gameVersion: "1.0.0",
          bridgeProtocolVersion: "1.0.0",
        },
      },
    ],
    ...overrides,
  };
}

function assessmentRecord(overrides = {}) {
  return {
    id: "assessment_ad8_001",
    patientId: "patient_real_001",
    assessmentType: "AD-8",
    scoreSummary: { ad8Total: 4 },
    riskGrades: [{ riskLevel: "moderate", isCurrent: true }],
    aiAnalyses: [{ analysisScene: "assessment_summary" }],
    ...overrides,
  };
}

function trainingSession(overrides = {}) {
  return {
    id: "session_real_001",
    patientId: "patient_real_001",
    rehabPlanId: "plan_real_001",
    planItemId: "plan_item_real_001",
    gameContentId: "game_browser_pose_001",
    sessionStatus: "completed",
    result: trainingResult(),
    gameContent: {
      id: "game_browser_pose_001",
      runtimeType: "browser_pose_canvas",
      buildStatus: "released",
      gameVersion: "1.0.0",
      bridgeProtocolVersion: "1.0.0",
    },
    motionMetrics: [
      { metricType: "reaction_time_ms", metricValue: 720 },
      { metricType: "target_hit_rate", metricValue: 0.82 },
      { metricType: "pose_visibility_avg", metricValue: 0.76 },
      { metricType: "arm_raise_accuracy", metricValue: 0.88 },
    ],
    ...overrides,
  };
}

function trainingResult(overrides = {}) {
  return {
    id: "result_real_001",
    sessionId: "session_real_001",
    qualityFlag: "suspicious",
    abnormalFlag: true,
    reviewStatus: "reviewed",
    reviewConclusion: "needs_retrain",
    reviewedByUserId: "doctor-user-id",
    reviewedAt: "2026-05-31T09:30:00.000Z",
    ...overrides,
  };
}

function caregiverSummary(overrides = {}) {
  return {
    patient: { id: "patient_real_001", name: "李*" },
    currentRisk: "moderate",
    currentPlan: rehabPlan(),
    recentTraining: [
      {
        id: "session_real_001",
        patientId: "patient_real_001",
        rehabPlanId: "plan_real_001",
        planItemId: "plan_item_real_001",
        gameContentId: "game_browser_pose_001",
        result: {
          id: "result_real_001",
          qualityFlag: "suspicious",
          abnormalFlag: true,
        },
      },
    ],
    permissions: {
      rawAssessment: false,
      planEdit: false,
      fullMedicalRecord: false,
    },
    ...overrides,
  };
}

function auditLogs() {
  return {
    "consent.grant": [
      auditLog(
        "audit_consent_privacy_policy",
        "consent.grant",
        "consent_record",
        "consent_privacy_policy",
      ),
      auditLog(
        "audit_consent_ai_processing",
        "consent.grant",
        "consent_record",
        "consent_ai_processing",
      ),
      auditLog(
        "audit_consent_camera_capture",
        "consent.grant",
        "consent_record",
        "consent_camera_capture",
      ),
      auditLog(
        "audit_consent_caregiver_sharing",
        "consent.grant",
        "consent_record",
        "consent_caregiver_sharing",
      ),
    ],
    "caregiver_relation.create": [
      auditLog(
        "audit_caregiver_relation_001",
        "caregiver_relation.create",
        "caregiver_relation",
        "caregiver_relation_001",
      ),
    ],
    "assessment.create": [
      auditLog(
        "audit_assessment_001",
        "assessment.create",
        "assessment_record",
        "assessment_ad8_001",
      ),
    ],
    "rehab_plan.recommend": [
      auditLog(
        "audit_plan_recommend_001",
        "rehab_plan.recommend",
        "rehab_plan",
        "plan_real_001",
      ),
    ],
    "rehab_plan.confirm": [
      auditLog(
        "audit_plan_confirm_001",
        "rehab_plan.confirm",
        "rehab_plan",
        "plan_real_001",
      ),
    ],
    "training_session.start": [
      auditLog(
        "audit_session_start_001",
        "training_session.start",
        "training_session",
        "session_real_001",
      ),
    ],
    "training_result.submit": [
      auditLog(
        "audit_result_submit_001",
        "training_result.submit",
        "training_session",
        "session_real_001",
      ),
    ],
    "training_result.review": [
      auditLog(
        "audit_result_review_001",
        "training_result.review",
        "training_result",
        "result_real_001",
      ),
    ],
    "caregiver.summary.view": [
      auditLog(
        "audit_caregiver_summary_001",
        "caregiver.summary.view",
        "patient_profile",
        "patient_real_001",
      ),
    ],
  };
}

function auditLog(id, action, targetType, targetId, overrides = {}) {
  return {
    id,
    action,
    targetType,
    targetId,
    result: "success",
    metadata: {},
    ...overrides,
  };
}

function consent(consentType, id = `consent_${consentType}`) {
  return {
    id,
    consentType,
    status: "granted",
    revokedAt: null,
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
