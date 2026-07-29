import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCognitiveWebTrainingResultPayload,
  calculateCognitiveScore,
  type CognitiveWebTrainingStats,
} from "./cognitive-web-training-result.ts";
import {
  cognitiveDifficultyForLevel,
  createCognitiveDifficultyAdjustment,
  measureCognitiveDifficultyWindow,
  type CognitiveDifficulty,
  type CognitiveDifficultyAdjustmentEvent,
  type CognitiveRoundResult,
} from "./cognitive-training-runtime.ts";
import type { GameContent, TrainingSession } from "@/types/api";

const startedAtMs = Date.parse("2026-05-26T09:00:00.000Z");
const completedAtMs = startedAtMs + 60_000;
const level2Difficulty = cognitiveDifficultyForLevel(2);
const level3Difficulty = cognitiveDifficultyForLevel(3);
const maxDifficulty: CognitiveDifficulty = {
  level: 3,
  sequenceLength: 6,
  optionCount: 7,
  presentationMs: 1_500,
};
type SubmittedCognitiveRound = Pick<
  CognitiveRoundResult,
  | "id"
  | "sequence"
  | "answers"
  | "difficultyLevel"
  | "presentedAtMs"
  | "answerStartedAtMs"
  | "completedAtMs"
> & { difficulty: CognitiveDifficulty };
type SubmittedDifficultyEvent = CognitiveDifficultyAdjustmentEvent;

const game: GameContent = {
  id: "game-content-id",
  code: "memory_path",
  name: "记忆路径",
  trainingTargets: ["思维训练", "memory", "sequence", "executive"],
  tags: ["风险评估辅助", "干预训练", "近记忆", "序列回忆"],
  defaultDuration: 8,
  defaultDifficulty: "三步路径",
  runtimeType: "cognitive_web",
  manifestUrl: null,
  buildBaseUrl: null,
  gameVersion: "1.0.0",
  bridgeProtocolVersion: "1.0.0",
  buildStatus: "released",
  releaseChannel: "production",
  supportsCamera: false,
  supportsMicrophone: false,
  supportedInputModes: ["touch", "keyboard"],
  requiredMetrics: [],
  status: "active",
};

const trainingSession: TrainingSession = {
  id: "training-session-id",
  patientId: "patient-profile-id",
  rehabPlanId: "rehab-plan-id",
  planItemId: "plan-item-id",
  gameContentId: "game-content-id",
  collectionBatchId: "collection-batch-real-001",
  gameRunId: "run-real-001",
  clientStartedAt: "2026-05-26T09:00:00.000Z",
  calibrationStatus: "checked",
  uploadAttemptCount: 0,
  sessionStatus: "in_progress",
  startedAt: "2026-05-26T09:00:00.000Z",
  syncStatus: "pending",
  runtimeConfigSnapshot: {
    approvedPlanItemId: "plan-item-id",
    assessmentSourceId: "assessment-approved-001",
    startingLevelSource: "clinician_approved_plan",
    startingDifficultyLevel: 2,
  },
};

function completedRounds(): CognitiveRoundResult[] {
  return [
    round({
      id: "round-1",
      sequence: ["蓝", "绿", "黄", "红"],
      answers: ["蓝", "绿", "黄", "红"],
      difficulty: level2Difficulty,
      presentedOffsetMs: 1_000,
      answerOffsetMs: 2_000,
      completedOffsetMs: 6_000,
    }),
    round({
      id: "round-2",
      sequence: ["蓝", "绿", "黄", "红", "紫"],
      answers: ["蓝", "绿", "黄", "红", "紫"],
      difficulty: level3Difficulty,
      presentedOffsetMs: 7_000,
      answerOffsetMs: 8_000,
      completedOffsetMs: 13_000,
    }),
    round({
      id: "round-3",
      sequence: ["蓝", "绿", "黄", "红", "紫", "橙"],
      answers: ["蓝", "绿", "黄", "红", "橙", "紫"],
      difficulty: maxDifficulty,
      presentedOffsetMs: 14_000,
      answerOffsetMs: 15_000,
      completedOffsetMs: 21_000,
    }),
  ];
}

