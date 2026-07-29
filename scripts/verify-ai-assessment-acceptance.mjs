#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CookieSessionClient } from "./local-contract-cookie-session.mjs";

const requiredConsentTypes = ["privacy_policy", "ai_processing"];
const expectedDraftAction = "ai.assessment_draft.generate";
const expectedAssessmentAction = "assessment.create";
const expectedSource = "production_ai_assessment";
const expectedDraftStatus = "pending_human_review";
const scoreSummaryFields = [
  "mmse",
  "cdr",
  "memory",
  "orientation",
  "executive",
  "language",
];
const dangerousClinicalPayloadKeyPattern =
  /(token|authorization|access|apikey|secret|password|credential|cookie|session|raw|payload|request|response|base64|audio)/;
const demoMarkerPattern =
  /(^|[^a-z0-9])(mock|demo|seed|fallback|fixed|manual|synthetic)([^a-z0-9]|$)/i;
const demoMarkerKeyPattern =
  /(mock|demo|seed|fallback|fixed|manual|synthetic)/i;
const minimumSecretPayloadLength = 8;
const allowedSensitivePayloadKeys = new Set([
  "rawassessment",
  "rawinputsummary",
]);
const credentialInputKeys = new Set(["doctorPassword", "auditPassword"]);
const sensitiveMetadataKeys = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "base64",
  "contentbase64",
  "key",
  "payload",
  "raw",
  "rawpayload",
  "requestbody",
  "responsebody",
  "secret",
  "token",
  "transcript",
]);
export async function verifyAiAssessmentAcceptance(config = {}) {
  const failures = [];

  validateJsonPlainContract(failures, config, "正式 AI 评估配置");
  if (failures.length) return { failures };

  const {
    apiBaseUrl,
    doctorAccount,
    doctorPassword,
    auditAccount,
    auditPassword,
    patientId,
    assessmentType = "MMSE/CDR",
    transcript,
    humanReview,
  } = config;

  validateConfig(failures, config);
  if (failures.length) return { failures };

  const doctorClient = new CookieSessionClient(apiBaseUrl);
  const auditClient = new CookieSessionClient(apiBaseUrl);
  if (
    !(await loginClient(failures, {
      client: doctorClient,
      account: doctorAccount,
      password: doctorPassword,
      label: "医师账号",
    }))
  ) {
    return { failures };
  }
  if (
    !(await loginClient(failures, {
      client: auditClient,
      account: auditAccount,
      password: auditPassword,
      label: "审计账号",
    }))
  ) {
    return { failures };
  }

  const me = await fetchRequiredObject(failures, {
    path: "/me",
    client: doctorClient,
    label: "当前医师身份 API",
  });
  if (!me) return { failures };
  verifyReviewerMatchesCurrentDoctor(failures, {
    me,
    reviewerUserId: humanReview.reviewerUserId,
  });
  if (failures.length) return { failures };

  const patient = await fetchRequiredObject(failures, {
    path: `/patients/${encodeURIComponent(patientId)}`,
    client: doctorClient,
    label: "患者详情 API",
  });
  if (!patient) return { failures };

  verifyRequiredConsents(failures, patient.consents);
  if (failures.length) return { failures };

  const beforeAssessments = await fetchAssessments(failures, {
    client: doctorClient,
    patientId,
    label: "AI 草稿前评估列表 API",
  });
  if (!beforeAssessments) return { failures };

  const draft = await postRequiredObject(failures, {
    path: "/ai/assessment-drafts",
    client: doctorClient,
    label: "AI 评估草稿 API",
    body: {
      patientId,
      assessmentType,
      transcript,
    },
  });
  if (!draft) return { failures };

  verifyDraftResponse(failures, {
    draft,
    expectedPatientId: patientId,
    expectedAssessmentType: assessmentType,
    expectedTranscript: transcript,
  });
  if (failures.length) return { failures };

  const afterDraftAssessments = await fetchAssessments(failures, {
    client: doctorClient,
    patientId,
    label: "AI 草稿后评估列表 API",
  });
  if (!afterDraftAssessments) return { failures };
  verifyNoAssessmentCreatedByDraft(failures, {
    beforeAssessments,
    afterDraftAssessments,
  });
  if (failures.length) return { failures };

  const formalBody = buildFormalAssessmentBody({
    patientId,
    assessmentType,
    draft,
    humanReview,
  });
  validatePayloadSafe(failures, formalBody, "正式评估创建请求");
  if (failures.length) return { failures };
  const createdAssessment = await postRequiredObject(failures, {
    path: "/assessments",
    client: doctorClient,
    label: "正式评估创建 API",
    body: formalBody,
  });
  if (!createdAssessment) return { failures };
  verifyCreatedAssessmentResponse(failures, createdAssessment);
  if (failures.length) return { failures };

  const afterFormalAssessments = await fetchAssessments(failures, {
    client: doctorClient,
    patientId,
    label: "正式评估后评估列表 API",
  });
  if (!afterFormalAssessments) return { failures };

  const formalAssessment = findAssessmentById(
    afterFormalAssessments,
    createdAssessment.id,
  );
  if (!formalAssessment) {
    failures.push("正式评估列表未找到 assessmentId：值已隐藏。");
    return { failures };
  }
  verifyFormalAssessmentRecord(failures, {
    formalAssessment,
    draft,
    formalBody,
    expectedPatientId: patientId,
    expectedAssessmentType: assessmentType,
  });
  if (failures.length) return { failures };

  await verifyAuditLogs(failures, {
    client: auditClient,
    patientId,
    formalAssessmentId: createdAssessment.id,
    draftEvidence: draft.rawInputSummary.evidence,
  });

  return { failures };
}

