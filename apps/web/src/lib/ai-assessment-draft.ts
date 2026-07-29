import type {
  AiAssessmentDraftResponse,
  AssessmentSpeechTranscriptResponse,
} from "@/types/api";
import { applyAssessmentSpeechTranscriptToForm } from "./assessment-speech-transcript.ts";

export type AssessmentDraftFormState = {
  mmse: string;
  cdr: string;
  memory: string;
  orientation: string;
  executive: string;
  language: string;
  transcript: string;
  reactionDelaySeconds: string;
  modelVersion: string;
  confidence: string;
  analysisSummary: string;
  aiDraftEvidence?: Record<string, unknown>;
  speechEvidence?: AssessmentSpeechTranscriptResponse["speechEvidence"];
};

export type Ad8AssessmentFormState = {
  informantName: string;
  informantRelation: string;
  assessmentSource: string;
  itemMemoryProblems: string;
  itemReducedInterest: string;
  itemRepeatsQuestions: string;
  itemTroubleLearningTools: string;
  itemForgetsMonthYear: string;
  itemHandlesFinancesPoorly: string;
  itemTroubleAppointments: string;
  itemDailyThinkingMemoryProblems: string;
  summaryText: string;
  clinicianConclusion: string;
  confidence: string;
};

const scoreFields = [
  "mmse",
  "cdr",
  "memory",
  "orientation",
  "executive",
  "language",
] as const;

export const ad8ItemFields = [
  "itemMemoryProblems",
  "itemReducedInterest",
  "itemRepeatsQuestions",
  "itemTroubleLearningTools",
  "itemForgetsMonthYear",
  "itemHandlesFinancesPoorly",
  "itemTroubleAppointments",
  "itemDailyThinkingMemoryProblems",
] as const;

const requiredSubmissionFields = [
  ...scoreFields,
  "transcript",
  "reactionDelaySeconds",
  "modelVersion",
  "confidence",
  "analysisSummary",
] as const;

export type AssessmentDraftFormField = Exclude<
  keyof AssessmentDraftFormState,
  "aiDraftEvidence" | "speechEvidence"
>;

export type Ad8AssessmentFormField = keyof Ad8AssessmentFormState;

export type StagedAiAssessmentDraft = Readonly<{
  patientId: string;
  assessmentType: string;
  transcript: string;
  draft: AiAssessmentDraftResponse;
}>;

export function createStagedAiAssessmentDraft({
  patientId,
  assessmentType,
  transcript,
  draft,
}: StagedAiAssessmentDraft): StagedAiAssessmentDraft {
  return {
    patientId,
    assessmentType,
    transcript: transcript.trim(),
    draft,
  };
}

export function isStagedAiAssessmentDraftForRequest(
  staged: StagedAiAssessmentDraft | null,
  request: Pick<
    StagedAiAssessmentDraft,
    "patientId" | "assessmentType" | "transcript"
  >,
) {
  return (
    staged !== null &&
    staged.patientId === request.patientId &&
    staged.assessmentType === request.assessmentType &&
    staged.transcript === request.transcript.trim()
  );
}

export function applyAiAssessmentDraftToForm(
  current: AssessmentDraftFormState,
  draft: AiAssessmentDraftResponse,
): AssessmentDraftFormState {
  const next = { ...current };

  for (const field of scoreFields) {
    const value = draft.scoreSummary[field];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("AI 评估草稿缺少完整结构化评分，不能回填表单。");
    }
    next[field] = String(value);
  }

  next.transcript = readRequiredText(
    draft.rawInputSummary.transcript,
    "AI 评估草稿缺少问答转写，不能回填表单。",
  );
  next.analysisSummary = readRequiredText(
    draft.rawInputSummary.analysisSummary,
    "AI 评估草稿缺少分析摘要，不能回填表单。",
  );
  next.modelVersion = readRequiredText(
    draft.rawInputSummary.modelVersion,
    "AI 评估草稿缺少模型版本，不能回填表单。",
  );
  const confidence = draft.rawInputSummary.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    throw new Error("AI 评估草稿缺少置信度，不能回填表单。");
  }
  next.confidence = String(confidence);
  next.aiDraftEvidence = draft.rawInputSummary.evidence;

  return next;
}

export function applySpeechAiAssessmentDraftToForm(
  current: AssessmentDraftFormState,
  transcript: AssessmentSpeechTranscriptResponse,
  draft: AiAssessmentDraftResponse,
): AssessmentDraftFormState {
  return applyAiAssessmentDraftToForm(
    applyAssessmentSpeechTranscriptToForm(current, transcript),
    draft,
  );
}

export function buildAssessmentSubmission({
  patientId,
  reviewerUserId,
  reviewedAt,
  form,
}: {
  patientId: string;
  reviewerUserId: string;
  reviewedAt: string;
  form: AssessmentDraftFormState;
}) {
  const scoreSummary = {
    mmse: parseRequiredNumber(form.mmse, "MMSE"),
    cdr: parseRequiredNumber(form.cdr, "CDR"),
    memory: parseRequiredNumber(form.memory, "记忆力"),
    orientation: parseRequiredNumber(form.orientation, "定向力"),
    executive: parseRequiredNumber(form.executive, "执行力"),
    language: parseRequiredNumber(form.language, "语言表达"),
  };
  const transcript = readRequiredText(
    form.transcript,
    "请填写问答转写/评估摘要。",
  );
  const analysisSummary = readRequiredText(
    form.analysisSummary,
    "请填写评估分析摘要。",
  );
  const modelVersion = readRequiredText(
    form.modelVersion,
    "请填写来源/模型版本。",
  );
  const confidence = parseRequiredNumber(form.confidence, "分析置信度");
  const reactionDelaySeconds = parseRequiredNumber(
    form.reactionDelaySeconds,
    "反应延迟",
  );

  return {
    patientId,
    assessmentType: "MMSE/CDR",
    scoreSummary,
    rawInputSummary: {
      source: resolveAssessmentSubmissionSource(form),
      transcript,
      analysisSummary,
      modelVersion,
      confidence,
      reactionDelaySeconds,
      capturedAt: new Date().toISOString(),
      ...(form.aiDraftEvidence
        ? {
            evidence: buildAssessmentEvidence(
              form.aiDraftEvidence,
              form.speechEvidence,
              reviewerUserId,
              reviewedAt,
            ),
          }
        : {}),
    },
  };
}