function stats(): CognitiveWebTrainingStats {
  const rounds = completedRounds();
  const firstAdjustment = adjustmentFor(rounds[0]!, level2Difficulty);
  const secondAdjustment = adjustmentFor(rounds[1]!, level3Difficulty);
  assert.ok(firstAdjustment);
  assert.ok(secondAdjustment);
  assert.deepEqual(secondAdjustment.after, {
    speed: Number((3_200 / maxDifficulty.presentationMs).toFixed(3)),
    complexityLevel: maxDifficulty.level,
    sequenceLength: maxDifficulty.sequenceLength,
    optionCount: maxDifficulty.optionCount,
    presentationMs: maxDifficulty.presentationMs,
  });
  return {
    startedAtMs,
    startedAtIso: new Date(startedAtMs).toISOString(),
    prescribedDurationSeconds: 60,
    completionReason: "prescribed_duration_elapsed",
    rounds,
    difficultyAdjustmentEvents: [firstAdjustment, secondAdjustment],
  };
}

test("buildCognitiveWebTrainingResultPayload derives quality and linked evidence from actual rounds", async () => {
  const trainingStats = stats();
  const payload = await buildPayload(trainingStats);

  assert.equal(payload.metricsSummary.source, "cognitive_web");
  assert.equal(
    payload.metricsSummary.collectionBatchId,
    "collection-batch-real-001",
  );
  assert.equal(payload.metricsSummary.gameRunId, "run-real-001");
  assert.equal(payload.metricsSummary.prescribedDurationSeconds, 60);
  assert.equal(payload.metricsSummary.completedRoundCount, 3);
  assert.equal(payload.metricsSummary.attemptCount, 15);
  assert.equal(payload.metricsSummary.correctStepCount, 13);
  assert.equal(payload.metricsSummary.mistakeCount, 2);
  assert.equal(payload.metricsSummary.difficultyAdjustmentCount, 2);
  assert.deepEqual(payload.metricsSummary.dynamicDifficultyEvidence, {
    schemaVersion: "1.0.0",
    events: trainingStats.difficultyAdjustmentEvents,
  });
  assert.ok(
    trainingStats.difficultyAdjustmentEvents.every(
      (event) =>
        event.runtimeFrameId.startsWith("run-real-001:") &&
        event.runtimeWindowId.startsWith("run-real-001:"),
    ),
  );
  assert.match(
    String(payload.metricsSummary.rawPayloadHash),
    /^sha256:[a-f0-9]{64}$/,
  );
  assert.equal(payload.durationSeconds, 60);
  assert.equal(payload.completionRate, 1);
  assert.equal(payload.motionAccuracy, 0.867);
  assert.equal(payload.reactionTimeMs, 1_000);
  assert.equal(payload.score, 89);
  assert.deepEqual(
    payload.motionMetrics.map((metric) => metric.metricType).sort(),
    ["path_completion_rate", "sequence_recall_rate"],
  );
});

