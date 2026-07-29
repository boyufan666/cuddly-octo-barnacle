import type { SubmitTrainingResultRequest } from "@/types/api";
import { dynamicDifficultyTriggerReasons } from "./dynamic-difficulty-evidence";

export const unityTrainingBridgeProtocolVersion = "1.0.0";
export const unityTrainingResultEventType = "training_result";
export const unityTrainingResultContractVersion = "rehab-unity-result-v2";
const requiredUnityMetricTypes = [
  "reaction_time_ms",
  "target_hit_rate",
  "arm_raise_accuracy",
  "duration_seconds",
  "difficulty_level",
] as const;

export type UnityTrainingResultBridgeEvent = {
  type: typeof unityTrainingResultEventType;
  action: typeof unityTrainingResultEventType;
  protocolVersion: typeof unityTrainingBridgeProtocolVersion;
  resultContractVersion: typeof unityTrainingResultContractVersion;
  sessionId: string;
  collectionBatchId: string;
  gameRunId: string;
  gameVersion: string;
  clientGeneratedAt: string;
  rawPayloadHash: string;
  score: number;
  completionRate: number;
  durationSeconds: number;
  reactionTimeMs: number;
  motionAccuracy: number;
  exerciseIntensity: SubmitTrainingResultRequest["exerciseIntensity"];
  metricsSummary: Record<string, unknown>;
  motionMetrics: SubmitTrainingResultRequest["motionMetrics"];
};

type ParseResult =
  | { ok: true; value: UnityTrainingResultBridgeEvent }
  | { ok: false; error: string };

export type UnityTrainingResultExpectedContext = {
  sessionId: string;
  gameRunId: string;
  gameVersion: string;
  collectionBatchId?: string | null;
};

export function toUnityRuntimeDurationSeconds(durationMinutes: number) {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Unity 训练缺少有效的已批准处方时长，不能启动正式训练。");
  }
  return durationMinutes * 60;
}

export function isExpectedUnityTrainingMessageSource(
  event: { origin: string; source: unknown },
  expectedOrigin: string,
  expectedSource: unknown,
) {
  return event.origin === expectedOrigin && event.source === expectedSource;
}

export function isUnityTrainingResultCandidate(value: unknown) {
  return (
    isPlainObject(value) &&
    (value.type === unityTrainingResultEventType ||
      value.action === unityTrainingResultEventType)
  );
}

