import type {
  GameContent,
  SubmitTrainingResultRequest,
  TrainingSession,
} from "@/types/api";
import type {
  CognitiveDifficultyAdjustmentEvent,
  CognitiveRoundResult,
} from "./cognitive-training-runtime";
import {
  cognitiveDifficultyForLevel,
  cognitiveDifficultySnapshot,
  isCognitivePrescriptionComplete,
  measureCognitiveDifficultyWindow,
  requireCognitiveDifficulty,
  resolveCognitiveDifficultyAfter,
  resolveCognitiveDifficultyTrigger,
} from "./cognitive-training-runtime";

export type CognitiveWebTrainingStats = {
  startedAtMs: number;
  startedAtIso: string;
  prescribedDurationSeconds: number;
  completionReason: "prescribed_duration_elapsed";
  rounds: CognitiveRoundResult[];
  difficultyAdjustmentEvents: CognitiveDifficultyAdjustmentEvent[];
};

const resultIncompleteMessage = "训练结果信息不完整，请重新完成本次训练。";

export async function buildCognitiveWebTrainingResultPayload({
  stats,
  game,
  trainingSession,
  completedAtMs,
  generatedAt = new Date().toISOString(),
}: {
  stats: CognitiveWebTrainingStats;
  game: GameContent;
  trainingSession: TrainingSession;
  completedAtMs: number;
  generatedAt?: string;
}): Promise<SubmitTrainingResultRequest> {
  const { id: sessionId, collectionBatchId, gameRunId } = trainingSession;
  const { gameVersion, bridgeProtocolVersion: protocolVersion } = game;
  if (!collectionBatchId || !gameRunId) {
    throw new Error(resultIncompleteMessage);
  }
  const {
    startedAtMs,
    startedAtIso,
    prescribedDurationSeconds,
    completionReason,
  } = stats;
  if (
    !Number.isSafeInteger(prescribedDurationSeconds) ||
    prescribedDurationSeconds <= 0
  ) {
    throw new Error("认知训练处方训练时长必须是正安全整数秒。");
  }
  const roundFacts = stats.rounds.map(canonicalCognitiveRound);
  const difficultyAdjustmentEvents = stats.difficultyAdjustmentEvents.map(
    canonicalDifficultyAdjustmentEvent,
  );
  if (completionReason !== "prescribed_duration_elapsed") {
    throw new Error("认知训练没有满足有效完成条件。");
  }
  if (
    !isCognitivePrescriptionComplete(
      startedAtMs,
      completedAtMs,
      prescribedDurationSeconds,
    )
  ) {
    throw new Error("认知训练尚未达到处方训练时长，不能生成完成结果。");
  }
  const difficultyEvidenceContext =
    readDifficultyEvidenceContext(trainingSession);
  validateRounds(roundFacts, completedAtMs);
  validateDifficultyEvents(roundFacts, difficultyAdjustmentEvents, {
    ...difficultyEvidenceContext,
    gameRunId,
  });

  const durationSeconds = Math.max(
    1,
    Math.round((completedAtMs - startedAtMs) / 1_000),
  );
  const totalStepCount = roundFacts.reduce(
    (sum, round) => sum + round.sequence.length,
    0,
  );
  const correctStepCount = roundFacts.reduce(
    (sum, round) => sum + countPositionMatches(round.answers, round.sequence),
    0,
  );
  const attemptCount = roundFacts.reduce(
    (sum, round) => sum + round.answers.length,
    0,
  );
  const completedRoundCount = roundFacts.filter(
    (round) => round.answers.length === round.sequence.length,
  ).length;
  const mistakeCount = attemptCount - correctStepCount;
  const rawSequenceRecallRate = correctStepCount / attemptCount;
  const rawPathCompletionRate = completedRoundCount / roundFacts.length;
  const sequenceRecallRate = roundedRatio(rawSequenceRecallRate);
  const pathCompletionRate = roundedRatio(rawPathCompletionRate);
  const completionRate = pathCompletionRate;
  const motionAccuracy = sequenceRecallRate;
  const reactionTimes = roundFacts.map(
    (round) =>
      (round.completedAtMs - round.answerStartedAtMs) / round.answers.length,
  );
  const reactionTimeMs = Math.round(average(reactionTimes));
  const score = calculateCognitiveScore(
    rawSequenceRecallRate,
    rawPathCompletionRate,
  );
  const rawPayloadHash = await createTrainingPayloadHash({
    sessionId,
    gameRunId,
    prescribedDurationSeconds,
    rounds: roundFacts,
    difficultyAdjustmentEvents,
    durationSeconds,
  });
  const commonSummary = {
    source: "cognitive_web",
    gameRunId,
    sequenceRecallRate,
    pathCompletionRate,
    completedRoundCount,
    attemptCount,
    correctStepCount,
    totalStepCount,
    mistakeCount,
  };
  return {
    score,
    completionRate,
    durationSeconds,
    reactionTimeMs,
    motionAccuracy,
    exerciseIntensity: "low",
    metricsSummary: {
      ...commonSummary,
      rounds: roundFacts,
      collectionBatchId,
      gameVersion,
      protocolVersion,
      clientGeneratedAt: generatedAt,
      prescribedDurationSeconds,
      difficultyAdjustmentCount: difficultyAdjustmentEvents.length,
      rawPayloadHash,
      rawInputStored: false,
      dynamicDifficultyEvidence: {
        schemaVersion: "1.0.0",
        events: difficultyAdjustmentEvents,
      },
    },
    motionMetrics: [
      {
        metricType: "sequence_recall_rate",
        metricValue: sequenceRecallRate,
        confidence: 1,
        unit: "ratio",
        sampleCount: roundFacts.length,
        windowStartedAt: startedAtIso,
        windowEndedAt: generatedAt,
        qualityFlag: "valid",
        rawSummary: commonSummary,
      },
      {
        metricType: "path_completion_rate",
        metricValue: pathCompletionRate,
        confidence: 1,
        unit: "ratio",
        sampleCount: roundFacts.length,
        windowStartedAt: startedAtIso,
        windowEndedAt: generatedAt,
        qualityFlag: "valid",
        rawSummary: commonSummary,
      },
    ],
  };
}

