import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAiAssessmentDraftToForm,
  applySpeechAiAssessmentDraftToForm,
  buildAd8AssessmentSubmission,
  buildAssessmentSubmission,
  createStagedAiAssessmentDraft,
  isAd8AssessmentSubmissionFormComplete,
  isAssessmentPhysicalConditionSelectionComplete,
  isAssessmentSubmissionFormComplete,
  isStagedAiAssessmentDraftForRequest,
  normalizeAssessmentPhysicalConditions,
  type AssessmentDraftFormState,
  updateAd8AssessmentFormField,
  updateAssessmentDraftFormField,
  updateAssessmentPhysicalConditions,
} from "./ai-assessment-draft.ts";
import { applyAssessmentSpeechTranscriptToForm } from "./assessment-speech-transcript.ts";
import type {
  AiAssessmentDraftResponse,
  AssessmentSpeechTranscriptResponse,
} from "@/types/api";

const emptyForm: AssessmentDraftFormState = {
  assessmentType: "MMSE/CDR",
  riskLevel: "",
  physicalConditions: ["no_known_limitations"],
  informantName: "",
  informantRelation: "",
  assessmentSource: "caregiver_interview",
  mmse: "",
  cdr: "",
  memory: "",
  orientation: "",
  executive: "",
  language: "",
  ad8Total: "",
  itemMemoryProblems: "",
  itemReducedInterest: "",
  itemRepeatsQuestions: "",
  itemTroubleLearningTools: "",
  itemForgetsMonthYear: "",
  itemHandlesFinancesPoorly: "",
  itemTroubleAppointments: "",
  itemDailyThinkingMemoryProblems: "",
  transcript: "医师原始记录",
  reactionDelaySeconds: "",
  modelVersion: "",
  confidence: "",
  analysisSummary: "",
  aiDraftEvidence: undefined,
};

function validDraft(
  overrides: Partial<AiAssessmentDraftResponse> = {},
): AiAssessmentDraftResponse {
  return {
    patientId: "patient-profile-id",
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
      transcript: "患者完成 MMSE 问答，短时记忆表现下降。",
      analysisSummary: "存在中度认知风险，建议医生复核后生成康复方案。",
      modelVersion: "MiMo-V2.5",
      confidence: 0.82,
      evidence: {
        provider: "xiaomi-mimo",
        model: "mimo-v2.5",
        modelVersion: "mimo-v2.5",
        callId: "chatcmpl-real-001",
        endpointRef: "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
        promptVersion: "cognitive-assessment-mimo-2026-05",
        calledAt: "2026-05-26T10:00:00.000Z",
        humanReview: {
          required: true,
          status: "pending_human_review",
        },
      },
    },
    ...overrides,
  };
}

test("applyAiAssessmentDraftToForm fills clinician review form from complete draft", () => {
  const form = applyAiAssessmentDraftToForm(emptyForm, validDraft());

  assert.equal(form.mmse, "21");
  assert.equal(form.cdr, "1");
  assert.equal(form.memory, "45");
  assert.equal(form.transcript, "患者完成 MMSE 问答，短时记忆表现下降。");
  assert.equal(form.modelVersion, "MiMo-V2.5");
  assert.equal(form.confidence, "0.82");
  assert.equal(form.assessmentType, "MMSE/CDR");
  assert.equal(form.riskLevel, "moderate");
  assert.deepEqual(form.aiDraftEvidence, validDraft().rawInputSummary.evidence);
});

test("applyAiAssessmentDraftToForm routes AD-8 drafts without requiring MMSE/CDR scores", () => {
  const form = applyAiAssessmentDraftToForm(
    emptyForm,
    validDraft({
      assessmentType: "AD-8",
      riskLevel: "high",
      scoreSummary: {
        ad8Total: 4,
        itemMemoryProblems: 1,
        itemReducedInterest: 0,
        itemRepeatsQuestions: 1,
        itemTroubleLearningTools: 0,
        itemForgetsMonthYear: 1,
        itemHandlesFinancesPoorly: 0,
        itemTroubleAppointments: 1,
        itemDailyThinkingMemoryProblems: 0,
      },
    }),
  );

  assert.equal(form.assessmentType, "AD-8");
  assert.equal(form.riskLevel, "high");
  assert.equal(form.ad8Total, "4");
  assert.equal(form.itemRepeatsQuestions, "1");
});

