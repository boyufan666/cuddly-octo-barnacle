import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PatientProfile, RiskGrade } from "@/types/api";
import { PatientClinicalSummary } from "./PatientClinicalSummary.tsx";

test("patient clinical summary does not confirm assessment with patient-level stale risk", () => {
  const stalePatientRisk: RiskGrade = {
    id: "stale-patient-risk-id",
    riskLevel: "high",
    systemRiskLevel: "high",
    manualRiskLevel: null,
    reasonSummary: "历史患者风险，不属于当前评估。",
    isCurrent: true,
    confirmedById: null,
    confirmedAt: null,
  };
  const patient: PatientProfile = {
    id: "patient-profile-id",
    userId: "patient-user-id",
    responsibleDoctorId: "doctor-profile-id",
    name: "李秀兰",
    gender: "女",
    age: 72,
    healthMetrics: {},
    riskGrades: [stalePatientRisk],
    rehabPlans: [],
    trainingSessions: [],
    assessments: [
      {
        id: "assessment-id",
        assessmentType: "MMSE/CDR",
        scoreSummary: { mmse: 22, cdr: 1 },
        rawInputSummary: {},
        createdAt: "2026-06-10T08:00:00.000Z",
        riskGrades: [],
      },
    ],
    consents: [],
    caregiverRelations: [],
  };

  const html = renderToStaticMarkup(
    <PatientClinicalSummary patient={patient} onConfirmRisk={() => undefined} />,
  );

  assert.match(html, /待补充证据/);
  assert.doesNotMatch(html, /历史患者风险/);
  assert.match(html, /disabled=""/);
});
