import assert from "node:assert/strict";
import test from "node:test";
import {
  appendCognitiveAnswer,
  cognitiveDifficultyForLevel,
  createCognitiveDifficultyAdjustment,
  createCognitiveRound,
  isCognitivePrescriptionComplete,
  measureCognitiveDifficultyWindow,
  requireCognitiveDurationSeconds,
  type CognitiveRoundResult,
} from "./cognitive-training-runtime.ts";

test("requireCognitiveDurationSeconds uses the prescribed minutes without a game default", () => {
  assert.equal(requireCognitiveDurationSeconds(2), 120);
  assert.throws(
    () => requireCognitiveDurationSeconds(undefined as unknown as number),
    /处方训练时长无效/,
  );
  assert.throws(() => requireCognitiveDurationSeconds(0), /处方训练时长无效/);
  assert.throws(() => requireCognitiveDurationSeconds(1.5), /处方训练时长无效/);
  assert.throws(
    () => requireCognitiveDurationSeconds(Number.NaN),
    /处方训练时长无效/,
  );
  assert.throws(
    () => requireCognitiveDurationSeconds(Number.POSITIVE_INFINITY),
    /处方训练时长无效/,
  );
  assert.throws(
    () => requireCognitiveDurationSeconds(Number.MAX_SAFE_INTEGER),
    /处方训练时长无效/,
  );
});

test("createCognitiveRound uses injected randomness and produces a unique unsorted sequence", () => {
  const randomValues = [0, 0, 0, 0, 0, 0, 0, 0];
  const sourceDifficulty = cognitiveDifficultyForLevel(1);
  const round = createCognitiveRound({
    roundNumber: 1,
    difficulty: sourceDifficulty,
    nowMs: 1_000,
    random: () => randomValues.shift() ?? 0,
  });

  assert.equal(round.sequence.length, 3);
  assert.equal(round.options.length, 4);
  assert.equal(new Set(round.sequence).size, round.sequence.length);
  assert.notDeepEqual(
    round.sequence,
    [...round.sequence].sort((left, right) =>
      left.localeCompare(right, "zh-Hans-CN"),
    ),
  );
  assert.ok(round.sequence.every((value) => round.options.includes(value)));
  assert.notStrictEqual(round.difficulty, sourceDifficulty);
  sourceDifficulty.sequenceLength = 99;
  assert.equal(round.difficulty.sequenceLength, 3);
});

test("completed cognitive round facts own sequence, answers, and difficulty snapshots", async () => {
  const runtime =
    (await import("./cognitive-training-runtime.ts")) as unknown as {
      createCognitiveRoundResult?: (input: {
        round: ReturnType<typeof createCognitiveRound>;
        answers: readonly string[];
        answerStartedAtMs: number;
        completedAtMs: number;
      }) => CognitiveRoundResult;
    };
  assert.equal(typeof runtime.createCognitiveRoundResult, "function");
  const sourceDifficulty = cognitiveDifficultyForLevel(1);
  const sourceRound = createCognitiveRound({
    roundNumber: 1,
    difficulty: sourceDifficulty,
    nowMs: 1_000,
    random: () => 0,
  });
  const sourceAnswers = [...sourceRound.sequence];
  const result = runtime.createCognitiveRoundResult!({
    round: sourceRound,
    answers: sourceAnswers,
    answerStartedAtMs: 2_000,
    completedAtMs: 3_000,
  });

  assert.notStrictEqual(result.sequence, sourceRound.sequence);
  assert.notStrictEqual(result.answers, sourceAnswers);
  assert.notStrictEqual(result.difficulty, sourceRound.difficulty);
  const expected = structuredClone(result);
  sourceRound.sequence[0] = "伪造序列";
  sourceAnswers[0] = "伪造答案";
  sourceRound.difficulty.sequenceLength = 99;
  assert.deepEqual(result, expected);
});