test("staged AI draft is reusable only for the exact completed request", () => {
  const staged = createStagedAiAssessmentDraft({
    patientId: "patient-profile-id",
    assessmentType: "MMSE/CDR",
    physicalConditions: ["wheelchair"],
    transcript: "  患者完成 MMSE 问答。  ",
    draft: validDraft({
      rawInputSummary: {
        ...validDraft().rawInputSummary,
        transcript: "患者完成 MMSE 问答。",
      },
    }),
  });

  assert.equal(
    isStagedAiAssessmentDraftForRequest(staged, {
      patientId: "patient-profile-id",
      assessmentType: "MMSE/CDR",
      physicalConditions: ["wheelchair"],
      transcript: "患者完成 MMSE 问答。",
    }),
    true,
  );
  assert.equal(
    isStagedAiAssessmentDraftForRequest(staged, {
      patientId: "other-patient",
      assessmentType: "MMSE/CDR",
      physicalConditions: ["wheelchair"],
      transcript: "患者完成 MMSE 问答。",
    }),
    false,
  );
  assert.equal(
    isStagedAiAssessmentDraftForRequest(staged, {
      patientId: "patient-profile-id",
      assessmentType: "MMSE/CDR",
      physicalConditions: ["wheelchair"],
      transcript: "患者完成另一份问答。",
    }),
    false,
  );
  assert.equal(
    isStagedAiAssessmentDraftForRequest(staged, {
      patientId: "patient-profile-id",
      assessmentType: "MMSE/CDR",
      physicalConditions: ["upper_limb_limited"],
      transcript: "患者完成 MMSE 问答。",
    }),
    false,
  );
});

test("applyAiAssessmentDraftToForm preserves speech evidence from transcript response", () => {
  const transcribed = applyAssessmentSpeechTranscriptToForm(
    emptyForm,
    validTranscriptResponse(),
  );
  const form = applyAiAssessmentDraftToForm(transcribed, validDraft());

  assert.deepEqual(
    form.speechEvidence,
    validTranscriptResponse().speechEvidence,
  );
  assert.deepEqual(form.aiDraftEvidence, validDraft().rawInputSummary.evidence);
});

test("applySpeechAiAssessmentDraftToForm combines STT and AI evidence for doctor review", () => {
  const form = applySpeechAiAssessmentDraftToForm(
    emptyForm,
    validTranscriptResponse(),
    validDraft({
      rawInputSummary: {
        ...validDraft().rawInputSummary,
        transcript: "患者完成语音问答。",
      },
    }),
  );

  assert.equal(form.transcript, "患者完成语音问答。");
  assert.deepEqual(
    form.speechEvidence,
    validTranscriptResponse().speechEvidence,
  );
  assert.deepEqual(form.aiDraftEvidence, validDraft().rawInputSummary.evidence);

  const submission = buildAssessmentSubmission({
    patientId: "patient-profile-id",
    reviewerUserId: "doctor-user-id",
    reviewedAt: "2026-05-26T10:05:00.000Z",
    form: {
      ...form,
      reactionDelaySeconds: "2.4",
    },
  });

  assert.equal(submission.rawInputSummary.source, "speech_ai_assessment");
  assertSpeechAiEvidence(submission.rawInputSummary.evidence);
});

