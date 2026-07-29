import assert from "node:assert/strict";
import test from "node:test";
import { buildCaregiverWorkspaceModel } from "./caregiver-workspace-model";
import type {
  CareCircleResponse,
  CaregiverSummaryResponse,
  CaregiverTrainingSession,
  GameContent,
  RehabPlan,
} from "@/types/api";

test("maps unknown care labels to fixed safe copy", () => {
  const model = buildCaregiverWorkspaceModel(makeSummary(), {
    precautions: [
      makeReminder({
        id: "notice-1",
        category: "internal_category",
        priority: "urgent_private",
      }),
    ],
    posts: [
      makeNote({
        id: "note-1",
        mood: "backend_private_mood",
        reactions: [{ reactionType: "private_reaction", count: 2 }],
      }),
    ],
  });

  assert.equal(model.reminders[0]?.categoryLabel, "照护建议");
  assert.equal(model.reminders[0]?.priorityLabel, "常规提醒");
  assert.equal(model.notes[0]?.moodLabel, "照护记录");
  assert.equal(model.notes[0]?.reactions[0]?.label, "回应");
});

test("builds an unauthorized empty care model", () => {
  const model = buildCaregiverWorkspaceModel();

  assert.equal(model.hasSummary, false);
  assert.equal(model.patientDisplayName, "等待授权");
  assert.equal(model.dailyDurationLabel, "待安排");
  assert.equal(model.recentTrainingLabel, "0 次");
  assert.deepEqual(model.reminders, []);
  assert.deepEqual(model.notes, []);
  assert.deepEqual(model.scopeItems, [
    "等待患者授权后显示训练进展",
    "等待医生发布给家属的提醒",
    "未授权前不能查看照护摘要",
  ]);
});

test("keeps only published reminders and visible notes", () => {
  const model = buildCaregiverWorkspaceModel(makeSummary(), {
    precautions: [
      makeReminder({ id: "published-1", status: "published" }),
      makeReminder({ id: "draft-1", status: "draft" }),
    ],
    posts: [
      makeNote({ id: "visible-1", moderationStatus: "visible" }),
      makeNote({ id: "hidden-1", moderationStatus: "hidden" }),
    ],
  });

  assert.deepEqual(
    model.reminders.map((item) => item.id),
    ["published-1"],
  );
  assert.deepEqual(
    model.notes.map((item) => item.id),
    ["visible-1"],
  );
});

test("limits caregiver reminders and notes", () => {
  const model = buildCaregiverWorkspaceModel(makeSummary(), {
    precautions: Array.from({ length: 6 }, (_, index) =>
      makeReminder({ id: `notice-${index}` }),
    ),
    posts: Array.from({ length: 6 }, (_, index) =>
      makeNote({ id: `note-${index}` }),
    ),
  });

  assert.equal(model.reminders.length, 4);
  assert.equal(model.notes.length, 4);
  assert.deepEqual(
    model.reminders.map((item) => item.id),
    ["notice-0", "notice-1", "notice-2", "notice-3"],
  );
  assert.deepEqual(
    model.notes.map((item) => item.id),
    ["note-0", "note-1", "note-2", "note-3"],
  );
});

test("keeps caregiver progress quiet without average scoring stats", () => {
  const model = buildCaregiverWorkspaceModel(makeSummary());
  const labels = model.progressStats.map((item) => item.label);
  const helpers = model.progressStats.map((item) => item.helper);
  const visibleText = [...labels, ...helpers].join(" ");

  assert.deepEqual(labels, ["完成次数", "最近一次", "今日安排"]);
  assert.doesNotMatch(visibleText, /平均|得分|score|completion/i);
  assert.doesNotMatch(
    JSON.stringify(model),
    /rawPayload|rawPayloadHash|qualityFlag|qualityReasons|runtime|manifest|provider|endpoint|审计|导出/i,
  );
});

function makeSummary(): CaregiverSummaryResponse {
  return {
    patient: {
      id: "patient-1",
      name: "张阿姨",
      age: 72,
    },
    currentRisk: "moderate",
    currentPlan: makePlan(),
    recentTraining: [
      makeTraining({
        completionRate: 0.82,
        score: 81,
      }),
      makeTraining({
        completionRate: 0.92,
        score: 91,
      }),
    ],
    permissions: {
      rawAssessment: false,
      planEdit: false,
      fullMedicalRecord: false,
    },
  };
}

function makePlan(): RehabPlan {
  return {
    id: "plan-1",
    patientId: "patient-1",
    planName: "居家训练安排",
    status: "active",
    isCurrent: true,
    weekFrequency: 5,
    dailyDuration: 20,
    recommendationReason: "医生确认后执行",
    items: [],
  };
}

function makeTraining({
  completionRate,
  score,
}: {
  completionRate: number;
  score: number;
}): CaregiverTrainingSession {
  return {
    sessionStatus: "completed",
    startedAt: "2026-06-08T08:00:00.000Z",
    gameContent: makeGame(),
    result: {
      score,
      completionRate,
      durationSeconds: 1200,
      reactionTimeMs: 900,
      motionAccuracy: 0.86,
      exerciseIntensity: "moderate",
      abnormalFlag: false,
      createdAt: "2026-06-08T08:20:00.000Z",
    },
  };
}

function makeGame(): GameContent {
  return {
    id: "game-1",
    code: "game-code",
    name: "节奏训练",
    trainingTargets: ["运动训练"],
    tags: ["运动训练"],
    defaultDuration: 20,
    defaultDifficulty: "基础",
    runtimeType: "browser_pose_canvas",
    bridgeProtocolVersion: "1",
    buildStatus: "released",
    releaseChannel: "production",
    supportsCamera: true,
    supportsMicrophone: false,
    supportedInputModes: ["camera"],
    requiredMetrics: {},
    status: "active",
  };
}

function makeReminder(
  overrides: Partial<CareCircleResponse["precautions"][number]> = {},
): CareCircleResponse["precautions"][number] {
  return {
    id: "notice",
    title: "晚间陪伴",
    content: "训练后观察休息状态。",
    category: "safety",
    priority: "normal",
    status: "published",
    createdAt: "2026-06-08T08:00:00.000Z",
    ...overrides,
  };
}

function makeNote(
  overrides: Partial<CareCircleResponse["posts"][number]> = {},
): CareCircleResponse["posts"][number] {
  return {
    id: "note",
    body: "今天按时完成训练。",
    moderationStatus: "visible",
    createdAt: "2026-06-08T08:00:00.000Z",
    author: {
      displayName: "家属",
    },
    comments: [],
    reactions: [],
    ...overrides,
  };
}
