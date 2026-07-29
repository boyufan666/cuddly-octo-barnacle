import type {
  FormalTrainingRuntime,
  SubmitTrainingResultRequest,
} from "@/types/api";

const patientResultIncompleteMessage = "训练结果信息不完整，请重新完成本次训练。";

export function validateCapturedPatientTrainingResult(
  payload: SubmitTrainingResultRequest | null | undefined,
  runtimeType: FormalTrainingRuntime,
  collectionBatchId?: string | null,
): SubmitTrainingResultRequest {
  if (!payload) {
    throw new Error(patientResultIncompleteMessage);
  }

  assertFiniteNumber(payload.score, patientResultIncompleteMessage);
  assertNumberRange(payload.score, 0, 100, patientResultIncompleteMessage);
  assertFiniteNumber(payload.completionRate, patientResultIncompleteMessage);
  assertNumberRange(payload.completionRate, 0, 1, patientResultIncompleteMessage);
  assertFiniteNumber(payload.motionAccuracy, patientResultIncompleteMessage);
  assertNumberRange(payload.motionAccuracy, 0, 1, patientResultIncompleteMessage);
  assertFiniteNumber(payload.durationSeconds, patientResultIncompleteMessage);
  assertFiniteNumber(payload.reactionTimeMs, patientResultIncompleteMessage);
  if (payload.durationSeconds <= 0 || payload.reactionTimeMs <= 0) {
    throw new Error(patientResultIncompleteMessage);
  }
  validateExerciseIntensity(payload.exerciseIntensity);
  validateTrainingMetricsSummary(
    payload.metricsSummary,
    runtimeType,
    collectionBatchId,
  );
  const motionMetrics = parseMotionMetrics(payload.motionMetrics);

  return {
    ...payload,
    motionMetrics,
  };
}

function validateExerciseIntensity(
  value: SubmitTrainingResultRequest["exerciseIntensity"],
) {
  if (value === "low" || value === "moderate" || value === "high") {
    return;
  }
  throw new Error(patientResultIncompleteMessage);
}

function parseMotionMetrics(
  value: unknown,
): SubmitTrainingResultRequest["motionMetrics"] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(patientResultIncompleteMessage);
  }

  return value.map((item) => {
    if (!isPlainObject(item)) {
      throw new Error(patientResultIncompleteMessage);
    }
    const metricType = readRequiredText(
      item.metricType,
      patientResultIncompleteMessage,
    );
    const metricValue = readRequiredFiniteNumber(
      item.metricValue,
      patientResultIncompleteMessage,
    );
    const confidence = readRequiredFiniteNumber(
      item.confidence,
      patientResultIncompleteMessage,
    );
    assertNumberRange(
      confidence,
      0,
      1,
      patientResultIncompleteMessage,
    );

    const metric: SubmitTrainingResultRequest["motionMetrics"][number] = {
      metricType,
      metricValue,
      confidence,
    };
    const unit = readOptionalText(item.unit);
    if (unit) {
      metric.unit = unit;
    }
    if (item.sampleCount !== undefined) {
      const sampleCount = readRequiredFiniteNumber(
        item.sampleCount,
        patientResultIncompleteMessage,
      );
      if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
        throw new Error(patientResultIncompleteMessage);
      }
      metric.sampleCount = sampleCount;
    }
    const windowStartedAt = readOptionalText(item.windowStartedAt);
    if (windowStartedAt) {
      assertValidDateText(windowStartedAt, patientResultIncompleteMessage);
      metric.windowStartedAt = windowStartedAt;
    }
    const windowEndedAt = readOptionalText(item.windowEndedAt);
    if (windowEndedAt) {
      assertValidDateText(windowEndedAt, patientResultIncompleteMessage);
      metric.windowEndedAt = windowEndedAt;
    }
    if (windowStartedAt && windowEndedAt) {
      const startedAt = new Date(windowStartedAt);
      const endedAt = new Date(windowEndedAt);
      if (startedAt.getTime() > endedAt.getTime()) {
        throw new Error(patientResultIncompleteMessage);
      }
    }
    const qualityFlag = readOptionalText(item.qualityFlag);
    if (qualityFlag) {
      metric.qualityFlag = qualityFlag;
    }
    const bodyPart = readOptionalText(item.bodyPart);
    if (bodyPart) {
      metric.bodyPart = bodyPart;
    }
    const jointName = readOptionalText(item.jointName);
    if (jointName) {
      metric.jointName = jointName;
    }
    if (item.rawSummary !== undefined) {
      if (!isPlainObject(item.rawSummary)) {
        throw new Error(patientResultIncompleteMessage);
      }
      metric.rawSummary = item.rawSummary;
    }
    return metric;
  });
}

function validateTrainingMetricsSummary(
  summary: unknown,
  runtimeType: FormalTrainingRuntime,
  expectedCollectionBatchId?: string | null,
) {
  if (!isPlainObject(summary)) {
    throw new Error(patientResultIncompleteMessage);
  }
  const source = readRequiredText(
    summary.source,
    patientResultIncompleteMessage,
  );
  if (source !== runtimeType) {
    throw new Error(patientResultIncompleteMessage);
  }
  const collectionBatchId = readRequiredText(
    summary.collectionBatchId,
    patientResultIncompleteMessage,
  );
  if (!expectedCollectionBatchId) {
    throw new Error(patientResultIncompleteMessage);
  }
  if (collectionBatchId !== expectedCollectionBatchId) {
    throw new Error(patientResultIncompleteMessage);
  }
  readRequiredText(summary.gameRunId, patientResultIncompleteMessage);
  readRequiredText(summary.gameVersion, patientResultIncompleteMessage);
  const protocolVersion = readRequiredText(
    summary.protocolVersion,
    patientResultIncompleteMessage,
  );
  if (protocolVersion !== "1.0.0") {
    throw new Error(patientResultIncompleteMessage);
  }
  const clientGeneratedAt = readRequiredText(
    summary.clientGeneratedAt,
    patientResultIncompleteMessage,
  );
  assertValidDateText(clientGeneratedAt, patientResultIncompleteMessage);
  readRequiredText(summary.rawPayloadHash, patientResultIncompleteMessage);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }
  return value.trim();
}

function readOptionalText(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new Error("可选文本字段格式无效。");
  }
  return value.trim() || undefined;
}

function readRequiredFiniteNumber(value: unknown, message: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(message);
  }
  return numberValue;
}

function assertValidDateText(value: string, message: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(message);
  }
}

function assertNumberRange(
  value: number,
  min: number,
  max: number,
  message: string,
) {
  if (value < min || value > max) {
    throw new Error(message);
  }
}

function assertFiniteNumber(
  value: unknown,
  message: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(message);
  }
}
