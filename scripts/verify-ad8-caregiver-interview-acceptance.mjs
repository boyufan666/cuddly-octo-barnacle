#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CookieSessionClient } from "./local-contract-cookie-session.mjs";

const expectedAssessmentType = "AD-8";
const expectedAssessmentSource = "clinician_input";
const expectedModelVersion = "ad8-clinician-structured-v1";
const expectedAssessmentAction = "assessment.create";
const expectedCaregiverSummaryAction = "caregiver.summary.view";
const requiredConsentTypes = [
  "privacy_policy",
  "ai_processing",
  "caregiver_sharing",
];
const ad8ItemFields = [
  "itemMemoryProblems",
  "itemReducedInterest",
  "itemRepeatsQuestions",
  "itemTroubleLearningTools",
  "itemForgetsMonthYear",
  "itemHandlesFinancesPoorly",
  "itemTroubleAppointments",
  "itemDailyThinkingMemoryProblems",
];
const forbiddenMarkerPattern =
  /(^|[^a-z0-9])(mock|demo|seed|fallback|fixed|manual|synthetic)([^a-z0-9]|$)/i;
const forbiddenMarkerKeyPattern =
  /(mock|demo|seed|fallback|fixed|manual|synthetic)/i;
const minimumSecretPayloadLength = 8;
const dangerousClinicalPayloadKeyPattern =
  /(token|authorization|access|apikey|secret|password|credential|cookie|session|raw|payload|request|response|base64|audio)/;