function canonicalCognitiveRound(
  round: CognitiveRoundResult,
): CognitiveRoundResult {
  return {
    id: round.id,
    sequence: [...round.sequence],
    answers: [...round.answers],
    difficulty: {
      level: round.difficulty.level,
      sequenceLength: round.difficulty.sequenceLength,
      optionCount: round.difficulty.optionCount,
      presentationMs: round.difficulty.presentationMs,
    },
    difficultyLevel: round.difficultyLevel,
    presentedAtMs: round.presentedAtMs,
    answerStartedAtMs: round.answerStartedAtMs,
    completedAtMs: round.completedAtMs,
  };
}

function canonicalDifficultyAdjustmentEvent(
  event: CognitiveDifficultyAdjustmentEvent,
): CognitiveDifficultyAdjustmentEvent {
  return {
    startingLevel: event.startingLevel,
    startingLevelSource: event.startingLevelSource,
    approvedPlanItemId: event.approvedPlanItemId,
    assessmentSourceId: event.assessmentSourceId,
    triggerReason: event.triggerReason,
    before: {
      speed: event.before.speed,
      complexityLevel: event.before.complexityLevel,
      sequenceLength: event.before.sequenceLength,
      optionCount: event.before.optionCount,
      presentationMs: event.before.presentationMs,
    },
    after: {
      speed: event.after.speed,
      complexityLevel: event.after.complexityLevel,
      sequenceLength: event.after.sequenceLength,
      optionCount: event.after.optionCount,
      presentationMs: event.after.presentationMs,
    },
    windowRoundIds: [...event.windowRoundIds],
    windowMetrics: {
      attemptCount: event.windowMetrics.attemptCount,
      correctCount: event.windowMetrics.correctCount,
      accuracy: event.windowMetrics.accuracy,
      averageResponseTimeMs: event.windowMetrics.averageResponseTimeMs,
    },
    adjustedAt: event.adjustedAt,
    runtimeFrameId: event.runtimeFrameId,
    runtimeWindowId: event.runtimeWindowId,
  };
}

