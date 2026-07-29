import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { verifyAd8CaregiverInterviewAcceptance } from "../verify-ad8-caregiver-interview-acceptance.mjs";

const execFileAsync = promisify(execFile);
const EMPTY_BODY = Symbol("empty-body");

function validConfig(overrides = {}) {
  const { fetchImpl = createFetchImpl(), ...configOverrides } = overrides;
  globalThis.fetch = fetchImpl;
  return {
    apiBaseUrl: "https://rehab.example.com",
    doctorAccount: "doctor001",
    doctorPassword: "doctor-password",
    caregiverAccount: "caregiver001",
    caregiverPassword: "caregiver-password",
    auditAccount: "auditor001",
    auditPassword: "auditor-password",
    patientId: "patient_real_001",
    informant: {
      caregiverUserId: "caregiver-user-id",
      relation: "daughter",
    },
    humanReview: {
      reviewerUserId: "doctor-user-id",
      reviewedAt: "2026-05-31T09:15:00.000Z",
      conclusion: "approved",
      notes: "医生已复核 AD-8 访谈和结构化题项。",
    },
    interview: {
      assessmentSource: "caregiver_interview",
      transcript: "照护者反馈患者近期重复提问、处理财务困难、忘记日期。",
      analysisSummary:
        "AD-8 总分 4 分，提示认知改变可能，建议结合 MMSE/CDR 复核。",
      confidence: 0.86,
      items: {
        itemMemoryProblems: 1,
        itemReducedInterest: 0,
        itemRepeatsQuestions: 1,
        itemTroubleLearningTools: 0,
        itemForgetsMonthYear: 1,
        itemHandlesFinancesPoorly: 1,
        itemTroubleAppointments: 0,
        itemDailyThinkingMemoryProblems: 0,
      },
    },
    ...configOverrides,
  };
}

test("AD-8 caregiver interview acceptance creates formal AD-8 assessment after doctor approval", async () => {
  const apiData = createApiData();
  const result = await verifyAd8CaregiverInterviewAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.deepEqual(result.failures, []);
  assert.equal(apiData.calls.meRequests, 1);
  assert.equal(apiData.calls.caregiverSummaryReads, 1);
  assert.equal(apiData.calls.assessmentsReads, 2);
  assert.equal(apiData.calls.assessmentCreates, 1);
  assert.deepEqual(apiData.calls.loginAccounts, [
    "doctor001",
    "caregiver001",
    "auditor001",
  ]);
  assert.deepEqual(
    apiData.events
      .filter((event) => !event.path.startsWith("/auth/"))
      .map(({ method, path, account }) => ({ method, path, account })),
    [
      { method: "GET", path: "/me", account: "doctor001" },
      { method: "GET", path: "/me", account: "caregiver001" },
      {
        method: "GET",
        path: "/patients/patient_real_001",
        account: "doctor001",
      },
      {
        method: "GET",
        path: "/caregiver/patients/patient_real_001/summary",
        account: "caregiver001",
      },
      {
        method: "GET",
        path: "/patients/patient_real_001/assessments",
        account: "doctor001",
      },
      { method: "POST", path: "/assessments", account: "doctor001" },
      {
        method: "GET",
        path: "/patients/patient_real_001/assessments",
        account: "doctor001",
      },
      {
        method: "GET",
        path: "/admin/audit-logs",
        account: "auditor001",
      },
      {
        method: "GET",
        path: "/admin/audit-logs",
        account: "auditor001",
      },
    ],
  );
  assert.equal(
    apiData.events.some((event) => event.authorization !== undefined),
    false,
  );
  for (const event of apiData.events.filter(
    (candidate) => candidate.method === "POST",
  )) {
    assert.match(event.cookie, /rehab_csrf=/);
    assert.equal(event.csrf, parseCookies(event.cookie).rehab_csrf);
  }
  assert.equal(apiData.createdAssessmentBody.assessmentType, "AD-8");
  assert.equal(apiData.createdAssessmentBody.scoreSummary.ad8Total, 4);
  assert.deepEqual(apiData.createdAssessmentBody.rawInputSummary.humanReview, {
    required: true,
    reviewerUserId: "doctor-user-id",
    reviewedAt: "2026-05-31T09:15:00.000Z",
    conclusion: "approved",
    notes: "医生已复核 AD-8 访谈和结构化题项。",
  });
});

test("AD-8 caregiver interview acceptance ignores legacy accessToken responses and never sends Bearer authorization", async () => {
  const apiData = createApiData();
  const result = await verifyAd8CaregiverInterviewAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.deepEqual(result.failures, []);
  assert.equal(
    apiData.events.some(
      (event) =>
        typeof event.authorization === "string" ||
        /Bearer\s+/i.test(event.authorization ?? ""),
    ),
    false,
  );
  assert.equal(
    apiData.events
      .filter((event) => !event.path.startsWith("/auth/"))
      .every((event) => /rehab_session=/.test(event.cookie)),
    true,
  );
});

test("AD-8 caregiver interview acceptance rejects legacy token-only config", async () => {
  const apiData = createApiData();
  const config = validConfig({ fetchImpl: createFetchImpl(apiData) });
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

  const result = await verifyAd8CaregiverInterviewAcceptance(config);

  assert.match(result.failures.join("\n"), /doctorAccount|doctorPassword/);
  assert.match(
    result.failures.join("\n"),
    /caregiverAccount|caregiverPassword/,
  );
  assert.match(result.failures.join("\n"), /auditAccount|auditPassword/);
  assert.equal(apiData.events.length, 0);
});

