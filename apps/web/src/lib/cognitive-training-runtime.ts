import type { DynamicDifficultyTriggerReason } from "./dynamic-difficulty-evidence";

const cognitiveSymbols = ["蓝", "绿", "黄", "红", "紫", "橙", "白"] as const;
const difficultyWindowSize = 1;

export type CognitiveDifficulty = {
  level: number;
  sequenceLength: number;
  optionCount: number;
  presentationMs: number;
};

const difficultyLadder: readonly CognitiveDifficulty[] = [
  { level: 1, sequenceLength: 2, optionCount: 3, presentationMs: 3_800 },
  { level: 1, sequenceLength: 3, optionCount: 4, presentationMs: 3_200 },
  { level: 2, sequenceLength: 4, optionCount: 5, presentationMs: 2_600 },
  { level: 3, sequenceLength: 5, optionCount: 6, presentationMs: 2_000 },
  { level: 3, sequenceLength: 6, optionCount: 7, presentationMs: 1_500 },
];

export type CognitiveRound = {
  id: string;
  sequence: string[];
  options: string[];
  difficulty: CognitiveDifficulty;
  presentedAtMs: number;
};

export type CognitiveRoundResult = {
  id: string;
  sequence: readonly string[];
  answers: readonly string[];
  difficulty: CognitiveDifficulty;
  difficultyLevel: number;
  presentedAtMs: number;
  answerStartedAtMs: number;
  completedAtMs: number;
};

export type CognitiveDifficultySnapshot = {
  speed: number;
  complexityLevel: number;
  sequenceLength: number;
  optionCount: number;
  presentationMs: number;
};

export type CognitiveDifficultyAdjustmentEvent = {
  startingLevel: number;
  startingLevelSource: "clinician_approved_plan";
  approvedPlanItemId: string;
  assessmentSourceId: string;
  triggerReason: DynamicDifficultyTriggerReason;
  before: CognitiveDifficultySnapshot;
  after: CognitiveDifficultySnapshot;
  windowRoundIds: string[];
  windowMetrics: CognitiveDifficultyWindowMetrics;
  adjustedAt: string;
  runtimeFrameId: string;
  runtimeWindowId: string;
};

export type CognitiveDifficultyWindowMetrics = {
  attemptCount: number;
  correctCount: number;
  accuracy: number;
  averageResponseTimeMs: number;
};

export function requireCognitiveDurationSeconds(durationMinutes: number) {
  const durationSeconds = durationMinutes * 60;
  if (
    !Number.isSafeInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    !Number.isSafeInteger(durationSeconds)
  ) {
    throw new Error("处方训练时长无效，不能启动认知训练。");
  }
  return durationSeconds;
}

export function requireCognitiveClientStartedAt(value: unknown) {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error("训练会话 clientStartedAt 必须是精确 canonical ISO 时间。");
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) {
    throw new Error("训练会话 clientStartedAt 必须是精确 canonical ISO 时间。");
  }
  return { ms, iso: value };
}

export function isCognitivePrescriptionComplete(
  startedAtMs: number,
  nowMs: number,
  prescribedDurationSeconds: number,
) {
  if (
    !Number.isFinite(startedAtMs) ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(prescribedDurationSeconds) ||
    prescribedDurationSeconds <= 0
  ) {
    throw new Error("认知训练时钟信息无效。");
  }
  return nowMs - startedAtMs >= prescribedDurationSeconds * 1_000;
}

export function cognitiveDifficultyForLevel(
  level: number,
): CognitiveDifficulty {
  if (!Number.isInteger(level) || level < 1 || level > 3) {
    throw new Error("认知训练难度等级必须是 1 到 3 的整数。");
  }
  const ladderIndex = level === 1 ? 1 : level === 2 ? 2 : 3;
  return { ...difficultyLadder[ladderIndex]! };
}