function validateConfig(failures, config) {
  const {
    apiBaseUrl,
    doctorAccount,
    doctorPassword,
    auditAccount,
    auditPassword,
    patientId,
    assessmentType,
    transcript,
    humanReview,
  } = config;
  const apiBaseUrlValidation = validateHttpsUrl(apiBaseUrl);
  if (!apiBaseUrl || typeof apiBaseUrl !== "string") {
    failures.push("apiBaseUrl 必须显式提供正式 API 地址。");
  } else if (!apiBaseUrlValidation.valid) {
    failures.push("apiBaseUrl 必须使用正式 HTTPS 地址。");
  } else if (demoMarkerPattern.test(apiBaseUrl)) {
    failures.push(
      "apiBaseUrl 不能包含 mock/demo/seed/fallback/fixed/manual/synthetic 标记。",
    );
  }
  requireString(failures, doctorAccount, "doctorAccount");
  requireString(failures, doctorPassword, "doctorPassword");
  requireString(failures, auditAccount, "auditAccount");
  requireString(failures, auditPassword, "auditPassword");
  requireString(failures, patientId, "patientId");
  requireString(failures, assessmentType, "assessmentType");
  requireString(failures, transcript, "transcript");
  validateHumanReview(failures, humanReview);
  if (
    typeof doctorAccount === "string" &&
    typeof auditAccount === "string" &&
    doctorAccount.trim() &&
    doctorAccount.trim() === auditAccount.trim()
  ) {
    failures.push("医师账号与审计账号必须不同，且必须在任何网络请求前校验。");
  }
  validateAiClinicalConfigSafe(failures, config);
}

function validateHumanReview(failures, humanReview) {
  if (!isObject(humanReview)) {
    failures.push("humanReview 必须是对象。");
    return;
  }
  requireString(
    failures,
    humanReview.reviewerUserId,
    "humanReview.reviewerUserId",
  );
  requireIsoDate(failures, humanReview.reviewedAt, "humanReview.reviewedAt");
  if (humanReview.conclusion !== "approved") {
    failures.push(
      "humanReview.conclusion 必须是 approved，正式 AI 评估必须经人工复核批准。",
    );
  }
  if (humanReview.notes !== undefined) {
    requireString(failures, humanReview.notes, "humanReview.notes");
  }
}

function verifyReviewerMatchesCurrentDoctor(failures, { me, reviewerUserId }) {
  const currentUserId = me?.user?.id;
  if (currentUserId !== reviewerUserId) {
    failures.push(
      "humanReview.reviewerUserId 必须等于当前医师会话对应用户，不能手工填写他人复核人。",
    );
  }
  const roles = Array.isArray(me?.user?.roles) ? me.user.roles : [];
  const hasDoctorRole = roles.some((role) => role?.roleCode === "doctor");
  if (!hasDoctorRole) {
    failures.push("当前会话必须属于医师用户，才能执行 AI 评估人工复核验收。");
  }
}

function verifyRequiredConsents(failures, consents) {
  if (!Array.isArray(consents)) {
    failures.push("患者详情 API 返回的 consents 必须是数组。");
    return;
  }

  for (const consentType of requiredConsentTypes) {
    const record = consents.find(
      (consent) =>
        consent?.consentType === consentType &&
        consent.status === "granted" &&
        !consent.revokedAt,
    );
    if (!record) {
      failures.push(`患者缺少有效 ${consentType} 授权，不能执行 AI 评估验收。`);
    }
  }
}

