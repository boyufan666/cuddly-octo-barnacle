export const dynamicDifficultyTriggerReasons = [
  "prior_assessment",
  "reaction_slow",
  "accuracy_high",
  "accuracy_low",
  "fatigue_risk",
  "clinician_limit",
] as const;

export type DynamicDifficultyTriggerReason =
  (typeof dynamicDifficultyTriggerReasons)[number];

export type DynamicDifficultyEvidenceEvent = {
  startingLevel: number;
  startingLevelSource: "clinician_approved_plan" | "clinician_approved_assessment";
  approvedPlanItemId: string;
  assessmentSourceId: string;
  triggerReason: DynamicDifficultyTriggerReason;
  before: {
    speed: number;
    complexityLevel: number;
    targetSizeScale: number;
    minimumLandmarkVisibility: number;
    holdDurationScale: number;
    targetIntervalMs: number;
    targetLifetimeMs: number;
  };
  after: {
    speed: number;
    complexityLevel: number;
    targetSizeScale: number;
    minimumLandmarkVisibility: number;
    holdDurationScale: number;
    targetIntervalMs: number;
    targetLifetimeMs: number;
  };
  metricsWindow: {
    windowStartedAt: string;
    windowEndedAt: string;
    hitCount: number;
    missCount: number;
    sampleCount: number;
    validFrameCount: number;
    averageReactionTimeMs: number;
    completionRate: number;
    validFrameRatio: number;
    motionAccuracy: number;
  };
  adjustedAt: string;
  runtimeFrameId: string;
  runtimeWindowId: string;
  safetyClampReason?: string;
};

export type DynamicDifficultyRuntimeParameters =
  DynamicDifficultyEvidenceEvent["before"];

export type DynamicDifficultyEvidence = {
  schemaVersion: "1.0.0";
  events: DynamicDifficultyEvidenceEvent[];
};

export function buildBrowserPoseDynamicDifficultyEvidence({
  events,
  approvedPlanItemId,
  gameRunId,
  generatedAt,
}: {
  events: DynamicDifficultyEvidenceEvent[];
  approvedPlanItemId: string;
  gameRunId: string;
  generatedAt: string;
}): DynamicDifficultyEvidence {
  requireText(approvedPlanItemId, "已批准方案项目");
  requireText(gameRunId, "训练运行标识");
  requireUtcIso(generatedAt, "结果生成时间");
  if (!events.length) {
    throw new Error("训练结果缺少运行中动态难度事件，不能生成正式结果。");
  }

  let previousEvent: DynamicDifficultyEvidenceEvent | undefined;
  for (const [index, event] of events.entries()) {
    validateEvent(event, {
      index,
      approvedPlanItemId,
      gameRunId,
      generatedAt,
      previousEvent,
    });
    previousEvent = event;
  }

  return {
    schemaVersion: "1.0.0",
    events: events.map(copyEvent),
  };
}