test("applyAiAssessmentDraftToForm rejects incomplete draft instead of inventing scores", () => {
  assert.throws(
    () =>
      applyAiAssessmentDraftToForm(
        emptyForm,
        validDraft({
          scoreSummary: {
            mmse: 21,
            cdr: 1,
            memory: 45,
            orientation: 62,
            executive: 50,
          } as AiAssessmentDraftResponse["scoreSummary"],
        }),
      ),
    /结构化评分/,
  );
});

test("buildAssessmentSubmission keeps manual review input as clinician source", () => {
  const submission = buildAssessmentSubmission({
    patientId: "patient-profile-id",
    reviewerUserId: "doctor-user-id",
    reviewedAt: "2026-05-26T10:05:00.000Z",
    form: {
      ...emptyForm,
      physicalConditions: ["wheelchair", "upper_limb_limited"],
      mmse: "22",
      cdr: "1",
      memory: "48",
      orientation: "58",
      executive: "52",
      language: "73",
      transcript: "医师手工录入问答摘要。",
      analysisSummary: "存在轻中度认知风险。",
      modelVersion: "clinician-structured-input-v1",
      confidence: "0.84",
      reactionDelaySeconds: "2.1",
    },
  });

  assert.equal(submission.rawInputSummary.source, "clinician_input");
  assert.equal(submission.rawInputSummary.evidence, undefined);
  assert.deepEqual(submission.rawInputSummary.physicalConditions, [
    "upper_limb_limited",
    "wheelchair",
  ]);
});

test("buildAssessmentSubmission preserves AI evidence and adds approved human review", () => {
  const form = applyAiAssessmentDraftToForm(emptyForm, validDraft());
  const submission = buildAssessmentSubmission({
    patientId: "patient-profile-id",
    reviewerUserId: "doctor-user-id",
    reviewedAt: "2026-05-26T10:05:00.000Z",
    form: {
      ...form,
      reactionDelaySeconds: "2.4",
    },
  });

  assert.equal(submission.rawInputSummary.source, "production_ai_assessment");
  assert.deepEqual(submission.rawInputSummary.evidence?.humanReview, {
    required: true,
    reviewerUserId: "doctor-user-id",
    reviewedAt: "2026-05-26T10:05:00.000Z",
    conclusion: "approved",
  });
});

test("buildAssessmentSubmission uses speech AI source with AI and speech evidence after human review", () => {
  const transcribed = applyAssessmentSpeechTranscriptToForm(
    emptyForm,
    validTranscriptResponse(),
  );
  const form = applyAiAssessmentDraftToForm(transcribed, validDraft());
  const submission = buildAssessmentSubmission({
    patientId: "patient-profile-id",
    reviewerUserId: "doctor-user-id",
    reviewedAt: "2026-05-26T10:05:00.000Z",
    form: {
      ...form,
      reactionDelaySeconds: "2.4",
    },
  });

  assert.equal(submission.rawInputSummary.source, "speech_ai_assessment");
  const evidence = submission.rawInputSummary.evidence;
  assertSpeechAiEvidence(evidence);
  assert.deepEqual(evidence.ai, validDraft().rawInputSummary.evidence);
  assert.deepEqual(evidence.speech, validTranscriptResponse().speechEvidence);
  assert.deepEqual(evidence.humanReview, {
    required: true,
    reviewerUserId: "doctor-user-id",
    reviewedAt: "2026-05-26T10:05:00.000Z",
    conclusion: "approved",
  });
});

test("buildAssessmentSubmission keeps AI-only drafts as production AI source", () => {
  const form = applyAiAssessmentDraftToForm(emptyForm, validDraft());
  const submission = buildAssessmentSubmission({
    patientId: "patient-profile-id",
    reviewerUserId: "doctor-user-id",
    reviewedAt: "2026-05-26T10:05:00.000Z",
    form: {
      ...form,
      reactionDelaySeconds: "2.4",
    },
  });

  assert.equal(submission.rawInputSummary.source, "production_ai_assessment");
  const evidence = submission.rawInputSummary.evidence;
  assert.ok(evidence && typeof evidence === "object");
  assert.equal("speech" in evidence, false);
});