function verifyDraftResponse(
  failures,
  { draft, expectedPatientId, expectedAssessmentType, expectedTranscript },
) {
  compareFields(failures, "AI 评估草稿响应", draft, {
    patientId: expectedPatientId,
    assessmentType: expectedAssessmentType,
    status: expectedDraftStatus,
  });
  validateDraftPayloadSafe(failures, draft);
  validateScoreSummary(
    failures,
    draft.scoreSummary,
    "AI 评估草稿 scoreSummary",
  );
  const rawInputSummary = requireObject(
    failures,
    draft.rawInputSummary,
    "AI 评估草稿 rawInputSummary 必须是对象。",
  );
  if (!rawInputSummary) return;
  compareFields(failures, "AI 评估草稿 rawInputSummary", rawInputSummary, {
    source: expectedSource,
    transcript: expectedTranscript,
  });
  requireString(
    failures,
    rawInputSummary.analysisSummary,
    "rawInputSummary.analysisSummary",
  );
  requireString(
    failures,
    rawInputSummary.modelVersion,
    "rawInputSummary.modelVersion",
  );
  requireNumberInRange(
    failures,
    rawInputSummary.confidence,
    "rawInputSummary.confidence",
    0,
    1,
  );
  verifyProviderEvidence(failures, rawInputSummary.evidence);
  validateNoDemoMarkers(failures, draft, "AI 评估草稿响应");
}

function verifyProviderEvidence(failures, evidence) {
  if (
    !requireObject(failures, evidence, "rawInputSummary.evidence 必须是对象。")
  ) {
    return;
  }
  requireString(failures, evidence.provider, "evidence.provider");
  requireString(failures, evidence.model, "evidence.model");
  requireString(failures, evidence.modelVersion, "evidence.modelVersion");
  requireString(failures, evidence.callId, "evidence.callId");
  requireHttpsUrl(failures, evidence.endpointRef, "evidence.endpointRef");
  requireString(failures, evidence.promptVersion, "evidence.promptVersion");
  requireIsoDate(failures, evidence.calledAt, "evidence.calledAt");
  const humanReview = requireObject(
    failures,
    evidence.humanReview,
    "evidence.humanReview 必须是对象。",
  );
  if (!humanReview) return;
  if (humanReview.required !== true) {
    failures.push("AI 草稿 evidence.humanReview.required 必须为 true。");
  }
  if (humanReview.status !== expectedDraftStatus) {
    failures.push(
      "AI 草稿 evidence.humanReview.status 必须是 pending_human_review。",
    );
  }
}

function verifyNoAssessmentCreatedByDraft(
  failures,
  { beforeAssessments, afterDraftAssessments },
) {
  const beforeIds = new Set(
    beforeAssessments.map((assessment) => assessment?.id),
  );
  const newAssessments = afterDraftAssessments.filter(
    (assessment) => assessment?.id && !beforeIds.has(assessment.id),
  );
  if (newAssessments.length) {
    failures.push(
      "AI 草稿阶段出现新的正式评估记录，草稿不得自动创建正式评估。",
    );
  }
}

function buildFormalAssessmentBody({
  patientId,
  assessmentType,
  draft,
  humanReview,
}) {
  const rawInputSummary = draft.rawInputSummary;
  const evidence = rawInputSummary.evidence;
  return {
    patientId,
    assessmentType,
    scoreSummary: {
      mmse: draft.scoreSummary.mmse,
      cdr: draft.scoreSummary.cdr,
      memory: draft.scoreSummary.memory,
      orientation: draft.scoreSummary.orientation,
      executive: draft.scoreSummary.executive,
      language: draft.scoreSummary.language,
    },
    rawInputSummary: {
      source: rawInputSummary.source,
      transcript: rawInputSummary.transcript,
      analysisSummary: rawInputSummary.analysisSummary,
      modelVersion: rawInputSummary.modelVersion,
      confidence: rawInputSummary.confidence,
      evidence: {
        provider: evidence.provider,
        model: evidence.model,
        modelVersion: evidence.modelVersion,
        callId: evidence.callId,
        endpointRef: evidence.endpointRef,
        promptVersion: evidence.promptVersion,
        calledAt: evidence.calledAt,
        humanReview: {
          required: true,
          reviewerUserId: humanReview.reviewerUserId,
          reviewedAt: humanReview.reviewedAt,
          conclusion: humanReview.conclusion,
          ...(humanReview.notes === undefined
            ? {}
            : { notes: humanReview.notes }),
        },
      },
    },
  };
}

