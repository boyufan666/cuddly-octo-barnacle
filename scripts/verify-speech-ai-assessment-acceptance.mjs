#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CookieSessionClient } from "./local-contract-cookie-session.mjs";

const requiredConsentTypes = [
  "privacy_policy",
  "ai_processing",
  "microphone_capture",
];
const expectedSpeechProvider = "xiaomi-mimo-audio-understanding";
const expectedSpeechSource = "provider_audio_understanding";
const expectedDraftAction = "ai.assessment_draft.generate";
const expectedSpeechAction = "ai.assessment_speech_transcript.generate";
const expectedAssessmentAction = "assessment.create";
const expectedAssessmentSource = "speech_ai_assessment";
const expectedDraftSource = "production_ai_assessment";
const expectedDraftStatus = "pending_human_review";
const supportedAudioMimeTypes = new Set([
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/flac",
]);
const demoMarkerPattern =
  /(^|[^a-z0-9])(mock|demo|seed|fallback|fixed|manual|synthetic)([^a-z0-9]|$)/i;
const demoMarkerKeyPattern =
  /(mock|demo|seed|fallback|fixed|manual|synthetic)/i;
const allowedAuditMetadataKeys = new Set([
  "provider",
  "modelVersion",
  "callId",
  "endpointRef",
  "source",
  "calledAt",
  "promptVersion",
  "status",
  "audio",
]);
const speechAuditMetadataKeys = new Set([
  "provider",
  "modelVersion",
  "callId",
  "endpointRef",
  "source",
  "calledAt",
  "audio",
]);
const draftAuditMetadataKeys = new Set([
  "provider",
  "modelVersion",
  "promptVersion",
  "callId",
  "status",
]);
const allowedAuditAudioMetadataKeys = new Set(["mimeType", "durationSeconds"]);