test("cognitive result payload includes complete per-round JSON facts", async () => {
  const trainingStats = stats();
  const runtimeOnly = { mutable: true };
  const firstRound = trainingStats.rounds[0]! as CognitiveRoundResult & {
    runtimeRoundState: string;
    difficulty: CognitiveDifficulty & { runtimeOnly: { mutable: boolean } };
  };
  firstRound.runtimeRoundState = "do-not-submit";
  firstRound.difficulty.runtimeOnly = runtimeOnly;
  const payload = await buildPayload(trainingStats);
  const payloadRound = (
    payload.metricsSummary.rounds as SubmittedCognitiveRound[]
  )[0]!;

  assert.deepEqual(Object.keys(payloadRound).sort(), [
    "answerStartedAtMs",
    "answers",
    "completedAtMs",
    "difficulty",
    "difficultyLevel",
    "id",
    "presentedAtMs",
    "sequence",
  ]);
  assert.deepEqual(Object.keys(payloadRound.difficulty).sort(), [
    "level",
    "optionCount",
    "presentationMs",
    "sequenceLength",
  ]);
  assert.equal("runtimeRoundState" in payloadRound, false);
  assert.equal("runtimeOnly" in payloadRound.difficulty, false);
  const payloadRounds = payload.metricsSummary
    .rounds as SubmittedCognitiveRound[];
  assert.equal(payloadRounds.length, trainingStats.rounds.length);
  assert.deepEqual(payloadRounds[2], {
    id: "round-3",
    sequence: ["蓝", "绿", "黄", "红", "紫", "橙"],
    answers: ["蓝", "绿", "黄", "红", "橙", "紫"],
    difficulty: {
      level: 3,
      sequenceLength: 6,
      optionCount: 7,
      presentationMs: 1_500,
    },
    difficultyLevel: 3,
    presentedAtMs: startedAtMs + 14_000,
    answerStartedAtMs: startedAtMs + 15_000,
    completedAtMs: startedAtMs + 21_000,
  });
});

test("cognitive result payload owns an immutable snapshot of per-round facts", async () => {
  const trainingStats = structuredClone(stats());
  const runtimeOnly = { mutable: true };
  const sourceDifficulty = trainingStats.rounds[0]!
    .difficulty as CognitiveDifficulty & {
    runtimeOnly: { mutable: boolean };
  };
  sourceDifficulty.runtimeOnly = runtimeOnly;
  const payload = await buildPayload(trainingStats);
  const originalPayloadRounds = structuredClone(payload.metricsSummary.rounds);
  const mutableRound = trainingStats.rounds[0]! as unknown as {
    id: string;
    sequence: string[];
    answers: string[];
    difficulty: CognitiveDifficulty;
  };

  mutableRound.id = "round-forged";
  mutableRound.sequence[0] = "伪造序列";
  mutableRound.answers[0] = "伪造答案";
  mutableRound.difficulty.sequenceLength = 99;
  runtimeOnly.mutable = false;
  const mutableLastRound = trainingStats.rounds[2]! as unknown as {
    sequence: string[];
    answers: string[];
    difficulty: CognitiveDifficulty;
  };
  mutableLastRound.sequence[5] = "伪造末轮序列";
  mutableLastRound.answers[5] = "伪造末轮答案";
  mutableLastRound.difficulty.presentationMs = 999;

  assert.deepEqual(payload.metricsSummary.rounds, originalPayloadRounds);
});

test("runtime-only round fields do not change canonical facts or payload hash", async () => {
  const canonicalStats = structuredClone(stats());
  const statsWithRuntimeFields = structuredClone(stats());
  const runtimeRound = statsWithRuntimeFields
    .rounds[0] as CognitiveRoundResult & {
    runtimeState: { selectedIndex: number };
    difficulty: CognitiveDifficulty & {
      runtimeOnly: { animationFrame: number };
    };
  };
  runtimeRound.runtimeState = { selectedIndex: 2 };
  runtimeRound.difficulty.runtimeOnly = { animationFrame: 42 };
  const runtimeEvent = statsWithRuntimeFields
    .difficultyAdjustmentEvents[0] as CognitiveDifficultyAdjustmentEvent & {
    runtimeState: { animationFrame: number };
    before: CognitiveDifficultyAdjustmentEvent["before"] & {
      runtimeOnly: { mutable: boolean };
    };
    after: CognitiveDifficultyAdjustmentEvent["after"] & {
      runtimeOnly: { mutable: boolean };
    };
    windowMetrics: CognitiveDifficultyAdjustmentEvent["windowMetrics"] & {
      runtimeOnly: { mutable: boolean };
    };
  };
  runtimeEvent.runtimeState = { animationFrame: 84 };
  runtimeEvent.before.runtimeOnly = { mutable: true };
  runtimeEvent.after.runtimeOnly = { mutable: true };
  runtimeEvent.windowMetrics.runtimeOnly = { mutable: true };

  const canonicalPayload = await buildPayload(canonicalStats);
  const runtimePayload = await buildPayload(statsWithRuntimeFields);

  assert.deepEqual(
    runtimePayload.metricsSummary.rounds,
    canonicalPayload.metricsSummary.rounds,
  );
  assert.deepEqual(
    runtimePayload.metricsSummary.dynamicDifficultyEvidence,
    canonicalPayload.metricsSummary.dynamicDifficultyEvidence,
  );
  assert.equal(
    runtimePayload.metricsSummary.rawPayloadHash,
    canonicalPayload.metricsSummary.rawPayloadHash,
  );
});