export function parseUnityTrainingResultBridgeEvent(
  value: unknown,
  expected: UnityTrainingResultExpectedContext,
): ParseResult {
  if (!isPlainObject(value)) {
    return { ok: false, error: "桥接事件必须是对象。" };
  }

  const type = value.type;
  const action = value.action;
  const protocolVersion = value.protocolVersion;
  const sessionId = value.sessionId;

  if (type !== unityTrainingResultEventType || action !== unityTrainingResultEventType) {
    return {
      ok: false,
      error: "桥接事件 type 和 action 必须都是 training_result。",
    };
  }

  if (protocolVersion !== unityTrainingBridgeProtocolVersion) {
    return {
      ok: false,
      error: `桥接协议版本必须是 ${unityTrainingBridgeProtocolVersion}。`,
    };
  }

  if (value.resultContractVersion !== unityTrainingResultContractVersion) {
    return {
      ok: false,
      error: `桥接结果 resultContractVersion 必须是 ${unityTrainingResultContractVersion}。`,
    };
  }

  if (typeof sessionId !== "string" || !sessionId.trim()) {
    return { ok: false, error: "桥接事件缺少有效 sessionId。" };
  }

  if (sessionId !== expected.sessionId) {
    return { ok: false, error: "桥接事件 sessionId 与当前训练会话不一致。" };
  }

  if (!expected.collectionBatchId) {
    return { ok: false, error: "当前训练缺少准备记录，不能接收桥接结果。" };
  }

  const collectionBatchId = readRequiredExactString(value.collectionBatchId);
  if (!collectionBatchId) {
    return { ok: false, error: "桥接事件缺少有效 collectionBatchId。" };
  }
  if (collectionBatchId !== expected.collectionBatchId) {
    return { ok: false, error: "桥接事件训练准备记录与当前训练不一致。" };
  }

  const gameRunId = readRequiredString(value.gameRunId);
  if (!gameRunId) {
    return { ok: false, error: "桥接事件缺少有效 gameRunId。" };
  }
  if (gameRunId !== expected.gameRunId) {
    return { ok: false, error: "桥接事件 gameRunId 与当前训练会话不一致。" };
  }

  const gameVersion = readRequiredString(value.gameVersion);
  if (!gameVersion) {
    return { ok: false, error: "桥接事件缺少有效 gameVersion。" };
  }
  if (gameVersion !== expected.gameVersion) {
    return { ok: false, error: "桥接事件 gameVersion 与当前训练内容不一致。" };
  }

  const clientGeneratedAt = readRequiredString(value.clientGeneratedAt);
  if (!clientGeneratedAt || Number.isNaN(new Date(clientGeneratedAt).getTime())) {
    return { ok: false, error: "桥接事件缺少有效 clientGeneratedAt。" };
  }

  const rawPayloadHash = readRequiredString(value.rawPayloadHash);
  if (!rawPayloadHash) {
    return { ok: false, error: "桥接事件缺少有效 rawPayloadHash。" };
  }

  const score = readStrictFiniteNumber(value.score);
  if (score === undefined) {
    return { ok: false, error: "桥接事件缺少有效 score。" };
  }
  if (score < 0 || score > 100) {
    return { ok: false, error: "score 必须在 0 到 100 之间。" };
  }

  const completionRate = readStrictFiniteNumber(value.completionRate);
  if (completionRate === undefined) {
    return { ok: false, error: "桥接事件缺少有效 completionRate。" };
  }
  if (completionRate < 0 || completionRate > 1) {
    return { ok: false, error: "completionRate 必须在 0 到 1 之间。" };
  }

  const durationSeconds = readStrictFiniteNumber(value.durationSeconds);
  if (durationSeconds === undefined || durationSeconds <= 0) {
    return { ok: false, error: "桥接事件缺少有效 durationSeconds。" };
  }

  const reactionTimeMs = readStrictFiniteNumber(value.reactionTimeMs);
  if (reactionTimeMs === undefined || reactionTimeMs <= 0) {
    return { ok: false, error: "桥接事件缺少有效 reactionTimeMs。" };
  }

  const motionAccuracy = readStrictFiniteNumber(value.motionAccuracy);
  if (motionAccuracy === undefined) {
    return { ok: false, error: "桥接事件缺少有效 motionAccuracy。" };
  }
  if (motionAccuracy < 0 || motionAccuracy > 1) {
    return { ok: false, error: "motionAccuracy 必须在 0 到 1 之间。" };
  }

  const exerciseIntensity = value.exerciseIntensity;
  if (
    exerciseIntensity !== "low" &&
    exerciseIntensity !== "moderate" &&
    exerciseIntensity !== "high"
  ) {
    return {
      ok: false,
      error: "bridge 事件的 exerciseIntensity 必须是 low、moderate 或 high。",
    };
  }

  if (!isPlainObject(value.metricsSummary)) {
    return {
      ok: false,
      error: "桥接事件缺少 metricsSummary 对象。",
    };
  }
  if (value.metricsSummary.source !== "unity_webgl") {
    return {
      ok: false,
      error: "metricsSummary.source 必须是 unity_webgl。",
    };
  }
  if (
    value.metricsSummary.resultContractVersion !==
    unityTrainingResultContractVersion
  ) {
    return {
      ok: false,
      error: `metricsSummary.resultContractVersion 必须是 ${unityTrainingResultContractVersion}。`,
    };
  }
  const metricsSummaryCollectionBatchId = readRequiredExactString(
    value.metricsSummary.collectionBatchId,
  );
  if (!metricsSummaryCollectionBatchId) {
    return {
      ok: false,
      error: "metricsSummary 缺少有效 collectionBatchId。",
    };
  }
  if (metricsSummaryCollectionBatchId !== collectionBatchId) {
    return {
      ok: false,
      error: "metricsSummary.collectionBatchId 与桥接事件不一致。",
    };
  }
  const dynamicDifficultyEvidence = validateDynamicDifficultyEvidence(
    value.metricsSummary.dynamicDifficultyEvidence,
  );
  if (!dynamicDifficultyEvidence.ok) {
    return dynamicDifficultyEvidence;
  }

  if (!Array.isArray(value.motionMetrics) || value.motionMetrics.length === 0) {
    return {
      ok: false,
      error: "桥接事件缺少 motionMetrics 非空数组。",
    };
  }

  const motionMetrics = parseMotionMetrics(value.motionMetrics);
  if (!motionMetrics.ok) {
    return motionMetrics;
  }
  const requiredMetricCheck = validateRequiredUnityMetricTypes(
    motionMetrics.value,
  );
  if (!requiredMetricCheck.ok) {
    return requiredMetricCheck;
  }

  return {
    ok: true,
    value: {
      type: unityTrainingResultEventType,
      action: unityTrainingResultEventType,
      protocolVersion: unityTrainingBridgeProtocolVersion,
      resultContractVersion: unityTrainingResultContractVersion,
      sessionId,
      collectionBatchId,
      gameRunId,
      gameVersion,
      clientGeneratedAt,
      rawPayloadHash,
      score,
      completionRate,
      durationSeconds,
      reactionTimeMs,
      motionAccuracy,
      exerciseIntensity,
      metricsSummary: {
        ...value.metricsSummary,
        dynamicDifficultyEvidence: dynamicDifficultyEvidence.value,
      },
      motionMetrics: motionMetrics.value,
    },
  };
}

