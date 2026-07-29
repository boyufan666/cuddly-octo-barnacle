import assert from "node:assert/strict";
import test from "node:test";
import type { AssessmentRecord, RiskGrade } from "@/types/api";

process.env.NEXT_PUBLIC_API_BASE_URL = "http://unit.test";

test("buildDoctorAssessmentReviewPayload approves current risk with doctor-safe review note", async () => {
  const { buildDoctorAssessmentReviewPayload } = await import(
    "./doctor-workbench-actions.ts"
  );
  const assessment: AssessmentRecord = {
    id: "assessment-id",
    assessmentType: "MMSE/CDR",
    scoreSummary: {
      mmse: 22,
      cdr: 1,
      memory: 48,
      orientation: 58,
      executive: 52,
      language: 73,
    },
    rawInputSummary: {
      source: "clinician_input",
      transcript: "患者完成结构化评估。",
      analysisSummary: "存在中度认知风险。",
      modelVersion: "clinician-review-v1",
      confidence: 0.84,
    },
    createdAt: "2026-06-10T08:00:00.000Z",
  };
  const risk: RiskGrade = {
    id: "risk-grade-id",
    riskLevel: "moderate",
    systemRiskLevel: "moderate",
    manualRiskLevel: null,
    reasonSummary: "MMSE 22 分，CDR 1 分，提示中度风险。",
    isCurrent: true,
    confirmedById: null,
    confirmedAt: null,
  };

  assert.deepEqual(buildDoctorAssessmentReviewPayload(assessment, risk), {
    decision: "approved",
    manualRiskLevel: "moderate",
    reviewNote: "已结合量表、访谈摘要和训练风险建议确认当前风险结论。",
  });
});

test("buildDoctorAssessmentReviewPayload rejects missing current risk evidence", async () => {
  const { buildDoctorAssessmentReviewPayload } = await import(
    "./doctor-workbench-actions.ts"
  );
  const assessment = {
    id: "assessment-id",
    assessmentType: "MMSE/CDR",
    scoreSummary: {},
    rawInputSummary: {},
    createdAt: "2026-06-10T08:00:00.000Z",
  } satisfies AssessmentRecord;

  assert.throws(
    () =>
      buildDoctorAssessmentReviewPayload(assessment, {
        id: "risk-grade-id",
        riskLevel: "moderate",
        systemRiskLevel: "moderate",
        manualRiskLevel: null,
        reasonSummary: "",
        isCurrent: true,
      }),
    /风险证据/,
  );
});