test("difficulty events are exact immutable canonical snapshots", async () => {
  const trainingStats = structuredClone(stats());
  const sourceEvent = trainingStats
    .difficultyAdjustmentEvents[0] as CognitiveDifficultyAdjustmentEvent & {
    runtimeEventState: { visible: boolean };
    before: CognitiveDifficultyAdjustmentEvent["before"] & {
      runtimeOnly: { mutable: boolean };
    };
    after: CognitiveDifficultyAdjustmentEvent["after"] & {
      runtimeOnly: { mutable: boolean };
    };
    windowMetrics: CognitiveDifficultyAdjustmentEvent["windowMetrics"] & {
      runtimeOnly: { mutable: boolean };
    };
  };
  sourceEvent.runtimeEventState = { visible: true };
  sourceEvent.before.runtimeOnly = { mutable: true };
  sourceEvent.after.runtimeOnly = { mutable: true };
  sourceEvent.windowMetrics.runtimeOnly = { mutable: true };

  const payload = await buildPayload(trainingStats);
  const evidence = payload.metricsSummary.dynamicDifficultyEvidence as {
    schemaVersion: string;
    events: SubmittedDifficultyEvent[];
  };
  const payloadEvent = evidence.events[0]!;
  const originalEvents = structuredClone(evidence.events);

  assert.deepEqual(Object.keys(payloadEvent).sort(), [
    "adjustedAt",
    "after",
    "approvedPlanItemId",
    "assessmentSourceId",
    "before",
    "runtimeFrameId",
    "runtimeWindowId",
    "startingLevel",
    "startingLevelSource",
    "triggerReason",
    "windowMetrics",
    "windowRoundIds",
  ]);
  for (const snapshot of [payloadEvent.before, payloadEvent.after]) {
    assert.deepEqual(Object.keys(snapshot).sort(), [
      "complexityLevel",
      "optionCount",
      "presentationMs",
      "sequenceLength",
      "speed",
    ]);
  }
  assert.deepEqual(Object.keys(payloadEvent.windowMetrics).sort(), [
    "accuracy",
    "attemptCount",
    "averageResponseTimeMs",
    "correctCount",
  ]);
  assert.equal("runtimeEventState" in payloadEvent, false);
  assert.equal("runtimeOnly" in payloadEvent.before, false);
  assert.equal("runtimeOnly" in payloadEvent.after, false);
  assert.equal("runtimeOnly" in payloadEvent.windowMetrics, false);
  assert.deepEqual(payloadEvent, {
    startingLevel: 2,
    startingLevelSource: "clinician_approved_plan",
    approvedPlanItemId: "plan-item-id",
    assessmentSourceId: "assessment-approved-001",
    triggerReason: "accuracy_high",
    before: {
      speed: 1.231,
      complexityLevel: 2,
      sequenceLength: 4,
      optionCount: 5,
      presentationMs: 2_600,
    },
    after: {
      speed: 1.6,
      complexityLevel: 3,
      sequenceLength: 5,
      optionCount: 6,
      presentationMs: 2_000,
    },
    windowRoundIds: ["round-1"],
    windowMetrics: {
      attemptCount: 4,
      correctCount: 4,
      accuracy: 1,
      averageResponseTimeMs: 1_000,
    },
    adjustedAt: "2026-05-26T09:00:06.000Z",
    runtimeFrameId: "run-real-001:cognitive-round-round-1",
    runtimeWindowId: "run-real-001:rounds:round-1-round-1",
  });

  sourceEvent.runtimeEventState.visible = false;
  sourceEvent.before.speed = 999;
  sourceEvent.after.presentationMs = 999;
  sourceEvent.windowRoundIds[0] = "round-forged";
  sourceEvent.windowMetrics.attemptCount = 999;

  assert.deepEqual(evidence.events, originalEvents);
});