test("AD-8 caregiver interview acceptance rejects every role account collision before network", async () => {
  for (const [left, right] of [
    ["doctorAccount", "caregiverAccount"],
    ["doctorAccount", "auditAccount"],
    ["caregiverAccount", "auditAccount"],
  ]) {
    const config = validConfig();
    config[right] = config[left];
    let networkCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      networkCalls += 1;
      throw new Error("network must not be called");
    };
    try {
      const result = await verifyAd8CaregiverInterviewAcceptance(config);
      assert.match(result.failures.join("\n"), /账号必须两两不同/);
      assert.equal(networkCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

test("AD-8 caregiver interview acceptance template requires account and password fields without tokens", async () => {
  const template = JSON.parse(
    await readFile(
      new URL(
        "../../docs/templates/ad8-caregiver-interview-acceptance-config.template.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  for (const field of [
    "doctorAccount",
    "doctorPassword",
    "caregiverAccount",
    "caregiverPassword",
    "auditAccount",
    "auditPassword",
  ]) {
    assert.match(template[field], /^<[^>]+>$/);
  }
  for (const field of [
    "doctorToken",
    "caregiverToken",
    "auditToken",
    "accessToken",
  ]) {
    assert.equal(Object.hasOwn(template, field), false);
  }
});

test("AD-8 caregiver interview acceptance runbook documents the strict adversarial contract", async () => {
  const runbook = await readFile(
    new URL(
      "../../docs/ad8-caregiver-interview-acceptance-runbook.md",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    runbook,
    /mock.*demo.*seed.*fallback.*fixed.*manual.*synthetic/i,
  );
  assert.match(runbook, /8 个字符|八个字符/);
  assert.match(runbook, /审计.*候选.*恰好一条|审计.*候选.*严格等于 1/);
  assert.match(runbook, /JSON plain object/);
});

test("AD-8 caregiver interview acceptance hard-fails login without retry or business requests", async () => {
  const apiData = createApiData({ loginFailures: { caregiver001: 401 } });
  const result = await verifyAd8CaregiverInterviewAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /家属.*登录.*HTTP 401/);
  assert.deepEqual(apiData.calls.loginAccounts, ["doctor001", "caregiver001"]);
  assert.equal(
    apiData.events.some((event) => !event.path.startsWith("/auth/")),
    false,
  );
});

test("AD-8 caregiver interview acceptance rejects every required API empty, null, or malformed response and stops", async () => {
  const issues = [];
  const cases = [
    ["doctorMe", EMPTY_BODY, /当前医师身份 API/],
    ["caregiverMe", null, /当前家属身份 API/],
    ["patient", [], /患者详情 API/],
    ["caregiverSummary", "unexpected-shape", /家属授权摘要 API/],
    ["assessmentsBefore", {}, /AD-8 入库前评估列表 API/],
    ["assessmentCreate", [], /AD-8 正式评估创建 API/],
    ["assessmentsAfter", null, /AD-8 入库后评估列表 API/],
    ["assessmentAudit", EMPTY_BODY, /AD-8 正式评估审计 API/],
    ["caregiverAudit", {}, /家属摘要审计 API/],
  ];

  for (const [responseKey, responseBody, expectedFailure] of cases) {
    const apiData = createApiData({
      responseOverrides: { [responseKey]: responseBody },
    });
    const result = await verifyAd8CaregiverInterviewAcceptance(
      validConfig({ fetchImpl: createFetchImpl(apiData) }),
    );

    if (!expectedFailure.test(result.failures.join("\n"))) {
      issues.push(`${responseKey}:missing-failure`);
    }
    if (apiData.events.at(-1)?.responseKey !== responseKey) {
      issues.push(`${responseKey}:continued-request`);
    }
  }

  assert.deepEqual(issues, []);
});

test("AD-8 caregiver interview acceptance requires caregiver authorization before writing assessment", async () => {
  const apiData = createApiData({
    caregiverSummaryStatus: 403,
  });
  const result = await verifyAd8CaregiverInterviewAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /家属授权摘要 API.*HTTP 403/);
  assert.equal(apiData.calls.assessmentCreates, 0);
});

test("AD-8 caregiver interview acceptance rejects non-approved human review before API calls", async () => {
  const apiData = createApiData();
  const result = await verifyAd8CaregiverInterviewAcceptance(
    validConfig({
      fetchImpl: createFetchImpl(apiData),
      humanReview: {
        reviewerUserId: "doctor-user-id",
        reviewedAt: "2026-05-31T09:15:00.000Z",
        conclusion: "needs_revision",
      },
    }),
  );

  assert.match(result.failures.join("\n"), /approved|人工复核/);
  assert.equal(apiData.calls.meRequests, 0);
  assert.equal(apiData.calls.assessmentCreates, 0);
});

test("AD-8 caregiver interview acceptance rejects unsafe interview config before API writes", async () => {
  const apiData = createApiData();
  const result = await verifyAd8CaregiverInterviewAcceptance(
    validConfig({
      fetchImpl: createFetchImpl(apiData),
      interview: {
        assessmentSource: "caregiver_interview",
        transcript: "manual demo transcript must never become formal evidence",
        analysisSummary:
          "AD-8 总分 4 分，提示认知改变可能，建议结合 MMSE/CDR 复核。",
        confidence: 0.86,
        items: {
          itemMemoryProblems: 1,
          itemReducedInterest: 0,
          itemRepeatsQuestions: 1,
          itemTroubleLearningTools: 0,
          itemForgetsMonthYear: 1,
          itemHandlesFinancesPoorly: 1,
          itemTroubleAppointments: 0,
          itemDailyThinkingMemoryProblems: 0,
        },
      },
      humanReview: {
        reviewerUserId: "doctor-user-id",
        reviewedAt: "2026-05-31T09:15:00.000Z",
        conclusion: "approved",
        notes: "secret_token_abcdef1234567890",
      },
    }),
  );

  assert.match(
    result.failures.join("\n"),
    /interview\.transcript|humanReview\.notes/,
  );
  assert.match(
    result.failures.join("\n"),
    /正式 AD-8 配置|敏感字段|mock\/demo/,
  );
  assert.equal(apiData.calls.meRequests, 0);
  assert.equal(apiData.calls.assessmentCreates, 0);
});

test("AD-8 caregiver interview acceptance rejects credential-like clinical config text before network calls without echoing values", async () => {
  const cases = [
    ["patientId", "token:patient-secret-12345"],
    ["informant.caregiverUserId", "authorization=caregiver-secret-12345"],
    ["informant.relation", "credential relation-secret-12345"],
    ["humanReview.reviewerUserId", "api key reviewer-secret-12345"],
    ["humanReview.notes", "token:review-secret-12345"],
    ["humanReview.notes", "token=review-secret-12345"],
    ["humanReview.notes", "token review-secret-12345"],
    ["humanReview.notes", "token_reviewsecret12345"],
    ["humanReview.notes", "token-reviewsecret12345"],
    ["interview.assessmentSource", "secret:source-secret-12345"],
    ["interview.transcript", "Bearer transcript-secret-12345"],
    ["interview.analysisSummary", "password summary-secret-12345"],
  ];
  const issues = [];

  for (const [path, unsafeValue] of cases) {
    const apiData = createApiData();
    const config = validConfig({ fetchImpl: createFetchImpl(apiData) });
    const pathParts = path.split(".");
    if (pathParts.length === 1) {
      config[path] = unsafeValue;
    } else {
      config[pathParts[0]][pathParts[1]] = unsafeValue;
    }

    const result = await verifyAd8CaregiverInterviewAcceptance(config);
    const failures = result.failures.join("\n");
    const expectedPath = `正式 AD-8 配置.${path}`;
    if (!failures.includes(expectedPath) || !/敏感字段/.test(failures)) {
      issues.push(`${path}:missing-redacted-failure`);
    }
    if (failures.includes(unsafeValue)) {
      issues.push(`${path}:value-echoed`);
    }
    if (apiData.events.length !== 0) {
      issues.push(`${path}:network-called`);
    }
  }

  const safeResult = await verifyAd8CaregiverInterviewAcceptance(validConfig());
  if (safeResult.failures.length !== 0) {
    issues.push("normal-chinese-clinical-text:rejected");
  }

  assert.deepEqual(issues, []);
});

test("AD-8 caregiver interview acceptance enforces the eight-character secret payload separator matrix", async () => {
  const unsafeValues = [
    "token::abcd1234",
    "api_key: :abcd1234",
    "credential = :abcd1234",
    "authorization_-:=abcd1234",
    "token-plan-secret-12345",
  ];
  const safeValues = [
    "token::abc1234",
    "token-plan endpoint",
    "0123456789abcdef0123456789abcdef01234567",
    "550e8400-e29b-41d4-a716-446655440000",
  ];
  const issues = [];

  for (const unsafeValue of unsafeValues) {
    const apiData = createApiData();
    const config = validConfig({ fetchImpl: createFetchImpl(apiData) });
    config.humanReview.notes = unsafeValue;

    const result = await verifyAd8CaregiverInterviewAcceptance(config);
    const failures = result.failures.join("\n");
    if (!failures.includes("正式 AD-8 配置.humanReview.notes")) {
      issues.push(`${unsafeValue}:missing-failure`);
    }
    if (failures.includes(unsafeValue)) {
      issues.push(`${unsafeValue}:value-echoed`);
    }
    if (apiData.events.length !== 0) {
      issues.push(`${unsafeValue}:network-called`);
    }
  }

  for (const safeValue of safeValues) {
    const assessment = ad8Assessment({
      rawInputSummary: { humanReview: { notes: safeValue } },
    });
    const apiData = createApiData({
      createdAssessment: assessment,
      assessmentsAfterFormal: [assessment],
    });
    const result = await verifyAd8CaregiverInterviewAcceptance(
      validConfig({
        fetchImpl: createFetchImpl(apiData),
        humanReview: {
          reviewerUserId: "doctor-user-id",
          reviewedAt: "2026-05-31T09:15:00.000Z",
          conclusion: "approved",
          notes: safeValue,
        },
      }),
    );
    if (result.failures.length !== 0) {
      issues.push(`${safeValue}:safe-value-rejected`);
    }
  }

  assert.deepEqual(issues, []);
});

test("AD-8 caregiver interview acceptance rejects sensitive informant keys before network calls", async () => {
  const issues = [];
  const cases = [
    ["accessToken", "opaque-provider-credential"],
    ["token", "opaque-session-reference"],
    ["rawPayload", { source: "caregiver-device" }],
    ["password", "caregiver-passphrase"],
    ["cookie", "caregiver-cookie-reference"],
    ["session", "caregiver-session-reference"],
  ];

  for (const [field, value] of cases) {
    const apiData = createApiData();
    const result = await verifyAd8CaregiverInterviewAcceptance(
      validConfig({
        fetchImpl: createFetchImpl(apiData),
        informant: {
          caregiverUserId: "caregiver-user-id",
          relation: "daughter",
          [field]: value,
        },
      }),
    );

    if (!new RegExp(`informant\\.${field}`).test(result.failures.join("\n"))) {
      issues.push(`${field}:missing-failure`);
    }
    if (apiData.events.length !== 0) {
      issues.push(`${field}:network-called`);
    }
  }

  assert.deepEqual(issues, []);
});

test("AD-8 caregiver interview acceptance normalizes only common leetspeak digits for dangerous key recognition", async () => {
  const issues = [];
  const dangerousFields = [
    "t0ken",
    "4uthorization",
    "apiK3y",
    "pa55word",
    "credent1al",
    "5ecret",
    "sess10n",
  ];

  for (const field of dangerousFields) {
    const apiData = createApiData();
    const config = validConfig({ fetchImpl: createFetchImpl(apiData) });
    config.humanReview[field] = "must-not-echo-sensitive-value-123";

    const result = await verifyAd8CaregiverInterviewAcceptance(config);
    const failures = result.failures.join("\n");
    if (
      !failures.includes(`正式 AD-8 配置.humanReview.${field}`) ||
      !/敏感字段/.test(failures)
    ) {
      issues.push(`${field}:missing-dangerous-key-failure`);
    }
    if (failures.includes("must-not-echo-sensitive-value-123")) {
      issues.push(`${field}:value-echoed`);
    }
    if (apiData.events.length !== 0) {
      issues.push(`${field}:network-called`);
    }
  }

  const safeFields = {
    clinicalReview2024: "临床复核记录编号",
    adl3MonthTrend: "近三个月日常生活能力变化",
    item4Orientation: "第四项定向力观察",
  };
  const safeApiData = createApiData();
  const safeConfig = validConfig({ fetchImpl: createFetchImpl(safeApiData) });
  Object.assign(safeConfig.humanReview, safeFields);
  const safeResult = await verifyAd8CaregiverInterviewAcceptance(safeConfig);
  if (safeResult.failures.length !== 0) {
    issues.push("ordinary-numeric-clinical-keys:rejected");
  }
  for (const field of Object.keys(safeFields)) {
    if (
      Object.hasOwn(
        safeApiData.createdAssessmentBody.rawInputSummary.humanReview,
        field,
      )
    ) {
      issues.push(`${field}:unexpected-formal-passthrough`);
    }
  }

  assert.deepEqual(issues, []);
});

test("AD-8 formal body source forbids informant passthrough or spread", async () => {
  const source = await readFile(
    new URL(
      "../verify-ad8-caregiver-interview-acceptance.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  const buildBodySource = source.match(
    /function buildAd8FormalAssessmentBody[\s\S]*?\n}\n\nfunction verifyCreatedAssessmentResponse/,
  )?.[0];

  assert.ok(buildBodySource, "buildAd8FormalAssessmentBody source must exist");
  assert.doesNotMatch(buildBodySource, /^ {6}informant,\s*$/m);
  assert.doesNotMatch(buildBodySource, /informant\s*:\s*informant\b/);
  assert.doesNotMatch(buildBodySource, /\.\.\.\s*informant\b/);
});

test("AD-8 caregiver interview acceptance requires exactly the two informant own enumerable keys on a plain object", async () => {
  const inheritedInformant = Object.assign(
    Object.create({ nickname: "must-not-echo-inherited-value" }),
    {
      caregiverUserId: "caregiver-user-id",
      relation: "daughter",
    },
  );
  const symbolInformant = {
    caregiverUserId: "caregiver-user-id",
    relation: "daughter",
  };
  Object.defineProperty(symbolInformant, Symbol("hidden-extra"), {
    value: "must-not-echo-symbol-value",
    enumerable: true,
  });
  const nonEnumerableInformant = {
    caregiverUserId: "caregiver-user-id",
    relation: "daughter",
  };
  Object.defineProperty(nonEnumerableInformant, "hiddenExtra", {
    value: "must-not-echo-non-enumerable-value",
    enumerable: false,
  });
  const nullPrototypeInformant = Object.assign(Object.create(null), {
    caregiverUserId: "caregiver-user-id",
    relation: "daughter",
  });
  const cases = [
    [
      "ordinary-extra",
      {
        caregiverUserId: "caregiver-user-id",
        relation: "daughter",
        nickname: "must-not-echo-extra-value",
      },
    ],
    [
      "constructor-extra",
      {
        caregiverUserId: "caregiver-user-id",
        relation: "daughter",
        constructor: "must-not-echo-constructor-value",
      },
    ],
    [
      "proto-own-extra",
      JSON.parse(
        '{"caregiverUserId":"caregiver-user-id","relation":"daughter","__proto__":{"note":"must-not-echo-proto-value"}}',
      ),
    ],
    ["custom-prototype", inheritedInformant],
    ["symbol-extra", symbolInformant],
    ["non-enumerable-extra", nonEnumerableInformant],
    ["null-prototype", nullPrototypeInformant],
  ];
  const issues = [];

  for (const [label, informant] of cases) {
    const apiData = createApiData();
    const result = await verifyAd8CaregiverInterviewAcceptance(
      validConfig({
        fetchImpl: createFetchImpl(apiData),
        informant,
      }),
    );
    const failures = result.failures.join("\n");
    if (!/informant.*(?:own enumerable keys|普通对象原型)/.test(failures)) {
      issues.push(`${label}:missing-shape-failure`);
    }
    if (
      /must-not-echo-(?:extra|constructor|proto|inherited|symbol)-value/.test(
        failures,
      )
    ) {
      issues.push(`${label}:value-echoed`);
    }
    if (apiData.events.length !== 0) {
      issues.push(`${label}:network-called`);
    }
  }

  const safeApiData = createApiData();
  const safeResult = await verifyAd8CaregiverInterviewAcceptance(
    validConfig({ fetchImpl: createFetchImpl(safeApiData) }),
  );
  if (safeResult.failures.length !== 0) {
    issues.push("exact-plain-informant:rejected");
  }
  if (
    !safeApiData.createdAssessmentBody ||
    !Object.keys(
      safeApiData.createdAssessmentBody.rawInputSummary.informant,
    ).every((key) => ["caregiverUserId", "relation"].includes(key)) ||
    Object.keys(safeApiData.createdAssessmentBody.rawInputSummary.informant)
      .length !== 2
  ) {
    issues.push("formal-body:not-explicitly-mapped");
  }

  assert.deepEqual(issues, []);
});

test("AD-8 caregiver interview acceptance recursively enforces the JSON plain-object contract before network", async () => {
  const issues = [];
  const cases = [];

  const customPrototype = validConfig();
  Object.setPrototypeOf(customPrototype, {
    inheritedField: "must-not-echo-inherited-config-value",
  });
  cases.push(["custom-prototype", customPrototype]);

  const nullPrototype = Object.assign(Object.create(null), validConfig());
  cases.push(["null-prototype", nullPrototype]);

  const nonEnumerable = validConfig();
  Object.defineProperty(nonEnumerable.humanReview, "hiddenField", {
    value: "must-not-echo-hidden-config-value",
    enumerable: false,
  });
  cases.push(["non-enumerable", nonEnumerable]);

  const symbolKey = validConfig();
  symbolKey.interview[Symbol("hidden-field")] =
    "must-not-echo-symbol-config-value";
  cases.push(["symbol", symbolKey]);

  const inheritedArrayItem = Object.assign(
    Object.create({ hidden: "must-not-echo-array-inherited-value" }),
    { clinical: "safe" },
  );
  const recursiveArray = validConfig();
  recursiveArray.extensions = [inheritedArrayItem];
  cases.push(["recursive-array-item", recursiveArray]);

  for (const [label, config] of cases) {
    const apiData = createApiData();
    globalThis.fetch = createFetchImpl(apiData);
    const result = await verifyAd8CaregiverInterviewAcceptance(config);
    const failures = result.failures.join("\n");
    if (!/JSON|plain|普通对象|own enumerable keys/.test(failures)) {
      issues.push(`${label}:missing-contract-failure`);
    }
    if (/must-not-echo/.test(failures)) {
      issues.push(`${label}:value-echoed`);
    }
    if (apiData.events.length !== 0) {
      issues.push(`${label}:network-called`);
    }
  }

  assert.deepEqual(issues, []);
});

test("AD-8 caregiver interview acceptance requires caregiver session to match the informant user", async () => {
  const apiData = createApiData({
    caregiverMe: {
      user: {
        id: "caregiver-token-user-id",
        account: "caregiver001",
        roles: [{ roleCode: "caregiver" }],
      },
    },
  });
  const result = await verifyAd8CaregiverInterviewAcceptance(
    validConfig({
      fetchImpl: createFetchImpl(apiData),
      informant: {
        caregiverUserId: "other-caregiver-user-id",
        relation: "daughter",
      },
    }),
  );

  assert.match(
    result.failures.join("\n"),
    /informant\.caregiverUserId|家属会话/,
  );
  assert.equal(apiData.calls.caregiverMeRequests, 1);
  assert.equal(apiData.calls.assessmentCreates, 0);
});

test("AD-8 caregiver interview acceptance rejects incomplete item scores and mismatched total", async () => {
  const result = await verifyAd8CaregiverInterviewAcceptance(
    validConfig({
      interview: {
        items: {
          itemMemoryProblems: 1,
          itemReducedInterest: 0,
          itemRepeatsQuestions: 1,
          itemTroubleLearningTools: 0,
          itemForgetsMonthYear: 1,
          itemHandlesFinancesPoorly: 2,
          itemTroubleAppointments: 0,
        },
      },
    }),
  );

  assert.match(result.failures.join("\n"), /AD-8.*8 个题项|只能是 0 或 1/);
});

test("AD-8 caregiver interview acceptance requires formal assessment risk grade and AI analysis", async () => {
  const apiData = createApiData({
    assessmentsAfterFormal: [
      {
        ...ad8Assessment(),
        riskGrades: [],
        aiAnalyses: [],
      },
    ],
  });
  const result = await verifyAd8CaregiverInterviewAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /风险评级|分析记录/);
});

test("AD-8 caregiver interview acceptance requires isCurrent to be boolean true", async () => {
  const apiData = createApiData({
    assessmentsAfterFormal: [
      ad8Assessment({
        riskGrades: [
          {
            id: "risk_ad8_string_false",
            riskLevel: "moderate",
            systemRiskLevel: "moderate",
            reasonSummary: "历史风险记录，不得作为当前风险。",
            isCurrent: "false",
          },
        ],
      }),
    ],
  });

  const result = await verifyAd8CaregiverInterviewAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /isCurrent=true|当前风险评级/);
});

test("AD-8 caregiver interview acceptance rejects missing audit logs", async () => {
  const apiData = createApiData({
    audit: {
      "assessment.create": [],
      "caregiver.summary.view": [],
    },
  });
  const result = await verifyAd8CaregiverInterviewAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /审计日志/);
});

test("AD-8 caregiver interview acceptance requires exactly one matching candidate for each audit action", async () => {
  const issues = [];
  for (const action of ["assessment.create", "caregiver.summary.view"]) {
    const apiData = createApiData();
    const candidate = apiData.audit[action][0];
    apiData.audit[action] = [
      candidate,
      { ...candidate, id: `${candidate.id}_2` },
    ];

    const result = await verifyAd8CaregiverInterviewAcceptance(
      validConfig({ fetchImpl: createFetchImpl(apiData) }),
    );
    if (!/候选.*(?:恰好|严格).*1|数量.*1/.test(result.failures.join("\n"))) {
      issues.push(`${action}:duplicate-accepted`);
    }
  }

  assert.deepEqual(issues, []);
});

test("AD-8 caregiver interview acceptance recursively scans every audit candidate", async () => {
  const sensitiveValue = "must-not-echo-audit-secret-90817";
  const apiData = createApiData();
  apiData.audit["assessment.create"].push({
    id: "unmatched-audit-candidate",
    action: "other.action",
    targetType: "other_target",
    targetId: "other-target",
    result: "failure",
    metadata: {
      nested: { accessToken: sensitiveValue },
      synthetic: "clean-looking-value",
    },
  });

  const result = await verifyAd8CaregiverInterviewAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );
  const failures = result.failures.join("\n");

  assert.match(failures, /审计.*(?:accessToken|synthetic)|敏感字段|标记/);
  assert.doesNotMatch(failures, new RegExp(sensitiveValue));
});

