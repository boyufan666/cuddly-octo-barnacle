import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { verifyAiAssessmentAcceptance } from "../verify-ai-assessment-acceptance.mjs";

const execFileAsync = promisify(execFile);
const EMPTY_BODY = Symbol("empty-body");

function validConfig(overrides = {}) {
  const { fetchImpl = createFetchImpl(), ...configOverrides } = overrides;
  globalThis.fetch = fetchImpl;
  return {
    apiBaseUrl: "https://rehab.example.com",
    doctorAccount: "doctor001",
    doctorPassword: "doctor-password",
    auditAccount: "auditor001",
    auditPassword: "auditor-password",
    patientId: "patient_real_001",
    assessmentType: "MMSE/CDR",
    transcript: "患者完成 MMSE/CDR 评估，短时记忆与执行功能下降。",
    humanReview: {
      reviewerUserId: "doctor-user-id",
      reviewedAt: "2026-05-27T10:15:00.000Z",
      conclusion: "approved",
      notes: "医生复核评分和摘要后批准入库。",
    },
    ...configOverrides,
  };
}

test("AI assessment acceptance verifier creates formal assessment only after approved human review", async () => {
  const apiData = createApiData();
  const result = await verifyAiAssessmentAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.deepEqual(result.failures, []);
  assert.equal(apiData.calls.draftRequests, 1);
  assert.equal(apiData.calls.assessmentCreates, 1);
  assert.equal(apiData.calls.assessmentsReads, 3);
  assert.deepEqual(apiData.calls.loginAccounts, ["doctor001", "auditor001"]);
  assert.deepEqual(
    apiData.events
      .filter((event) => !event.path.startsWith("/auth/"))
      .map(({ method, path, account }) => ({ method, path, account })),
    [
      { method: "GET", path: "/me", account: "doctor001" },
      {
        method: "GET",
        path: "/patients/patient_real_001",
        account: "doctor001",
      },
      {
        method: "GET",
        path: "/patients/patient_real_001/assessments",
        account: "doctor001",
      },
      {
        method: "POST",
        path: "/ai/assessment-drafts",
        account: "doctor001",
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
  assert.deepEqual(
    apiData.createdAssessmentBody.rawInputSummary.evidence.humanReview,
    {
      required: true,
      reviewerUserId: "doctor-user-id",
      reviewedAt: "2026-05-27T10:15:00.000Z",
      conclusion: "approved",
      notes: "医生复核评分和摘要后批准入库。",
    },
  );
});

test("AI assessment acceptance verifier ignores legacy accessToken responses and never sends Bearer authorization", async () => {
  const apiData = createApiData();
  const result = await verifyAiAssessmentAcceptance(
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

test("AI assessment acceptance verifier requires human reviewer to match current doctor session user", async () => {
  const apiData = createApiData();
  const result = await verifyAiAssessmentAcceptance(
    validConfig({
      fetchImpl: createFetchImpl(apiData),
      humanReview: {
        reviewerUserId: "other-doctor-user-id",
        reviewedAt: "2026-05-27T10:15:00.000Z",
        conclusion: "approved",
      },
    }),
  );

  assert.match(result.failures.join("\n"), /复核人|当前医师/);
  assert.equal(apiData.calls.draftRequests, 0);
  assert.equal(apiData.calls.assessmentCreates, 0);
});

test("AI assessment acceptance verifier rejects legacy token-only config", async () => {
  const apiData = createApiData();
  const config = validConfig({ fetchImpl: createFetchImpl(apiData) });
  delete config.doctorAccount;
  delete config.doctorPassword;
  delete config.auditAccount;
  delete config.auditPassword;
  Object.assign(config, {
    doctorToken: "doctor-token",
    auditToken: "audit-token",
    accessToken: "Bearer malicious-legacy-access-token",
  });

  const result = await verifyAiAssessmentAcceptance(config);

  assert.match(result.failures.join("\n"), /doctorAccount|doctorPassword/);
  assert.match(result.failures.join("\n"), /auditAccount|auditPassword/);
  assert.equal(apiData.events.length, 0);
});

test("AI assessment acceptance verifier rejects credential-like clinical config text before network calls without echoing values", async () => {
  const cases = [
    ["patientId", "token:patient-secret-12345"],
    ["assessmentType", "api_key=assessment-secret-12345"],
    ["transcript", "Bearer transcript-secret-12345"],
    ["humanReview.reviewerUserId", "authorization reviewer-secret-12345"],
    ["humanReview.notes", "token:review-secret-12345"],
    ["humanReview.notes", "token=review-secret-12345"],
    ["humanReview.notes", "token review-secret-12345"],
    ["humanReview.notes", "token_review-secret-12345"],
    ["humanReview.notes", "token-review-secret-12345"],
  ];
  const issues = [];

  for (const [path, unsafeValue] of cases) {
    const apiData = createApiData();
    const config = validConfig({ fetchImpl: createFetchImpl(apiData) });
    if (path.startsWith("humanReview.")) {
      config.humanReview[path.slice("humanReview.".length)] = unsafeValue;
    } else {
      config[path] = unsafeValue;
    }

    const result = await verifyAiAssessmentAcceptance(config);
    const failures = result.failures.join("\n");
    const expectedPath = `正式 AI 评估配置.${path}`;
    if (!failures.includes(expectedPath) || !/敏感值/.test(failures)) {
      issues.push(`${path}:missing-redacted-failure`);
    }
    if (failures.includes(unsafeValue)) {
      issues.push(`${path}:value-echoed`);
    }
    if (apiData.events.length !== 0) {
      issues.push(`${path}:network-called`);
    }
  }

  const safeResult = await verifyAiAssessmentAcceptance(validConfig());
  if (safeResult.failures.length !== 0) {
    issues.push("normal-chinese-clinical-text:rejected");
  }

  assert.deepEqual(issues, []);
});

test("AI assessment acceptance verifier enforces the eight-character secret payload separator matrix", async () => {
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

    const result = await verifyAiAssessmentAcceptance(config);
    const failures = result.failures.join("\n");
    if (!failures.includes("正式 AI 评估配置.humanReview.notes")) {
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
    const assessment = formalAssessment({
      rawInputSummary: {
        evidence: { humanReview: { notes: safeValue } },
      },
    });
    const apiData = createApiData({
      createdAssessment: assessment,
      assessmentsAfterFormal: [assessment, existingAssessment()],
    });
    const result = await verifyAiAssessmentAcceptance(
      validConfig({
        fetchImpl: createFetchImpl(apiData),
        humanReview: {
          reviewerUserId: "doctor-user-id",
          reviewedAt: "2026-05-27T10:15:00.000Z",
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

test("AI assessment acceptance verifier rejects identical doctor and audit accounts before network", async () => {
  const apiData = createApiData();
  const result = await verifyAiAssessmentAcceptance(
    validConfig({
      fetchImpl: createFetchImpl(apiData),
      auditAccount: "doctor001",
    }),
  );

  assert.match(result.failures.join("\n"), /医师.*审计.*不同|账号.*不同/);
  assert.equal(apiData.events.length, 0);
});

test("AI assessment acceptance verifier recursively enforces the JSON plain-object contract before network", async () => {
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
  symbolKey.humanReview[Symbol("hidden-field")] =
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
    const result = await verifyAiAssessmentAcceptance(config);
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

test("AI assessment acceptance verifier recursively scans unknown top-level input fields before network", async () => {
  const issues = [];
  for (const [field, value] of [
    ["accessToken", "must-not-echo-top-level-secret-90817"],
    ["syntheticTrace", "clean-looking-value"],
  ]) {
    const apiData = createApiData();
    const config = validConfig({ fetchImpl: createFetchImpl(apiData) });
    config[field] = value;

    const result = await verifyAiAssessmentAcceptance(config);
    const failures = result.failures.join("\n");
    if (!failures.includes(`正式 AI 评估配置.${field}`)) {
      issues.push(`${field}:missing-failure`);
    }
    if (failures.includes(value)) {
      issues.push(`${field}:value-echoed`);
    }
    if (apiData.events.length !== 0) {
      issues.push(`${field}:network-called`);
    }
  }

  assert.deepEqual(issues, []);
});

test("AI assessment acceptance template requires account and password fields without tokens", async () => {
  const template = JSON.parse(
    await readFile(
      new URL(
        "../../docs/templates/ai-assessment-acceptance-config.template.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  for (const field of [
    "doctorAccount",
    "doctorPassword",
    "auditAccount",
    "auditPassword",
  ]) {
    assert.match(template[field], /^<[^>]+>$/);
  }
  for (const field of ["doctorToken", "auditToken", "accessToken"]) {
    assert.equal(Object.hasOwn(template, field), false);
  }
});

test("AI assessment acceptance verifier hard-fails login without retry or business requests", async () => {
  const apiData = createApiData({ loginFailures: { auditor001: 401 } });
  const result = await verifyAiAssessmentAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /审计.*登录.*HTTP 401/);
  assert.deepEqual(apiData.calls.loginAccounts, ["doctor001", "auditor001"]);
  assert.equal(
    apiData.events.some((event) => !event.path.startsWith("/auth/")),
    false,
  );
});

test("AI assessment acceptance verifier rejects every required API empty, null, or malformed response and stops", async () => {
  const issues = [];
  const cases = [
    ["doctorMe", EMPTY_BODY, /当前医师身份 API/],
    ["patient", null, /患者详情 API/],
    ["assessmentsBefore", {}, /AI 草稿前评估列表 API/],
    ["draft", [], /AI 评估草稿 API/],
    ["assessmentsAfterDraft", null, /AI 草稿后评估列表 API/],
    ["assessmentCreate", "unexpected-shape", /正式评估创建 API/],
    ["assessmentsAfterFormal", EMPTY_BODY, /正式评估后评估列表 API/],
    ["draftAudit", null, /AI 草稿审计 API/],
    ["assessmentAudit", {}, /正式评估审计 API/],
  ];

  for (const [responseKey, responseBody, expectedFailure] of cases) {
    const apiData = createApiData({
      responseOverrides: { [responseKey]: responseBody },
    });
    const result = await verifyAiAssessmentAcceptance(
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

test("AI assessment acceptance verifier rejects mock or demo API URLs", async () => {
  const result = await verifyAiAssessmentAcceptance(
    validConfig({ apiBaseUrl: "https://demo-rehab.example.com/api" }),
  );

  assert.match(result.failures.join("\n"), /mock|demo|fallback|fixed|seed/i);
});

test("AI assessment acceptance runbook documents the complete forbidden URL marker list", async () => {
  const runbook = await readFile(
    new URL("../../docs/ai-assessment-acceptance-runbook.md", import.meta.url),
    "utf8",
  );

  assert.match(runbook, /mock\/demo\/seed\/fallback\/fixed\/manual/);
  assert.match(runbook, /8 个字符|八个字符/);
  assert.match(runbook, /审计.*候选.*恰好一条|审计.*候选.*严格等于 1/);
  assert.match(runbook, /JSON plain object/);
});

test("AI assessment acceptance verifier rejects manual markers in AI evidence or formal records", async () => {
  const apiData = createApiData({
    draft: aiDraft({
      rawInputSummary: {
        evidence: {
          promptVersion: "manual-wrapped-ai-assessment",
        },
      },
    }),
  });
  const result = await verifyAiAssessmentAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /manual|手工/i);
  assert.equal(apiData.calls.assessmentCreates, 0);
});

test("AI assessment acceptance verifier rejects draft sensitive evidence fields before formal write", async () => {
  const apiData = createApiData({
    draft: aiDraft({
      rawInputSummary: {
        evidence: {
          accessToken: "opaque-provider-credential",
        },
      },
    }),
  });

  const result = await verifyAiAssessmentAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /evidence\.accessToken|敏感字段/);
  assert.equal(apiData.calls.assessmentCreates, 0);
  assert.equal(apiData.createdAssessmentBody, null);
});

test("AI assessment acceptance verifier normalizes only common leetspeak digits for dangerous key recognition", async () => {
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
    const apiData = createApiData({
      draft: aiDraft({
        rawInputSummary: {
          evidence: {
            [field]: "must-not-echo-sensitive-value-123",
          },
        },
      }),
    });
    const result = await verifyAiAssessmentAcceptance(
      validConfig({ fetchImpl: createFetchImpl(apiData) }),
    );
    const failures = result.failures.join("\n");
    if (
      !failures.includes(`rawInputSummary.evidence.${field}`) ||
      !/敏感字段/.test(failures)
    ) {
      issues.push(`${field}:missing-dangerous-key-failure`);
    }
    if (failures.includes("must-not-echo-sensitive-value-123")) {
      issues.push(`${field}:value-echoed`);
    }
    if (apiData.calls.assessmentCreates !== 0) {
      issues.push(`${field}:formal-write-called`);
    }
  }

  const safeFields = {
    clinicalReview2024: "临床复核记录编号",
    adl3MonthTrend: "近三个月日常生活能力变化",
    item4Orientation: "第四项定向力观察",
  };
  const safeApiData = createApiData({
    draft: aiDraft({
      rawInputSummary: { evidence: safeFields },
    }),
  });
  const safeResult = await verifyAiAssessmentAcceptance(
    validConfig({ fetchImpl: createFetchImpl(safeApiData) }),
  );
  if (safeResult.failures.length !== 0) {
    issues.push("ordinary-numeric-clinical-keys:rejected");
  }
  for (const field of Object.keys(safeFields)) {
    if (
      Object.hasOwn(
        safeApiData.createdAssessmentBody.rawInputSummary.evidence,
        field,
      )
    ) {
      issues.push(`${field}:unexpected-formal-passthrough`);
    }
  }

  assert.deepEqual(issues, []);
});

test("AI assessment acceptance verifier rejects sensitive score summary fields before formal write", async () => {
  const apiData = createApiData({
    draft: aiDraft({
      scoreSummary: {
        accessToken: "opaque-score-provider-credential",
      },
    }),
  });

  const result = await verifyAiAssessmentAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(
    result.failures.join("\n"),
    /scoreSummary\.accessToken|敏感字段/,
  );
  assert.equal(apiData.calls.assessmentCreates, 0);
  assert.equal(apiData.createdAssessmentBody, null);
});

test("AI assessment formal body source forbids score summary passthrough or spread", async () => {
  const source = await readFile(
    new URL("../verify-ai-assessment-acceptance.mjs", import.meta.url),
    "utf8",
  );
  const buildBodySource = source.match(
    /function buildFormalAssessmentBody[\s\S]*?\n}\n\nfunction verifyCreatedAssessmentResponse/,
  )?.[0];

  assert.ok(buildBodySource, "buildFormalAssessmentBody source must exist");
  assert.doesNotMatch(
    buildBodySource,
    /scoreSummary\s*:\s*draft\.scoreSummary\b/,
  );
  assert.doesNotMatch(buildBodySource, /\.\.\.\s*(?:draft\.)?scoreSummary\b/);
});

test("AI assessment acceptance verifier explicitly selects formal raw input and evidence fields", async () => {
  const apiData = createApiData({
    draft: aiDraft({
      rawInputSummary: {
        providerEnvelope: { region: "cn-east" },
        evidence: {
          providerDiagnostic: "safe-provider-diagnostic",
        },
      },
    }),
  });

  const result = await verifyAiAssessmentAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.deepEqual(result.failures, []);
  assert.equal(
    Object.hasOwn(
      apiData.createdAssessmentBody.rawInputSummary,
      "providerEnvelope",
    ),
    false,
  );
  assert.equal(
    Object.hasOwn(
      apiData.createdAssessmentBody.rawInputSummary.evidence,
      "providerDiagnostic",
    ),
    false,
  );
});

test("AI assessment acceptance verifier rejects revoked AI consent before provider draft call", async () => {
  const apiData = createApiData({
    patient: {
      consents: [
        consent("privacy_policy"),
        consent("ai_processing", {
          status: "revoked",
          revokedAt: "2026-05-27T10:00:00.000Z",
        }),
      ],
    },
  });
  const result = await verifyAiAssessmentAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /ai_processing/);
  assert.equal(apiData.calls.draftRequests, 0);
  assert.equal(apiData.calls.assessmentCreates, 0);
});

test("AI assessment acceptance verifier rejects draft responses that already created formal assessment records", async () => {
  const apiData = createApiData({
    assessmentsAfterDraft: [existingAssessment(), formalAssessment()],
  });
  const result = await verifyAiAssessmentAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /草稿.*正式评估|正式评估.*草稿/);
  assert.equal(apiData.calls.assessmentCreates, 0);
});

test("AI assessment acceptance verifier requires approved human review before formal submission", async () => {
  const apiData = createApiData();
  const result = await verifyAiAssessmentAcceptance(
    validConfig({
      fetchImpl: createFetchImpl(apiData),
      humanReview: {
        reviewerUserId: "doctor-user-id",
        reviewedAt: "2026-05-27T10:15:00.000Z",
        conclusion: "needs_revision",
      },
    }),
  );

  assert.match(result.failures.join("\n"), /approved|人工复核/);
  assert.equal(apiData.calls.draftRequests, 0);
  assert.equal(apiData.calls.assessmentCreates, 0);
});

test("AI assessment acceptance verifier rejects formal assessment missing risk grade and AI analysis", async () => {
  const apiData = createApiData({
    assessmentsAfterFormal: [
      {
        ...formalAssessment(),
        riskGrades: [],
        aiAnalyses: [],
      },
    ],
  });
  const result = await verifyAiAssessmentAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /风险评级|AI 分析/);
});

test("AI assessment acceptance verifier requires an explicitly current risk grade", async () => {
  const apiData = createApiData({
    assessmentsAfterFormal: [
      formalAssessment({
        riskGrades: [
          {
            id: "risk_ai_not_current",
            riskLevel: "moderate",
            systemRiskLevel: "moderate",
            reasonSummary: "历史风险记录，不得作为当前风险。",
            isCurrent: false,
          },
        ],
      }),
    ],
  });

  const result = await verifyAiAssessmentAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /isCurrent=true|当前风险评级/);
});

test("AI assessment acceptance verifier rejects audit logs that do not match draft and formal assessment evidence", async () => {
  const apiData = createApiData({
    audit: {
      "ai.assessment_draft.generate": [],
      "assessment.create": [],
    },
  });
  const result = await verifyAiAssessmentAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /审计日志/);
});

test("AI assessment acceptance verifier requires exactly one matching candidate for each audit action", async () => {
  const issues = [];
  for (const action of ["ai.assessment_draft.generate", "assessment.create"]) {
    const apiData = createApiData();
    const candidate = apiData.audit[action][0];
    apiData.audit[action] = [
      candidate,
      { ...candidate, id: `${candidate.id}_2` },
    ];

    const result = await verifyAiAssessmentAcceptance(
      validConfig({ fetchImpl: createFetchImpl(apiData) }),
    );
    if (!/候选.*(?:恰好|严格).*1|数量.*1/.test(result.failures.join("\n"))) {
      issues.push(`${action}:duplicate-accepted`);
    }
  }

  assert.deepEqual(issues, []);
});

test("AI assessment acceptance verifier recursively scans every audit candidate", async () => {
  const sensitiveValue = "must-not-echo-audit-secret-90817";
  const apiData = createApiData();
  apiData.audit["ai.assessment_draft.generate"].push({
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

  const result = await verifyAiAssessmentAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );
  const failures = result.failures.join("\n");

  assert.match(failures, /审计.*(?:accessToken|synthetic)|敏感字段|标记/);
  assert.doesNotMatch(failures, new RegExp(sensitiveValue));
});

test("AI assessment acceptance verifier recursively scans all business responses and formal records", async () => {
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
      "assessmentsBefore",
      () => [{ id: "old", nested: { accessToken: sensitiveValue } }],
    ],
    [
      "draft",
      (data) => aiDraft({ rawInputSummary: { accessToken: sensitiveValue } }),
    ],
    [
      "assessmentsAfterDraft",
      () => [
        { ...existingAssessment(), nested: { accessToken: sensitiveValue } },
      ],
    ],
    [
      "assessmentCreate",
      (data) => ({
        ...data.createdAssessment,
        nested: { accessToken: sensitiveValue },
      }),
    ],
    [
      "assessmentsAfterFormal",
      () => [
        formalAssessment({ rawInputSummary: { accessToken: sensitiveValue } }),
        existingAssessment(),
      ],
    ],
    [
      "draftAudit",
      (data) => [
        {
          ...data.audit["ai.assessment_draft.generate"][0],
          metadata: {
            ...data.audit["ai.assessment_draft.generate"][0].metadata,
            nested: { accessToken: sensitiveValue },
          },
        },
      ],
    ],
  ];

  for (const [responseKey, buildBody] of scenarios) {
    const apiData = createApiData();
    apiData.responseOverrides[responseKey] = buildBody(apiData);
    const result = await verifyAiAssessmentAcceptance(
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

test("AI assessment acceptance verifier reports only paths and categories for server mismatches", async () => {
  const serverAssessmentId = "server-returned-assessment-id-90817";
  const missingApiData = createApiData({
    createdAssessment: { ...formalAssessment(), id: serverAssessmentId },
  });
  const missingResult = await verifyAiAssessmentAcceptance(
    validConfig({ fetchImpl: createFetchImpl(missingApiData) }),
  );
  assert.match(missingResult.failures.join("\n"), /评估列表|assessmentId/);
  assert.doesNotMatch(
    missingResult.failures.join("\n"),
    new RegExp(serverAssessmentId),
  );

  const mismatchApiData = createApiData({
    assessmentsAfterFormal: [
      formalAssessment({ patientId: "srv-id-9" }),
      existingAssessment(),
    ],
  });
  const mismatchResult = await verifyAiAssessmentAcceptance(
    validConfig({ fetchImpl: createFetchImpl(mismatchApiData) }),
  );
  const mismatchFailures = mismatchResult.failures.join("\n");
  assert.match(mismatchFailures, /正式评估记录\.patientId/);
  assert.doesNotMatch(mismatchFailures, /srv-id-9|patient_real_001/);
});

test("AI assessment acceptance verifier rejects synthetic markers in keys and values", async () => {
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
    const result = await verifyAiAssessmentAcceptance(config);
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

test("AI assessment acceptance verifier redacts sensitive field mismatch values", async () => {
  const apiData = createApiData({
    assessmentsAfterFormal: [
      formalAssessment({
        rawInputSummary: {
          transcript: "患者敏感评估转写不一致",
          analysisSummary: "模型输出敏感摘要不一致",
        },
      }),
    ],
  });
  const result = await verifyAiAssessmentAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );
  const failures = result.failures.join("\n");

  assert.match(failures, /transcript|analysisSummary/);
  assert.doesNotMatch(failures, /患者敏感评估转写不一致/);
  assert.doesNotMatch(failures, /模型输出敏感摘要不一致/);
  assert.doesNotMatch(failures, /患者完成 MMSE\/CDR 评估/);
});

test("AI assessment acceptance CLI never prints failed response body details", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ai-assessment-acceptance-"));
  const configPath = join(dir, "ai-config.json");
  await writeFile(
    configPath,
    JSON.stringify({
      apiBaseUrl: "https://rehab.example.com",
      doctorAccount: "doctor001",
      doctorPassword: "doctor-password",
      auditAccount: "auditor001",
      auditPassword: "auditor-password",
      patientId: "patient_real_001",
      assessmentType: "MMSE/CDR",
      transcript: "患者完成 MMSE/CDR 评估，短时记忆与执行功能下降。",
      humanReview: {
        reviewerUserId: "doctor-user-id",
        reviewedAt: "2026-05-27T10:15:00.000Z",
        conclusion: "approved",
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
      "    return 'detail=real-short-token-123 transcript=患者敏感评估转写 key=real-key';",
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
        "scripts/verify-ai-assessment-acceptance.mjs",
        configPath,
      ]),
    (error) => {
      assert.match(error.stderr, /HTTP 502/);
      assert.match(error.stderr, /响应体已隐藏/);
      assert.doesNotMatch(error.stderr, /real-short-token-123/);
      assert.doesNotMatch(error.stderr, /患者敏感评估转写/);
      assert.doesNotMatch(error.stderr, /real-key/);
      return true;
    },
  );
});

test("AI assessment acceptance CLI prints a fixed redacted message for invalid JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ai-assessment-invalid-json-"));
  const configPath = join(dir, "ai-invalid.json");
  const sensitiveInvalidJson =
    '{"transcript":"must-not-echo-parser-secret-123","humanReview":';
  await writeFile(configPath, sensitiveInvalidJson);

  await assert.rejects(
    () =>
      execFileAsync("node", [
        "scripts/verify-ai-assessment-acceptance.mjs",
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

test("AI assessment acceptance can be imported when process.argv[1] is absent", async () => {
  const moduleUrl = new URL(
    "../verify-ai-assessment-acceptance.mjs",
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

    if (parsed.pathname.endsWith(`/patients/${apiData.patient.id}`)) {
      return apiResponse(apiData, event, "patient", apiData.patient, parsed);
    }

    if (parsed.pathname.endsWith("/me")) {
      apiData.calls.meRequests += 1;
      return apiResponse(apiData, event, "doctorMe", apiData.me, parsed);
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
      if (apiData.calls.assessmentsReads === 2) {
        return apiResponse(
          apiData,
          event,
          "assessmentsAfterDraft",
          apiData.assessmentsAfterDraft,
          parsed,
        );
      }
      return apiResponse(
        apiData,
        event,
        "assessmentsAfterFormal",
        apiData.assessmentsAfterFormal,
        parsed,
      );
    }

    if (parsed.pathname.endsWith("/ai/assessment-drafts")) {
      apiData.calls.draftRequests += 1;
      return apiResponse(apiData, event, "draft", apiData.draft, parsed);
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
        action === "ai.assessment_draft.generate"
          ? "draftAudit"
          : "assessmentAudit";
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
  const draft = aiDraft();
  const createdAssessment = formalAssessment();
  return deepMerge(
    {
      calls: {
        loginAccounts: [],
        assessmentsReads: 0,
        meRequests: 0,
        draftRequests: 0,
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
          displayName: "王医生",
          roles: [
            {
              roleCode: "doctor",
              relatedObjectType: "doctor_profile",
              relatedObjectId: "doctor-profile-id",
            },
          ],
        },
      },
      patient: {
        id: "patient_real_001",
        consents: [consent("privacy_policy"), consent("ai_processing")],
      },
      assessmentsBefore: [existingAssessment()],
      assessmentsAfterDraft: [existingAssessment()],
      draft,
      createdAssessment,
      assessmentsAfterFormal: [createdAssessment, existingAssessment()],
      audit: {
        "ai.assessment_draft.generate": [
          {
            id: "audit_ai_draft_001",
            action: "ai.assessment_draft.generate",
            targetType: "patient_profile",
            targetId: "patient_real_001",
            result: "success",
            metadata: {
              provider: "xiaomi-mimo",
              modelVersion: "MiMo-V2.5",
              promptVersion: "cognitive-assessment-mimo-2026-05",
              callId: "mimo-call-001",
              status: "pending_human_review",
            },
          },
        ],
        "assessment.create": [
          {
            id: "audit_assessment_create_001",
            action: "assessment.create",
            targetType: "assessment_record",
            targetId: "assessment_ai_001",
            result: "success",
            metadata: null,
          },
        ],
      },
    },
    overrides,
  );
}

function aiDraft(overrides = {}) {
  return deepMerge(
    {
      patientId: "patient_real_001",
      assessmentType: "MMSE/CDR",
      status: "pending_human_review",
      riskLevel: "moderate",
      scoreSummary: {
        mmse: 21,
        cdr: 1,
        memory: 45,
        orientation: 62,
        executive: 50,
        language: 72,
      },
      rawInputSummary: {
        source: "production_ai_assessment",
        transcript: "患者完成 MMSE/CDR 评估，短时记忆与执行功能下降。",
        analysisSummary:
          "患者短时记忆与执行功能下降，建议进行反应和上肢协调训练。",
        modelVersion: "MiMo-V2.5",
        confidence: 0.82,
        evidence: {
          provider: "xiaomi-mimo",
          model: "MiMo-V2.5",
          modelVersion: "MiMo-V2.5",
          callId: "mimo-call-001",
          endpointRef:
            "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
          promptVersion: "cognitive-assessment-mimo-2026-05",
          calledAt: "2026-05-27T10:10:00.000Z",
          humanReview: {
            required: true,
            status: "pending_human_review",
          },
        },
      },
    },
    overrides,
  );
}

function formalAssessment(overrides = {}) {
  return deepMerge(
    {
      id: "assessment_ai_001",
      patientId: "patient_real_001",
      assessmentType: "MMSE/CDR",
      source: "production_ai_assessment",
      scoreSummary: aiDraft().scoreSummary,
      rawInputSummary: {
        ...aiDraft().rawInputSummary,
        evidence: {
          ...aiDraft().rawInputSummary.evidence,
          humanReview: {
            required: true,
            reviewerUserId: "doctor-user-id",
            reviewedAt: "2026-05-27T10:15:00.000Z",
            conclusion: "approved",
            notes: "医生复核评分和摘要后批准入库。",
          },
        },
      },
      createdAt: "2026-05-27T10:15:05.000Z",
      completedAt: "2026-05-27T10:15:05.000Z",
      riskGrades: [
        {
          id: "risk_ai_001",
          riskLevel: "moderate",
          systemRiskLevel: "moderate",
          reasonSummary: "MMSE 21 且 CDR 1，提示中度风险。",
          isCurrent: true,
        },
      ],
      aiAnalyses: [
        {
          id: "analysis_ai_001",
          analysisScene: "assessment_summary",
          modelVersion: "MiMo-V2.5",
          confidence: 0.82,
          inputSummary: aiDraft().rawInputSummary,
          outputSummary: {
            riskLevel: "moderate",
            reasonSummary: "MMSE 21 且 CDR 1，提示中度风险。",
          },
        },
      ],
    },
    overrides,
  );
}

function existingAssessment() {
  return {
    id: "assessment_existing_001",
    patientId: "patient_real_001",
    assessmentType: "MMSE/CDR",
    scoreSummary: {
      mmse: 26,
      cdr: 0.5,
      memory: 72,
      orientation: 80,
      executive: 75,
      language: 82,
    },
    rawInputSummary: {
      source: "clinician_input",
      transcript: "既往评估记录。",
    },
    createdAt: "2026-05-20T10:00:00.000Z",
    riskGrades: [],
    aiAnalyses: [],
  };
}

function consent(consentType, overrides = {}) {
  return {
    id: `consent_${consentType}`,
    consentType,
    consentVersion: "v1.2",
    status: "granted",
    revokedAt: null,
    grantedAt: "2026-05-27T09:50:00.000Z",
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