test("builder snapshots all formal facts before its first await", async () => {
  const sourceStats = structuredClone(stats());
  const sourceGame = structuredClone(game);
  const sourceSession = structuredClone(trainingSession);
  const baseline = await buildCognitiveWebTrainingResultPayload({
    stats: structuredClone(sourceStats),
    game: structuredClone(sourceGame),
    trainingSession: structuredClone(sourceSession),
    completedAtMs,
    generatedAt: new Date(completedAtMs).toISOString(),
  });

  const pendingPayload = buildCognitiveWebTrainingResultPayload({
    stats: sourceStats,
    game: sourceGame,
    trainingSession: sourceSession,
    completedAtMs,
    generatedAt: new Date(completedAtMs).toISOString(),
  });
  sourceStats.startedAtMs = 0;
  sourceStats.startedAtIso = "forged-started-at";
  sourceStats.prescribedDurationSeconds = 999;
  sourceStats.completionReason =
    "forged" as typeof sourceStats.completionReason;
  const mutableLastRound = sourceStats.rounds[2]! as unknown as {
    sequence: string[];
    answers: string[];
    difficulty: CognitiveDifficulty;
  };
  mutableLastRound.sequence[5] = "await后伪造序列";
  mutableLastRound.answers[5] = "await后伪造答案";
  mutableLastRound.difficulty.presentationMs = 999;
  const mutableEvent = sourceStats.difficultyAdjustmentEvents[0]!;
  mutableEvent.before.speed = 999;
  mutableEvent.after.presentationMs = 999;
  mutableEvent.windowRoundIds[0] = "round-forged";
  mutableEvent.windowMetrics.attemptCount = 999;
  sourceSession.id = "forged-session";
  sourceSession.gameRunId = "forged-run";
  sourceSession.collectionBatchId = "forged-collection-batch";
  sourceGame.gameVersion = "forged-game-version";
  sourceGame.bridgeProtocolVersion = "forged-protocol-version";

  const payload = await pendingPayload;

  assert.deepEqual(payload, baseline);
});

test("a distractor choice is a valid wrong attempt", async () => {
  const trainingStats = stats();
  trainingStats.rounds[2] = {
    ...trainingStats.rounds[2]!,
    answers: ["蓝", "绿", "黄", "红", "白", "紫"],
  };

  const payload = await buildPayload(trainingStats);

  assert.equal(payload.metricsSummary.attemptCount, 15);
  assert.equal(payload.metricsSummary.correctStepCount, 13);
  assert.equal(payload.metricsSummary.mistakeCount, 2);
  assert.equal(payload.metricsSummary.sequenceRecallRate, 0.867);
});

test("one completed round is valid without an unapplied adjustment event", async () => {
  const slowRound = completedRounds()[0]!;
  const singleRoundStats: CognitiveWebTrainingStats = {
    ...stats(),
    rounds: [
      {
        ...slowRound,
        completedAtMs: slowRound.answerStartedAtMs + 12_000,
      },
    ],
    difficultyAdjustmentEvents: [],
  };

  const payload = await buildPayload(singleRoundStats);

  assert.equal(payload.metricsSummary.completedRoundCount, 1);
  assert.equal(payload.metricsSummary.difficultyAdjustmentCount, 0);
  assert.equal(payload.reactionTimeMs, 3_000);
  assert.deepEqual(payload.metricsSummary.dynamicDifficultyEvidence, {
    schemaVersion: "1.0.0",
    events: [],
  });
});

