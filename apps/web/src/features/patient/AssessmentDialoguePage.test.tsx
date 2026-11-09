import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AssessmentRecord } from "@/types/api";
import {
  assessmentPhysicalConditionChoices,
  AssessmentScreen,
  emptyAiConversationForm,
  emptyAssessmentForm,
  toggleAssessmentPhysicalCondition,
  type AssessmentFormState,
} from "./AssessmentDialoguePage";

const asyncAction = async () => undefined;

function renderAssessmentScreen(
  canUseAiAssessment: boolean,
  formOverrides: Partial<AssessmentFormState> = {},
  assessments: AssessmentRecord[] = [],
) {
  return renderToStaticMarkup(
    <AssessmentScreen
      assessments={assessments}
      aiConversationForm={emptyAiConversationForm}
      aiConversations={[]}
      assessmentForm={{ ...emptyAssessmentForm, ...formOverrides }}
      canUseAiAssessment={canUseAiAssessment}
      hasMicrophoneConsent
      isAiConversationBusy={false}
      isDraftBusy={false}
      isSpeechAiDraftBusy={false}
      isSpeechBusy={false}
      isTtsBusy={false}
      onAiConversationFormChange={() => undefined}
      onAppendAiConversationMessage={asyncAction}
      onAssessmentFormChange={() => undefined}
      onAssessmentPhysicalConditionsChange={() => undefined}
      onCompleteAiConversation={asyncAction}
      onCreateAiAssessmentDraft={asyncAction}
      onCreateAssessmentSpeechTranscript={asyncAction}
      onCreateSpeechAiAssessmentDraft={asyncAction}
      onCreateTtsSpeechOutput={asyncAction}
      onStartAiConversation={asyncAction}
      showTechnicalEvidence={false}
    />,
  );
}

test("patient AI assessment exposes real AI inputs without formal clinical actions", () => {
  const markup = renderAssessmentScreen(true, {
    physicalConditions: ["no_known_limitations"],
  });

  assert.match(markup, /开始智能对话/);
  assert.match(markup, /开始语音评估录音/);
  assert.match(markup, /生成待复核评估建议/);
  assert.doesNotMatch(markup, /分析置信度|来源\/模型版本|评估来源/);
  assert.doesNotMatch(markup, /批准正式评估/);
  assert.doesNotMatch(markup, /保存 AD-8 正式筛查记录/);
  assert.doesNotMatch(markup, /生成待医师确认的个性化方案/);
});

test("physical conditions are controlled selectable options", () => {
  const unselectedMarkup = renderAssessmentScreen(true);
  const selectedMarkup = renderAssessmentScreen(true, {
    physicalConditions: ["wheelchair", "upper_limb_limited"],
  });

  assert.deepEqual(
    assessmentPhysicalConditionChoices.map((choice) => choice.id),
    ["no_known_limitations", "wheelchair", "upper_limb_limited"],
  );
  assert.match(unselectedMarkup, /必须选择/);
  assert.match(unselectedMarkup, /请先明确身体情况/);
  assert.match(
    unselectedMarkup,
    /<button[^>]*disabled=""[^>]*><span[^>]*>开始智能对话<\/span><\/button>/,
  );
  assert.equal((unselectedMarkup.match(/role="checkbox"/g) ?? []).length, 3);
  assert.equal(
    (unselectedMarkup.match(/aria-checked="false"/g) ?? []).length,
    3,
  );
  assert.doesNotMatch(
    unselectedMarkup,
    /<button[^>]*role="checkbox"[^>]*disabled=""/,
  );
  assert.equal((selectedMarkup.match(/aria-checked="true"/g) ?? []).length, 2);
  assert.deepEqual(
    toggleAssessmentPhysicalCondition([], "no_known_limitations"),
    ["no_known_limitations"],
  );
  assert.deepEqual(toggleAssessmentPhysicalCondition([], "wheelchair"), [
    "wheelchair",
  ]);
  assert.deepEqual(
    toggleAssessmentPhysicalCondition(
      ["no_known_limitations"],
      "upper_limb_limited",
    ),
    ["upper_limb_limited"],
  );
  assert.deepEqual(
    toggleAssessmentPhysicalCondition(["wheelchair"], "wheelchair"),
    ["wheelchair"],
  );
  assert.deepEqual(
    toggleAssessmentPhysicalCondition(
      ["wheelchair", "upper_limb_limited"],
      "wheelchair",
    ),
    ["upper_limb_limited"],
  );
  assert.deepEqual(
    toggleAssessmentPhysicalCondition(
      ["wheelchair", "upper_limb_limited"],
      "no_known_limitations",
    ),
    ["no_known_limitations"],
  );
});

