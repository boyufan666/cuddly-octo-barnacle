import assert from "node:assert/strict";
import test from "node:test";
import type {
  AssessmentRecord,
  CollectionBatch,
  CollectionProtocol,
  GameContent,
  PatientProfile,
  RehabPlan,
  RiskGrade,
} from "@/types/api";
import { buildDoctorWorkbenchModel } from "./doctor-workbench-model.ts";

const emptyCollectionBatchForm = {
  planItemId: "",
  protocolId: "",
  operatorNotes: "",
};

function createPatientProfile(
  assessment: AssessmentRecord,
  patientRiskGrades: RiskGrade[],
): PatientProfile {
  return {
    id: "patient-profile-id",
    userId: "patient-user-id",
    responsibleDoctorId: "doctor-profile-id",
    name: "李秀兰",
    gender: "女",
    age: 72,
    healthMetrics: {},
    riskGrades: patientRiskGrades,
    rehabPlans: [],
    trainingSessions: [],
    assessments: [assessment],
    consents: [],
    caregiverRelations: [],
  };
}

test("doctor workbench binds assessment review to the selected assessment risk", () => {
  const assessmentRisk: RiskGrade = {
    id: "assessment-risk-id",
    riskLevel: "moderate",
    systemRiskLevel: "moderate",
    manualRiskLevel: null,
    reasonSummary: "本次评估对应的中风险证据。",
    isCurrent: true,
    confirmedById: null,
    confirmedAt: null,
  };
  const unrelatedPatientRisk: RiskGrade = {
    id: "patient-current-risk-id",
    riskLevel: "high",
    systemRiskLevel: "high",
    manualRiskLevel: null,
    reasonSummary: "患者历史风险，不属于当前评估。",
    isCurrent: true,
    confirmedById: null,
    confirmedAt: null,
  };

  const model = buildDoctorWorkbenchModel({
    patient: createPatientProfile(
      {
        id: "assessment-id",
        assessmentType: "MMSE/CDR",
        status: "completed",
        scoreSummary: { mmse: 22, cdr: 1 },
        rawInputSummary: {},
        createdAt: "2026-06-10T08:00:00.000Z",
        riskGrades: [assessmentRisk],
      },
      [unrelatedPatientRisk],
    ),
    collectionBatchForm: emptyCollectionBatchForm,
    collectionBatches: [],
    collectionProtocols: [],
  });

  assert.equal(model.currentRisk?.id, "assessment-risk-id");
  assert.equal(model.assessmentReview.isApproveDisabled, false);
});

test("doctor workbench keeps return action available when risk evidence is missing", () => {
  const model = buildDoctorWorkbenchModel({
    patient: createPatientProfile(
      {
        id: "assessment-id",
        assessmentType: "MMSE/CDR",
        status: "completed",
        scoreSummary: { mmse: 22, cdr: 1 },
        rawInputSummary: {},
        createdAt: "2026-06-10T08:00:00.000Z",
        riskGrades: [],
      },
      [],
    ),
    collectionBatchForm: emptyCollectionBatchForm,
    collectionBatches: [],
    collectionProtocols: [],
  });

  assert.equal(model.assessmentReview.isApproveDisabled, true);
  assert.equal(model.assessmentReview.isReturnDisabled, false);
});

test("doctor plan recommendation requires a doctor-confirmed formal assessment", () => {
  const confirmedRisk = createConfirmedRisk("assessment-risk-id");
  const model = buildDoctorWorkbenchModel({
    patient: createPatientProfile(
      {
        id: "assessment-id",
        assessmentType: "MMSE/CDR",
        status: "completed",
        scoreSummary: { mmse: 22, cdr: 1 },
        rawInputSummary: {},
        createdAt: "2026-06-10T08:00:00.000Z",
        riskGrades: [confirmedRisk],
      },
      [confirmedRisk],
    ),
    collectionBatchForm: emptyCollectionBatchForm,
    collectionBatches: [],
    collectionProtocols: [],
  });

  assert.equal(model.planRecommendation.canRecommend, false);
  assert.equal(model.planRecommendation.assessmentConfirmed, false);
  assert.match(model.planRecommendation.blockers.join(" "), /正式评估/);
});

test("doctor plan recommendation requires the current risk linked to the formal assessment", () => {
  const unrelatedConfirmedRisk = createConfirmedRisk("patient-risk-id");
  const model = buildDoctorWorkbenchModel({
    patient: createPatientProfile(
      {
        id: "assessment-id",
        assessmentType: "MMSE/CDR",
        status: "doctor_confirmed",
        scoreSummary: { mmse: 22, cdr: 1 },
        rawInputSummary: {},
        createdAt: "2026-06-10T08:00:00.000Z",
        riskGrades: [],
      },
      [unrelatedConfirmedRisk],
    ),
    collectionBatchForm: emptyCollectionBatchForm,
    collectionBatches: [],
    collectionProtocols: [],
  });

  assert.equal(model.currentRisk, undefined);
  assert.equal(model.planRecommendation.canRecommend, false);
  assert.match(model.planRecommendation.blockers.join(" "), /当前风险评级/);
});