function verifyCreatedAssessmentResponse(failures, assessment) {
  requireString(failures, assessment.id, "正式评估创建响应 id");
}

function verifyFormalAssessmentRecord(
  failures,
  {
    formalAssessment,
    draft,
    formalBody,
    expectedPatientId,
    expectedAssessmentType,
  },
) {
  compareFields(failures, "正式评估记录", formalAssessment, {
    patientId: expectedPatientId,
    assessmentType: expectedAssessmentType,
  });
  if (!valuesEqual(formalAssessment.scoreSummary, formalBody.scoreSummary)) {
    failures.push("正式评估 scoreSummary 必须与已复核 AI 草稿一致。");
  }
  verifyFormalRawInputSummary(
    failures,
    formalAssessment.rawInputSummary,
    formalBody.rawInputSummary,
  );
  verifyRiskGrades(failures, formalAssessment.riskGrades, draft.riskLevel);
  verifyAiAnalyses(
    failures,
    formalAssessment.aiAnalyses,
    draft.rawInputSummary,
  );
  validateNoDemoMarkers(failures, formalAssessment, "正式评估记录");
}

function verifyFormalRawInputSummary(failures, actual, expected) {
  if (
    !requireObject(failures, actual, "正式评估 rawInputSummary 必须是对象。")
  ) {
    return;
  }
  compareFields(failures, "正式评估 rawInputSummary", actual, {
    source: expectedSource,
    transcript: expected.transcript,
    analysisSummary: expected.analysisSummary,
    modelVersion: expected.modelVersion,
    confidence: expected.confidence,
  });
  if (!valuesEqual(actual.evidence, expected.evidence)) {
    failures.push(
      "正式评估 evidence 必须保留供应商调用证据和 approved 人工复核记录。",
    );
  }
}

function verifyRiskGrades(failures, riskGrades, expectedRiskLevel) {
  if (!Array.isArray(riskGrades) || riskGrades.length === 0) {
    failures.push("正式评估必须能反查风险评级记录。");
    return;
  }
  const current = riskGrades.find((risk) => risk?.isCurrent === true);
  if (!current) {
    failures.push("正式评估必须能反查 isCurrent=true 的当前风险评级。");
    return;
  }
  if (current.riskLevel !== expectedRiskLevel) {
    failures.push("正式评估风险评级必须与 AI 草稿风险等级一致。");
  }
}

function verifyAiAnalyses(failures, aiAnalyses, rawInputSummary) {
  if (!Array.isArray(aiAnalyses) || aiAnalyses.length === 0) {
    failures.push("正式评估必须能反查 AI 分析记录。");
    return;
  }
  const matched = aiAnalyses.find(
    (analysis) =>
      analysis?.analysisScene === "assessment_summary" &&
      analysis.modelVersion === rawInputSummary.modelVersion &&
      analysis.confidence === rawInputSummary.confidence,
  );
  if (!matched) {
    failures.push("正式评估 AI 分析记录必须保留模型版本和置信度。");
  }
}

async function verifyAuditLogs(
  failures,
  { client, patientId, formalAssessmentId, draftEvidence },
) {
  const draftLogs = await fetchAuditLogs(failures, {
    client,
    action: expectedDraftAction,
    targetType: "patient_profile",
    targetId: patientId,
    label: "AI 草稿审计 API",
  });
  if (!draftLogs) return;
  const matchedDraftLogs = draftLogs.filter(
    (log) =>
      log?.action === expectedDraftAction &&
      log.targetType === "patient_profile" &&
      log.targetId === patientId &&
      log.result === "success" &&
      log.metadata?.provider === draftEvidence.provider &&
      log.metadata?.modelVersion === draftEvidence.modelVersion &&
      log.metadata?.promptVersion === draftEvidence.promptVersion &&
      log.metadata?.callId === draftEvidence.callId &&
      log.metadata?.status === expectedDraftStatus,
  );
  if (matchedDraftLogs.length !== 1) {
    failures.push("AI 草稿成功审计日志候选数量必须严格等于 1。");
  } else {
    validateAuditMetadataSafe(
      failures,
      matchedDraftLogs[0].metadata,
      "AI 草稿审计候选[0].metadata",
    );
  }
  if (failures.length) return;

  const assessmentLogs = await fetchAuditLogs(failures, {
    client,
    action: expectedAssessmentAction,
    targetType: "assessment_record",
    targetId: formalAssessmentId,
    label: "正式评估审计 API",
  });
  if (!assessmentLogs) return;
  const matchedAssessmentLogs = assessmentLogs.filter(
    (log) =>
      log?.action === expectedAssessmentAction &&
      log.targetType === "assessment_record" &&
      log.targetId === formalAssessmentId &&
      log.result === "success",
  );
  if (matchedAssessmentLogs.length !== 1) {
    failures.push("正式评估成功审计日志候选数量必须严格等于 1。");
  } else if (
    matchedAssessmentLogs[0].metadata !== null &&
    matchedAssessmentLogs[0].metadata !== undefined
  ) {
    validateAuditMetadataSafe(
      failures,
      matchedAssessmentLogs[0].metadata,
      "正式评估审计候选[0].metadata",
    );
  }
}

