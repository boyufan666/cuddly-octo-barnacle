import assert from "node:assert/strict";
import test from "node:test";
import {
  isExpectedUnityTrainingMessageSource,
  parseUnityTrainingResultBridgeEvent,
  toUnityRuntimeDurationSeconds,
} from "./unity-training-bridge.ts";

function validUnityTrainingEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: "training_result",
    action: "training_result",
    protocolVersion: "1.0.0",
    resultContractVersion: "rehab-unity-result-v2",
    sessionId: "session_real_001",
    collectionBatchId: "collection_batch_real_001",
    gameRunId: "run_real_001",
    gameVersion: "0.1.0",
    clientGeneratedAt: "2026-05-23T10:02:08.000Z",
    rawPayloadHash: "sha256:abcdef",
    score: 82,
    completionRate: 0.91,
    durationSeconds: 180,
    reactionTimeMs: 760,
    motionAccuracy: 0.84,
    exerciseIntensity: "moderate",
    metricsSummary: {
      source: "unity_webgl",
      resultContractVersion: "rehab-unity-result-v2",
      collectionBatchId: "collection_batch_real_001",
      gameRunId: "run_real_001",
      gameVersion: "0.1.0",
      dynamicDifficultyEvidence: dynamicDifficultyEvidence(),
    },
    motionMetrics: [
      metric("reaction_time_ms", 760, "ms", 24, 0.91),
      metric("target_hit_rate", 0.88, "ratio", 24, 0.89),
      metric("arm_raise_accuracy", 0.82, "ratio", 24, 0.87),
      metric("duration_seconds", 180, "seconds", 24, 1),
      metric("difficulty_level", 2, "level", 24, 1),
    ],
    ...overrides,
  };
}

function dynamicDifficultyEvidence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0.0",
    events: [
      {
        startingLevel: 2,
        startingLevelSource: "clinician_approved_plan",
        approvedPlanItemId: "plan_item_001",
        assessmentSourceId: "assessment_approved_001",
        triggerReason: "accuracy_high",
        before: {
          speed: 1,
          complexityLevel: 2,
        },
        after: {
          speed: 1.2,
          complexityLevel: 3,
        },
        adjustedAt: "2026-05-23T10:01:00.000Z",
        runtimeFrameId: "run_real_001:frame:1800",
        runtimeWindowId:
          "run_real_001:runtime-window:0:2026-05-23T10:00:00.000Z-2026-05-23T10:01:00.000Z",
        ...overrides,
      },
    ],
  };
}

function metric(
  metricType: string,
  metricValue: number,
  unit: string,
  sampleCount: number,
  confidence: number,
) {
  return {
    metricType,
    metricValue,
    unit,
    sampleCount,
    confidence,
    windowStartedAt: "2026-05-23T10:00:00.000Z",
    windowEndedAt: "2026-05-23T10:03:00.000Z",
  };
}

test("toUnityRuntimeDurationSeconds uses only the approved plan duration", () => {
  assert.equal(toUnityRuntimeDurationSeconds(8), 480);
  assert.throws(() => toUnityRuntimeDurationSeconds(0), /处方时长/);
  assert.throws(() => toUnityRuntimeDurationSeconds(Number.NaN), /处方时长/);
});

test("isExpectedUnityTrainingMessageSource requires both origin and source", () => {
  const expectedSource = {};

  assert.equal(
    isExpectedUnityTrainingMessageSource(
      { origin: "https://rehab.example", source: expectedSource },
      "https://rehab.example",
      expectedSource,
    ),
    true,
  );
  assert.equal(
    isExpectedUnityTrainingMessageSource(
      { origin: "https://evil.example", source: expectedSource },
      "https://rehab.example",
      expectedSource,
    ),
    false,
  );
  assert.equal(
    isExpectedUnityTrainingMessageSource(
      { origin: "https://rehab.example", source: {} },
      "https://rehab.example",
      expectedSource,
    ),
    false,
  );
});