export function createCognitiveRound({
  roundNumber,
  difficulty,
  nowMs,
  random = Math.random,
}: {
  roundNumber: number;
  difficulty: CognitiveDifficulty;
  nowMs: number;
  random?: () => number;
}): CognitiveRound {
  if (
    !Number.isInteger(roundNumber) ||
    roundNumber < 1 ||
    !Number.isFinite(nowMs)
  ) {
    throw new Error("认知训练轮次信息无效。");
  }
  const availableSymbols = cognitiveSymbols.slice(0, difficulty.optionCount);
  if (
    availableSymbols.length !== difficulty.optionCount ||
    difficulty.sequenceLength >= difficulty.optionCount
  ) {
    throw new Error("认知训练难度参数无效。");
  }
  const options = shuffleRandom(availableSymbols, random);
  const sequence = shuffleRandom(options, random).slice(
    0,
    difficulty.sequenceLength,
  );
  return {
    id: `round-${roundNumber}`,
    sequence,
    options,
    difficulty: { ...difficulty },
    presentedAtMs: nowMs,
  };
}

export function createCognitiveRoundResult({
  round,
  answers,
  answerStartedAtMs,
  completedAtMs,
}: {
  round: CognitiveRound;
  answers: readonly string[];
  answerStartedAtMs: number;
  completedAtMs: number;
}): CognitiveRoundResult {
  return {
    id: round.id,
    sequence: [...round.sequence],
    answers: [...answers],
    difficulty: { ...round.difficulty },
    difficultyLevel: round.difficulty.level,
    presentedAtMs: round.presentedAtMs,
    answerStartedAtMs,
    completedAtMs,
  };
}

export function appendCognitiveAnswer(
  current: readonly string[],
  value: string,
  maxLength: number,
) {
  if (current.length >= maxLength || current.includes(value)) return current;
  return [...current, value];
}

export function createCognitiveDifficultyAdjustment({
  rounds,
  startingLevel,
  currentDifficulty,
  approvedPlanItemId,
  assessmentSourceId,
  gameRunId,
  adjustedAt,
}: {
  rounds: readonly CognitiveRoundResult[];
  startingLevel: number;
  currentDifficulty: CognitiveDifficulty;
  approvedPlanItemId: string;
  assessmentSourceId: string;
  gameRunId: string;
  adjustedAt: string;
}): CognitiveDifficultyAdjustmentEvent | null {
  if (rounds.length !== difficultyWindowSize) {
    throw new Error(
      `动态难度窗口必须包含 ${difficultyWindowSize} 个已完成轮次。`,
    );
  }
  cognitiveDifficultyForLevel(startingLevel);
  const currentLadderIndex = difficultyLadder.findIndex((difficulty) =>
    sameDifficulty(difficulty, currentDifficulty),
  );
  if (currentLadderIndex === -1) {
    throw new Error("认知训练当前难度参数无效。");
  }
  if (
    rounds.some((round) => !sameDifficulty(round.difficulty, currentDifficulty))
  ) {
    throw new Error("动态难度窗口轮次与当前实际难度不一致。");
  }
  const windowMetrics = measureCognitiveDifficultyWindow(rounds);
  const triggerReason = resolveCognitiveDifficultyTrigger(windowMetrics);
  const after = resolveCognitiveDifficultyAfter(
    currentDifficulty,
    triggerReason,
  );
  if (!after) return null;
  const before = difficultyLadder[currentLadderIndex]!;
  const firstRound = rounds[0];
  const lastRound = rounds[rounds.length - 1];
  if (!firstRound || !lastRound) {
    throw new Error("动态难度窗口缺少已完成轮次。");
  }
  const canonicalGameRunId = requireText(gameRunId);
  return {
    startingLevel,
    startingLevelSource: "clinician_approved_plan",
    approvedPlanItemId: requireText(approvedPlanItemId),
    assessmentSourceId: requireText(assessmentSourceId),
    triggerReason,
    before: cognitiveDifficultySnapshot(before),
    after: cognitiveDifficultySnapshot(after),
    windowRoundIds: rounds.map((round) => round.id),
    windowMetrics,
    adjustedAt: requireText(adjustedAt),
    runtimeFrameId: `${canonicalGameRunId}:cognitive-round-${lastRound.id}`,
    runtimeWindowId: `${canonicalGameRunId}:rounds:${firstRound.id}-${lastRound.id}`,
  };
}