async function fetchAuditLogs(
  failures,
  { client, action, targetType, targetId, label },
) {
  const searchParams = new URLSearchParams({
    action,
    targetType,
    targetId,
    result: "success",
    limit: "200",
  });

  const logs = await fetchRequiredArray(failures, {
    path: `/admin/audit-logs?${searchParams.toString()}`,
    client,
    label,
  });
  if (!logs) return null;
  const failureCount = failures.length;
  logs.forEach((log, index) => {
    if (!isObject(log)) return;
    if (log.metadata !== null && log.metadata !== undefined) {
      validateAuditMetadataSafe(
        failures,
        log.metadata,
        `${label}[${index}].metadata`,
      );
    }
  });
  return failures.length === failureCount ? logs : null;
}

async function fetchAssessments(failures, { client, patientId, label }) {
  return fetchRequiredArray(failures, {
    path: `/patients/${encodeURIComponent(patientId)}/assessments`,
    client,
    label,
  });
}

async function fetchRequiredObject(failures, options) {
  return requireResponseShape(failures, options, "对象", isObject, fetchJson);
}

async function postRequiredObject(failures, options) {
  return requireResponseShape(failures, options, "对象", isObject, postJson);
}

async function fetchRequiredArray(failures, options) {
  return requireResponseShape(
    failures,
    options,
    "数组",
    Array.isArray,
    fetchJson,
  );
}

async function requireResponseShape(
  failures,
  options,
  expectedShape,
  matchesShape,
  request,
) {
  const failureCount = failures.length;
  const value = await request(failures, options);
  if (failures.length > failureCount) return null;
  validateJsonPlainContract(failures, value, options.label);
  validatePayloadSafe(failures, value, options.label);
  if (failures.length > failureCount) return null;
  if (!matchesShape(value)) {
    failures.push(
      `${options.label} 返回值必须是${expectedShape}，不能是 2xx 空体、null 或其他错误 shape。`,
    );
    return null;
  }
  return value;
}

async function fetchJson(failures, { path, client, label }) {
  return requestJson(failures, {
    path,
    client,
    label,
    method: "GET",
  });
}

async function postJson(failures, { path, client, label, body }) {
  return requestJson(failures, {
    path,
    client,
    label,
    method: "POST",
    body,
  });
}

async function requestJson(failures, { path, client, label, method, body }) {
  try {
    return await client.request(path, {
      method,
      headers: {
        Accept: "application/json",
      },
      ...(body === undefined ? {} : { body }),
    });
  } catch (error) {
    recordClientFailure(failures, label, error);
    return null;
  }
}

async function loginClient(failures, { client, account, password, label }) {
  try {
    await client.login(account, password);
    return true;
  } catch (error) {
    recordClientFailure(failures, `${label}登录`, error);
    return false;
  }
}

function recordClientFailure(failures, label, error) {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.match(/\bHTTP (\d{3})\b/)?.[1];
  if (status) {
    failures.push(
      `${label}返回 HTTP ${status}：响应体已隐藏，避免泄露 token、密钥、转写或模型内容。`,
    );
    return;
  }
  if (/csrf|rehab_csrf/i.test(message)) {
    failures.push(`${label}失败：Cookie/CSRF 会话无效，未执行后续验收。`);
    return;
  }
  if (/password_reset_required/i.test(message)) {
    failures.push(`${label}失败：password_reset_required，未执行后续验收。`);
    return;
  }
  failures.push(`${label}失败：错误详情已隐藏，未执行后续验收。`);
}

