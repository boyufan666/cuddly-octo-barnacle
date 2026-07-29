import assert from "node:assert/strict";
import test from "node:test";
import type { GameContent, PatientProfile, RehabPlan } from "@/types/api";
import {
  buildPlanPrerequisiteState,
  summarizeTrainingContentReadiness,
} from "./plan-suggestion-model.ts";

const unityRequiredMetrics = [
  { metricType: "reaction_time_ms" },
  { metricType: "target_hit_rate" },
  { metricType: "arm_raise_accuracy" },
  { metricType: "duration_seconds" },
  { metricType: "difficulty_level" },
];

const baseGame: GameContent = {
  id: "game-1",
  code: "unity-reach",
  name: "节奏触达",
  trainingTargets: ["运动训练"],
  tags: ["运动训练", "干预训练"],
  defaultDuration: 8,
  defaultDifficulty: "基础",
  runtimeType: "unity_webgl",
  manifestUrl: "https://cdn.example.com/game/manifest.json",
  buildBaseUrl: "https://cdn.example.com/game/",
  gameVersion: "1.0.0",
  bridgeProtocolVersion: "1.0.0",
  buildStatus: "released",
  releaseChannel: "production",
  supportsCamera: true,
  supportsMicrophone: false,
  supportedInputModes: ["camera_pose"],
  requiredMetrics: unityRequiredMetrics,
  difficultyPolicy: { source: "formal" },
  dynamicDifficultyTriggers: ["accuracy_low"],
  requiredPermissions: ["camera_capture"],
  resultSchema: { source: "formal" },
  publishedStatus: "published",
  status: "active",
};

const basePlan: RehabPlan = {
  id: "plan-1",
  patientId: "patient-1",
  doctorId: "doctor-1",
  planName: "基础训练方案",
  status: "active",
  isCurrent: true,
  weekFrequency: 5,
  dailyDuration: 20,
  recommendationReason: "评估后建议",
  items: [
    {
      id: "item-1",
      rehabPlanId: "plan-1",
      gameContentId: baseGame.id,
      sequence: 1,
      durationMinutes: 8,
      frequencyPerWeek: 5,
      difficulty: "基础",
      gameContent: baseGame,
    },
  ],
};

const readyPatient: PatientProfile = {
  id: "patient-1",
  userId: "user-1",
  name: "王明",
  age: 72,
  gender: "male",
  consents: [consent("privacy_policy"), consent("ai_processing")],
  assessments: [],
  riskGrades: [
    {
      id: "risk-1",
      riskLevel: "moderate",
      systemRiskLevel: "moderate",
      reasonSummary: "需持续训练",
      isCurrent: true,
    },
  ],
  rehabPlans: [basePlan],
  healthMetrics: {},
  caregiverRelations: [],
  trainingSessions: [],
};

test("plan recommendation is blocked while a pending plan already awaits doctor confirmation", () => {
  const pendingPlan: RehabPlan = {
    ...basePlan,
    id: "plan-pending",
    status: "pending_confirm",
    isCurrent: false,
  };
  const readiness = buildPlanPrerequisiteState(readyPatient, pendingPlan);

  assert.equal(readiness.canRecommend, false);
  assert.deepEqual(readiness.blockers, [["方案状态", "已有待确认方案"]]);
});

test("training readiness rejects released Unity content without a formal manifest", () => {
  const plan = planWithGame({
    ...baseGame,
    manifestUrl: "",
  });

  const readiness = summarizeTrainingContentReadiness(plan);

  assert.equal(readiness.tone, "warning");
  assert.equal(readiness.label, "1 项待完善");
});