function validateEvent(
  event: DynamicDifficultyEvidenceEvent,
  context: {
    index: number;
    approvedPlanItemId: string;
    gameRunId: string;
    generatedAt: string;
    previousEvent?: DynamicDifficultyEvidenceEvent;
  },
) {
  const label = `动态难度事件 ${context.index + 1}`;
  if (!Number.isInteger(event.startingLevel) || event.startingLevel < 1 || event.startingLevel > 3) {
    throw new Error(`${label}的初始等级非法。`);
  }
  if (event.startingLevelSource !== "clinician_approved_plan") {
    throw new Error(`${label}缺少医师批准方案来源。`);
  }
  if (event.approvedPlanItemId !== context.approvedPlanItemId) {
    throw new Error(`${label}的方案项目身份不一致。`);
  }
  requireText(event.assessmentSourceId, `${label}的评估来源`);
  if (!dynamicDifficultyTriggerReasons.includes(event.triggerReason)) {
    throw new Error(`${label}的触发原因非法。`);
  }
  validateParameters(event.before, `${label}.before`);
  validateParameters(event.after, `${label}.after`);
  validateMetricsWindow(event.metricsWindow, label);
  requireUtcIso(event.adjustedAt, `${label}调整时间`);
  if (event.metricsWindow.windowEndedAt !== event.adjustedAt) {
    throw new Error(`${label}的窗口结束时间必须等于真实调整时间。`);
  }
  if (Date.parse(event.adjustedAt) > Date.parse(context.generatedAt)) {
    throw new Error(`${label}的调整时间不能晚于结果生成时间。`);
  }
  if (!event.runtimeFrameId.startsWith(`${context.gameRunId}:frame:`)) {
    throw new Error(`${label}的运行帧身份不属于当前训练。`);
  }
  if (!event.runtimeWindowId.startsWith(`${context.gameRunId}:difficulty-window:`)) {
    throw new Error(`${label}的指标窗口身份不属于当前训练。`);
  }
  const unchanged = sameParameters(event.before, event.after);
  if (unchanged && !event.safetyClampReason?.trim()) {
    throw new Error(`${label}参数未变化时必须记录安全限制原因。`);
  }
  if (!unchanged && event.safetyClampReason) {
    throw new Error(`${label}参数已变化时不能伪造安全限制原因。`);
  }
  if (context.previousEvent) {
    if (!sameParameters(context.previousEvent.after, event.before)) {
      throw new Error(`${label}的 before 与上一事件 after 不连续。`);
    }
    if (
      Date.parse(event.metricsWindow.windowStartedAt) <
      Date.parse(context.previousEvent.metricsWindow.windowEndedAt)
    ) {
      throw new Error(`${label}的指标窗口与上一事件重叠。`);
    }
  }
}

function validateParameters(
  parameters: DynamicDifficultyRuntimeParameters,
  label: string,
) {
  for (const [name, value] of Object.entries(parameters)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${label}.${name} 必须是正数。`);
    }
  }
  if (
    !Number.isInteger(parameters.complexityLevel) ||
    parameters.complexityLevel < 1 ||
    parameters.complexityLevel > 3
  ) {
    throw new Error(`${label}.complexityLevel 必须是 1 到 3 的整数。`);
  }
  if (parameters.minimumLandmarkVisibility > 1) {
    throw new Error(`${label}.minimumLandmarkVisibility 不能超过 1。`);
  }
}

function validateMetricsWindow(
  metrics: DynamicDifficultyEvidenceEvent["metricsWindow"],
  label: string,
) {
  requireUtcIso(metrics.windowStartedAt, `${label}窗口开始时间`);
  requireUtcIso(metrics.windowEndedAt, `${label}窗口结束时间`);
  if (Date.parse(metrics.windowStartedAt) >= Date.parse(metrics.windowEndedAt)) {
    throw new Error(`${label}的指标窗口时间顺序非法。`);
  }
  for (const [name, value] of [
    ["hitCount", metrics.hitCount],
    ["missCount", metrics.missCount],
    ["sampleCount", metrics.sampleCount],
    ["validFrameCount", metrics.validFrameCount],
    ["averageReactionTimeMs", metrics.averageReactionTimeMs],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${label}.${name} 必须是非负整数。`);
    }
  }
  if (metrics.hitCount + metrics.missCount < 4) {
    throw new Error(`${label}没有达到真实动态难度窗口大小。`);
  }
  if (metrics.validFrameCount > metrics.sampleCount) {
    throw new Error(`${label}的有效帧数不能超过采样帧数。`);
  }
  for (const [name, value] of [
    ["completionRate", metrics.completionRate],
    ["validFrameRatio", metrics.validFrameRatio],
    ["motionAccuracy", metrics.motionAccuracy],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${label}.${name} 必须位于 0 到 1。`);
    }
  }
}

function copyEvent(event: DynamicDifficultyEvidenceEvent) {
  return {
    ...event,
    before: { ...event.before },
    after: { ...event.after },
    metricsWindow: { ...event.metricsWindow },
  };
}

function sameParameters(
  left: DynamicDifficultyRuntimeParameters,
  right: DynamicDifficultyRuntimeParameters,
) {
  return (Object.keys(left) as Array<keyof DynamicDifficultyRuntimeParameters>).every(
    (key) => left[key] === right[key],
  );
}

function requireText(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label}缺失。`);
}

function requireUtcIso(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label}不是有效 UTC 时间。`);
  }
}