export function measureCognitiveDifficultyWindow(
  rounds: readonly CognitiveRoundResult[],
): CognitiveDifficultyWindowMetrics {
  if (!rounds.length) throw new Error("动态难度窗口不能为空。");
  const attemptCount = rounds.reduce(
    (sum, round) => sum + round.answers.length,
    0,
  );
  if (attemptCount <= 0) throw new Error("动态难度窗口缺少真实作答。");
  const correctCount = rounds.reduce(
    (sum, round) =>
      sum +
      round.sequence.reduce(
        (count, value, index) =>
          count + (round.answers[index] === value ? 1 : 0),
        0,
      ),
    0,
  );
  const responseTimes = rounds.map((round) => {
    if (
      !Number.isFinite(round.answerStartedAtMs) ||
      !Number.isFinite(round.completedAtMs) ||
      round.completedAtMs < round.answerStartedAtMs
    ) {
      throw new Error("认知训练轮次响应时间无效。");
    }
    return round.completedAtMs - round.answerStartedAtMs;
  });
  const totalResponseTimeMs = rounds.reduce(
    (sum, _round, index) => sum + responseTimes[index]!,
    0,
  );
  return {
    attemptCount,
    correctCount,
    accuracy: correctCount / attemptCount,
    averageResponseTimeMs: totalResponseTimeMs / attemptCount,
  };
}

export function resolveCognitiveDifficultyTrigger(
  metrics: CognitiveDifficultyWindowMetrics,
): Extract<
  DynamicDifficultyTriggerReason,
  "accuracy_high" | "accuracy_low" | "reaction_slow"
> {
  if (metrics.averageResponseTimeMs > 2_500) return "reaction_slow";
  if (metrics.accuracy >= 0.8) return "accuracy_high";
  return "accuracy_low";
}

export function resolveCognitiveDifficultyAfter(
  currentDifficulty: CognitiveDifficulty,
  triggerReason: Extract<
    DynamicDifficultyTriggerReason,
    "accuracy_high" | "accuracy_low" | "reaction_slow"
  >,
) {
  const currentLadderIndex = difficultyLadder.findIndex((difficulty) =>
    sameDifficulty(difficulty, currentDifficulty),
  );
  if (currentLadderIndex === -1) {
    throw new Error("认知训练当前难度参数无效。");
  }
  const targetLadderIndex =
    currentLadderIndex + (triggerReason === "accuracy_high" ? 1 : -1);
  const target = difficultyLadder[targetLadderIndex];
  return target ? { ...target } : null;
}

export function cognitiveDifficultySnapshot(
  difficulty: CognitiveDifficulty,
): CognitiveDifficultySnapshot {
  requireCognitiveDifficulty(difficulty);
  return {
    speed: Number((3_200 / difficulty.presentationMs).toFixed(3)),
    complexityLevel: difficulty.level,
    sequenceLength: difficulty.sequenceLength,
    optionCount: difficulty.optionCount,
    presentationMs: difficulty.presentationMs,
  };
}

export function requireCognitiveDifficulty(
  difficulty: CognitiveDifficulty,
): CognitiveDifficulty {
  if (
    !difficultyLadder.some((candidate) => sameDifficulty(candidate, difficulty))
  ) {
    throw new Error("认知训练当前难度参数无效。");
  }
  return difficulty;
}

function sameDifficulty(left: CognitiveDifficulty, right: CognitiveDifficulty) {
  return (
    left.level === right.level &&
    left.sequenceLength === right.sequenceLength &&
    left.optionCount === right.optionCount &&
    left.presentationMs === right.presentationMs
  );
}

function shuffleRandom<T>(values: readonly T[], random: () => number) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomValue = random();
    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
      throw new Error("认知训练随机数必须在 0（含）到 1（不含）之间。");
    }
    const swapIndex = Math.floor(randomValue * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex]!,
      shuffled[index]!,
    ];
  }
  return shuffled;
}

function requireText(value: string) {
  if (!value.trim()) throw new Error("动态难度证据信息不完整。");
  return value.trim();
}