test("AD-8 caregiver interview acceptance recursively scans all business responses and formal records", async () => {
  const sensitiveValue = "must-not-echo-response-secret-90817";
  const issues = [];
  const scenarios = [
    [
      "doctorMe",
      (data) => ({ ...data.me, nested: { accessToken: sensitiveValue } }),
    ],
    [
      "patient",
      (data) => ({ ...data.patient, nested: { accessToken: sensitiveValue } }),
    ],
    [
      "caregiverSummary",
      (data) => ({
        ...data.caregiverSummary,
        nested: { accessToken: sensitiveValue },
      }),
    ],
    [
      "assessmentsBefore",
      () => [{ id: "old", nested: { accessToken: sensitiveValue } }],
    ],
    [
      "assessmentCreate",
      (data) => ({
        ...data.createdAssessment,
        nested: { accessToken: sensitiveValue },
      }),
    ],
    [
      "assessmentsAfter",
      () => [
        ad8Assessment({ rawInputSummary: { accessToken: sensitiveValue } }),
      ],
    ],
    [
      "assessmentAudit",
      (data) => [
        {
          ...data.audit["assessment.create"][0],
          metadata: { nested: { accessToken: sensitiveValue } },
        },
      ],
    ],
  ];

  for (const [responseKey, buildBody] of scenarios) {
    const apiData = createApiData();
    apiData.responseOverrides[responseKey] = buildBody(apiData);
    const result = await verifyAd8CaregiverInterviewAcceptance(
      validConfig({ fetchImpl: createFetchImpl(apiData) }),
    );
    const failures = result.failures.join("\n");
    if (!/accessToken|敏感字段|敏感值/.test(failures)) {
      issues.push(`${responseKey}:missing-recursive-failure`);
    }
    if (failures.includes(sensitiveValue)) {
      issues.push(`${responseKey}:value-echoed`);
    }
    if (apiData.events.at(-1)?.responseKey !== responseKey) {
      issues.push(`${responseKey}:continued-request`);
    }
  }

  assert.deepEqual(issues, []);
});