export async function verifySpeechAiAssessmentAcceptance({
  apiBaseUrl,
  doctorAccount,
  doctorPassword,
  auditAccount,
  auditPassword,
  patientId,
  assessmentType = "MMSE/CDR",
  audioFilePath,
  audioMimeType,
  durationSeconds,
  humanReview,
} = {}) {
  const failures = [];

  validateConfig(failures, {
    apiBaseUrl,
    doctorAccount,
    doctorPassword,
    auditAccount,
    auditPassword,
    patientId,
    assessmentType,
    audioFilePath,
    audioMimeType,
    durationSeconds,
    humanReview,
  });
  if (failures.length) return { failures };

  const audioContentBase64 = readAudioFileAsBase64(failures, audioFilePath);
  if (!audioContentBase64) return { failures };

  const doctorClient = new CookieSessionClient(apiBaseUrl);
  const doctorLoggedIn = await loginSession(failures, {
    client: doctorClient,
    account: doctorAccount,
    password: doctorPassword,
    label: "医师验收账号",
  });
  if (!doctorLoggedIn) return { failures };

  const me = await fetchJson(failures, {
    client: doctorClient,
    path: "/me",
    label: "当前医师身份 API",
    expectedType: "object",
  });
  if (!me) return { failures };
  verifyReviewerMatchesCurrentDoctor(failures, {
    me,
    reviewerUserId: humanReview.reviewerUserId,
  });
  if (failures.length) return { failures };

  const patient = await fetchJson(failures, {
    client: doctorClient,
    path: `/patients/${encodeURIComponent(patientId)}`,
    label: "患者详情 API",
    expectedType: "object",
  });
  if (!patient) return { failures };
  verifyRequiredConsents(failures, patient.consents);
  if (failures.length) return { failures };

  const beforeAssessments = await fetchAssessments(failures, {
    client: doctorClient,
    patientId,
    label: "语音 AI 前评估列表 API",
  });
  if (!beforeAssessments) return { failures };

  const transcript = await postJson(failures, {
    client: doctorClient,
    path: "/ai/assessment-speech-transcripts",
    label: "语音转写 API",
    expectedType: "object",
    body: {
      patientId,
      assessmentType,
      audio: {
        contentBase64: audioContentBase64,
        mimeType: audioMimeType,
        durationSeconds,
      },
    },
  });
  if (!transcript) return { failures };
  verifyTranscriptResponse(failures, {
    transcript,
    expectedPatientId: patientId,
    expectedAssessmentType: assessmentType,
    expectedAudioMimeType: audioMimeType,
    expectedDurationSeconds: durationSeconds,
  });
  if (failures.length) return { failures };

  const afterTranscriptAssessments = await fetchAssessments(failures, {
    client: doctorClient,
    patientId,
    label: "语音转写后评估列表 API",
  });
  if (!afterTranscriptAssessments) return { failures };
  verifyNoAssessmentCreated(failures, {
    beforeAssessments,
    afterAssessments: afterTranscriptAssessments,
    label: "语音转写阶段",
  });
  if (failures.length) return { failures };

  const draft = await postJson(failures, {
    client: doctorClient,
    path: "/ai/assessment-drafts",
    label: "AI 评估草稿 API",
    expectedType: "object",
    body: {
      patientId,
      assessmentType,
      transcript: transcript.transcript,
    },
  });
  if (!draft) return { failures };
  verifyDraftResponse(failures, {
    draft,
    expectedPatientId: patientId,
    expectedAssessmentType: assessmentType,
    expectedTranscript: transcript.transcript,
  });
  if (failures.length) return { failures };

  const afterDraftAssessments = await fetchAssessments(failures, {
    client: doctorClient,
    patientId,
    label: "AI 草稿后评估列表 API",
  });
  if (!afterDraftAssessments) return { failures };
  verifyNoAssessmentCreated(failures, {
    beforeAssessments,
    afterAssessments: afterDraftAssessments,
    label: "AI 草稿阶段",
  });
  if (failures.length) return { failures };

  const formalBody = buildSpeechAiAssessmentBody({
    patientId,
    assessmentType,
    draft,
    speechEvidence: transcript.speechEvidence,
    humanReview,
  });
  const createdAssessment = await postJson(failures, {
    client: doctorClient,
    path: "/assessments",
    label: "正式语音 AI 评估创建 API",
    expectedType: "object",
    body: formalBody,
  });
  if (!createdAssessment) return { failures };
  requireString(failures, createdAssessment.id, "正式语音 AI 评估创建响应 id");
  if (failures.length) return { failures };

  const afterFormalAssessments = await fetchAssessments(failures, {
    client: doctorClient,
    patientId,
    label: "正式语音 AI 评估后评估列表 API",
  });
  if (!afterFormalAssessments) return { failures };

  const formalAssessment = findAssessmentById(
    afterFormalAssessments,
    createdAssessment.id,
  );
  if (!formalAssessment) {
    failures.push(`正式评估列表未找到 assessmentId=${createdAssessment.id}。`);
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

  const auditClient = new CookieSessionClient(apiBaseUrl);
  const auditLoggedIn = await loginSession(failures, {
    client: auditClient,
    account: auditAccount,
    password: auditPassword,
    label: "审计验收账号",
  });
  if (!auditLoggedIn) return { failures };

  await verifyAuditLogs(failures, {
    client: auditClient,
    patientId,
    formalAssessmentId: createdAssessment.id,
    speechEvidence: transcript.speechEvidence,
    draftEvidence: draft.rawInputSummary.evidence,
  });

  return { failures };
}

function validateConfig(
  failures,
  {
    apiBaseUrl,
    doctorAccount,
    doctorPassword,
    auditAccount,
    auditPassword,
    patientId,
    assessmentType,
    audioFilePath,
    audioMimeType,
    durationSeconds,
    humanReview,
  },
) {
  const apiBaseUrlValidation = validateHttpsUrl(apiBaseUrl);
  if (!apiBaseUrl || typeof apiBaseUrl !== "string") {
    failures.push("apiBaseUrl 必须显式提供正式 API 地址。");
  } else if (!apiBaseUrlValidation.valid) {
    failures.push("apiBaseUrl 必须使用正式 HTTPS 地址。");
  } else if (demoMarkerPattern.test(apiBaseUrl)) {
    failures.push(
      "apiBaseUrl 不能包含 mock/demo/seed/fallback/fixed/manual 标记。",
    );
  }
  requireString(failures, doctorAccount, "doctorAccount");
  requireString(failures, doctorPassword, "doctorPassword");
  requireString(failures, auditAccount, "auditAccount");
  requireString(failures, auditPassword, "auditPassword");
  if (
    typeof doctorAccount === "string" &&
    typeof auditAccount === "string" &&
    doctorAccount.trim() &&
    doctorAccount.trim() === auditAccount.trim()
  ) {
    failures.push("doctorAccount 与 auditAccount 必须使用不同账号。");
  }
  requireString(failures, patientId, "patientId");
  requireString(failures, assessmentType, "assessmentType");
  validateAudioInputConfig(failures, {
    audioFilePath,
    audioMimeType,
    durationSeconds,
  });
  validateHumanReview(failures, humanReview);
}

function validateAudioInputConfig(
  failures,
  { audioFilePath, audioMimeType, durationSeconds },
) {
  requireString(failures, audioFilePath, "audioFilePath");
  requireString(failures, audioMimeType, "audioMimeType");
  if (
    typeof audioMimeType === "string" &&
    !supportedAudioMimeTypes.has(audioMimeType)
  ) {
    failures.push("audioMimeType 必须是小米音频理解支持的正式音频格式。");
  }
  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
    failures.push("durationSeconds 必须是大于 0 的整数。");
  }
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
      "humanReview.conclusion 必须是 approved，正式语音 AI 评估必须经人工复核批准。",
    );
  }
  if (humanReview.notes !== undefined) {
    requireString(failures, humanReview.notes, "humanReview.notes");
  }
}