test("doctor plan recommendation opens only after formal assessment and risk confirmation", () => {
  const confirmedRisk = createConfirmedRisk("assessment-risk-id");
  const model = buildDoctorWorkbenchModel({
    patient: createPatientProfile(
      {
        id: "assessment-id",
        assessmentType: "MMSE/CDR",
        status: "doctor_confirmed",
        scoreSummary: { mmse: 22, cdr: 1 },
        rawInputSummary: {},
        createdAt: "2026-06-10T08:00:00.000Z",
        riskGrades: [confirmedRisk],
      },
      [confirmedRisk],
    ),
    collectionBatchForm: emptyCollectionBatchForm,
    collectionBatches: [],
    collectionProtocols: [],
  });

  assert.equal(model.planRecommendation.canRecommend, true);
  assert.equal(model.planRecommendation.assessmentConfirmed, true);
  assert.equal(model.planRecommendation.riskConfirmed, true);
  assert.deepEqual(model.planRecommendation.blockers, []);
});

test("doctor plan editor never falls back to the active plan", () => {
  const confirmedRisk = createConfirmedRisk("assessment-risk-id");
  const patient = createPatientProfile(
    {
      id: "assessment-id",
      assessmentType: "MMSE/CDR",
      status: "doctor_confirmed",
      scoreSummary: { mmse: 22, cdr: 1 },
      rawInputSummary: {},
      createdAt: "2026-06-10T08:00:00.000Z",
      riskGrades: [confirmedRisk],
    },
    [confirmedRisk],
  );
  patient.rehabPlans = [createPlan("active-plan-id", [])];

  const model = buildDoctorWorkbenchModel({
    patient,
    collectionBatchForm: emptyCollectionBatchForm,
    collectionBatches: [],
    collectionProtocols: [],
  });

  assert.equal(model.currentPlan, undefined);
  assert.equal(model.confirmedPlan?.id, "active-plan-id");
  assert.equal(model.planEditorForm.dailyDuration, "");
});

test("existing pending plan is shown for adjustment and blocks duplicate recommendation", () => {
  const confirmedRisk = createConfirmedRisk("assessment-risk-id");
  const patient = createPatientProfile(
    {
      id: "assessment-id",
      assessmentType: "MMSE/CDR",
      status: "doctor_confirmed",
      scoreSummary: { mmse: 22, cdr: 1 },
      rawInputSummary: {},
      createdAt: "2026-06-10T08:00:00.000Z",
      riskGrades: [confirmedRisk],
    },
    [confirmedRisk],
  );
  const pendingPlan = createPlan("pending-plan-id", []);
  pendingPlan.status = "pending_confirm";
  pendingPlan.isCurrent = false;
  patient.rehabPlans = [pendingPlan];

  const model = buildDoctorWorkbenchModel({
    patient,
    collectionBatchForm: emptyCollectionBatchForm,
    collectionBatches: [],
    collectionProtocols: [],
  });

  assert.equal(model.currentPlan?.id, "pending-plan-id");
  assert.equal(model.planRecommendation.canRecommend, false);
  assert.match(model.planRecommendation.blockers.join(" "), /待确认推荐方案/);
});

test("doctor preparation reload opens the plan item with an existing ready batch", () => {
  const firstGame = createGameContent("game-first", "运动任务", "browser_pose_canvas");
  const preparedGame = createGameContent("game-prepared", "记忆路径", "cognitive_web");
  const patient = createPatientProfile(
    {
      id: "assessment-id",
      assessmentType: "MMSE/CDR",
      scoreSummary: { mmse: 22, cdr: 1 },
      rawInputSummary: {},
      createdAt: "2026-06-10T08:00:00.000Z",
      riskGrades: [],
    },
    [],
  );
  patient.rehabPlans = [
    createPlan("plan-id", [
      {
        id: "plan-item-first",
        rehabPlanId: "plan-id",
        gameContentId: firstGame.id,
        sequence: 1,
        durationMinutes: 10,
        frequencyPerWeek: 3,
        difficulty: "basic",
        gameContent: firstGame,
      },
      {
        id: "plan-item-prepared",
        rehabPlanId: "plan-id",
        gameContentId: preparedGame.id,
        sequence: 2,
        durationMinutes: 12,
        frequencyPerWeek: 3,
        difficulty: "basic",
        gameContent: preparedGame,
      },
    ]),
  ];

  const protocol = createProtocol("protocol-prepared", preparedGame);
  const model = buildDoctorWorkbenchModel({
    patient,
    collectionBatchForm: emptyCollectionBatchForm,
    collectionBatches: [
      createReadyBatch({
        protocol,
        planItemId: "plan-item-prepared",
        gameContentId: preparedGame.id,
      }),
    ],
    collectionProtocols: [protocol],
  });

  assert.equal(
    model.collectionPreparation.selectedPlanItem?.id,
    "plan-item-prepared",
  );
  assert.equal(model.collectionPreparation.readyBatch?.id, "ready-batch");
});