test("AD-8 caregiver interview acceptance reports only paths and categories for server mismatches", async () => {
  const serverAssessmentId = "server-returned-assessment-id-90817";
  const missingApiData = createApiData({
    createdAssessment: { ...ad8Assessment(), id: serverAssessmentId },
  });
  const missingResult = await verifyAd8CaregiverInterviewAcceptance(
    validConfig({ fetchImpl: createFetchImpl(missingApiData) }),
  );
  assert.match(missingResult.failures.join("\n"), /评估列表|assessmentId/);
  assert.doesNotMatch(
    missingResult.failures.join("\n"),
    new RegExp(serverAssessmentId),
  );

  const mismatchApiData = createApiData({
    assessmentsAfterFormal: [ad8Assessment({ patientId: "srv-id-9" })],
  });
  const mismatchResult = await verifyAd8CaregiverInterviewAcceptance(
    validConfig({ fetchImpl: createFetchImpl(mismatchApiData) }),
  );
  const mismatchFailures = mismatchResult.failures.join("\n");
  assert.match(mismatchFailures, /正式评估记录\.patientId/);
  assert.doesNotMatch(mismatchFailures, /srv-id-9|patient_real_001/);
});

test("AD-8 caregiver interview acceptance rejects synthetic markers in keys and values", async () => {
  const issues = [];
  for (const [field, value] of [
    ["synthetic", "clean-looking-value"],
    ["clinicalMarker", "synthetic-output"],
    ["mockEnvelope", "clean-looking-value"],
    ["fallbackTrace", "clean-looking-value"],
    ["demoEvidence", "clean-looking-value"],
  ]) {
    const apiData = createApiData();
    const config = validConfig({ fetchImpl: createFetchImpl(apiData) });
    config.humanReview[field] = value;
    const result = await verifyAd8CaregiverInterviewAcceptance(config);
    if (
      !/synthetic|mock|fallback|demo|标记/i.test(result.failures.join("\n"))
    ) {
      issues.push(`${field}:marker-accepted`);
    }
    if (apiData.events.length !== 0) {
      issues.push(`${field}:network-called`);
    }
  }
  assert.deepEqual(issues, []);
});