test("buildAssessmentSubmission rejects AI draft submission without provider evidence", () => {
  assert.throws(
    () =>
      buildAssessmentSubmission({
        patientId: "patient-profile-id",
        reviewerUserId: "doctor-user-id",
        reviewedAt: "2026-05-26T10:05:00.000Z",
        form: {
          ...emptyForm,
          mmse: "22",
          cdr: "1",
          memory: "48",
          orientation: "58",
          executive: "52",
          language: "73",
          transcript: "AI 草稿转写。",
          analysisSummary: "AI 草稿摘要。",
          modelVersion: "mimo-v2.5",
          confidence: "0.84",
          reactionDelaySeconds: "2.1",
          aiDraftEvidence: {
            humanReview: {
              required: true,
              status: "pending_human_review",
            },
          },
        },
      }),
    /供应商调用证据/,
  );
});

test("updateAssessmentDraftFormField clears AI evidence after clinician edits a draft field", () => {
  const form = applyAiAssessmentDraftToForm(emptyForm, validDraft());
  const edited = updateAssessmentDraftFormField(
    form,
    "analysisSummary",
    "医生复核后改写摘要。",
  );

  assert.equal(edited.analysisSummary, "医生复核后改写摘要。");
  assert.equal(edited.aiDraftEvidence, undefined);
});

test("updateAssessmentDraftFormField clears AI and speech evidence after clinician edits draft field", () => {
  const transcribed = applyAssessmentSpeechTranscriptToForm(
    emptyForm,
    validTranscriptResponse(),
  );
  const form = applyAiAssessmentDraftToForm(transcribed, validDraft());
  const edited = updateAssessmentDraftFormField(
    form,
    "analysisSummary",
    "医生复核后改写摘要。",
  );

  assert.equal(edited.analysisSummary, "医生复核后改写摘要。");
  assert.equal(edited.aiDraftEvidence, undefined);
  assert.equal(edited.speechEvidence, undefined);
});

test("updateAssessmentPhysicalConditions stores explicit selections and invalidates stale draft evidence", () => {
  const form = applyAiAssessmentDraftToForm(emptyForm, validDraft());
  const updated = updateAssessmentPhysicalConditions(form, [
    "wheelchair",
    "upper_limb_limited",
  ]);

  assert.deepEqual(updated.physicalConditions, [
    "upper_limb_limited",
    "wheelchair",
  ]);
  assert.equal(updated.aiDraftEvidence, undefined);
});

test("physical condition validation rejects empty and mutually exclusive selections", () => {
  assert.equal(isAssessmentPhysicalConditionSelectionComplete([]), false);
  assert.equal(
    isAssessmentPhysicalConditionSelectionComplete(["no_known_limitations"]),
    true,
  );
  assert.equal(
    isAssessmentPhysicalConditionSelectionComplete([
      "no_known_limitations",
      "wheelchair",
    ]),
    false,
  );
  assert.throws(
    () => normalizeAssessmentPhysicalConditions([]),
    /明确选择身体情况/,
  );
  assert.throws(
    () =>
      normalizeAssessmentPhysicalConditions([
        "no_known_limitations",
        "upper_limb_limited",
      ]),
    /不能与其他身体限制同时选择/,
  );
  assert.throws(
    () =>
      buildAssessmentSubmission({
        patientId: "patient-profile-id",
        reviewerUserId: "doctor-user-id",
        reviewedAt: "2026-05-26T10:05:00.000Z",
        form: { ...emptyForm, physicalConditions: [] },
      }),
    /明确选择身体情况/,
  );
});

