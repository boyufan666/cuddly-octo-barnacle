import type {
  DynamicDifficultyEvidenceEvent,
  DynamicDifficultyRuntimeParameters,
  DynamicDifficultyTriggerReason,
} from "./dynamic-difficulty-evidence";

const browserPoseDifficultyWindowTargetCount = 4;

export type BrowserPoseRuntimeDifficultyState = {
  startingLevel: number;
  currentLevel: number;
  currentParameters: DynamicDifficultyRuntimeParameters;
  approvedPlanItemId: string;
  assessmentSourceId: string;
  gameRunId: string;
  startedAtMs: number;
  startedAtIso: string;
  baseTargetIntervalMs: number;
  baseTargetLifetimeMs: number;
  events: DynamicDifficultyEvidenceEvent[];
  windowBaseline: {
    startedAtMs: number;
    hits: number;
    misses: number;
    sampleCount: number;
    validFrameCount: number;
    reactionCount: number;
  };
};

export type BrowserPoseDifficultyCumulativeMetrics = {
  timestampMs: number;
  hits: number;
  misses: number;
  sampleCount: number;
  validFrameCount: number;
  reactionTimes: number[];
};

export function createBrowserPoseRuntimeDifficulty({
  startingLevel,
  approvedPlanItemId,
  assessmentSourceId,
  gameRunId,
  startedAtMs,
  startedAtIso,
  baseTargetIntervalMs,
  baseTargetLifetimeMs,
}: {
  startingLevel: number;
  approvedPlanItemId: string;
  assessmentSourceId: string;
  gameRunId: string;
  startedAtMs: number;
  startedAtIso: string;
  baseTargetIntervalMs: number;
  baseTargetLifetimeMs: number;
}): BrowserPoseRuntimeDifficultyState {
  requireDifficultyLevel(startingLevel);
  requireText(approvedPlanItemId, "已批准方案项目");
  requireText(assessmentSourceId, "已批准评估来源");
  requireText(gameRunId, "训练运行标识");
  requireFiniteTimestamp(startedAtMs, "训练开始时间");
  requireUtcIso(startedAtIso, "训练开始时间");
  requirePositiveNumber(baseTargetIntervalMs, "目标间隔");
  requirePositiveNumber(baseTargetLifetimeMs, "目标存活时间");

  return {
    startingLevel,
    currentLevel: startingLevel,
    currentParameters: parametersForLevel(
      startingLevel,
      baseTargetIntervalMs,
      baseTargetLifetimeMs,
    ),
    approvedPlanItemId,
    assessmentSourceId,
    gameRunId,
    startedAtMs,
    startedAtIso,
    baseTargetIntervalMs,
    baseTargetLifetimeMs,
    events: [],
    windowBaseline: {
      startedAtMs,
      hits: 0,
      misses: 0,
      sampleCount: 0,
      validFrameCount: 0,
      reactionCount: 0,
    },
  };
}

export function maybeUpdateBrowserPoseRuntimeDifficulty(
  state: BrowserPoseRuntimeDifficultyState,
  cumulative: BrowserPoseDifficultyCumulativeMetrics,
) {
  validateCumulativeMetrics(state, cumulative);
  const windowHitCount = cumulative.hits - state.windowBaseline.hits;
  const windowMissCount = cumulative.misses - state.windowBaseline.misses;
  if (
    windowHitCount + windowMissCount <
    browserPoseDifficultyWindowTargetCount
  ) {
    return undefined;
  }

  const windowSampleCount =
    cumulative.sampleCount - state.windowBaseline.sampleCount;
  const windowValidFrameCount =
    cumulative.validFrameCount - state.windowBaseline.validFrameCount;
  const windowReactionTimes = cumulative.reactionTimes.slice(
    state.windowBaseline.reactionCount,
  );
  const completionRate = ratio(
    windowHitCount,
    windowHitCount + windowMissCount,
  );
  const validFrameRatio = ratio(windowValidFrameCount, windowSampleCount);
  const motionAccuracy = clamp(
    completionRate * 0.8 + validFrameRatio * 0.2,
    0,
    1,
  );
  const averageReactionTimeMs = Math.round(average(windowReactionTimes));
  const triggerReason = resolveTriggerReason({
    averageReactionTimeMs,
    completionRate,
    motionAccuracy,
  });
  const beforeLevel = state.currentLevel;
  const afterLevel = clampLevel(
    beforeLevel + levelDeltaForTrigger(triggerReason),
  );
  const before = state.currentParameters;
  const after = parametersForLevel(
    afterLevel,
    state.baseTargetIntervalMs,
    state.baseTargetLifetimeMs,
  );
  const windowIndex = state.events.length + 1;
  const adjustedAt = timestampToIso(state, cumulative.timestampMs);
  const event: DynamicDifficultyEvidenceEvent = {
    startingLevel: state.startingLevel,
    startingLevelSource: "clinician_approved_plan",
    approvedPlanItemId: state.approvedPlanItemId,
    assessmentSourceId: state.assessmentSourceId,
    triggerReason,
    before,
    after,
    metricsWindow: {
      windowStartedAt: timestampToIso(
        state,
        state.windowBaseline.startedAtMs,
      ),
      windowEndedAt: adjustedAt,
      hitCount: windowHitCount,
      missCount: windowMissCount,
      sampleCount: windowSampleCount,
      validFrameCount: windowValidFrameCount,
      averageReactionTimeMs,
      completionRate: roundRatio(completionRate),
      validFrameRatio: roundRatio(validFrameRatio),
      motionAccuracy: roundRatio(motionAccuracy),
    },
    adjustedAt,
    runtimeFrameId: `${state.gameRunId}:frame:${Math.round(cumulative.timestampMs)}`,
    runtimeWindowId: `${state.gameRunId}:difficulty-window:${windowIndex}:${Math.round(
      state.windowBaseline.startedAtMs,
    )}-${Math.round(cumulative.timestampMs)}`,
    ...(afterLevel === beforeLevel
      ? { safetyClampReason: safetyClampReason(beforeLevel, triggerReason) }
      : {}),
  };

  state.currentLevel = afterLevel;
  state.currentParameters = after;
  state.events.push(event);
  state.windowBaseline = {
    startedAtMs: cumulative.timestampMs,
    hits: cumulative.hits,
    misses: cumulative.misses,
    sampleCount: cumulative.sampleCount,
    validFrameCount: cumulative.validFrameCount,
    reactionCount: cumulative.reactionTimes.length,
  };
  return event;
}