test("training readiness rejects Unity content that backend formal start would reject", () => {
  for (const game of [
    { ...baseGame, releaseChannel: "staging" as const },
    {
      ...baseGame,
      requiredMetrics: unityRequiredMetrics.filter(
        (metric) => metric.metricType !== "duration_seconds",
      ),
    },
    { ...baseGame, difficultyPolicy: undefined },
    { ...baseGame, resultSchema: undefined },
    { ...baseGame, requiredPermissions: [] },
    { ...baseGame, publishedStatus: "draft" as const },
  ]) {
    const readiness = summarizeTrainingContentReadiness(planWithGame(game));

    assert.equal(readiness.tone, "warning");
    assert.equal(readiness.label, "1 项待完善");
  }
});

test("training readiness requires the exact five-item Unity metric contract", () => {
  const accepted = summarizeTrainingContentReadiness(planWithGame(baseGame));

  assert.equal(accepted.tone, "success");
  assert.equal(accepted.label, "已准备");

  for (const game of [
    {
      ...baseGame,
      requiredMetrics: unityRequiredMetrics.filter(
        (metric) => metric.metricType !== "difficulty_level",
      ),
    },
    {
      ...baseGame,
      requiredMetrics: unityRequiredMetrics.map((metric) =>
        metric.metricType === "difficulty_level"
          ? { metricType: "pose_visibility_avg" }
          : metric,
      ),
    },
    {
      ...baseGame,
      requiredMetrics: [
        ...unityRequiredMetrics,
        { metricType: "unexpected_metric" },
      ],
    },
  ]) {
    const readiness = summarizeTrainingContentReadiness(planWithGame(game));

    assert.equal(readiness.tone, "warning");
    assert.equal(readiness.label, "1 项待完善");
  }
});

test("training readiness accepts fully configured browser and cognitive content", () => {
  const browserGame = {
    ...baseGame,
    id: "browser-game",
    runtimeType: "browser_pose_canvas",
    manifestUrl: null,
    buildBaseUrl: null,
    supportsCamera: true,
    supportedInputModes: ["camera_pose"],
    requiredMetrics: [
      { metricType: "reaction_time_ms", unit: "ms", min: 0, max: 60000 },
      { metricType: "target_hit_rate", unit: "ratio", min: 0, max: 1 },
      { metricType: "pose_visibility_avg", unit: "ratio", min: 0, max: 1 },
      { metricType: "arm_raise_accuracy", unit: "ratio", min: 0, max: 1 },
    ],
    requiredPermissions: ["camera_capture"],
    difficultyPolicy: { source: "formal" },
    dynamicDifficultyTriggers: ["accuracy_low"],
    resultSchema: { source: "formal" },
    publishedStatus: "published",
  } satisfies GameContent;
  const cognitiveGame = {
    ...baseGame,
    id: "cognitive-game",
    runtimeType: "cognitive_web",
    manifestUrl: null,
    buildBaseUrl: null,
    supportsCamera: false,
    supportedInputModes: ["touch"],
    requiredMetrics: [
      { metricType: "sequence_recall_rate" },
      { metricType: "path_completion_rate" },
    ],
    releaseChannel: "production",
    requiredPermissions: [],
  } satisfies GameContent;
  const plan: RehabPlan = {
    ...basePlan,
    items: [
      { ...basePlan.items[0], id: "browser-item", gameContent: browserGame },
      {
        ...basePlan.items[0],
        id: "cognitive-item",
        gameContent: cognitiveGame,
      },
    ],
  };

  const readiness = summarizeTrainingContentReadiness(plan);

  assert.equal(readiness.tone, "success");
  assert.equal(readiness.label, "已准备");
});

function consent(consentType: "privacy_policy" | "ai_processing") {
  return {
    id: `consent-${consentType}`,
    patientId: "patient-1",
    subjectUserId: "user-1",
    consentType,
    consentVersion: "v1.2",
    status: "granted",
    grantedAt: "2026-06-01T00:00:00.000Z",
    evidenceSnapshot: {},
  } as const;
}

function planWithGame(gameContent: GameContent): RehabPlan {
  return {
    ...basePlan,
    items: [{ ...basePlan.items[0], gameContent }],
  };
}