test("AD-8 draft panel renders informant fields from the submitted assessment form", () => {
  const markup = renderAssessmentScreen(true, {
    assessmentType: "AD-8",
    physicalConditions: ["no_known_limitations"],
  });

  assert.match(markup, /AD-8 信息提供者姓名/);
  assert.match(markup, /AD-8 信息提供者关系/);
  assert.match(markup, /AD-8 评估来源/);
  assert.match(markup, /caregiver_interview/);
});

test("non-patient assessment view remains read-only", () => {
  const markup = renderAssessmentScreen(false);

  assert.match(markup, /等待医生完成评估/);
  assert.doesNotMatch(markup, /开始智能对话/);
  assert.doesNotMatch(markup, /开始语音评估录音/);
  assert.doesNotMatch(markup, /生成待复核评估建议/);
});

test("patient assessment summary uses only the current risk grade", () => {
  const markup = renderAssessmentScreen(false, {}, [
    {
      id: "assessment-id",
      assessmentType: "MMSE/CDR",
      status: "doctor_confirmed",
      scoreSummary: { mmse: 27, cdr: 0 },
      createdAt: "2026-08-15T08:00:00.000Z",
      riskGrades: [
        {
          id: "historical-risk-id",
          riskLevel: "high",
          systemRiskLevel: "high",
          reasonSummary: "历史风险，不应展示。",
          isCurrent: false,
        },
        {
          id: "current-risk-id",
          riskLevel: "low",
          systemRiskLevel: "low",
          reasonSummary: "当前风险。",
          isCurrent: true,
          confirmedAt: "2026-08-15T08:30:00.000Z",
        },
      ],
    },
  ]);

  assert.match(markup, /低风险/);
  assert.doesNotMatch(markup, /高风险/);
});

test("patient assessment summary trusts the formal assessment status", () => {
  const confirmedWithoutRiskConfirmation = renderAssessmentScreen(false, {}, [
    {
      id: "confirmed-assessment-id",
      assessmentType: "MMSE/CDR",
      status: "doctor_confirmed",
      scoreSummary: { mmse: 27, cdr: 0 },
      createdAt: "2026-08-15T08:00:00.000Z",
      riskGrades: [
        {
          id: "current-risk-id",
          riskLevel: "moderate",
          systemRiskLevel: "moderate",
          reasonSummary: "当前风险。",
          isCurrent: true,
        },
      ],
    },
  ]);
  const completedWithConfirmedRisk = renderAssessmentScreen(true, {}, [
    {
      id: "completed-assessment-id",
      assessmentType: "MMSE/CDR",
      status: "completed",
      scoreSummary: { mmse: 27, cdr: 0 },
      createdAt: "2026-08-15T08:00:00.000Z",
      riskGrades: [
        {
          id: "current-risk-id",
          riskLevel: "low",
          systemRiskLevel: "low",
          reasonSummary: "当前风险。",
          isCurrent: true,
          confirmedAt: "2026-08-15T08:30:00.000Z",
        },
      ],
    },
  ]);

  assert.match(confirmedWithoutRiskConfirmation, /医生已确认评估/);
  assert.match(completedWithConfirmedRisk, /待医生确认/);
  assert.doesNotMatch(completedWithConfirmedRisk, /已有正式评估/);
});