function validateScoreSummary(failures, scoreSummary, label) {
  if (!requireObject(failures, scoreSummary, `${label} 必须是对象。`)) return;
  const ownKeys = Reflect.ownKeys(scoreSummary);
  if (
    ownKeys.length !== scoreSummaryFields.length ||
    !ownKeys.every(
      (key) => typeof key === "string" && scoreSummaryFields.includes(key),
    )
  ) {
    failures.push(
      `${label} 的 own enumerable string keys 必须严格等于六个正式评分字段。`,
    );
  }
  for (const field of scoreSummaryFields) {
    if (typeof scoreSummary[field] !== "number") {
      failures.push(`${label}.${field} 必须是数字。`);
    }
  }
}

function validateAuditMetadataSafe(
  failures,
  metadata,
  label = "AI 评估审计 metadata",
) {
  if (!isObject(metadata)) {
    failures.push(`${label} 必须是对象。`);
    return;
  }

  const unsafePaths = [];
  collectUnsafeMetadataPaths(metadata, label, unsafePaths);
  for (const path of unsafePaths) {
    failures.push(
      `${path} 包含敏感字段、演示/手工标记或原始载荷，不能作为正式 AI 评估审计记录。`,
    );
  }
}

function validateDraftPayloadSafe(failures, draft) {
  const unsafePaths = [];
  for (const field of ["scoreSummary", "rawInputSummary"]) {
    collectUnsafePayloadPaths(
      draft[field],
      `AI 评估草稿 ${field}`,
      unsafePaths,
    );
  }
  for (const path of unsafePaths) {
    failures.push(`${path} 包含敏感字段或敏感值，不能写入正式 AI 评估记录。`);
  }
}

function validateAiClinicalConfigSafe(failures, config) {
  const unsafePaths = [];
  collectUnsafePayloadPaths(config, "正式 AI 评估配置", unsafePaths, {
    ignoredRootKeys: credentialInputKeys,
  });
  for (const path of unsafePaths) {
    failures.push(
      `${path} 包含敏感字段、敏感值或演示/合成标记，不能用于正式 AI 评估。`,
    );
  }
}

function validatePayloadSafe(failures, value, label) {
  const unsafePaths = [];
  collectUnsafePayloadPaths(value, label, unsafePaths);
  for (const path of unsafePaths) {
    failures.push(
      `${path} 包含敏感字段、敏感值或 mock/demo/seed/fallback/fixed/manual/synthetic 标记。`,
    );
  }
}

function collectUnsafePayloadPaths(
  value,
  path,
  paths,
  { ignoredRootKeys = new Set(), depth = 0 } = {},
) {
  if (typeof value === "string") {
    if (isUnsafeText(value)) paths.push(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectUnsafePayloadPaths(item, `${path}[${index}]`, paths, {
        ignoredRootKeys,
        depth: depth + 1,
      }),
    );
    return;
  }
  if (!isObject(value)) return;
  for (const [key, nested] of enumerableStringEntries(value)) {
    if (depth === 0 && ignoredRootKeys.has(key)) continue;
    const nestedPath = `${path}.${key}`;
    const normalizedKey = normalizeDangerousKey(key);
    if (
      demoMarkerKeyPattern.test(normalizedKey) ||
      (isSensitiveDraftPayloadKey(key) &&
        !allowedSensitivePayloadKeys.has(normalizedKey))
    ) {
      paths.push(nestedPath);
      continue;
    }
    collectUnsafePayloadPaths(nested, nestedPath, paths, {
      ignoredRootKeys,
      depth: depth + 1,
    });
  }
}

function isSensitiveDraftPayloadKey(key) {
  return dangerousClinicalPayloadKeyPattern.test(normalizeDangerousKey(key));
}

function collectUnsafeMetadataPaths(value, path, paths) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectUnsafeMetadataPaths(item, `${path}[${index}]`, paths),
    );
    return;
  }

  if (!isObject(value)) return;
  for (const [key, nested] of enumerableStringEntries(value)) {
    const nestedPath = `${path}.${key}`;
    const normalizedKey = normalizeDangerousKey(key);
    if (
      demoMarkerKeyPattern.test(normalizedKey) ||
      sensitiveMetadataKeys.has(normalizedKey) ||
      (isSensitiveDraftPayloadKey(key) &&
        !allowedSensitivePayloadKeys.has(normalizedKey))
    ) {
      paths.push(nestedPath);
      continue;
    }
    if (typeof nested === "string" && isUnsafeText(nested)) {
      paths.push(nestedPath);
      continue;
    }
    collectUnsafeMetadataPaths(nested, nestedPath, paths);
  }
}