test("doctor preparation only treats the selected protocol batch as already prepared", () => {
  const game = createGameContent("rhythm-reach", "节奏触达 3D", "unity_webgl");
  const patient = createPatientProfile(
    {
      id: "assessment-id",
      assessmentType: "MMSE/CDR",
      scoreSummary: { mmse: 22, cdr: 1 },
      rawInputSummary: {},
      createdAt: "2026-06-10T08:00:00.000Z",
      riskGrades: [],
    },
    [],
  );
  patient.rehabPlans = [
    createPlan("plan-id", [
      {
        id: "plan-item-rhythm-reach",
        rehabPlanId: "plan-id",
        gameContentId: game.id,
        sequence: 1,
        durationMinutes: 6,
        frequencyPerWeek: 3,
        difficulty: "basic",
        gameContent: game,
      },
    ]),
  ];
  const previousProtocol = createProtocol("protocol-1-0-0", game, "1.0.0");
  const currentProtocol = createProtocol("protocol-1-1-0", game, "1.1.0");

  const model = buildDoctorWorkbenchModel({
    patient,
    collectionBatchForm: {
      planItemId: "plan-item-rhythm-reach",
      protocolId: currentProtocol.id,
      operatorNotes: "",
    },
    collectionBatches: [
      createReadyBatch({
        protocol: previousProtocol,
        planItemId: "plan-item-rhythm-reach",
        gameContentId: game.id,
      }),
    ],
    collectionProtocols: [previousProtocol, currentProtocol],
  });

  assert.equal(model.collectionPreparation.readyBatch, undefined);
});

function createGameContent(
  id: string,
  name: string,
  runtimeType: GameContent["runtimeType"],
): GameContent {
  return {
    id,
    code: id,
    name,
    trainingTargets: [],
    tags: [],
    defaultDuration: 10,
    defaultDifficulty: "basic",
    runtimeType,
    bridgeProtocolVersion: "1.0.0",
    buildStatus: "released",
    releaseChannel: "production",
    supportsCamera: runtimeType === "browser_pose_canvas",
    supportsMicrophone: false,
    supportedInputModes: ["keyboard"],
    requiredMetrics: [{ metricType: "completionRate", unit: "ratio" }],
    status: "active",
  };
}

function createConfirmedRisk(id: string): RiskGrade {
  return {
    id,
    riskLevel: "moderate",
    systemRiskLevel: "moderate",
    manualRiskLevel: "moderate",
    reasonSummary: "量表与临床观察支持当前风险结论。",
    isCurrent: true,
    confirmedById: "doctor-user-id",
    confirmedAt: "2026-06-10T09:00:00.000Z",
  };
}

function createPlan(id: string, items: RehabPlan["items"]): RehabPlan {
  return {
    id,
    patientId: "patient-profile-id",
    planName: "当前正式方案",
    status: "active",
    isCurrent: true,
    weekFrequency: 3,
    dailyDuration: 20,
    recommendationReason: "正式训练计划",
    items,
  };
}

function createProtocol(
  id: string,
  game: GameContent,
  version = "1.0.0",
): CollectionProtocol {
  return {
    id,
    conditionId: "condition-id",
    gameContentId: game.id,
    code: id,
    name: "正式准备规则",
    version,
    runtimeType: game.runtimeType,
    requiredConsentTypes: ["privacy_policy"],
    requiredInputModes: ["keyboard"],
    requiredMetrics: game.requiredMetrics,
    conditionRules: {},
    samplingConfig: {},
    qualityGate: {},
    status: "active",
    createdAt: "2026-06-10T08:00:00.000Z",
    updatedAt: "2026-06-10T08:00:00.000Z",
  };
}

function createReadyBatch({
  protocol,
  planItemId,
  gameContentId,
}: {
  protocol: CollectionProtocol;
  planItemId: string;
  gameContentId: string;
}): CollectionBatch {
  return {
    id: "ready-batch",
    patientId: "patient-profile-id",
    rehabPlanId: "plan-id",
    planItemId,
    gameContentId,
    protocolId: protocol.id,
    conditionId: protocol.conditionId,
    protocolVersion: protocol.version,
    status: "ready",
    conditionSnapshot: { id: "condition-id", code: "condition", name: "准备条件" },
    protocolSnapshot: { id: protocol.id, code: protocol.code, name: protocol.name },
    createdAt: "2026-06-10T08:00:00.000Z",
    updatedAt: "2026-06-10T08:00:00.000Z",
    protocol,
  };
}