function validateDynamicDifficultyEvidence(
  value: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      error: "metricsSummary.dynamicDifficultyEvidence 必须是对象。",
    };
  }
  if (value.schemaVersion !== "1.0.0") {
    return {
      ok: false,
      error: "dynamicDifficultyEvidence.schemaVersion 必须是 1.0.0。",
    };
  }
  if (!Array.isArray(value.events) || value.events.length === 0) {
    return {
      ok: false,
      error: "dynamicDifficultyEvidence.events 必须是非空数组。",
    };
  }
  const normalizedEvents: Array<Record<string, unknown>> = [];
  for (let index = 0; index < value.events.length; index += 1) {
    const event = value.events[index];
    if (!isPlainObject(event)) {
      return {
        ok: false,
        error: `dynamicDifficultyEvidence.events 第 ${index + 1} 项必须是对象。`,
      };
    }
    const startingLevel = readStrictInteger(event.startingLevel);
    if (startingLevel === undefined || startingLevel < 1 || startingLevel > 3) {
      return {
        ok: false,
        error: `dynamicDifficultyEvidence.events 第 ${index + 1} 项 startingLevel 必须是 1 到 3 之间的整数。`,
      };
    }
    const startingLevelSource = readRequiredString(event.startingLevelSource);
    if (
      startingLevelSource !== "clinician_approved_plan" &&
      startingLevelSource !== "clinician_approved_assessment"
    ) {
      return {
        ok: false,
        error: `dynamicDifficultyEvidence.events 第 ${index + 1} 项 startingLevelSource 无效。`,
      };
    }
    const approvedPlanItemId = readRequiredString(event.approvedPlanItemId);
    if (!approvedPlanItemId) {
      return {
        ok: false,
        error: `dynamicDifficultyEvidence.events 第 ${index + 1} 项缺少 approvedPlanItemId。`,
      };
    }
    const assessmentSourceId = readRequiredString(event.assessmentSourceId);
    if (!assessmentSourceId) {
      return {
        ok: false,
        error: `dynamicDifficultyEvidence.events 第 ${index + 1} 项缺少 assessmentSourceId。`,
      };
    }
    const triggerReason = readRequiredString(event.triggerReason);
    if (
      !dynamicDifficultyTriggerReasons.includes(
        triggerReason as (typeof dynamicDifficultyTriggerReasons)[number],
      )
    ) {
      return {
        ok: false,
        error: `dynamicDifficultyEvidence.events 第 ${index + 1} 项 triggerReason 无效。`,
      };
    }
    const before = validateDifficultyLevelSnapshot(event.before, index, "before");
    if (!before.ok) return before;
    const after = validateDifficultyLevelSnapshot(event.after, index, "after");
    if (!after.ok) return after;
    const adjustedAt = readRequiredString(event.adjustedAt);
    if (!adjustedAt || Number.isNaN(new Date(adjustedAt).getTime())) {
      return {
        ok: false,
        error: `dynamicDifficultyEvidence.events 第 ${index + 1} 项 adjustedAt 无效。`,
      };
    }
    const runtimeFrameId = readRequiredString(event.runtimeFrameId);
    if (!runtimeFrameId) {
      return {
        ok: false,
        error: `dynamicDifficultyEvidence.events 第 ${index + 1} 项缺少 runtimeFrameId。`,
      };
    }
    const runtimeWindowId = readRequiredString(event.runtimeWindowId);
    if (!runtimeWindowId) {
      return {
        ok: false,
        error: `dynamicDifficultyEvidence.events 第 ${index + 1} 项缺少 runtimeWindowId。`,
      };
    }
    const unchanged =
      before.value.speed === after.value.speed &&
      before.value.complexityLevel === after.value.complexityLevel;
    const safetyClampReason = readOptionalString(event.safetyClampReason);
    if (safetyClampReason === null) {
      return {
        ok: false,
        error: `dynamicDifficultyEvidence.events 第 ${index + 1} 项 safetyClampReason 必须是字符串。`,
      };
    }
    if (unchanged && !safetyClampReason) {
      return {
        ok: false,
        error: `dynamicDifficultyEvidence.events 第 ${index + 1} 项难度未变化时必须填写 safetyClampReason。`,
      };
    }
    normalizedEvents.push({
      startingLevel,
      startingLevelSource,
      approvedPlanItemId,
      assessmentSourceId,
      triggerReason,
      before: before.value,
      after: after.value,
      adjustedAt,
      runtimeFrameId,
      runtimeWindowId,
      ...(safetyClampReason ? { safetyClampReason } : {}),
    });
  }
  return {
    ok: true,
    value: {
      schemaVersion: "1.0.0",
      events: normalizedEvents,
    },
  };
}