test("cognitive clientStartedAt must be an exact canonical ISO timestamp", async () => {
  const runtime =
    (await import("./cognitive-training-runtime.ts")) as unknown as {
      requireCognitiveClientStartedAt?: (value: unknown) => {
        iso: string;
        ms: number;
      };
    };
  assert.equal(typeof runtime.requireCognitiveClientStartedAt, "function");
  assert.deepEqual(
    runtime.requireCognitiveClientStartedAt!("2026-07-13T09:00:00.000Z"),
    {
      iso: "2026-07-13T09:00:00.000Z",
      ms: Date.parse("2026-07-13T09:00:00.000Z"),
    },
  );
  for (const value of [
    undefined,
    " 2026-07-13T09:00:00.000Z ",
    "2026-07-13T17:00:00.000+08:00",
    "not-a-date",
  ]) {
    assert.throws(
      () => runtime.requireCognitiveClientStartedAt!(value),
      /clientStartedAt|会话开始时间/,
    );
  }
});

test("appendCognitiveAnswer accepts each option only once in a round", () => {
  const first = appendCognitiveAnswer([], "蓝", 3);
  const duplicate = appendCognitiveAnswer(first, "蓝", 3);
  const second = appendCognitiveAnswer(duplicate, "绿", 3);

  assert.deepEqual(first, ["蓝"]);
  assert.strictEqual(duplicate, first);
  assert.deepEqual(second, ["蓝", "绿"]);
});

test("isCognitivePrescriptionComplete gates completion on prescribed elapsed time", () => {
  assert.equal(isCognitivePrescriptionComplete(1_000, 60_999, 60), false);
  assert.equal(isCognitivePrescriptionComplete(1_000, 61_000, 60), true);
});

test("createCognitiveDifficultyAdjustment changes all runtime parameters from a completed window", () => {
  const rounds: CognitiveRoundResult[] = [
    {
      id: "round-1",
      sequence: ["蓝", "绿", "黄", "红"],
      answers: ["蓝", "绿", "黄", "红"],
      difficultyLevel: 2,
      difficulty: cognitiveDifficultyForLevel(2),
      presentedAtMs: 10_000,
      answerStartedAtMs: 12_000,
      completedAtMs: 14_000,
    },
  ];

  const adjustment = createCognitiveDifficultyAdjustment({
    rounds,
    startingLevel: 2,
    currentDifficulty: cognitiveDifficultyForLevel(2),
    approvedPlanItemId: "plan-item-id",
    assessmentSourceId: "assessment-id",
    gameRunId: "run-id",
    adjustedAt: "2026-07-13T08:00:00.000Z",
  });

  assert.ok(adjustment);
  assert.equal(adjustment.triggerReason, "accuracy_high");
  assert.equal(adjustment.before.complexityLevel, 2);
  assert.equal(adjustment.after.complexityLevel, 3);
  assert.notEqual(
    adjustment.before.sequenceLength,
    adjustment.after.sequenceLength,
  );
  assert.notEqual(adjustment.before.optionCount, adjustment.after.optionCount);
  assert.notEqual(
    adjustment.before.presentationMs,
    adjustment.after.presentationMs,
  );
  assert.deepEqual(adjustment.windowRoundIds, ["round-1"]);
  assert.deepEqual(adjustment.windowMetrics, {
    attemptCount: 4,
    correctCount: 4,
    accuracy: 1,
    averageResponseTimeMs: 500,
  });
  assert.equal(adjustment.runtimeFrameId, "run-id:cognitive-round-round-1");
  assert.equal(adjustment.runtimeWindowId, "run-id:rounds:round-1-round-1");
});