const allowedSensitivePayloadKeys = new Set([
  "rawassessment",
  "rawinputsummary",
]);
const credentialInputKeys = new Set([
  "doctorPassword",
  "caregiverPassword",
  "auditPassword",
]);
const sensitiveMetadataKeys = new Set([
  "apikey",
  "authorization",
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
export async function verifyAd8CaregiverInterviewAcceptance(config = {}) {
  const failures = [];

  validateJsonPlainContract(failures, config, "正式 AD-8 配置");
  if (failures.length) return { failures };

  const {
    apiBaseUrl,
    doctorAccount,
    doctorPassword,
    caregiverAccount,
    caregiverPassword,
    auditAccount,
    auditPassword,
    patientId,
    informant,
    humanReview,
    interview,
  } = config;

  validateConfig(failures, config);
  validateFormalAd8ConfigSafe(failures, config);
  if (failures.length) return { failures };

  const doctorClient = new CookieSessionClient(apiBaseUrl);
  const caregiverClient = new CookieSessionClient(apiBaseUrl);
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
      client: caregiverClient,
      account: caregiverAccount,
      password: caregiverPassword,
      label: "家属账号",
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

  const caregiverMe = await fetchRequiredObject(failures, {
    path: "/me",
    client: caregiverClient,
    label: "当前家属身份 API",
  });
  if (!caregiverMe) return { failures };
  verifyInformantMatchesCurrentCaregiver(failures, {
    me: caregiverMe,
    caregiverUserId: informant.caregiverUserId,
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

  const caregiverSummary = await fetchRequiredObject(failures, {
    path: `/caregiver/patients/${encodeURIComponent(patientId)}/summary`,
    client: caregiverClient,
    label: "家属授权摘要 API",
  });
  if (!caregiverSummary) return { failures };
  verifyCaregiverSummary(failures, caregiverSummary, patientId);
  if (failures.length) return { failures };

  const beforeAssessments = await fetchAssessments(failures, {
    client: doctorClient,
    patientId,
    label: "AD-8 入库前评估列表 API",
  });
  if (!beforeAssessments) return { failures };

  const formalBody = buildAd8FormalAssessmentBody({
    patientId,
    informant,
    humanReview,
    interview,
  });
  validatePayloadSafe(failures, formalBody, "AD-8 正式评估请求");
  if (failures.length) return { failures };
  const createdAssessment = await postRequiredObject(failures, {
    path: "/assessments",
    client: doctorClient,
    label: "AD-8 正式评估创建 API",
    body: formalBody,
  });
  if (!createdAssessment) return { failures };
  verifyCreatedAssessmentResponse(failures, createdAssessment);
  if (failures.length) return { failures };

  const afterAssessments = await fetchAssessments(failures, {
    client: doctorClient,
    patientId,
    label: "AD-8 入库后评估列表 API",
  });
  if (!afterAssessments) return { failures };

  verifyAssessmentWasCreated(failures, {
    beforeAssessments,
    afterAssessments,
    createdAssessmentId: createdAssessment.id,
  });
  const formalAssessment = findAssessmentById(
    afterAssessments,
    createdAssessment.id,
  );
  if (!formalAssessment) return { failures };
  verifyFormalAd8Assessment(failures, {
    formalAssessment,
    formalBody,
    expectedRiskLevel: calculateAd8RiskLevel(formalBody.scoreSummary.ad8Total),
  });
  if (failures.length) return { failures };

  await verifyAuditLogs(failures, {
    client: auditClient,
    patientId,
    formalAssessmentId: createdAssessment.id,
  });

  return { failures };
}

function validateConfig(
  failures,
  {
    apiBaseUrl,
    doctorAccount,
    doctorPassword,
    caregiverAccount,
    caregiverPassword,
    auditAccount,
    auditPassword,
    patientId,
    informant,
    humanReview,
    interview,
  },
) {
  requireHttpsUrl(failures, apiBaseUrl, "apiBaseUrl");
  requireString(failures, doctorAccount, "doctorAccount");
  requireString(failures, doctorPassword, "doctorPassword");
  requireString(failures, caregiverAccount, "caregiverAccount");
  requireString(failures, caregiverPassword, "caregiverPassword");
  requireString(failures, auditAccount, "auditAccount");
  requireString(failures, auditPassword, "auditPassword");
  requireString(failures, patientId, "patientId");
  requireDistinctRoleAccounts(failures, {
    doctorAccount,
    caregiverAccount,
    auditAccount,
  });
  validateInformant(failures, informant);
  validateHumanReview(failures, humanReview);
  validateInterview(failures, interview);
}

function requireDistinctRoleAccounts(
  failures,
  { doctorAccount, caregiverAccount, auditAccount },
) {
  const accounts = [doctorAccount, caregiverAccount, auditAccount];
  if (
    accounts.some((account) => typeof account !== "string" || !account.trim())
  ) {
    return;
  }
  if (
    new Set(accounts.map((account) => account.trim())).size !== accounts.length
  ) {
    failures.push(
      "医师、家属和审计账号必须两两不同，且必须在任何网络请求前校验。",
    );
  }
}

function validateInformant(failures, informant) {
  if (!requireObject(failures, informant, "informant 必须是对象。")) return;
  const ownEnumerableKeys = Reflect.ownKeys(informant);
  const allowedKeys = new Set(["caregiverUserId", "relation"]);
  if (
    ownEnumerableKeys.length !== allowedKeys.size ||
    !ownEnumerableKeys.every(
      (key) => typeof key === "string" && allowedKeys.has(key),
    )
  ) {
    failures.push(
      "informant 的 own enumerable keys 必须严格等于 caregiverUserId/relation。",
    );
  }
  if (Object.getPrototypeOf(informant) !== Object.prototype) {
    failures.push(
      "informant 必须使用普通对象原型，不能通过 prototype/constructor 继承额外字段。",
    );
  }
  requireString(
    failures,
    informant.caregiverUserId,
    "informant.caregiverUserId",
  );
  requireString(failures, informant.relation, "informant.relation");
}

function validateHumanReview(failures, humanReview) {
  if (!requireObject(failures, humanReview, "humanReview 必须是对象。")) return;
  requireString(
    failures,
    humanReview.reviewerUserId,
    "humanReview.reviewerUserId",
  );
  requireIsoDate(failures, humanReview.reviewedAt, "humanReview.reviewedAt");
  if (humanReview.conclusion !== "approved") {
    failures.push(
      "humanReview.conclusion 必须是 approved，AD-8 正式筛查记录必须经医生人工复核批准。",
    );
  }
  if (humanReview.notes !== undefined) {
    requireString(failures, humanReview.notes, "humanReview.notes");
  }
}

function validateInterview(failures, interview) {
  if (!requireObject(failures, interview, "interview 必须是对象。")) return;
  requireString(
    failures,
    interview.assessmentSource,
    "interview.assessmentSource",
  );
  requireString(failures, interview.transcript, "interview.transcript");
  requireString(
    failures,
    interview.analysisSummary,
    "interview.analysisSummary",
  );
  requireNumberInRange(
    failures,
    interview.confidence,
    "interview.confidence",
    0,
    1,
  );
  if (
    !requireObject(
      failures,
      interview.items,
      "interview.items 必须包含 AD-8 8 个题项。",
    )
  ) {
    return;
  }
  const itemKeys = Reflect.ownKeys(interview.items);
  if (
    itemKeys.length !== ad8ItemFields.length ||
    !itemKeys.every(
      (key) => typeof key === "string" && ad8ItemFields.includes(key),
    )
  ) {
    failures.push("AD-8 访谈必须提供 8 个题项，不能缺项或增加非量表字段。");
  }
  for (const field of ad8ItemFields) {
    const value = interview.items[field];
    if (value !== 0 && value !== 1) {
      failures.push(`AD-8 ${field} 只能是 0 或 1。`);
    }
  }
}

function validateFormalAd8ConfigSafe(failures, config) {
  const unsafePaths = [];
  collectUnsafePayloadPaths(config, "正式 AD-8 配置", unsafePaths, {
    ignoredRootKeys: credentialInputKeys,
  });
  for (const path of unsafePaths) {
    failures.push(
      `${path} 包含敏感字段、mock/demo/seed/fallback/fixed/manual/synthetic 标记或原始载荷，不能写入正式 AD-8 记录。`,
    );
  }
}

function verifyReviewerMatchesCurrentDoctor(failures, { me, reviewerUserId }) {
  const currentUserId = me?.user?.id;
  if (currentUserId !== reviewerUserId) {
    failures.push("humanReview.reviewerUserId 必须等于当前医师会话对应用户。");
  }
  const roles = Array.isArray(me?.user?.roles) ? me.user.roles : [];
  const hasDoctorRole = roles.some((role) => role?.roleCode === "doctor");
  if (!hasDoctorRole) {
    failures.push("当前会话必须属于医师用户，才能执行 AD-8 医生复核验收。");
  }
}

function verifyInformantMatchesCurrentCaregiver(
  failures,
  { me, caregiverUserId },
) {
  const currentUserId = me?.user?.id;
  if (currentUserId !== caregiverUserId) {
    failures.push("informant.caregiverUserId 必须等于当前家属会话对应用户。");
  }
  const roles = Array.isArray(me?.user?.roles) ? me.user.roles : [];
  const hasCaregiverRole = roles.some((role) => role?.roleCode === "caregiver");
  if (!hasCaregiverRole) {
    failures.push(
      "当前会话必须属于家属用户，才能作为 AD-8 照护者访谈信息提供者。",
    );
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
      failures.push(
        `患者缺少有效 ${consentType} 授权，不能执行 AD-8 照护者访谈验收。`,
      );
    }
  }
}

function verifyCaregiverSummary(failures, summary, expectedPatientId) {
  if (summary?.patient?.id !== expectedPatientId) {
    failures.push("家属授权摘要必须返回同一患者的脱敏摘要。");
  }
  if (
    hasNestedKey(summary, "motionMetrics") ||
    hasNestedKey(summary, "metricsSummary")
  ) {
    failures.push("家属授权摘要不得返回原始动作指标或采集明细。");
  }
  const permissions = summary?.permissions;
  if (
    permissions?.rawAssessment !== false ||
    permissions?.planEdit !== false ||
    permissions?.fullMedicalRecord !== false
  ) {
    failures.push("家属授权摘要必须显式关闭原始评估、方案编辑和完整病历权限。");
  }
}

function buildAd8FormalAssessmentBody({
  patientId,
  informant,
  humanReview,
  interview,
}) {
  const scoreSummary = {
    ad8Total: ad8ItemFields.reduce(
      (sum, field) => sum + interview.items[field],
      0,
    ),
    ...Object.fromEntries(
      ad8ItemFields.map((field) => [field, interview.items[field]]),
    ),
  };

  return {
    patientId,
    assessmentType: expectedAssessmentType,
    scoreSummary,
    rawInputSummary: {
      source: expectedAssessmentSource,
      interviewSource: interview.assessmentSource,
      transcript: interview.transcript,
      analysisSummary: interview.analysisSummary,
      modelVersion: expectedModelVersion,
      confidence: interview.confidence,
      informant: {
        caregiverUserId: informant.caregiverUserId,
        relation: informant.relation,
      },
      scaleVersion: "AD8-2005",
      scoringRule: "yes=1,no=0,total=0-8",
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
  };
}

function verifyCreatedAssessmentResponse(failures, assessment) {
  requireString(failures, assessment.id, "AD-8 正式评估创建响应 id");
}

function verifyAssessmentWasCreated(
  failures,
  { beforeAssessments, afterAssessments, createdAssessmentId },
) {
  const beforeIds = new Set(
    beforeAssessments.map((assessment) => assessment?.id),
  );
  const newAssessments = afterAssessments.filter(
    (assessment) => assessment?.id && !beforeIds.has(assessment.id),
  );
  if (
    !newAssessments.some((assessment) => assessment.id === createdAssessmentId)
  ) {
    failures.push("AD-8 评估列表未找到新建 assessmentId：值已隐藏。");
  }
}

function verifyFormalAd8Assessment(
  failures,
  { formalAssessment, formalBody, expectedRiskLevel },
) {
  compareFields(failures, "AD-8 正式评估记录", formalAssessment, {
    patientId: formalBody.patientId,
    assessmentType: expectedAssessmentType,
  });
  if (!valuesEqual(formalAssessment.scoreSummary, formalBody.scoreSummary)) {
    failures.push(
      "AD-8 正式评估 scoreSummary 必须与医生复核后的 8 个题项一致。",
    );
  }
  verifyFormalRawInputSummary(
    failures,
    formalAssessment.rawInputSummary,
    formalBody.rawInputSummary,
  );
  verifyRiskGrades(failures, formalAssessment.riskGrades, expectedRiskLevel);
  verifyAnalysisRecords(
    failures,
    formalAssessment.aiAnalyses,
    formalBody.rawInputSummary,
  );
  validateNoForbiddenMarkers(failures, formalAssessment, "AD-8 正式评估记录");
}

function verifyFormalRawInputSummary(failures, actual, expected) {
  if (
    !requireObject(
      failures,
      actual,
      "AD-8 正式评估 rawInputSummary 必须是对象。",
    )
  ) {
    return;
  }
  compareFields(failures, "AD-8 正式评估 rawInputSummary", actual, {
    source: expectedAssessmentSource,
    interviewSource: expected.interviewSource,
    transcript: expected.transcript,
    analysisSummary: expected.analysisSummary,
    modelVersion: expectedModelVersion,
    confidence: expected.confidence,
  });
  if (!valuesEqual(actual.informant, expected.informant)) {
    failures.push("AD-8 正式评估必须保留照护者身份引用和关系。");
  }
  if (!valuesEqual(actual.humanReview, expected.humanReview)) {
    failures.push("AD-8 正式评估必须保留医生 approved 人工复核记录。");
  }
}

function verifyRiskGrades(failures, riskGrades, expectedRiskLevel) {
  if (!Array.isArray(riskGrades) || riskGrades.length === 0) {
    failures.push("AD-8 正式评估必须能反查风险评级记录。");
    return;
  }
  const current = riskGrades.find((risk) => risk?.isCurrent === true);
  if (!current) {
    failures.push("AD-8 正式评估必须能反查 isCurrent=true 的当前风险评级。");
    return;
  }
  if (current.riskLevel !== expectedRiskLevel) {
    failures.push("AD-8 风险评级必须与 AD-8 总分分级一致。");
  }
}

function verifyAnalysisRecords(failures, aiAnalyses, rawInputSummary) {
  if (!Array.isArray(aiAnalyses) || aiAnalyses.length === 0) {
    failures.push("AD-8 正式评估必须能反查分析记录。");
    return;
  }
  const matched = aiAnalyses.find(
    (analysis) =>
      analysis?.analysisScene === "assessment_summary" &&
      analysis.modelVersion === rawInputSummary.modelVersion &&
      analysis.confidence === rawInputSummary.confidence,
  );
  if (!matched) {
    failures.push("AD-8 分析记录必须保留量表版本和置信度。");
  }
}

async function verifyAuditLogs(
  failures,
  { client, patientId, formalAssessmentId },
) {
  const assessmentLogs = await fetchAuditLogs(failures, {
    client,
    action: expectedAssessmentAction,
    targetType: "assessment_record",
    targetId: formalAssessmentId,
    label: "AD-8 正式评估审计 API",
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
    failures.push("AD-8 正式评估成功审计日志候选数量必须严格等于 1。");
  } else if (
    matchedAssessmentLogs[0].metadata !== null &&
    matchedAssessmentLogs[0].metadata !== undefined
  ) {
    validateAuditMetadataSafe(
      failures,
      matchedAssessmentLogs[0].metadata,
      "AD-8 正式评估审计候选[0].metadata",
    );
  }
  if (failures.length) return;

  const caregiverLogs = await fetchAuditLogs(failures, {
    client,
    action: expectedCaregiverSummaryAction,
    targetType: "patient_profile",
    targetId: patientId,
    label: "家属摘要审计 API",
  });
  if (!caregiverLogs) return;
  const matchedCaregiverLogs = caregiverLogs.filter(
    (log) =>
      log?.action === expectedCaregiverSummaryAction &&
      log.targetType === "patient_profile" &&
      log.targetId === patientId &&
      log.result === "success",
  );
  if (matchedCaregiverLogs.length !== 1) {
    failures.push("家属授权摘要成功审计日志候选数量必须严格等于 1。");
  } else if (
    matchedCaregiverLogs[0].metadata !== null &&
    matchedCaregiverLogs[0].metadata !== undefined
  ) {
    validateAuditMetadataSafe(
      failures,
      matchedCaregiverLogs[0].metadata,
      "家属授权摘要审计候选[0].metadata",
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
      `${label}返回 HTTP ${status}：响应体已隐藏，避免泄露 token、密钥、访谈原文或模型内容。`,
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

function validateAuditMetadataSafe(
  failures,
  metadata,
  label = "AD-8 审计 metadata",
) {
  if (!isObject(metadata)) {
    failures.push(`${label} 必须是对象。`);
    return;
  }

  const unsafePaths = [];
  collectUnsafeMetadataPaths(metadata, label, unsafePaths);
  for (const path of unsafePaths) {
    failures.push(
      `${path} 包含敏感字段、演示/手工标记或原始载荷，不能作为正式 AD-8 审计记录。`,
    );
  }
}

function collectUnsafeMetadataPaths(value, path, paths) {
  collectUnsafeValuePaths(value, path, paths);
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
      forbiddenMarkerKeyPattern.test(normalizedKey) ||
      (isSensitiveConfigKey(key) &&
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

function isSensitiveConfigKey(key) {
  return dangerousClinicalPayloadKeyPattern.test(normalizeDangerousKey(key));
}

function collectUnsafeValuePaths(value, path, paths) {
  if (typeof value === "string") {
    if (isUnsafeText(value)) paths.push(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectUnsafeValuePaths(item, `${path}[${index}]`, paths),
    );
    return;
  }
  if (!isObject(value)) return;
  for (const [key, nested] of enumerableStringEntries(value)) {
    const nestedPath = `${path}.${key}`;
    if (isSafeHashMetadataField(key, nested)) continue;
    const normalizedKey = normalizeDangerousKey(key);
    if (
      forbiddenMarkerKeyPattern.test(normalizedKey) ||
      sensitiveMetadataKeys.has(normalizedKey) ||
      (isSensitiveConfigKey(key) &&
        !allowedSensitivePayloadKeys.has(normalizedKey))
    ) {
      paths.push(nestedPath);
      continue;
    }
    collectUnsafeValuePaths(nested, nestedPath, paths);
  }
}

function validateNoForbiddenMarkers(failures, value, label) {
  const paths = [];
  collectForbiddenMarkerPaths(value, label, paths);
  for (const path of paths) {
    failures.push(
      `${path} 包含 mock/demo/seed/fallback/fixed/manual/synthetic 标记，不能作为正式 AD-8 验收结果。`,
    );
  }
}

function collectForbiddenMarkerPaths(value, path, paths) {
  if (typeof value === "string") {
    if (forbiddenMarkerPattern.test(value)) paths.push(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectForbiddenMarkerPaths(item, `${path}[${index}]`, paths),
    );
    return;
  }
  if (!isObject(value)) return;
  for (const [key, nested] of enumerableStringEntries(value)) {
    const nestedPath = `${path}.${key}`;
    if (forbiddenMarkerKeyPattern.test(normalizeDangerousKey(key))) {
      paths.push(nestedPath);
      continue;
    }
    collectForbiddenMarkerPaths(nested, nestedPath, paths);
  }
}

function calculateAd8RiskLevel(ad8Total) {
  if (ad8Total >= 6) return "high";
  if (ad8Total >= 2) return "moderate";
  return "low";
}

function hasNestedKey(value, key) {
  if (Array.isArray(value))
    return value.some((item) => hasNestedKey(item, key));
  if (!isObject(value)) return false;
  return enumerableStringEntries(value).some(
    ([nestedKey, nestedValue]) =>
      nestedKey === key || hasNestedKey(nestedValue, key),
  );
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
      failures.push(`${label} 必须使用正式 HTTPS 地址。`);
    }
  } catch {
    failures.push(`${label} 必须是有效 URL。`);
  }
  if (typeof value === "string" && forbiddenMarkerPattern.test(value)) {
    failures.push(
      `${label} 不能包含 mock/demo/seed/fallback/fixed/manual/synthetic 标记。`,
    );
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
    forbiddenMarkerPattern.test(value) ||
    bearerTokenPattern().test(value) ||
    credentialLikePattern().test(redactTokenPlanEndpointLabel(value)) ||
    /(?:[A-Za-z0-9+/]{40,}={0,2})/g.test(value)
  );
}

function bearerTokenPattern() {
  return /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}(?=$|[^A-Za-z0-9._~+/=-])/i;
}

function credentialLikePattern() {
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

function isSafeHashMetadataField(key, value) {
  return (
    /hash$/i.test(normalizeKey(key)) &&
    typeof value === "string" &&
    isHashDigestText(value)
  );
}

function isHashDigestText(value) {
  return /^(?:sha1|sha256|sha384|sha512):[a-f0-9]{40,128}$/i.test(value);
}

function isSafeIdentifierText(value) {
  return (
    isHashDigestText(value) ||
    /^[a-f0-9]{40}$/i.test(value) ||
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
  const configPath = process.argv.slice(2).find((arg) => arg !== "--");

  if (!configPath) {
    console.error(
      "缺少 AD-8 照护者访谈验收配置文件路径。请显式传入 JSON 文件路径。",
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

  const result = await verifyAd8CaregiverInterviewAcceptance(readResult.value);
  if (result.failures.length) {
    console.error("AD-8 照护者访谈正式验收失败：");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("AD-8 照护者访谈正式验收通过。");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await cli();
}