test("buildAssessmentSubmission preserves an AI-routed AD-8 score set and physical conditions", () => {
  const form = applyAiAssessmentDraftToForm(
    { ...emptyForm, physicalConditions: ["wheelchair"] },
    validDraft({
      assessmentType: "AD-8",
      riskLevel: "high",
      scoreSummary: {
        ad8Total: 4,
        itemMemoryProblems: 1,
        itemReducedInterest: 0,
        itemRepeatsQuestions: 1,
        itemTroubleLearningTools: 0,
        itemForgetsMonthYear: 1,
        itemHandlesFinancesPoorly: 0,
        itemTroubleAppointments: 1,
        itemDailyThinkingMemoryProblems: 0,
      },
    }),
  );
  const submission = buildAssessmentSubmission({
    patientId: "patient-profile-id",
    reviewerUserId: "doctor-user-id",
    reviewedAt: "2026-05-26T10:05:00.000Z",
    form: {
      ...form,
      informantName: "李明",
      informantRelation: "儿子",
      assessmentSource: "caregiver_interview",
      reactionDelaySeconds: "2.4",
    },
  });

  assert.equal(submission.assessmentType, "AD-8");
  assert.equal(submission.scoreSummary.ad8Total, 4);
  assert.equal("mmse" in submission.scoreSummary, false);
  assert.deepEqual(submission.rawInputSummary.physicalConditions, [
    "wheelchair",
  ]);
  assert.equal(
    submission.rawInputSummary.interviewSource,
    "caregiver_interview",
  );
  assert.deepEqual(submission.rawInputSummary.informant, {
    name: "李明",
    relation: "儿子",
  });
});

test("isAssessmentSubmissionFormComplete ignores optional AI evidence and checks required strings only", () => {
  assert.equal(
    isAssessmentSubmissionFormComplete({
      ...emptyForm,
      mmse: "22",
      cdr: "1",
      memory: "48",
      orientation: "58",
      executive: "52",
      language: "73",
      transcript: "医师手工录入问答摘要。",
      analysisSummary: "存在轻中度认知风险。",
      modelVersion: "clinician-structured-input-v1",
      confidence: "0.84",
      reactionDelaySeconds: "2.1",
    }),
    true,
  );
  assert.equal(
    isAssessmentSubmissionFormComplete({
      ...emptyForm,
      physicalConditions: [],
      mmse: "22",
      cdr: "1",
      memory: "48",
      orientation: "58",
      executive: "52",
      language: "73",
      transcript: "医师手工录入问答摘要。",
      analysisSummary: "存在轻中度认知风险。",
      modelVersion: "clinician-structured-input-v1",
      confidence: "0.84",
      reactionDelaySeconds: "2.1",
    }),
    false,
  );
});

test("buildAd8AssessmentSubmission creates structured AD-8 assessment without MMSE/CDR fields", () => {
  const submission = buildAd8AssessmentSubmission({
    patientId: "patient-profile-id",
    form: {
      informantName: "李明",
      informantRelation: "儿子",
      assessmentSource: "caregiver_interview",
      itemMemoryProblems: "1",
      itemReducedInterest: "0",
      itemRepeatsQuestions: "1",
      itemTroubleLearningTools: "0",
      itemForgetsMonthYear: "1",
      itemHandlesFinancesPoorly: "0",
      itemTroubleAppointments: "1",
      itemDailyThinkingMemoryProblems: "0",
      summaryText: "照护者反馈近半年重复提问和日期定向问题增多。",
      clinicianConclusion:
        "AD-8 总分 4 分，提示认知改变可能，建议结合 MMSE/CDR 复核。",
      confidence: "0.82",
    },
  });

  assert.equal(submission.assessmentType, "AD-8");
  assert.equal(submission.scoreSummary.ad8Total, 4);
  assert.equal("mmse" in submission.scoreSummary, false);
  assert.equal(submission.rawInputSummary.source, "clinician_input");
  assert.equal(
    submission.rawInputSummary.interviewSource,
    "caregiver_interview",
  );
  assert.equal(submission.rawInputSummary.scaleVersion, "AD8-2005");
  assert.equal(submission.rawInputSummary.scoringRule, "yes=1,no=0,total=0-8");
  assert.equal(submission.rawInputSummary.informant.relation, "儿子");
});