function readAudioFileAsBase64(failures, audioFilePath) {
  const absolutePath = resolve(process.cwd(), audioFilePath);
  if (!existsSync(absolutePath)) {
    failures.push(`音频文件不存在：${absolutePath}`);
    return undefined;
  }
  const bytes = readFileSync(absolutePath);
  if (bytes.length <= 0) {
    failures.push(`音频文件为空：${absolutePath}`);
    return undefined;
  }
  return bytes.toString("base64");
}

function verifyReviewerMatchesCurrentDoctor(failures, { me, reviewerUserId }) {
  const currentUserId = me?.user?.id;
  if (currentUserId !== reviewerUserId) {
    failures.push(
      "humanReview.reviewerUserId 必须等于当前医师会话用户，不能手工填写他人复核人。",
    );
  }
  const roles = Array.isArray(me?.user?.roles) ? me.user.roles : [];
  const hasDoctorRole = roles.some((role) => role?.roleCode === "doctor");
  if (!hasDoctorRole) {
    failures.push(
      "当前登录会话必须属于医师用户，才能执行语音 AI 评估人工复核验收。",
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
        `患者缺少有效 ${consentType} 授权，不能执行语音 AI 评估验收。`,
      );
    }
  }
}

function verifyTranscriptResponse(
  failures,
  {
    transcript,
    expectedPatientId,
    expectedAssessmentType,
    expectedAudioMimeType,
    expectedDurationSeconds,
  },
) {
  compareFields(failures, "语音转写响应", transcript, {
    patientId: expectedPatientId,
    assessmentType: expectedAssessmentType,
    status: "transcribed",
  });
  requireString(failures, transcript.transcript, "transcript");
  const evidence = requireObject(
    failures,
    transcript.speechEvidence,
    "speechEvidence 必须是对象。",
  );
  if (!evidence) return;
  compareFields(failures, "speechEvidence", evidence, {
    provider: expectedSpeechProvider,
    source: expectedSpeechSource,
  });
  requireString(failures, evidence.modelVersion, "speechEvidence.modelVersion");
  requireString(failures, evidence.callId, "speechEvidence.callId");
  requireIsoDate(failures, evidence.calledAt, "speechEvidence.calledAt");
  requireHttpsUrl(failures, evidence.endpointRef, "speechEvidence.endpointRef");
  const audio = requireObject(
    failures,
    evidence.audio,
    "speechEvidence.audio 必须是对象。",
  );
  if (audio) {
    compareFields(failures, "speechEvidence.audio", audio, {
      mimeType: expectedAudioMimeType,
      durationSeconds: expectedDurationSeconds,
    });
  }
  validateNoDemoMarkers(failures, transcript, "语音转写响应");
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
    source: expectedDraftSource,
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
  verifyAiProviderEvidence(
    failures,
    rawInputSummary.evidence,
    "AI 草稿 evidence",
  );
  const humanReview = rawInputSummary.evidence?.humanReview;
  if (!isObject(humanReview)) {
    failures.push("AI 草稿 evidence.humanReview 必须是对象。");
  } else {
    if (humanReview.required !== true) {
      failures.push("AI 草稿 evidence.humanReview.required 必须为 true。");
    }
    if (humanReview.status !== expectedDraftStatus) {
      failures.push(
        "AI 草稿 evidence.humanReview.status 必须是 pending_human_review。",
      );
    }
  }
  validateNoDemoMarkers(failures, draft, "AI 评估草稿响应");
}