function validateNoDemoMarkers(failures, value, label) {
  const paths = [];
  collectDemoMarkerPaths(value, label, paths);
  for (const path of paths) {
    failures.push(
      `${path} 包含 mock/demo/seed/fallback/fixed/manual/synthetic 标记，不能作为正式 AI 评估验收结果。`,
    );
  }
}

function collectDemoMarkerPaths(value, path, paths) {
  if (typeof value === "string") {
    if (demoMarkerPattern.test(value)) paths.push(path);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectDemoMarkerPaths(item, `${path}[${index}]`, paths),
    );
    return;
  }

  if (!isObject(value)) return;
  for (const [key, nested] of enumerableStringEntries(value)) {
    const nestedPath = `${path}.${key}`;
    if (demoMarkerKeyPattern.test(normalizeDangerousKey(key))) {
      paths.push(nestedPath);
      continue;
    }
    collectDemoMarkerPaths(nested, nestedPath, paths);
  }
}

function findAssessmentById(assessments, assessmentId) {
  return assessments.find((assessment) => assessment?.id === assessmentId);
}

function compareFields(failures, label, actual, expected) {
  for (const [field, expectedValue] of enumerableStringEntries(expected)) {
    const actualValue = actual?.[field];
    if (!valuesEqual(actualValue, expectedValue)) {
      failures.push(formatMismatchMessage({ label, field }));
    }
  }
}

function formatMismatchMessage({ label, field }) {
  return `${label}.${field} 与预期不一致：值已隐藏（类别：字段不匹配）。`;
}

