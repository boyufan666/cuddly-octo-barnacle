import type { SubmitTrainingResultRequest } from "@/types/api";

export const unityTrainingBridgeProtocolVersion = "1.0.0";
export const unityTrainingResultEventType = "training_result";

export type UnityTrainingResultBridgeEvent = {
  type: typeof unityTrainingResultEventType;
  action: typeof unityTrainingResultEventType;
  protocolVersion: typeof unityTrainingBridgeProtocolVersion;
  sessionId: string;
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

export function isUnityTrainingResultCandidate(value: unknown) {
  return (
    isPlainObject(value) &&
    (value.type === unityTrainingResultEventType ||
      value.action === unityTrainingResultEventType)
  );
}

export function parseUnityTrainingResultBridgeEvent(
  value: unknown,
  currentSessionId: string,
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

  if (typeof sessionId !== "string" || !sessionId.trim()) {
    return { ok: false, error: "桥接事件缺少有效 sessionId。" };
  }

  if (sessionId !== currentSessionId) {
    return { ok: false, error: "桥接事件 sessionId 与当前训练会话不一致。" };
  }

  const gameRunId = readRequiredString(value.gameRunId);
  if (!gameRunId) {
    return { ok: false, error: "桥接事件缺少有效 gameRunId。" };
  }

  const gameVersion = readRequiredString(value.gameVersion);
  if (!gameVersion) {
    return { ok: false, error: "桥接事件缺少有效 gameVersion。" };
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

  return {
    ok: true,
    value: {
      type: unityTrainingResultEventType,
      action: unityTrainingResultEventType,
      protocolVersion: unityTrainingBridgeProtocolVersion,
      sessionId,
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
      metricsSummary: value.metricsSummary,
      motionMetrics: motionMetrics.value,
    },
  };
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
    if (windowStartedAt && Number.isNaN(new Date(windowStartedAt).getTime())) {
      return {
        ok: false,
        error: `motionMetrics 第 ${index + 1} 项 windowStartedAt 无效。`,
      };
    }
    const windowEndedAt = readOptionalString(item.windowEndedAt);
    if (windowEndedAt && Number.isNaN(new Date(windowEndedAt).getTime())) {
      return {
        ok: false,
        error: `motionMetrics 第 ${index + 1} 项 windowEndedAt 无效。`,
      };
    }
    if (
      windowStartedAt &&
      windowEndedAt &&
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
    if (windowStartedAt) {
      metric.windowStartedAt = windowStartedAt;
    }
    if (windowEndedAt) {
      metric.windowEndedAt = windowEndedAt;
    }
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStrictFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readOptionalFiniteNumber(value: unknown) {
  if (value === undefined) return undefined;
  return readStrictFiniteNumber(value);
}

function readRequiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalString(value: unknown) {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