test("AD-8 caregiver interview acceptance rejects demo markers and raw sensitive metadata", async () => {
  const apiData = createApiData({
    audit: {
      "assessment.create": [
        {
          id: "audit_assessment_create_001",
          action: "assessment.create",
          targetType: "assessment_record",
          targetId: "assessment_ad8_001",
          result: "success",
          metadata: {
            transcript: "照护者原始访谈全文不应进入审计",
          },
        },
      ],
      "caregiver.summary.view": [
        {
          id: "audit_caregiver_summary_001",
          action: "caregiver.summary.view",
          targetType: "patient_profile",
          targetId: "patient_real_001",
          result: "success",
          metadata: {},
        },
      ],
    },
  });
  const result = await verifyAd8CaregiverInterviewAcceptance(
    validConfig({
      apiBaseUrl: "https://rehab.example.com/api",
      fetchImpl: createFetchImpl(apiData),
    }),
  );

  assert.match(result.failures.join("\n"), /敏感字段|原始载荷/);
});

test("AD-8 caregiver interview acceptance CLI hides failed response body details", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ad8-caregiver-acceptance-"));
  const configPath = join(dir, "ad8-config.json");
  await writeFile(
    configPath,
    JSON.stringify({
      apiBaseUrl: "https://rehab.example.com",
      doctorAccount: "doctor001",
      doctorPassword: "doctor-password",
      caregiverAccount: "caregiver001",
      caregiverPassword: "caregiver-password",
      auditAccount: "auditor001",
      auditPassword: "auditor-password",
      patientId: "patient_real_001",
      informant: {
        caregiverUserId: "caregiver-user-id",
        relation: "daughter",
      },
      humanReview: {
        reviewerUserId: "doctor-user-id",
        reviewedAt: "2026-05-31T09:15:00.000Z",
        conclusion: "approved",
      },
      interview: {
        assessmentSource: "caregiver_interview",
        transcript: "照护者反馈患者近期重复提问。",
        analysisSummary: "AD-8 总分 2 分，提示认知改变可能。",
        confidence: 0.86,
        items: {
          itemMemoryProblems: 1,
          itemReducedInterest: 0,
          itemRepeatsQuestions: 1,
          itemTroubleLearningTools: 0,
          itemForgetsMonthYear: 0,
          itemHandlesFinancesPoorly: 0,
          itemTroubleAppointments: 0,
          itemDailyThinkingMemoryProblems: 0,
        },
      },
    }),
  );
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
      "    return 'transcript=照护者敏感原文 token=real-secret-token-123';",
      "  }",
      "});",
      "",
    ].join("\n"),
  );

  await assert.rejects(
    () =>
      execFileAsync("node", [
        "--import",
        fetchFixturePath,
        "scripts/verify-ad8-caregiver-interview-acceptance.mjs",
        configPath,
      ]),
    (error) => {
      assert.match(error.stderr, /HTTP 502/);
      assert.match(error.stderr, /响应体已隐藏/);
      assert.doesNotMatch(error.stderr, /照护者敏感原文/);
      assert.doesNotMatch(error.stderr, /real-secret-token-123/);
      return true;
    },
  );
});