function validateRounds(
  rounds: readonly CognitiveRoundResult[],
  resultCompletedAtMs: number,
) {
  if (!rounds.length) {
    throw new Error("认知训练缺少已完成轮次，不能生成训练结果。");
  }
  if (new Set(rounds.map((round) => round.id)).size !== rounds.length) {
    throw new Error("认知训练轮次标识重复，不能生成训练结果。");
  }
  for (const round of rounds) {
    if (
      !round.id.trim() ||
      !round.sequence.length ||
      round.sequence.length !== round.difficulty.sequenceLength ||
      round.answers.length !== round.sequence.length ||
      new Set(round.sequence).size !== round.sequence.length ||
      new Set(round.answers).size !== round.answers.length ||
      round.difficultyLevel !== round.difficulty.level ||
      !Number.isInteger(round.difficultyLevel) ||
      round.difficultyLevel < 1 ||
      round.difficultyLevel > 3 ||
      !Number.isFinite(round.presentedAtMs) ||
      !Number.isFinite(round.answerStartedAtMs) ||
      !Number.isFinite(round.completedAtMs) ||
      round.answerStartedAtMs < round.presentedAtMs ||
      round.completedAtMs < round.answerStartedAtMs
    ) {
      throw new Error("认知训练轮次答案无效，不能生成训练结果。");
    }
    if (round.completedAtMs > resultCompletedAtMs) {
      throw new Error("认知训练轮次完成时间晚于训练结果完成时间。");
    }
    requireCognitiveDifficulty(round.difficulty);
  }
  for (let index = 1; index < rounds.length; index += 1) {
    const previous = rounds[index - 1]!;
    const current = rounds[index]!;
    if (
      current.presentedAtMs < previous.completedAtMs ||
      current.completedAtMs <= previous.completedAtMs
    ) {
      throw new Error("认知训练轮次时间顺序无效。");
    }
  }
}

function validateDifficultyEvents(
  rounds: readonly CognitiveRoundResult[],
  events: readonly CognitiveDifficultyAdjustmentEvent[],
  context: {
    approvedPlanItemId: string;
    assessmentSourceId: string;
    gameRunId: string;
    startingLevel: number;
  },
) {
  const firstRound = rounds[0]!;
  if (
    !sameSnapshot(
      cognitiveDifficultySnapshot(firstRound.difficulty),
      cognitiveDifficultySnapshot(
        cognitiveDifficultyForLevel(context.startingLevel),
      ),
    )
  ) {
    throw new Error("认知训练首轮难度与当前训练会话起始难度不一致。");
  }
  const roundIndexById = new Map(
    rounds.map((round, index) => [round.id, index] as const),
  );
  const eventByRoundIndex = new Map<
    number,
    CognitiveDifficultyAdjustmentEvent
  >();
  let previousEventRoundIndex = -1;
  for (const event of events) {
    if (event.windowRoundIds.length !== 1) {
      throw new Error("动态难度事件窗口必须包含单个连续轮次。");
    }
    const windowRoundId = event.windowRoundIds[0]!;
    const roundIndex = roundIndexById.get(windowRoundId);
    if (
      roundIndex === undefined ||
      roundIndex <= previousEventRoundIndex ||
      roundIndex >= rounds.length - 1 ||
      eventByRoundIndex.has(roundIndex)
    ) {
      throw new Error("动态难度事件窗口轮次不存在、不连续或没有后续实际轮次。");
    }
    const windowRound = rounds[roundIndex]!;
    const nextRound = rounds[roundIndex + 1]!;
    const expectedMetrics = measureCognitiveDifficultyWindow([windowRound]);
    const expectedTrigger = resolveCognitiveDifficultyTrigger(expectedMetrics);
    const expectedAfter = resolveCognitiveDifficultyAfter(
      windowRound.difficulty,
      expectedTrigger,
    );
    if (!expectedAfter) {
      throw new Error("动态难度事件声称发生了实际不存在的难度变化。");
    }
    if (
      !sameSnapshot(
        event.before,
        cognitiveDifficultySnapshot(windowRound.difficulty),
      ) ||
      !sameSnapshot(event.after, cognitiveDifficultySnapshot(expectedAfter)) ||
      !sameSnapshot(
        event.after,
        cognitiveDifficultySnapshot(nextRound.difficulty),
      )
    ) {
      throw new Error("动态难度事件 before/after 与实际轮次难度链不一致。");
    }
    if (
      event.triggerReason !== expectedTrigger ||
      !sameWindowMetrics(event.windowMetrics, expectedMetrics)
    ) {
      throw new Error("动态难度事件触发原因或窗口指标与真实作答不一致。");
    }
    const adjustedAtMs = Date.parse(event.adjustedAt);
    if (event.startingLevel !== context.startingLevel) {
      throw new Error("动态难度事件起始等级与当前训练会话不一致。");
    }
    if (
      !Number.isInteger(event.startingLevel) ||
      event.startingLevel < 1 ||
      event.startingLevel > 3 ||
      event.startingLevelSource !== "clinician_approved_plan" ||
      event.runtimeFrameId !==
        `${context.gameRunId}:cognitive-round-${windowRound.id}` ||
      event.runtimeWindowId !==
        `${context.gameRunId}:rounds:${windowRound.id}-${windowRound.id}` ||
      event.approvedPlanItemId !== context.approvedPlanItemId ||
      event.assessmentSourceId !== context.assessmentSourceId ||
      !Number.isFinite(adjustedAtMs) ||
      adjustedAtMs < windowRound.presentedAtMs ||
      adjustedAtMs > windowRound.completedAtMs
    ) {
      throw new Error("动态难度事件标识或调整时间不在真实窗口边界内。");
    }
    previousEventRoundIndex = roundIndex;
    eventByRoundIndex.set(roundIndex, event);
  }

  for (let roundIndex = 0; roundIndex < rounds.length - 1; roundIndex += 1) {
    const currentRound = rounds[roundIndex]!;
    const nextRound = rounds[roundIndex + 1]!;
    const metrics = measureCognitiveDifficultyWindow([currentRound]);
    const trigger = resolveCognitiveDifficultyTrigger(metrics);
    const expectedAfter = resolveCognitiveDifficultyAfter(
      currentRound.difficulty,
      trigger,
    );
    const event = eventByRoundIndex.get(roundIndex);
    if (expectedAfter) {
      if (
        !event ||
        !sameSnapshot(
          cognitiveDifficultySnapshot(expectedAfter),
          cognitiveDifficultySnapshot(nextRound.difficulty),
        )
      ) {
        throw new Error("动态难度事件缺失或后续实际难度未应用。");
      }
    } else if (
      event ||
      !sameSnapshot(
        cognitiveDifficultySnapshot(currentRound.difficulty),
        cognitiveDifficultySnapshot(nextRound.difficulty),
      )
    ) {
      throw new Error("动态难度边界轮次包含伪造变化或实际难度漂移。");
    }
  }
}