function valuesEqual(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function requireObject(failures, value, message) {
  if (!isObject(value)) {
    failures.push(message);
    return null;
  }
  return value;
}

function requireString(failures, value, label) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${label} 必须显式提供非空文本。`);
  }
}

function requireNumberInRange(failures, value, label, min, max) {
  if (typeof value !== "number" || value < min || value > max) {
    failures.push(`${label} 必须是 ${min} 到 ${max} 之间的数字。`);
  }
}

function requireIsoDate(failures, value, label) {
  requireString(failures, value, label);
  if (typeof value !== "string" || !value.trim()) return;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    failures.push(`${label} 必须是 ISO 8601 UTC 时间。`);
  }
}

function requireHttpsUrl(failures, value, label) {
  requireString(failures, value, label);
  if (typeof value !== "string" || !value.trim()) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      failures.push(`${label} 必须是正式 HTTPS 地址。`);
    }
  } catch {
    failures.push(`${label} 必须是有效 URL。`);
  }
  if (typeof value === "string" && demoMarkerPattern.test(value)) {
    failures.push(
      `${label} 不能包含 mock/demo/seed/fallback/fixed/manual/synthetic 标记。`,
    );
  }
}

function validateHttpsUrl(value) {
  if (typeof value !== "string" || !value.trim()) return { valid: false };
  try {
    const url = new URL(value);
    return { valid: url.protocol === "https:" };
  } catch {
    return { valid: false };
  }
}

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeDangerousKey(key) {
  const digitSubstitutions = {
    0: "o",
    1: "i",
    3: "e",
    4: "a",
    5: "s",
    7: "t",
  };
  return normalizeKey(key).replace(
    /[013457]/g,
    (digit) => digitSubstitutions[digit],
  );
}

function isUnsafeText(value) {
  if (isSafeIdentifierText(value)) return false;
  return (
    demoMarkerPattern.test(value) ||
    bearerTokenPattern().test(value) ||
    secretLikePattern().test(redactTokenPlanEndpointLabel(value)) ||
    base64LikePattern().test(value)
  );
}

function base64LikePattern() {
  return /(?:[A-Za-z0-9+/]{40,}={0,2})/g;
}

function bearerTokenPattern() {
  return /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}(?=$|[^A-Za-z0-9._~+/=-])/i;
}

function secretLikePattern() {
  const separator = "[\\s:=_-]+";
  const credentialLabel =
    "(?:authorization|access(?:[\\s:=_-]*token)?|api[\\s:=_-]*key|secret|password|credential|cookie|session)";
  const payload = `[A-Za-z0-9._~+/=-]{${minimumSecretPayloadLength},}`;
  return new RegExp(
    `\\b(?:(?:sk|ak)[_-]${payload}|token${separator}${payload}|${credentialLabel}${separator}${payload})`,
    "i",
  );
}

function redactTokenPlanEndpointLabel(value) {
  return value
    .replace(/\btoken-plan(?=\s+endpoint\b)/gi, "endpoint-plan")
    .replace(
      /\btoken-plan(?=(?:-[a-z0-9]+)*\.[a-z0-9.-]+(?::\d+)?(?:[/\s]|$))/gi,
      "endpoint-plan",
    );
}

function isSafeIdentifierText(value) {
  return (
    /^[a-f0-9]{40}$/i.test(value) ||
    /^(?:sha1|sha256|sha384|sha512):[a-f0-9]{40,128}$/i.test(value) ||
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  );
}

function isObject(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(
      descriptor?.enumerable && Object.hasOwn(descriptor, "value"),
    );
  });
}

function enumerableStringEntries(value) {
  return Reflect.ownKeys(value)
    .filter((key) => {
      if (typeof key !== "string") return false;
      return Object.getOwnPropertyDescriptor(value, key)?.enumerable === true;
    })
    .map((key) => [key, Object.getOwnPropertyDescriptor(value, key).value]);
}

function validateJsonPlainContract(failures, value, path) {
  const issues = [];
  collectJsonPlainContractIssues(value, path, issues, new WeakSet());
  for (const issue of issues) failures.push(issue);
}

function collectJsonPlainContractIssues(value, path, issues, activeObjects) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      issues.push(`${path} 违反 JSON plain object 契约：数字必须是有限值。`);
    }
    return;
  }
  if (typeof value !== "object") {
    issues.push(`${path} 违反 JSON plain object 契约：值类别不是 JSON。`);
    return;
  }
  if (activeObjects.has(value)) {
    issues.push(`${path} 违反 JSON plain object 契约：不能包含循环引用。`);
    return;
  }

  activeObjects.add(value);
  if (Array.isArray(value)) {
    collectJsonArrayContractIssues(value, path, issues, activeObjects);
  } else {
    collectJsonObjectContractIssues(value, path, issues, activeObjects);
  }
  activeObjects.delete(value);
}

function collectJsonArrayContractIssues(value, path, issues, activeObjects) {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    issues.push(`${path} 必须使用标准数组原型（JSON array）。`);
  }
  const indexedEntries = [];
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== "string" ||
      !/^(?:0|[1-9]\d*)$/.test(key) ||
      descriptor?.enumerable !== true ||
      !Object.hasOwn(descriptor ?? {}, "value")
    ) {
      issues.push(
        `${path}[item] 的 own enumerable keys 必须都是 enumerable string index data keys。`,
      );
      continue;
    }
    indexedEntries.push([key, descriptor.value]);
  }
  if (indexedEntries.length !== value.length) {
    issues.push(`${path} 违反 JSON array 契约：数组不能有空洞或额外属性。`);
  }
  for (const [key, nested] of indexedEntries) {
    collectJsonPlainContractIssues(
      nested,
      `${path}[${key}]`,
      issues,
      activeObjects,
    );
  }
}

function collectJsonObjectContractIssues(value, path, issues, activeObjects) {
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    issues.push(`${path} 必须使用普通对象原型（JSON plain object）。`);
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== "string" ||
      descriptor?.enumerable !== true ||
      !Object.hasOwn(descriptor ?? {}, "value")
    ) {
      issues.push(
        `${path}.[key] 的 own enumerable keys 必须都是 enumerable string data keys。`,
      );
      continue;
    }
    collectJsonPlainContractIssues(
      descriptor.value,
      `${path}.${key}`,
      issues,
      activeObjects,
    );
  }
}

function readJsonFile(path) {
  try {
    return { value: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { error };
  }
}

async function cli() {
  const configPath =
    process.argv.slice(2).find((arg) => arg !== "--") ??
    process.env.AI_ASSESSMENT_ACCEPTANCE_CONFIG;

  if (!configPath) {
    console.error(
      "缺少配置文件路径。请传入 JSON 文件路径，或设置 AI_ASSESSMENT_ACCEPTANCE_CONFIG。",
    );
    process.exitCode = 1;
    return;
  }

  const absolutePath = resolve(process.cwd(), configPath);
  if (!existsSync(absolutePath)) {
    console.error(`配置文件不存在：${absolutePath}`);
    process.exitCode = 1;
    return;
  }

  const readResult = readJsonFile(absolutePath);
  if (readResult.error) {
    console.error("配置文件不是有效 JSON。");
    process.exitCode = 1;
    return;
  }

  const result = await verifyAiAssessmentAcceptance(readResult.value);
  if (result.failures.length) {
    console.error("AI 评估正式验收失败：");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("AI 评估正式验收通过。");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await cli();
}