test("AD-8 caregiver interview acceptance CLI prints a fixed redacted message for invalid JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ad8-caregiver-invalid-json-"));
  const configPath = join(dir, "ad8-invalid.json");
  const sensitiveInvalidJson =
    '{"humanReview":{"notes":"must-not-echo-parser-secret-123"},';
  await writeFile(configPath, sensitiveInvalidJson);

  await assert.rejects(
    () =>
      execFileAsync("node", [
        "scripts/verify-ad8-caregiver-interview-acceptance.mjs",
        configPath,
      ]),
    (error) => {
      assert.equal(error.stderr, "配置文件不是有效 JSON。\n");
      assert.doesNotMatch(error.stderr, /must-not-echo-parser-secret-123/);
      assert.doesNotMatch(error.stderr, /Unexpected|Expected|position|column/i);
      return true;
    },
  );
});

test("AD-8 caregiver interview acceptance can be imported when process.argv[1] is absent", async () => {
  const moduleUrl = new URL(
    "../verify-ad8-caregiver-interview-acceptance.mjs",
    import.meta.url,
  ).href;
  const result = await execFileAsync("node", [
    "--input-type=module",
    "--eval",
    `delete process.argv[1]; await import(${JSON.stringify(moduleUrl)});`,
  ]);

  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

function createFetchImpl(apiData = createApiData()) {
  return async (url, options = {}) => {
    const parsed = new URL(url);
    const method = (options.method ?? "GET").toUpperCase();
    const headers = new Headers(options.headers);
    const cookie = headers.get("cookie") ?? "";
    const event = {
      method,
      path: parsed.pathname,
      cookie,
      csrf: headers.get("x-csrf-token") ?? undefined,
      authorization: headers.get("authorization") ?? undefined,
    };
    apiData.events.push(event);

    if (method === "GET" && parsed.pathname === "/auth/csrf") {
      apiData.csrfSequence += 1;
      const csrf = `csrf-${apiData.csrfSequence}`;
      return response(200, { csrfToken: csrf }, parsed, [
        `rehab_csrf=${csrf}; Path=/; SameSite=Lax`,
      ]);
    }

    if (method === "POST" && parsed.pathname === "/auth/login") {
      const body = JSON.parse(options.body);
      event.account = body.account;
      apiData.calls.loginAccounts.push(body.account);
      const cookies = parseCookies(cookie);
      if (!cookies.rehab_csrf || event.csrf !== cookies.rehab_csrf) {
        return response(403, { message: "CSRF token invalid" }, parsed);
      }
      const loginFailure = apiData.loginFailures[body.account];
      if (loginFailure) {
        return response(loginFailure, { message: "login rejected" }, parsed);
      }
      const session = `${body.account}-session`;
      const csrf = `${body.account}-csrf`;
      apiData.sessions[body.account] = session;
      return response(
        201,
        {
          status: "authenticated",
          context: { primaryRole: body.account },
          accessToken: "Bearer malicious-legacy-access-token",
        },
        parsed,
        [
          `rehab_session=${session}; Path=/; HttpOnly`,
          `rehab_csrf=${csrf}; Path=/; SameSite=Lax`,
        ],
      );
    }

    const requestCookies = parseCookies(cookie);
    const account = Object.entries(apiData.sessions).find(
      ([, session]) => session === requestCookies.rehab_session,
    )?.[0];
    event.account = account;
    if (!account) {
      return response(401, { message: "missing session cookie" }, parsed);
    }
    if (
      method !== "GET" &&
      method !== "HEAD" &&
      (!requestCookies.rehab_csrf || event.csrf !== requestCookies.rehab_csrf)
    ) {
      return response(403, { message: "CSRF token invalid" }, parsed);
    }

    if (parsed.pathname.endsWith("/me")) {
      if (account === "caregiver001") {
        apiData.calls.caregiverMeRequests += 1;
        return apiResponse(
          apiData,
          event,
          "caregiverMe",
          apiData.caregiverMe,
          parsed,
        );
      }
      apiData.calls.meRequests += 1;
      return apiResponse(apiData, event, "doctorMe", apiData.me, parsed);
    }

    if (parsed.pathname.endsWith(`/patients/${apiData.patient.id}`)) {
      return apiResponse(apiData, event, "patient", apiData.patient, parsed);
    }

    if (
      parsed.pathname.endsWith(
        `/caregiver/patients/${apiData.patient.id}/summary`,
      )
    ) {
      apiData.calls.caregiverSummaryReads += 1;
      if (apiData.caregiverSummaryStatus !== 200) {
        return response(
          apiData.caregiverSummaryStatus,
          { message: "forbidden" },
          parsed,
        );
      }
      return apiResponse(
        apiData,
        event,
        "caregiverSummary",
        apiData.caregiverSummary,
        parsed,
      );
    }

    if (
      parsed.pathname.endsWith(`/patients/${apiData.patient.id}/assessments`)
    ) {
      apiData.calls.assessmentsReads += 1;
      if (apiData.calls.assessmentsReads === 1) {
        return apiResponse(
          apiData,
          event,
          "assessmentsBefore",
          apiData.assessmentsBefore,
          parsed,
        );
      }
      return apiResponse(
        apiData,
        event,
        "assessmentsAfter",
        apiData.assessmentsAfterFormal,
        parsed,
      );
    }

    if (parsed.pathname.endsWith("/assessments")) {
      apiData.calls.assessmentCreates += 1;
      apiData.createdAssessmentBody = JSON.parse(options.body);
      return apiResponse(
        apiData,
        event,
        "assessmentCreate",
        apiData.createdAssessment,
        parsed,
      );
    }

    if (parsed.pathname.endsWith("/admin/audit-logs")) {
      const action = parsed.searchParams.get("action") ?? "";
      const responseKey =
        action === "assessment.create" ? "assessmentAudit" : "caregiverAudit";
      return apiResponse(
        apiData,
        event,
        responseKey,
        apiData.audit[action] ?? [],
        parsed,
      );
    }

    return response(404, { message: "not found" }, parsed);
  };
}

function createApiData(overrides = {}) {
  const createdAssessment = ad8Assessment();
  return deepMerge(
    {
      calls: {
        loginAccounts: [],
        meRequests: 0,
        caregiverMeRequests: 0,
        caregiverSummaryReads: 0,
        assessmentsReads: 0,
        assessmentCreates: 0,
      },
      csrfSequence: 0,
      events: [],
      sessions: {},
      loginFailures: {},
      responseOverrides: {},
      createdAssessmentBody: null,
      me: {
        user: {
          id: "doctor-user-id",
          account: "doctor001",
          roles: [{ roleCode: "doctor" }],
        },
      },
      caregiverMe: {
        user: {
          id: "caregiver-user-id",
          account: "caregiver001",
          roles: [{ roleCode: "caregiver" }],
        },
      },
      patient: {
        id: "patient_real_001",
        consents: [
          consent("privacy_policy"),
          consent("ai_processing"),
          consent("caregiver_sharing"),
        ],
      },
      caregiverSummaryStatus: 200,
      caregiverSummary: {
        patient: { id: "patient_real_001", name: "李*" },
        permissions: {
          rawAssessment: false,
          planEdit: false,
          fullMedicalRecord: false,
        },
      },
      assessmentsBefore: [],
      createdAssessment,
      assessmentsAfterFormal: [createdAssessment],
      audit: {
        "assessment.create": [
          {
            id: "audit_assessment_create_001",
            action: "assessment.create",
            targetType: "assessment_record",
            targetId: "assessment_ad8_001",
            result: "success",
            metadata: null,
          },
        ],
        "caregiver.summary.view": [
          {
            id: "audit_caregiver_summary_001",
            action: "caregiver.summary.view",
            targetType: "patient_profile",
            targetId: "patient_real_001",
            result: "success",
            metadata: {},
          },
        ],
      },
    },
    overrides,
  );
}

function ad8Assessment(overrides = {}) {
  return deepMerge(
    {
      id: "assessment_ad8_001",
      patientId: "patient_real_001",
      assessmentType: "AD-8",
      source: "clinician_input",
      scoreSummary: {
        ad8Total: 4,
        itemMemoryProblems: 1,
        itemReducedInterest: 0,
        itemRepeatsQuestions: 1,
        itemTroubleLearningTools: 0,
        itemForgetsMonthYear: 1,
        itemHandlesFinancesPoorly: 1,
        itemTroubleAppointments: 0,
        itemDailyThinkingMemoryProblems: 0,
      },
      rawInputSummary: {
        source: "clinician_input",
        interviewSource: "caregiver_interview",
        transcript: "照护者反馈患者近期重复提问、处理财务困难、忘记日期。",
        analysisSummary:
          "AD-8 总分 4 分，提示认知改变可能，建议结合 MMSE/CDR 复核。",
        modelVersion: "ad8-clinician-structured-v1",
        confidence: 0.86,
        informant: {
          caregiverUserId: "caregiver-user-id",
          relation: "daughter",
        },
        scaleVersion: "AD8-2005",
        humanReview: {
          required: true,
          reviewerUserId: "doctor-user-id",
          reviewedAt: "2026-05-31T09:15:00.000Z",
          conclusion: "approved",
          notes: "医生已复核 AD-8 访谈和结构化题项。",
        },
      },
      riskGrades: [
        {
          id: "risk_ad8_001",
          riskLevel: "moderate",
          systemRiskLevel: "moderate",
          reasonSummary: "AD-8 4/8，提示认知改变可能，系统判定为中度风险。",
          isCurrent: true,
        },
      ],
      aiAnalyses: [
        {
          id: "analysis_ad8_001",
          analysisScene: "assessment_summary",
          modelVersion: "ad8-clinician-structured-v1",
          confidence: 0.86,
        },
      ],
    },
    overrides,
  );
}

function consent(consentType, overrides = {}) {
  return {
    id: `consent_${consentType}`,
    consentType,
    consentVersion: "v1.2",
    status: "granted",
    revokedAt: null,
    grantedAt: "2026-05-31T08:50:00.000Z",
    ...overrides,
  };
}

function response(status, body, url, cookies = []) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Request Failed",
    url: url.toString(),
    headers: {
      getSetCookie() {
        return cookies;
      },
    },
    async json() {
      return body;
    },
    async text() {
      if (body === EMPTY_BODY) return "";
      return JSON.stringify(body);
    },
  };
}

function apiResponse(apiData, event, responseKey, defaultBody, url) {
  event.responseKey = responseKey;
  const body = Object.prototype.hasOwnProperty.call(
    apiData.responseOverrides,
    responseKey,
  )
    ? apiData.responseOverrides[responseKey]
    : defaultBody;
  return response(200, body, url);
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separator = item.indexOf("=");
        return [item.slice(0, separator), item.slice(separator + 1)];
      }),
  );
}

function deepMerge(base, overrides) {
  if (overrides === null) return null;
  if (!isPlainObject(base) || !isPlainObject(overrides))
    return overrides === undefined ? base : overrides;
  const output = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    output[key] = deepMerge(base[key], value);
  }
  return output;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
