import { randomUUID } from "node:crypto";

export async function createProductionAiAssessmentInput({
  apiPost,
  context,
  patientId,
  assessmentType,
  physicalConditions,
  transcript,
}) {
  const draft = await apiPost(
    context,
    "/ai/assessment-drafts",
    {
      patientId,
      assessmentType,
      physicalConditions,
      transcript,
      idempotencyKey: `playwright-assessment-${randomUUID()}`,
    },
    201,
  );

  const rawInputSummary = draft?.rawInputSummary;
  const providerEvidence = rawInputSummary?.evidence;
  if (
    !draft ||
    typeof draft !== "object" ||
    !draft.scoreSummary ||
    typeof rawInputSummary !== "object" ||
    rawInputSummary === null ||
    Array.isArray(rawInputSummary) ||
    typeof providerEvidence !== "object" ||
    providerEvidence === null ||
    Array.isArray(providerEvidence) ||
    typeof providerEvidence.humanReview !== "object" ||
    providerEvidence.humanReview === null ||
    Array.isArray(providerEvidence.humanReview)
  ) {
    throw new Error(
      "AI 评估草稿缺少可用于正式评估保存的供应商证据。",
    );
  }

  return {
    scoreSummary: draft.scoreSummary,
    physicalConditions,
    rawInputSummary: {
      ...rawInputSummary,
      evidence: {
        ...providerEvidence,
        humanReview: {
          ...providerEvidence.humanReview,
          required: true,
          status: "pending_human_review",
          conclusion: "approved",
        },
      },
    },
  };
}