test("a completed round sequence must match its actual difficulty rule", async () => {
  const forgedRound = completedRounds()[0]!;

  await assert.rejects(
    buildPayload({
      ...stats(),
      rounds: [
        {
          ...forgedRound,
          sequence: forgedRound.sequence.slice(0, 3),
          answers: forgedRound.answers.slice(0, 3),
        },
      ],
      difficultyAdjustmentEvents: [],
    }),
    /轮次答案无效/,
  );
});

test("a round completed after the result completion time is rejected", async () => {
  const trainingStats = stats();
  trainingStats.rounds[2] = {
    ...trainingStats.rounds[2]!,
    completedAtMs: completedAtMs + 1,
  };

  await assert.rejects(buildPayload(trainingStats), /晚于训练结果完成时间/);
});

test("format-correct forged difficulty events are rejected against actual rounds", async () => {
  const mutations: Array<(trainingStats: CognitiveWebTrainingStats) => void> = [
    (trainingStats) => {
      trainingStats.difficultyAdjustmentEvents[0]!.windowRoundIds = [
        "round-missing",
      ];
    },
    (trainingStats) => {
      const event = trainingStats.difficultyAdjustmentEvents[0]!;
      event.windowRoundIds = ["round-1", "round-3"];
      event.windowMetrics = measureCognitiveDifficultyWindow([
        trainingStats.rounds[0]!,
        trainingStats.rounds[2]!,
      ]);
    },
    (trainingStats) => {
      const event = trainingStats.difficultyAdjustmentEvents[0]!;
      event.before = trainingStats.difficultyAdjustmentEvents[1]!.before;
    },
    (trainingStats) => {
      const event = trainingStats.difficultyAdjustmentEvents[0]!;
      event.after = event.before;
    },
    (trainingStats) => {
      trainingStats.difficultyAdjustmentEvents[0]!.triggerReason =
        "accuracy_low";
    },
    (trainingStats) => {
      trainingStats.difficultyAdjustmentEvents[0]!.windowMetrics.accuracy = 0.5;
    },
    (trainingStats) => {
      trainingStats.difficultyAdjustmentEvents[0]!.adjustedAt = new Date(
        trainingStats.rounds[0]!.presentedAtMs - 1,
      ).toISOString();
    },
  ];

  for (const mutate of mutations) {
    const forged = structuredClone(stats());
    mutate(forged);
    await assert.rejects(buildPayload(forged), /动态难度/);
  }
});

test("dynamic difficulty evidence identities must match the current session", async () => {
  const mutations: Array<(trainingStats: CognitiveWebTrainingStats) => void> = [
    (trainingStats) => {
      trainingStats.difficultyAdjustmentEvents[0]!.approvedPlanItemId =
        "plan-item-from-another-session";
    },
    (trainingStats) => {
      trainingStats.difficultyAdjustmentEvents[0]!.assessmentSourceId =
        "assessment-from-another-session";
    },
    (trainingStats) => {
      trainingStats.difficultyAdjustmentEvents[0]!.runtimeWindowId =
        "run-from-another-session:rounds:round-1-round-1";
    },
    (trainingStats) => {
      trainingStats.difficultyAdjustmentEvents[0]!.runtimeFrameId =
        "cognitive-round-round-1";
    },
  ];

  for (const mutate of mutations) {
    const forged = structuredClone(stats());
    mutate(forged);
    await assert.rejects(buildPayload(forged), /动态难度/);
  }
});