function parametersForLevel(
  level: number,
  baseTargetIntervalMs: number,
  baseTargetLifetimeMs: number,
): DynamicDifficultyRuntimeParameters {
  const levelParameters = {
    1: {
      speed: 0.8,
      targetSizeScale: 1.15,
      minimumLandmarkVisibility: 0.4,
      holdDurationScale: 0.85,
    },
    2: {
      speed: 1,
      targetSizeScale: 1,
      minimumLandmarkVisibility: 0.45,
      holdDurationScale: 1,
    },
    3: {
      speed: 1.2,
      targetSizeScale: 0.85,
      minimumLandmarkVisibility: 0.5,
      holdDurationScale: 1.15,
    },
  }[level];
  if (!levelParameters) {
    throw new Error("运行中动态难度等级非法，训练已停止。");
  }
  return {
    speed: levelParameters.speed,
    complexityLevel: level,
    targetSizeScale: levelParameters.targetSizeScale,
    minimumLandmarkVisibility: levelParameters.minimumLandmarkVisibility,
    holdDurationScale: levelParameters.holdDurationScale,
    targetIntervalMs: Math.round(baseTargetIntervalMs / levelParameters.speed),
    targetLifetimeMs: Math.round(baseTargetLifetimeMs / levelParameters.speed),
  };
}

function resolveTriggerReason({
  averageReactionTimeMs,
  completionRate,
  motionAccuracy,
}: {
  averageReactionTimeMs: number;
  completionRate: number;
  motionAccuracy: number;
}): DynamicDifficultyTriggerReason {
  if (averageReactionTimeMs >= 1_100) return "reaction_slow";
  if (completionRate >= 0.9 && motionAccuracy >= 0.88) {
    return "accuracy_high";
  }
  if (completionRate < 0.7 || motionAccuracy < 0.72) return "accuracy_low";
  return "clinician_limit";
}

function levelDeltaForTrigger(triggerReason: DynamicDifficultyTriggerReason) {
  if (triggerReason === "accuracy_high") return 1;
  if (
    triggerReason === "reaction_slow" ||
    triggerReason === "accuracy_low" ||
    triggerReason === "fatigue_risk"
  ) {
    return -1;
  }
  return 0;
}

function safetyClampReason(
  level: number,
  triggerReason: DynamicDifficultyTriggerReason,
) {
  if (level === 3 && triggerReason === "accuracy_high") {
    return "clinician_limit:max_complexity";
  }
  if (
    level === 1 &&
    (triggerReason === "reaction_slow" ||
      triggerReason === "accuracy_low" ||
      triggerReason === "fatigue_risk")
  ) {
    return "clinician_limit:min_complexity";
  }
  return "clinician_limit:no_runtime_change";
}

function validateCumulativeMetrics(
  state: BrowserPoseRuntimeDifficultyState,
  cumulative: BrowserPoseDifficultyCumulativeMetrics,
) {
  requireFiniteTimestamp(cumulative.timestampMs, "动态难度窗口结束时间");
  if (cumulative.timestampMs <= state.windowBaseline.startedAtMs) {
    throw new Error("动态难度指标窗口时间非法，训练已停止。");
  }
  for (const [label, value, baseline] of [
    ["命中数", cumulative.hits, state.windowBaseline.hits],
    ["未命中数", cumulative.misses, state.windowBaseline.misses],
    ["采样帧数", cumulative.sampleCount, state.windowBaseline.sampleCount],
    ["有效帧数", cumulative.validFrameCount, state.windowBaseline.validFrameCount],
  ] as const) {
    if (!Number.isInteger(value) || value < baseline) {
      throw new Error(`动态难度窗口${label}非法，训练已停止。`);
    }
  }
  if (cumulative.validFrameCount > cumulative.sampleCount) {
    throw new Error("动态难度窗口有效帧数不能超过采样帧数。");
  }
  if (
    cumulative.reactionTimes.length < state.windowBaseline.reactionCount ||
    cumulative.reactionTimes.some(
      (value) => !Number.isFinite(value) || value < 0,
    )
  ) {
    throw new Error("动态难度窗口反应时间非法，训练已停止。");
  }
}

function timestampToIso(
  state: BrowserPoseRuntimeDifficultyState,
  timestampMs: number,
) {
  return new Date(
    Date.parse(state.startedAtIso) + (timestampMs - state.startedAtMs),
  ).toISOString();
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? clamp(numerator / denominator, 0, 1) : 0;
}

function roundRatio(value: number) {
  return Number(value.toFixed(3));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampLevel(level: number) {
  return Math.min(3, Math.max(1, level));
}

function requireDifficultyLevel(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 3) {
    throw new Error("已批准的初始动态难度等级非法，训练不能启动。");
  }
}

function requireText(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label}缺失，训练不能启动。`);
}

function requireFiniteTimestamp(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label}非法，训练不能启动。`);
}

function requireUtcIso(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label}不是有效 UTC 时间，训练不能启动。`);
  }
}

function requirePositiveNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}非法，训练不能启动。`);
  }
}
