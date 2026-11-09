import assert from "node:assert/strict";
import test from "node:test";
import {
  canRecommendRehabPlan,
  canUsePatientAiAssessment,
  doctorWorkspaceFromNavId,
  resolveAiAssessmentRoute,
  resolveRoleWorkspaceAiAssessmentRoute,
} from "./role-workspace-model";

test("AI assessment and plan recommendation stay on separate role boundaries", () => {
  assert.equal(canUsePatientAiAssessment("patient"), true);
  assert.equal(canUsePatientAiAssessment("caregiver"), false);
  assert.equal(canUsePatientAiAssessment("doctor"), false);

  assert.equal(canRecommendRehabPlan("doctor"), true);
  assert.equal(canRecommendRehabPlan("patient"), false);
  assert.equal(canRecommendRehabPlan("caregiver"), false);
});

test("AI assessment route uses explicit assessment type or severity", () => {
  assert.equal(resolveAiAssessmentRoute({ assessmentType: "AD8" }), "AD-8");
  assert.equal(
    resolveAiAssessmentRoute({ assessmentType: "MMSE" }),
    "MMSE/CDR",
  );
  assert.equal(resolveAiAssessmentRoute({ riskLevel: "high" }), "AD-8");
  assert.equal(
    resolveAiAssessmentRoute({ riskLevel: "moderate" }),
    "MMSE/CDR",
  );
  assert.throws(
    () => resolveAiAssessmentRoute({}),
    /没有明确的 assessmentType 或风险等级/,
  );
  assert.throws(
    () => resolveAiAssessmentRoute({ assessmentType: "unknown" }),
    /必须明确为 MMSE\/CDR 或 AD-8/,
  );
});

test("first-time patient starts the explicit MMSE/CDR AI screening route", () => {
  assert.equal(
    resolveRoleWorkspaceAiAssessmentRoute({
      assessments: [],
      patientRiskGrades: [],
    }),
    "MMSE/CDR",
  );
});

test("role workspace sends high risk to AD-8 and low or moderate risk to MMSE/CDR", () => {
  assert.equal(
    resolveRoleWorkspaceAiAssessmentRoute({
      formAssessmentType: "MMSE/CDR",
      formRiskLevel: "high",
    }),
    "AD-8",
  );
  assert.equal(
    resolveRoleWorkspaceAiAssessmentRoute({
      assessments: [
        {
          id: "assessment-1",
          assessmentType: "MMSE/CDR",
          scoreSummary: {},
          rawInputSummary: {},
          createdAt: "2026-08-15T00:00:00.000Z",
          riskGrades: [
            {
              id: "risk-1",
              riskLevel: "moderate",
              systemRiskLevel: "moderate",
              reasonSummary: "中度风险",
              isCurrent: true,
            },
          ],
        },
      ],
    }),
    "MMSE/CDR",
  );
  assert.equal(resolveRoleWorkspaceAiAssessmentRoute({}), "MMSE/CDR");
});

test("routes the doctor registration navigation item to its review workspace", () => {
  assert.equal(
    doctorWorkspaceFromNavId("registrationReview", "doctor"),
    "registration",
  );
});