test("dynamic difficulty starting level must match the current session", async () => {
  const forged = stats();
  forged.difficultyAdjustmentEvents[0]!.startingLevel = 1;

  await assert.rejects(buildPayload(forged), /起始等级/);
});

test("an event-free first round must start from the current session level", async () => {
  const otherStartingLevelSession = structuredClone(trainingSession);
  assert.ok(
    otherStartingLevelSession.runtimeConfigSnapshot &&
      typeof otherStartingLevelSession.runtimeConfigSnapshot === "object",
  );
  (
    otherStartingLevelSession.runtimeConfigSnapshot as Record<string, unknown>
  ).startingDifficultyLevel = 1;

  await assert.rejects(
    buildPayload(
      {
        ...stats(),
        rounds: [completedRounds()[0]!],
        difficultyAdjustmentEvents: [],
      },
      otherStartingLevelSession,
    ),
    /起始难度/,
  );
});

test("score uses raw accuracy before output rounding", () => {
  assert.equal(calculateCognitiveScore(13 / 27, 1), 59);
  assert.equal(calculateCognitiveScore(0.481, 1), 58);
});

test("builder scores from the raw 13-of-27 ratio before exposing its rounded rate", async () => {
  const payload = await buildPayload(rawScoreRoundingStats());

  assert.equal(payload.metricsSummary.correctStepCount, 13);
  assert.equal(payload.metricsSummary.attemptCount, 27);
  assert.equal(payload.metricsSummary.sequenceRecallRate, 0.481);
  assert.equal(payload.score, 59);
});

test("builder averages per-round response times instead of globally weighting steps", async () => {
  const rounds = completedRounds().slice(0, 2);
  rounds[1] = {
    ...rounds[1]!,
    completedAtMs: rounds[1]!.answerStartedAtMs + 10_000,
  };
  const firstAdjustment = adjustmentFor(rounds[0]!, level2Difficulty);
  assert.ok(firstAdjustment);
  const payload = await buildPayload({
    ...stats(),
    rounds,
    difficultyAdjustmentEvents: [firstAdjustment],
  });

  assert.equal(payload.reactionTimeMs, 1_500);
  assert.notEqual(payload.reactionTimeMs, Math.round(14_000 / 9));
});

test("completion before prescribed duration is rejected", async () => {
  await assert.rejects(
    buildCognitiveWebTrainingResultPayload({
      stats: stats(),
      game,
      trainingSession,
      completedAtMs: completedAtMs - 1,
      generatedAt: new Date(completedAtMs - 1).toISOString(),
    }),
    /尚未达到处方训练时长/,
  );
});

for (const [label, value] of [
  ["fractional", 60.5],
  ["infinite", Number.POSITIVE_INFINITY],
  ["unsafe", Number.MAX_SAFE_INTEGER + 1],
] as const) {
  test(`builder rejects ${label} prescribedDurationSeconds`, async () => {
    await assert.rejects(
      buildCognitiveWebTrainingResultPayload({
        stats: { ...stats(), prescribedDurationSeconds: value },
        game,
        trainingSession,
        completedAtMs: startedAtMs + 61_000,
        generatedAt: new Date(startedAtMs + 61_000).toISOString(),
      }),
      /处方训练时长.*正安全整数/,
    );
  });
}

test("zero completed rounds are explicitly invalid", async () => {
  await assert.rejects(
    buildPayload({ ...stats(), rounds: [], difficultyAdjustmentEvents: [] }),
    /缺少已完成轮次/,
  );
});

test("a formal preparation record remains required", async () => {
  await assert.rejects(
    buildCognitiveWebTrainingResultPayload({
      stats: stats(),
      game,
      trainingSession: {
        ...trainingSession,
        collectionBatchId: null,
      } as unknown as TrainingSession,
      completedAtMs,
      generatedAt: new Date(completedAtMs).toISOString(),
    }),
    /训练结果信息不完整，请重新完成本次训练。/,
  );
});