function verifyAiProviderEvidence(failures, evidence, label) {
  if (!requireObject(failures, evidence, `${label} 必须是对象。`)) return;
  requireString(failures, evidence.provider, `${label}.provider`);
  requireString(failures, evidence.model, `${label}.model`);
  requireString(failures, evidence.modelVersion, `${label}.modelVersion`);
  requireString(failures, evidence.callId, `${label}.callId`);
  requireHttpsUrl(failures, evidence.endpointRef, `${label}.endpointRef`);
  requireString(failures, evidence.promptVersion, `${label}.promptVersion`);
  requireIsoDate(failures, evidence.calledAt, `${label}.calledAt`);
}

function verifyNoAssessmentCreated(
  failures,
  { beforeAssessments, afterAssessments, label },
) {
  const beforeIds = new Set(
    beforeAssessments.map((assessment) => assessment?.id),
  );
  const newAssessments = afterAssessments.filter(
    (assessment) => assessment?.id && !beforeIds.has(assessment.id),
  );
  if (newAssessments.length) {
    failures.push(
      `${label} 出现新的正式评估记录，正式评估只能在医生 approved 后创建。`,
    );
  }
}

function buildSpeechAiAssessmentBody({
  patientId,
  assessmentType,
  draft,
  speechEvidence,
  humanReview,
}) {
  return {
    patientId,
    assessmentType,
    scoreSummary: draft.scoreSummary,
    rawInputSummary: {
      ...draft.rawInputSummary,
      source: expectedAssessmentSource,
      evidence: {
        ai: stripDraftHumanReview(draft.rawInputSummary.evidence),
        speech: speechEvidence,
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

function stripDraftHumanReview(evidence) {
  if (!isObject(evidence)) return evidence;
  const { humanReview: _humanReview, ...providerEvidence } = evidence;
  return providerEvidence;
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
  compareFields(failures, "正式语音 AI 评估记录", formalAssessment, {
    patientId: expectedPatientId,
    assessmentType: expectedAssessmentType,
    source: expectedAssessmentSource,
  });
  if (!valuesEqual(formalAssessment.scoreSummary, draft.scoreSummary)) {
    failures.push("正式语音 AI 评估 scoreSummary 必须与已复核 AI 草稿一致。");
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
  validateNoDemoMarkers(failures, formalAssessment, "正式语音 AI 评估记录");
}

function verifyFormalRawInputSummary(failures, actual, expected) {
  if (
    !requireObject(
      failures,
      actual,
      "正式语音 AI 评估 rawInputSummary 必须是对象。",
    )
  ) {
    return;
  }
  compareFields(failures, "正式语音 AI 评估 rawInputSummary", actual, {
    source: expectedAssessmentSource,
    transcript: expected.transcript,
    analysisSummary: expected.analysisSummary,
    modelVersion: expected.modelVersion,
    confidence: expected.confidence,
  });
  if (!valuesEqual(actual.evidence, expected.evidence)) {
    failures.push(
      "正式语音 AI 评估 evidence 必须保留 AI、语音和 approved 人工复核记录。",
    );
  }
}

function verifyRiskGrades(failures, riskGrades, expectedRiskLevel) {
  if (!Array.isArray(riskGrades) || riskGrades.length === 0) {
    failures.push("正式语音 AI 评估必须能反查风险评级记录。");
    return;
  }
  const current = riskGrades.find((risk) => risk?.isCurrent) ?? riskGrades[0];
  if (current.riskLevel !== expectedRiskLevel) {
    failures.push("正式语音 AI 评估风险评级必须与 AI 草稿风险等级一致。");
  }
}

function verifyAiAnalyses(failures, aiAnalyses, rawInputSummary) {
  if (!Array.isArray(aiAnalyses) || aiAnalyses.length === 0) {
    failures.push("正式语音 AI 评估必须能反查 AI 分析记录。");
    return;
  }
  const matched = aiAnalyses.find(
    (analysis) =>
      analysis?.analysisScene === "assessment_summary" &&
      analysis.modelVersion === rawInputSummary.modelVersion &&
      analysis.confidence === rawInputSummary.confidence,
  );
  if (!matched) {
    failures.push("正式语音 AI 评估 AI 分析记录必须保留模型版本和置信度。");
  }
}

async function verifyAuditLogs(
  failures,
  { client, patientId, formalAssessmentId, speechEvidence, draftEvidence },
) {
  const speechLogs = await fetchAuditLogs(failures, {
    client,
    action: expectedSpeechAction,
    targetType: "patient_profile",
    targetId: patientId,
    label: "语音转写审计 API",
  });
  if (speechLogs) {
    const candidates = filterAuditCandidates(speechLogs, {
      action: expectedSpeechAction,
      targetType: "patient_profile",
      targetId: patientId,
    });
    validateAuditCandidates(failures, candidates, {
      label: "语音转写审计 metadata",
      expectedKeys: speechAuditMetadataKeys,
    });
    if (candidates.length !== 1) {
      failures.push(
        `语音转写成功审计候选必须恰好 1 条，实际为 ${candidates.length} 条（审计日志）。`,
      );
    } else {
      const metadata = candidates[0].metadata;
      if (
        metadata?.provider !== speechEvidence.provider ||
        metadata?.modelVersion !== speechEvidence.modelVersion ||
        metadata?.callId !== speechEvidence.callId ||
        metadata?.endpointRef !== speechEvidence.endpointRef ||
        metadata?.source !== speechEvidence.source ||
        metadata?.calledAt !== speechEvidence.calledAt ||
        !valuesEqual(metadata?.audio, speechEvidence.audio)
      ) {
        failures.push("未找到与语音供应商调用证据匹配的成功审计日志。");
      }
    }
  }

  const draftLogs = await fetchAuditLogs(failures, {
    client,
    action: expectedDraftAction,
    targetType: "patient_profile",
    targetId: patientId,
    label: "AI 草稿审计 API",
  });
  if (draftLogs) {
    const candidates = filterAuditCandidates(draftLogs, {
      action: expectedDraftAction,
      targetType: "patient_profile",
      targetId: patientId,
    });
    validateAuditCandidates(failures, candidates, {
      label: "AI 草稿审计 metadata",
      expectedKeys: draftAuditMetadataKeys,
    });
    if (candidates.length !== 1) {
      failures.push(
        `AI 草稿成功审计候选必须恰好 1 条，实际为 ${candidates.length} 条（审计日志）。`,
      );
    } else {
      const metadata = candidates[0].metadata;
      if (
        metadata?.provider !== draftEvidence.provider ||
        metadata?.modelVersion !== draftEvidence.modelVersion ||
        metadata?.promptVersion !== draftEvidence.promptVersion ||
        metadata?.callId !== draftEvidence.callId ||
        metadata?.status !== expectedDraftStatus
      ) {
        failures.push("未找到与 AI 草稿供应商调用证据匹配的成功审计日志。");
      }
    }
  }

  const assessmentLogs = await fetchAuditLogs(failures, {
    client,
    action: expectedAssessmentAction,
    targetType: "assessment_record",
    targetId: formalAssessmentId,
    label: "正式语音 AI 评估审计 API",
  });
  if (assessmentLogs) {
    const candidates = filterAuditCandidates(assessmentLogs, {
      action: expectedAssessmentAction,
      targetType: "assessment_record",
      targetId: formalAssessmentId,
    });
    for (const candidate of candidates) {
      if (candidate.metadata !== null && candidate.metadata !== undefined) {
        if (isObject(candidate.metadata)) {
          validateAuditMetadataSafe(failures, candidate.metadata);
        }
        failures.push("正式评估创建审计 metadata 必须为空，不能包含额外字段。");
      }
    }
    if (candidates.length !== 1) {
      failures.push(
        `正式评估创建成功审计候选必须恰好 1 条，实际为 ${candidates.length} 条（审计日志）。`,
      );
    }
  }
}

function filterAuditCandidates(logs, { action, targetType, targetId }) {
  return logs.filter(
    (log) =>
      log?.action === action &&
      log.targetType === targetType &&
      log.targetId === targetId &&
      log.result === "success",
  );
}

function validateAuditCandidates(
  failures,
  candidates,
  { label, expectedKeys },
) {
  for (const candidate of candidates) {
    validateAuditMetadataSafe(failures, candidate.metadata);
    if (!isObject(candidate.metadata)) continue;
    for (const key of Object.keys(candidate.metadata)) {
      if (!expectedKeys.has(key)) {
        failures.push(`${label}.${key} 是当前审计动作不允许的额外字段。`);
      }
    }
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

  const logs = await fetchJson(failures, {
    client,
    path: `/admin/audit-logs?${searchParams}`,
    label,
    expectedType: "array",
  });
  if (!logs) return null;
  if (!Array.isArray(logs)) {
    failures.push(`${label} 返回值必须是数组。`);
    return null;
  }
  return logs;
}

async function fetchAssessments(failures, { client, patientId, label }) {
  const assessments = await fetchJson(failures, {
    client,
    path: `/patients/${encodeURIComponent(patientId)}/assessments`,
    label,
    expectedType: "array",
  });
  if (!assessments) return null;
  if (!Array.isArray(assessments)) {
    failures.push(`${label} 返回值必须是数组。`);
    return null;
  }
  return assessments;
}

async function loginSession(failures, { client, account, password, label }) {
  try {
    await client.login(account, password);
    return true;
  } catch (error) {
    failures.push(formatRequestFailure(`${label}登录 API`, error));
    return false;
  }
}

async function fetchJson(failures, { client, path, label, expectedType }) {
  return requestJson(failures, {
    client,
    path,
    label,
    expectedType,
    method: "GET",
  });
}

async function postJson(failures, { client, path, label, expectedType, body }) {
  return requestJson(failures, {
    client,
    path,
    label,
    expectedType,
    method: "POST",
    body,
  });
}

async function requestJson(
  failures,
  { client, path, label, expectedType, method, body },
) {
  try {
    const value = await client.request(path, {
      method,
      headers: {
        Accept: "application/json",
      },
      ...(body === undefined ? {} : { body }),
    });
    if (responseType(value) !== expectedType) {
      failures.push(
        `${label} response：期望类型 ${expectedType}，实际类型 ${responseType(value)}。`,
      );
      return null;
    }
    return value;
  } catch (error) {
    failures.push(formatRequestFailure(label, error));
    return null;
  }
}

function formatRequestFailure(label, error) {
  const status = String(error?.message ?? "").match(/^HTTP (\d{3})\b/)?.[1];
  if (status) {
    return `${label} 返回 HTTP ${status}：响应体已隐藏，避免泄露账号口令、cookie、密钥、音频、转写或模型内容。`;
  }
  return `${label} 请求失败：错误详情已隐藏，避免泄露账号口令、cookie、密钥、音频、转写或模型内容。`;
}

function validateScoreSummary(failures, scoreSummary, label) {
  if (!requireObject(failures, scoreSummary, `${label} 必须是对象。`)) return;
  for (const field of [
    "mmse",
    "cdr",
    "memory",
    "orientation",
    "executive",
    "language",
  ]) {
    if (typeof scoreSummary[field] !== "number") {
      failures.push(`${label}.${field} 必须是数字。`);
    }
  }
}

function validateAuditMetadataSafe(failures, metadata) {
  if (!isObject(metadata)) {
    failures.push("语音 AI 评估审计 metadata 必须是对象。");
    return;
  }

  const unsafePaths = [];
  collectUnsafeMetadataPaths(
    metadata,
    "语音 AI 评估审计 metadata",
    unsafePaths,
  );
  for (const path of unsafePaths) {
    failures.push(
      `${path} 包含敏感字段、演示/手工标记或原始载荷，不能作为正式语音 AI 评估审计记录。`,
    );
  }
}

function collectUnsafeMetadataPaths(value, path, paths) {
  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (!allowedAuditMetadataKeys.has(key)) {
      paths.push(nestedPath);
      continue;
    }
    if (key === "endpointRef" && typeof nested === "string") {
      if (isUnsafeEndpointRefValue(nested)) {
        paths.push(nestedPath);
      }
      continue;
    }
    if (key === "callId") {
      if (typeof nested !== "string" || isUnsafeCallIdValue(nested)) {
        paths.push(nestedPath);
      }
      continue;
    }
    if (key === "audio") {
      collectUnsafeAuditAudioMetadataPaths(nested, nestedPath, paths);
      continue;
    }
    if (typeof nested === "string" && isUnsafeText(nested)) {
      paths.push(nestedPath);
      continue;
    }
    if (isObject(nested) || Array.isArray(nested)) paths.push(nestedPath);
  }
}

function collectUnsafeAuditAudioMetadataPaths(value, path, paths) {
  if (!isObject(value)) {
    paths.push(path);
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (
      !allowedAuditAudioMetadataKeys.has(key) ||
      demoMarkerKeyPattern.test(key)
    ) {
      paths.push(nestedPath);
      continue;
    }
    if (typeof nested === "string" && isUnsafeText(nested)) {
      paths.push(nestedPath);
      continue;
    }
    if (isObject(nested) || Array.isArray(nested)) paths.push(nestedPath);
  }
}

function validateNoDemoMarkers(failures, value, label) {
  const paths = [];
  collectDemoMarkerPaths(value, label, paths);
  for (const path of new Set(paths)) {
    failures.push(
      `${path} 包含 mock/demo/seed/fallback/fixed/manual/synthetic 标记，不能作为正式语音 AI 评估验收结果。`,
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
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (demoMarkerKeyPattern.test(key)) paths.push(nestedPath);
    collectDemoMarkerPaths(nested, nestedPath, paths);
  }
}

function isUnsafeText(value) {
  return (
    demoMarkerPattern.test(value) ||
    bearerTokenPattern().test(value) ||
    secretLikePattern().test(value) ||
    base64LikePattern().test(value)
  );
}

function isUnsafeCallIdValue(value) {
  if (
    demoMarkerPattern.test(value) ||
    bearerTokenPattern().test(value) ||
    secretLikePattern().test(value)
  ) {
    return true;
  }
  if (/^[a-f0-9]{40}$/i.test(value) || /^[a-f0-9]{64}$/i.test(value)) {
    return false;
  }
  if (
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  ) {
    return false;
  }
  return (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ||
    base64LikePattern().test(value)
  );
}

function isUnsafeEndpointRefValue(value) {
  if (demoMarkerPattern.test(value)) return true;
  let url;
  try {
    url = new URL(value);
  } catch {
    return true;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return true;
  }
  return [...url.hostname.split("."), ...url.pathname.split("/")]
    .filter(Boolean)
    .some(isUnsafeEndpointUrlPart);
}

function isUnsafeEndpointUrlPart(value) {
  if (value.toLowerCase() === "token-plan-cn") return false;
  return isUnsafeText(value);
}

function compareFields(failures, label, actual, expected) {
  for (const [field, expectedValue] of Object.entries(expected)) {
    const actualValue = actual?.[field];
    if (actualValue !== expectedValue) {
      failures.push(
        `${label}.${field}：期望类型 ${responseType(expectedValue)}，实际类型 ${responseType(actualValue)}，值不符合预期。`,
      );
    }
  }
}

function requireString(failures, value, label) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${label} 必须显式提供非空文本。`);
  }
}

function requireObject(failures, value, message) {
  if (!isObject(value)) {
    failures.push(message);
    return null;
  }
  return value;
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
}

function requireIsoDate(failures, value, label) {
  requireString(failures, value, label);
  if (typeof value !== "string" || !value.trim()) return;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    failures.push(`${label} 必须是 ISO 8601 UTC 时间。`);
  }
}

function requireNumberInRange(failures, value, label, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    failures.push(`${label} 必须是数字。`);
    return;
  }
  if (value < min || value > max) {
    failures.push(`${label} 必须在 ${min} 到 ${max} 之间。`);
  }
}

function findAssessmentById(assessments, assessmentId) {
  return assessments.find((assessment) => assessment?.id === assessmentId);
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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

function base64LikePattern() {
  return /(?:[A-Za-z0-9+/]{40,}={0,2})/g;
}

function bearerTokenPattern() {
  return /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}(?![A-Za-z0-9._~+/=-])/i;
}

function responseType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function secretLikePattern() {
  return /\b(?:sk|ak|api[_-]?key|secret|token)[_-]?[A-Za-z0-9._~+/=-]{8,}\b/i;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
    process.env.SPEECH_AI_ASSESSMENT_ACCEPTANCE_CONFIG;

  if (!configPath) {
    console.error(
      "缺少配置文件路径。请传入 JSON 文件路径，或设置 SPEECH_AI_ASSESSMENT_ACCEPTANCE_CONFIG。",
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
    console.error("配置文件不是有效 JSON：解析详情已隐藏。");
    process.exitCode = 1;
    return;
  }

  const result = await verifySpeechAiAssessmentAcceptance(readResult.value);
  if (result.failures.length) {
    console.error("语音 AI 评估现场验收失败：");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("语音 AI 评估现场验收通过。");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await cli();
}