for (const [label, answerStartedAtMs, completedAtMs] of [
  ["reversed", 2_000, 1_999],
  ["non-finite start", Number.NaN, 2_000],
  ["non-finite completion", 1_000, Number.POSITIVE_INFINITY],
] as const) {
  test(`measureCognitiveDifficultyWindow rejects ${label} response timestamps`, () => {
    const round: CognitiveRoundResult = {
      id: "round-1",
      sequence: ["蓝", "绿"],
      answers: ["蓝", "绿"],
      difficultyLevel: 1,
      difficulty: {
        level: 1,
        sequenceLength: 2,
        optionCount: 3,
        presentationMs: 3_800,
      },
      presentedAtMs: 500,
      answerStartedAtMs,
      completedAtMs,
    };

    assert.throws(
      () => measureCognitiveDifficultyWindow([round]),
      /响应时间|轮次时间无效/,
    );
  });
}

test("createCognitiveDifficultyAdjustment changes runtime parameters within the top clinical level", () => {
  const rounds: CognitiveRoundResult[] = [
    {
      id: "round-1",
      sequence: ["蓝", "绿", "黄", "红", "紫"],
      answers: ["蓝", "绿", "黄", "红", "紫"],
      difficultyLevel: 3,
      difficulty: cognitiveDifficultyForLevel(3),
      presentedAtMs: 10_000,
      answerStartedAtMs: 11_000,
      completedAtMs: 12_000,
    },
  ];

  const firstAdjustment = createCognitiveDifficultyAdjustment({
    rounds,
    startingLevel: 3,
    currentDifficulty: cognitiveDifficultyForLevel(3),
    approvedPlanItemId: "plan-item-id",
    assessmentSourceId: "assessment-id",
    gameRunId: "run-id",
    adjustedAt: "2026-07-13T08:00:00.000Z",
  });

  assert.ok(firstAdjustment);
  assert.equal(firstAdjustment.before.complexityLevel, 3);
  assert.equal(firstAdjustment.after.complexityLevel, 3);
  assert.notEqual(
    firstAdjustment.before.sequenceLength,
    firstAdjustment.after.sequenceLength,
  );
  assert.notEqual(
    firstAdjustment.before.optionCount,
    firstAdjustment.after.optionCount,
  );
  assert.notEqual(
    firstAdjustment.before.presentationMs,
    firstAdjustment.after.presentationMs,
  );

  const maxDifficulty = {
    level: firstAdjustment.after.complexityLevel,
    sequenceLength: firstAdjustment.after.sequenceLength,
    optionCount: firstAdjustment.after.optionCount,
    presentationMs: firstAdjustment.after.presentationMs,
  };

  assert.equal(
    createCognitiveDifficultyAdjustment({
      rounds: rounds.map((round) => ({
        ...round,
        difficulty: maxDifficulty,
        difficultyLevel: maxDifficulty.level,
      })),
      startingLevel: 3,
      currentDifficulty: maxDifficulty,
      approvedPlanItemId: "plan-item-id",
      assessmentSourceId: "assessment-id",
      gameRunId: "run-id",
      adjustedAt: "2026-07-13T08:01:00.000Z",
    }),
    null,
  );
});

test("createCognitiveDifficultyAdjustment lowers difficulty below the accuracy target", () => {
  const rounds: CognitiveRoundResult[] = [
    {
      id: "round-1",
      sequence: ["蓝", "绿", "黄", "红"],
      answers: ["蓝", "黄", "绿", "红"],
      difficultyLevel: 2,
      difficulty: cognitiveDifficultyForLevel(2),
      presentedAtMs: 1_000,
      answerStartedAtMs: 2_000,
      completedAtMs: 5_000,
    },
  ];

  const adjustment = createCognitiveDifficultyAdjustment({
    rounds,
    startingLevel: 2,
    currentDifficulty: cognitiveDifficultyForLevel(2),
    approvedPlanItemId: "plan-item-id",
    assessmentSourceId: "assessment-id",
    gameRunId: "run-id",
    adjustedAt: "2026-07-13T08:00:00.000Z",
  });

  assert.ok(adjustment);
  assert.equal(adjustment.triggerReason, "accuracy_low");
  assert.equal(adjustment.before.complexityLevel, 2);
  assert.equal(adjustment.after.complexityLevel, 1);
});