function adjustmentFor(
  completedRound: CognitiveRoundResult,
  currentDifficulty: CognitiveDifficulty,
) {
  const adjustment = createCognitiveDifficultyAdjustment({
    rounds: [completedRound],
    startingLevel: 2,
    currentDifficulty,
    approvedPlanItemId: "plan-item-id",
    assessmentSourceId: "assessment-approved-001",
    gameRunId: "run-real-001",
    adjustedAt: new Date(completedRound.completedAtMs).toISOString(),
  });
  return adjustment;
}

function round({
  id,
  sequence,
  answers,
  difficulty,
  presentedOffsetMs,
  answerOffsetMs,
  completedOffsetMs,
}: {
  id: string;
  sequence: string[];
  answers: string[];
  difficulty: CognitiveDifficulty;
  presentedOffsetMs: number;
  answerOffsetMs: number;
  completedOffsetMs: number;
}): CognitiveRoundResult {
  return {
    id,
    sequence,
    answers,
    difficulty,
    difficultyLevel: difficulty.level,
    presentedAtMs: startedAtMs + presentedOffsetMs,
    answerStartedAtMs: startedAtMs + answerOffsetMs,
    completedAtMs: startedAtMs + completedOffsetMs,
  };
}

function buildPayload(
  trainingStats: CognitiveWebTrainingStats,
  session = trainingSession,
) {
  return buildCognitiveWebTrainingResultPayload({
    stats: trainingStats,
    game,
    trainingSession: session,
    completedAtMs,
    generatedAt: new Date(completedAtMs).toISOString(),
  });
}

function rawScoreRoundingStats(): CognitiveWebTrainingStats {
  const levelOneThreeStep: CognitiveDifficulty = {
    level: 1,
    sequenceLength: 3,
    optionCount: 4,
    presentationMs: 3_200,
  };
  const lowestDifficulty: CognitiveDifficulty = {
    level: 1,
    sequenceLength: 2,
    optionCount: 3,
    presentationMs: 3_800,
  };
  const rounds: CognitiveRoundResult[] = [
    round({
      id: "round-1",
      sequence: ["蓝", "绿", "黄", "红"],
      answers: ["蓝", "绿", "黄", "紫"],
      difficulty: level2Difficulty,
      presentedOffsetMs: 1_000,
      answerOffsetMs: 2_000,
      completedOffsetMs: 6_000,
    }),
    round({
      id: "round-2",
      sequence: ["蓝", "绿", "黄"],
      answers: ["蓝", "绿", "红"],
      difficulty: levelOneThreeStep,
      presentedOffsetMs: 7_000,
      answerOffsetMs: 8_000,
      completedOffsetMs: 11_000,
    }),
  ];
  for (let roundNumber = 3; roundNumber <= 12; roundNumber += 1) {
    const hasOneCorrectAnswer = roundNumber <= 10;
    const presentedOffsetMs = 12_000 + (roundNumber - 3) * 4_000;
    rounds.push(
      round({
        id: `round-${roundNumber}`,
        sequence: ["蓝", "绿"],
        answers: hasOneCorrectAnswer ? ["蓝", "黄"] : ["绿", "蓝"],
        difficulty: lowestDifficulty,
        presentedOffsetMs,
        answerOffsetMs: presentedOffsetMs + 1_000,
        completedOffsetMs: presentedOffsetMs + 3_000,
      }),
    );
  }
  const firstAdjustment = adjustmentFor(rounds[0]!, level2Difficulty);
  const secondAdjustment = adjustmentFor(rounds[1]!, levelOneThreeStep);
  assert.ok(firstAdjustment);
  assert.ok(secondAdjustment);
  return {
    startedAtMs,
    startedAtIso: new Date(startedAtMs).toISOString(),
    prescribedDurationSeconds: 60,
    completionReason: "prescribed_duration_elapsed",
    rounds,
    difficultyAdjustmentEvents: [firstAdjustment, secondAdjustment],
  };
}