function validateDifficultyLevelSnapshot(
  value: unknown,
  index: number,
  label: "before" | "after",
):
  | { ok: true; value: { speed: number; complexityLevel: number } }
  | { ok: false; error: string } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      error: `dynamicDifficultyEvidence.events 第 ${index + 1} 项 ${label} 必须是对象。`,
    };
  }
  const speed = readStrictFiniteNumber(value.speed);
  if (speed === undefined || speed <= 0) {
    return {
      ok: false,
      error: `dynamicDifficultyEvidence.events 第 ${index + 1} 项 ${label}.speed 必须大于 0。`,
    };
  }
  const complexityLevel = readStrictInteger(value.complexityLevel);
  if (complexityLevel === undefined || complexityLevel < 1 || complexityLevel > 3) {
    return {
      ok: false,
      error: `dynamicDifficultyEvidence.events 第 ${index + 1} 项 ${label}.complexityLevel 必须是 1 到 3 之间的整数。`,
    };
  }
  return { ok: true, value: { speed, complexityLevel } };
}

function parseMotionMetrics(
  value: unknown[],
):
  | { ok: true; value: SubmitTrainingResultRequest["motionMetrics"] }
  | { ok: false; error: string } {
  const metrics: SubmitTrainingResultRequest["motionMetrics"] = [];

  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isPlainObject(item)) {
      return {
        ok: false,
        error: `motionMetrics 第 ${index + 1} 项必须是对象。`,
      };
    }
    if (typeof item.metricType !== "string" || !item.metricType.trim()) {
      return {
        ok: false,
        error: `motionMetrics 第 ${index + 1} 项缺少 metricType。`,
      };
    }
    if (
      typeof item.metricValue !== "number" ||
      !Number.isFinite(item.metricValue)
    ) {
      return {
        ok: false,
        error: `motionMetrics 第 ${index + 1} 项 metricValue 必须是有限数字。`,
      };
    }
    if (
      typeof item.confidence !== "number" ||
      !Number.isFinite(item.confidence)
    ) {
      return {
        ok: false,
        error: `motionMetrics 第 ${index + 1} 项 confidence 必须是有限数字。`,
      };
    }
    if (item.confidence < 0 || item.confidence > 1) {
      return {
        ok: false,
        error: `motionMetrics 第 ${index + 1} 项 confidence 必须在 0 到 1 之间。`,
      };
    }
    const rawSummary = item.rawSummary;
    if (rawSummary !== undefined && !isPlainObject(rawSummary)) {
      return {
        ok: false,
        error: `motionMetrics 第 ${index + 1} 项 rawSummary 必须是对象。`,
      };
    }
    const unit = readOptionalString(item.unit);
    const sampleCount = readOptionalFiniteNumber(item.sampleCount);
    if (item.sampleCount !== undefined) {
      if (sampleCount === undefined || !Number.isInteger(sampleCount) || sampleCount <= 0) {
        return {
          ok: false,
          error: `motionMetrics 第 ${index + 1} 项 sampleCount 必须是正整数。`,
        };
      }
    }
    const windowStartedAt = readOptionalString(item.windowStartedAt);
    if (!windowStartedAt) {
      return {
        ok: false,
        error: `motionMetrics 第 ${index + 1} 项缺少 windowStartedAt。`,
      };
    }
    if (Number.isNaN(new Date(windowStartedAt).getTime())) {
      return {
        ok: false,
        error: `motionMetrics 第 ${index + 1} 项 windowStartedAt 无效。`,
      };
    }
    const windowEndedAt = readOptionalString(item.windowEndedAt);
    if (!windowEndedAt) {
      return {
        ok: false,
        error: `motionMetrics 第 ${index + 1} 项缺少 windowEndedAt。`,
      };
    }
    if (Number.isNaN(new Date(windowEndedAt).getTime())) {
      return {
        ok: false,
        error: `motionMetrics 第 ${index + 1} 项 windowEndedAt 无效。`,
      };
    }
    if (
      new Date(windowStartedAt).getTime() > new Date(windowEndedAt).getTime()
    ) {
      return {
        ok: false,
        error: `motionMetrics 第 ${index + 1} 项采样窗口开始时间不能晚于结束时间。`,
      };
    }
    const qualityFlag = readOptionalString(item.qualityFlag);
    const bodyPart = readOptionalString(item.bodyPart);
    const jointName = readOptionalString(item.jointName);

    const metric: SubmitTrainingResultRequest["motionMetrics"][number] = {
      metricType: item.metricType.trim(),
      metricValue: item.metricValue,
      confidence: item.confidence,
    };
    if (unit) {
      metric.unit = unit;
    }
    if (sampleCount !== undefined) {
      metric.sampleCount = sampleCount;
    }
    metric.windowStartedAt = windowStartedAt;
    metric.windowEndedAt = windowEndedAt;
    if (qualityFlag) {
      metric.qualityFlag = qualityFlag;
    }
    if (bodyPart) {
      metric.bodyPart = bodyPart;
    }
    if (jointName) {
      metric.jointName = jointName;
    }
    if (rawSummary !== undefined) {
      metric.rawSummary = rawSummary;
    }
    metrics.push(metric);
  }

  return { ok: true, value: metrics };
}

function validateRequiredUnityMetricTypes(
  metrics: SubmitTrainingResultRequest["motionMetrics"],
): { ok: true } | { ok: false; error: string } {
  const metricTypes = new Set(metrics.map((metric) => metric.metricType));
  const missingMetricTypes = requiredUnityMetricTypes.filter(
    (metricType) => !metricTypes.has(metricType),
  );
  if (missingMetricTypes.length) {
    return {
      ok: false,
      error: `Unity 正式训练结果缺少必需动作指标：${missingMetricTypes.join(", ")}。`,
    };
  }
  return { ok: true };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStrictFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readStrictInteger(value: unknown) {
  const number = readStrictFiniteNumber(value);
  return number !== undefined && Number.isInteger(number) ? number : undefined;
}

function readOptionalFiniteNumber(value: unknown) {
  if (value === undefined) return undefined;
  return readStrictFiniteNumber(value);
}

function readRequiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRequiredExactString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readOptionalString(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  return value.trim() ? value.trim() : undefined;
}