export function buildAd8AssessmentSubmission({
  patientId,
  form,
}: {
  patientId: string;
  form: Ad8AssessmentFormState;
}) {
  const itemScores = Object.fromEntries(
    ad8ItemFields.map((field) => [
      field,
      parseAd8ItemScore(form[field], field),
    ]),
  ) as Record<(typeof ad8ItemFields)[number], number>;
  const ad8Total = Object.values(itemScores).reduce(
    (sum, value) => sum + value,
    0,
  );
  const confidence = parseRequiredNumber(form.confidence, "分析置信度");
  const interviewSource = readRequiredText(
    form.assessmentSource,
    "请填写 AD-8 评估来源。",
  );

  return {
    patientId,
    assessmentType: "AD-8",
    scoreSummary: {
      ad8Total,
      ...itemScores,
    },
    rawInputSummary: {
      source: "clinician_input",
      interviewSource,
      transcript: readRequiredText(form.summaryText, "请填写 AD-8 访谈摘要。"),
      analysisSummary: readRequiredText(
        form.clinicianConclusion,
        "请填写 AD-8 医生结论。",
      ),
      modelVersion: "ad8-clinician-structured-v1",
      confidence,
      informant: {
        name: readRequiredText(form.informantName, "请填写 AD-8 信息提供者。"),
        relation: readRequiredText(
          form.informantRelation,
          "请填写 AD-8 信息提供者关系。",
        ),
      },
      scaleVersion: "AD8-2005",
      scoringRule: "yes=1,no=0,total=0-8",
      capturedAt: new Date().toISOString(),
    },
  };
}

export function updateAssessmentDraftFormField(
  current: AssessmentDraftFormState,
  field: AssessmentDraftFormField,
  value: string,
): AssessmentDraftFormState {
  return {
    ...current,
    [field]: value,
    aiDraftEvidence: undefined,
    speechEvidence: undefined,
  };
}

export function updateAd8AssessmentFormField(
  current: Ad8AssessmentFormState,
  field: Ad8AssessmentFormField,
  value: string,
): Ad8AssessmentFormState {
  return {
    ...current,
    [field]: value,
  };
}

export function isAssessmentSubmissionFormComplete(
  form: AssessmentDraftFormState,
) {
  return requiredSubmissionFields.every(
    (field) => form[field].trim().length > 0,
  );
}

export function isAd8AssessmentSubmissionFormComplete(
  form: Ad8AssessmentFormState,
) {
  const confidence = Number(form.confidence);
  return (
    Boolean(
      form.informantName.trim() &&
      form.informantRelation.trim() &&
      form.assessmentSource.trim() &&
      form.summaryText.trim() &&
      form.clinicianConclusion.trim() &&
      form.confidence.trim(),
    ) &&
    Number.isFinite(confidence) &&
    confidence >= 0 &&
    confidence <= 1 &&
    ad8ItemFields.every((field) => form[field] === "0" || form[field] === "1")
  );
}

function resolveAssessmentSubmissionSource(form: AssessmentDraftFormState) {
  if (form.aiDraftEvidence && form.speechEvidence) {
    return "speech_ai_assessment";
  }
  if (form.aiDraftEvidence) {
    return "production_ai_assessment";
  }
  return "clinician_input";
}

function buildAssessmentEvidence(
  evidence: Record<string, unknown>,
  speechEvidence:
    | AssessmentSpeechTranscriptResponse["speechEvidence"]
    | undefined,
  reviewerUserId: string,
  reviewedAt: string,
) {
  const approvedAiEvidence = readApprovedAiEvidence(
    evidence,
    reviewerUserId,
    reviewedAt,
  );
  if (!speechEvidence) {
    return approvedAiEvidence;
  }

  return {
    ai: evidence,
    speech: speechEvidence,
    humanReview: {
      required: true,
      reviewerUserId,
      reviewedAt,
      conclusion: "approved",
    },
  };
}

function readApprovedAiEvidence(
  evidence: Record<string, unknown>,
  reviewerUserId: string,
  reviewedAt: string,
) {
  const requiredFields = [
    "provider",
    "model",
    "modelVersion",
    "callId",
    "endpointRef",
    "promptVersion",
    "calledAt",
  ] as const;
  for (const field of requiredFields) {
    readRequiredText(evidence[field], "AI 草稿缺少供应商调用证据。");
  }

  return {
    ...evidence,
    humanReview: {
      required: true,
      reviewerUserId,
      reviewedAt,
      conclusion: "approved",
    },
  };
}

function parseRequiredNumber(value: string, label: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${label}必须是有效数字。`);
  }
  return numberValue;
}

function parseAd8ItemScore(value: string, field: string) {
  const numberValue = parseRequiredNumber(value, field);
  if (numberValue !== 0 && numberValue !== 1) {
    throw new Error("AD-8 题项只能填写 0 或 1。");
  }
  return numberValue;
}

function readRequiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }
  return value.trim();
}