function readDifficultyEvidenceContext(trainingSession: TrainingSession) {
  const snapshot = trainingSession.runtimeConfigSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("动态难度证据缺少当前训练会话上下文。");
  }
  const config = snapshot as Record<string, unknown>;
  const approvedPlanItemId = readEvidenceText(config.approvedPlanItemId);
  const assessmentSourceId = readEvidenceText(config.assessmentSourceId);
  const startingLevelSource = readEvidenceText(config.startingLevelSource);
  const startingLevel = config.startingDifficultyLevel;
  if (
    !approvedPlanItemId ||
    approvedPlanItemId !== trainingSession.planItemId.trim() ||
    !assessmentSourceId ||
    startingLevelSource !== "clinician_approved_plan"
  ) {
    throw new Error("动态难度证据与当前训练会话身份不一致。");
  }
  if (
    !Number.isInteger(startingLevel) ||
    (startingLevel as number) < 1 ||
    (startingLevel as number) > 3
  ) {
    throw new Error("动态难度证据缺少当前训练会话起始等级。");
  }
  return {
    approvedPlanItemId,
    assessmentSourceId,
    startingLevel: startingLevel as number,
  };
}

function readEvidenceText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function countPositionMatches(
  answer: readonly string[],
  expected: readonly string[],
) {
  return expected.reduce(
    (count, value, index) => count + (answer[index] === value ? 1 : 0),
    0,
  );
}

function roundedRatio(value: number) {
  return Number(clamp(value, 0, 1).toFixed(3));
}

export function calculateCognitiveScore(
  rawAccuracy: number,
  rawCompletionRate: number,
) {
  return Math.round(clamp(rawAccuracy * 80 + rawCompletionRate * 20, 0, 100));
}

function average(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sameSnapshot(
  left: {
    speed: number;
    complexityLevel: number;
    sequenceLength: number;
    optionCount: number;
    presentationMs: number;
  },
  right: {
    speed: number;
    complexityLevel: number;
    sequenceLength: number;
    optionCount: number;
    presentationMs: number;
  },
) {
  return (
    left.speed === right.speed &&
    left.complexityLevel === right.complexityLevel &&
    left.sequenceLength === right.sequenceLength &&
    left.optionCount === right.optionCount &&
    left.presentationMs === right.presentationMs
  );
}

function sameWindowMetrics(
  left: {
    attemptCount: number;
    correctCount: number;
    accuracy: number;
    averageResponseTimeMs: number;
  },
  right: {
    attemptCount: number;
    correctCount: number;
    accuracy: number;
    averageResponseTimeMs: number;
  },
) {
  return (
    left.attemptCount === right.attemptCount &&
    left.correctCount === right.correctCount &&
    left.accuracy === right.accuracy &&
    left.averageResponseTimeMs === right.averageResponseTimeMs
  );
}

async function createTrainingPayloadHash(value: unknown) {
  if (!globalThis.crypto?.subtle) {
    throw new Error(resultIncompleteMessage);
  }
  const json = JSON.stringify(value);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(json),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}