test("parseUnityTrainingResultBridgeEvent accepts a matching formal Unity result", () => {
  const result = parseUnityTrainingResultBridgeEvent(
    validUnityTrainingEvent(),
    {
      sessionId: "session_real_001",
      gameRunId: "run_real_001",
      gameVersion: "0.1.0",
      collectionBatchId: "collection_batch_real_001",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.resultContractVersion, "rehab-unity-result-v2");
  assert.equal(result.value.gameRunId, "run_real_001");
  assert.deepEqual(
    result.value.metricsSummary.dynamicDifficultyEvidence,
    dynamicDifficultyEvidence(),
  );
});

test("parseUnityTrainingResultBridgeEvent rejects missing or wrong result contract versions", () => {
  const event = validUnityTrainingEvent();
  const missingTopLevelVersion = { ...event };
  Reflect.deleteProperty(missingTopLevelVersion, "resultContractVersion");
  const missingResult = parseUnityTrainingResultBridgeEvent(
    missingTopLevelVersion,
    {
      sessionId: "session_real_001",
      gameRunId: "run_real_001",
      gameVersion: "0.1.0",
      collectionBatchId: "collection_batch_real_001",
    },
  );
  assert.equal(missingResult.ok, false);
  if (!missingResult.ok)
    assert.match(missingResult.error, /resultContractVersion/);

  const wrongSummaryResult = parseUnityTrainingResultBridgeEvent(
    {
      ...event,
      metricsSummary: {
        ...event.metricsSummary,
        resultContractVersion: "rehab-unity-result-v1",
      },
    },
    {
      sessionId: "session_real_001",
      gameRunId: "run_real_001",
      gameVersion: "0.1.0",
      collectionBatchId: "collection_batch_real_001",
    },
  );
  assert.equal(wrongSummaryResult.ok, false);
  if (!wrongSummaryResult.ok) {
    assert.match(wrongSummaryResult.error, /resultContractVersion/);
  }
});

test("parseUnityTrainingResultBridgeEvent requires collectionBatchId from the C# envelope", () => {
  const event = { ...validUnityTrainingEvent() };
  Reflect.deleteProperty(event, "collectionBatchId");

  const result = parseUnityTrainingResultBridgeEvent(event, {
    sessionId: "session_real_001",
    gameRunId: "run_real_001",
    gameVersion: "0.1.0",
    collectionBatchId: "collection_batch_real_001",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /collectionBatchId/);
});

test("parseUnityTrainingResultBridgeEvent rejects a missing summary collectionBatchId", () => {
  const event = validUnityTrainingEvent();
  const metricsSummary = { ...event.metricsSummary };
  Reflect.deleteProperty(metricsSummary, "collectionBatchId");

  const result = parseUnityTrainingResultBridgeEvent(
    { ...event, metricsSummary },
    {
      sessionId: "session_real_001",
      gameRunId: "run_real_001",
      gameVersion: "0.1.0",
      collectionBatchId: "collection_batch_real_001",
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /metricsSummary.*collectionBatchId/);
});

test("parseUnityTrainingResultBridgeEvent rejects conflicting collectionBatchId fields", () => {
  const event = validUnityTrainingEvent();
  const result = parseUnityTrainingResultBridgeEvent(
    {
      ...event,
      metricsSummary: {
        ...event.metricsSummary,
        collectionBatchId: "different-batch",
      },
    },
    {
      sessionId: "session_real_001",
      gameRunId: "run_real_001",
      gameVersion: "0.1.0",
      collectionBatchId: "collection_batch_real_001",
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /metricsSummary\.collectionBatchId.*不一致/);
});

test("parseUnityTrainingResultBridgeEvent compares collectionBatchId fields without trimming", () => {
  const event = validUnityTrainingEvent();
  const result = parseUnityTrainingResultBridgeEvent(
    {
      ...event,
      metricsSummary: {
        ...event.metricsSummary,
        collectionBatchId: " collection_batch_real_001",
      },
    },
    {
      sessionId: "session_real_001",
      gameRunId: "run_real_001",
      gameVersion: "0.1.0",
      collectionBatchId: "collection_batch_real_001",
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /metricsSummary\.collectionBatchId.*不一致/);
});

test("parseUnityTrainingResultBridgeEvent rejects Unity results without dynamic difficulty evidence", () => {
  const result = parseUnityTrainingResultBridgeEvent(
    validUnityTrainingEvent({
      metricsSummary: {
        source: "unity_webgl",
        resultContractVersion: "rehab-unity-result-v2",
        collectionBatchId: "collection_batch_real_001",
        gameRunId: "run_real_001",
        gameVersion: "0.1.0",
      },
    }),
    {
      sessionId: "session_real_001",
      gameRunId: "run_real_001",
      gameVersion: "0.1.0",
      collectionBatchId: "collection_batch_real_001",
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /dynamicDifficultyEvidence/);
});

test("parseUnityTrainingResultBridgeEvent requires safety clamp reason when difficulty is unchanged", () => {
  const result = parseUnityTrainingResultBridgeEvent(
    validUnityTrainingEvent({
      metricsSummary: {
        source: "unity_webgl",
        resultContractVersion: "rehab-unity-result-v2",
        collectionBatchId: "collection_batch_real_001",
        gameRunId: "run_real_001",
        gameVersion: "0.1.0",
        dynamicDifficultyEvidence: dynamicDifficultyEvidence({
          triggerReason: "clinician_limit",
          before: {
            speed: 1,
            complexityLevel: 2,
          },
          after: {
            speed: 1,
            complexityLevel: 2,
          },
        }),
      },
    }),
    {
      sessionId: "session_real_001",
      gameRunId: "run_real_001",
      gameVersion: "0.1.0",
      collectionBatchId: "collection_batch_real_001",
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /safetyClampReason/);
});

test("parseUnityTrainingResultBridgeEvent treats blank safety clamp reason as absent when difficulty changes", () => {
  const result = parseUnityTrainingResultBridgeEvent(
    validUnityTrainingEvent({
      metricsSummary: {
        source: "unity_webgl",
        resultContractVersion: "rehab-unity-result-v2",
        collectionBatchId: "collection_batch_real_001",
        gameRunId: "run_real_001",
        gameVersion: "0.1.0",
        dynamicDifficultyEvidence: dynamicDifficultyEvidence({
          safetyClampReason: "",
        }),
      },
    }),
    {
      sessionId: "session_real_001",
      gameRunId: "run_real_001",
      gameVersion: "0.1.0",
      collectionBatchId: "collection_batch_real_001",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const normalizedDynamicDifficultyEvidence = result.value.metricsSummary
    .dynamicDifficultyEvidence as {
    events: Array<Record<string, unknown>>;
  };
  assert.equal(
    "safetyClampReason" in normalizedDynamicDifficultyEvidence.events[0],
    false,
  );
});

test("parseUnityTrainingResultBridgeEvent rejects fractional dynamic difficulty levels", () => {
  const result = parseUnityTrainingResultBridgeEvent(
    validUnityTrainingEvent({
      metricsSummary: {
        source: "unity_webgl",
        resultContractVersion: "rehab-unity-result-v2",
        collectionBatchId: "collection_batch_real_001",
        gameRunId: "run_real_001",
        gameVersion: "0.1.0",
        dynamicDifficultyEvidence: dynamicDifficultyEvidence({
          startingLevel: 2.5,
          before: {
            speed: 1,
            complexityLevel: 2.5,
          },
          after: {
            speed: 1.2,
            complexityLevel: 3,
          },
        }),
      },
    }),
    {
      sessionId: "session_real_001",
      gameRunId: "run_real_001",
      gameVersion: "0.1.0",
      collectionBatchId: "collection_batch_real_001",
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /startingLevel|complexityLevel/);
});

test("parseUnityTrainingResultBridgeEvent rejects non-string safety clamp reason", () => {
  const result = parseUnityTrainingResultBridgeEvent(
    validUnityTrainingEvent({
      metricsSummary: {
        source: "unity_webgl",
        resultContractVersion: "rehab-unity-result-v2",
        collectionBatchId: "collection_batch_real_001",
        gameRunId: "run_real_001",
        gameVersion: "0.1.0",
        dynamicDifficultyEvidence: dynamicDifficultyEvidence({
          safetyClampReason: 123,
        }),
      },
    }),
    {
      sessionId: "session_real_001",
      gameRunId: "run_real_001",
      gameVersion: "0.1.0",
      collectionBatchId: "collection_batch_real_001",
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /safetyClampReason/);
});

test("parseUnityTrainingResultBridgeEvent rejects mismatched gameRunId", () => {
  const result = parseUnityTrainingResultBridgeEvent(
    validUnityTrainingEvent({ gameRunId: "different-run" }),
    {
      sessionId: "session_real_001",
      gameRunId: "run_real_001",
      gameVersion: "0.1.0",
      collectionBatchId: "collection_batch_real_001",
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /gameRunId/);
});

test("parseUnityTrainingResultBridgeEvent rejects mismatched gameVersion", () => {
  const result = parseUnityTrainingResultBridgeEvent(
    validUnityTrainingEvent({ gameVersion: "0.2.0" }),
    {
      sessionId: "session_real_001",
      gameRunId: "run_real_001",
      gameVersion: "0.1.0",
      collectionBatchId: "collection_batch_real_001",
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /gameVersion/);
});

test("parseUnityTrainingResultBridgeEvent rejects formal Unity results missing required metric types", () => {
  const result = parseUnityTrainingResultBridgeEvent(
    validUnityTrainingEvent({
      motionMetrics: [
        metric("reaction_time_ms", 760, "ms", 24, 0.91),
        metric("target_hit_rate", 0.88, "ratio", 24, 0.89),
        metric("duration_seconds", 180, "seconds", 24, 1),
        metric("difficulty_level", 2, "level", 24, 1),
      ],
    }),
    {
      sessionId: "session_real_001",
      gameRunId: "run_real_001",
      gameVersion: "0.1.0",
      collectionBatchId: "collection_batch_real_001",
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /arm_raise_accuracy/);
});

test("parseUnityTrainingResultBridgeEvent rejects formal Unity metrics without sampling windows", () => {
  const incompleteMetric = {
    metricType: "reaction_time_ms",
    metricValue: 760,
    unit: "ms",
    sampleCount: 24,
    confidence: 0.91,
  };

  const result = parseUnityTrainingResultBridgeEvent(
    validUnityTrainingEvent({
      motionMetrics: [
        incompleteMetric,
        metric("target_hit_rate", 0.88, "ratio", 24, 0.89),
        metric("arm_raise_accuracy", 0.82, "ratio", 24, 0.87),
        metric("duration_seconds", 180, "seconds", 24, 1),
        metric("difficulty_level", 2, "level", 24, 1),
      ],
    }),
    {
      sessionId: "session_real_001",
      gameRunId: "run_real_001",
      gameVersion: "0.1.0",
      collectionBatchId: "collection_batch_real_001",
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /windowStartedAt/);
});

test("parseUnityTrainingResultBridgeEvent rejects non-finite metric values and confidence", () => {
  const event = validUnityTrainingEvent();
  const expected = {
    sessionId: "session_real_001",
    gameRunId: "run_real_001",
    gameVersion: "0.1.0",
    collectionBatchId: "collection_batch_real_001",
  };

  const invalidValueResult = parseUnityTrainingResultBridgeEvent(
    {
      ...event,
      motionMetrics: [
        { ...event.motionMetrics[0], metricValue: Number.NaN },
        ...event.motionMetrics.slice(1),
      ],
    },
    expected,
  );
  assert.equal(invalidValueResult.ok, false);
  if (!invalidValueResult.ok)
    assert.match(invalidValueResult.error, /有限数字/);

  const invalidConfidenceResult = parseUnityTrainingResultBridgeEvent(
    {
      ...event,
      motionMetrics: [
        { ...event.motionMetrics[0], confidence: Number.POSITIVE_INFINITY },
        ...event.motionMetrics.slice(1),
      ],
    },
    expected,
  );
  assert.equal(invalidConfidenceResult.ok, false);
  if (!invalidConfidenceResult.ok) {
    assert.match(invalidConfidenceResult.error, /有限数字/);
  }
});