test("isAd8AssessmentSubmissionFormComplete requires all eight AD-8 answers and review text", () => {
  const complete = {
    informantName: "李明",
    informantRelation: "儿子",
    assessmentSource: "caregiver_interview",
    itemMemoryProblems: "1",
    itemReducedInterest: "0",
    itemRepeatsQuestions: "1",
    itemTroubleLearningTools: "0",
    itemForgetsMonthYear: "1",
    itemHandlesFinancesPoorly: "0",
    itemTroubleAppointments: "1",
    itemDailyThinkingMemoryProblems: "0",
    summaryText: "照护者反馈近半年重复提问和日期定向问题增多。",
    clinicianConclusion: "AD-8 总分 4 分，提示认知改变可能。",
    confidence: "0.82",
  };

  assert.equal(isAd8AssessmentSubmissionFormComplete(complete), true);
  assert.equal(
    isAd8AssessmentSubmissionFormComplete({
      ...complete,
      itemTroubleAppointments: "",
    }),
    false,
  );
  assert.equal(
    isAd8AssessmentSubmissionFormComplete({
      ...complete,
      itemTroubleAppointments: "2",
    }),
    false,
  );
  assert.equal(
    isAd8AssessmentSubmissionFormComplete({
      ...complete,
      confidence: "1.2",
    }),
    false,
  );
});

test("updateAd8AssessmentFormField updates only the selected AD-8 field", () => {
  const incomplete = {
    informantName: "李明",
    informantRelation: "儿子",
    assessmentSource: "caregiver_interview",
    itemMemoryProblems: "1",
    itemReducedInterest: "",
    itemRepeatsQuestions: "1",
    itemTroubleLearningTools: "0",
    itemForgetsMonthYear: "1",
    itemHandlesFinancesPoorly: "0",
    itemTroubleAppointments: "1",
    itemDailyThinkingMemoryProblems: "0",
    summaryText: "照护者反馈近半年重复提问和日期定向问题增多。",
    clinicianConclusion: "AD-8 总分需医生复核。",
    confidence: "0.82",
  };

  const updated = updateAd8AssessmentFormField(
    incomplete,
    "clinicianConclusion",
    "AD-8 总分需医生复核，暂不自动补全缺失题项。",
  );

  assert.equal(
    updated.clinicianConclusion,
    "AD-8 总分需医生复核，暂不自动补全缺失题项。",
  );
  assert.equal(updated.itemReducedInterest, "");
  assert.equal(isAd8AssessmentSubmissionFormComplete(updated), false);
});

function validTranscriptResponse(
  overrides: Partial<AssessmentSpeechTranscriptResponse> = {},
): AssessmentSpeechTranscriptResponse {
  return {
    patientId: "patient-profile-id",
    assessmentType: "MMSE/CDR",
    status: "transcribed",
    physicalConditions: ["no_known_limitations"],
    transcript: "患者完成语音问答。",
    speechEvidence: {
      provider: "xiaomi-mimo-audio-understanding",
      modelVersion: "mimo-v2.5",
      callId: "mimo-audio-call-001",
      endpointRef: "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
      source: "provider_audio_understanding",
      calledAt: "2026-05-27T09:58:45.000Z",
      audio: {
        mimeType: "audio/webm",
        durationSeconds: 42,
      },
    },
    ...overrides,
  };
}

function assertSpeechAiEvidence(evidence: unknown): asserts evidence is {
  ai: Record<string, unknown>;
  speech: AssessmentSpeechTranscriptResponse["speechEvidence"];
  humanReview: {
    required: boolean;
    reviewerUserId: string;
    reviewedAt: string;
    conclusion: string;
  };
} {
  assert.ok(evidence && typeof evidence === "object");
  assert.ok("ai" in evidence);
  assert.ok("speech" in evidence);
  assert.ok("humanReview" in evidence);
}
