import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const bridgePath = fileURLToPath(
  new URL("../../public/unity/rehab-unity-bridge.js", import.meta.url),
);

function loadBridge() {
  const window = {
    location: {
      origin: "http://localhost:3000",
    },
    parent: {
      postMessage() {
        throw new Error("postMessage should not be called by this test");
      },
    },
  };
  vm.runInNewContext(readFileSync(bridgePath, "utf8"), { window });
  return window as typeof window & {
    RehabUnityBridge: {
      buildTrainingResultEvent: (result: unknown) => {
        resultContractVersion: string;
        collectionBatchId: string;
        metricsSummary: {
          resultContractVersion: string;
          collectionBatchId: string;
          dynamicDifficultyEvidence: {
            events: Array<Record<string, unknown>>;
          };
        };
      };
    };
  };
}

function validUnityBridgeResult(overrides: Record<string, unknown> = {}) {
  return {
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

test("public Unity bridge requires and preserves the C# collectionBatchId", () => {
  const window = loadBridge();
  const event = window.RehabUnityBridge.buildTrainingResultEvent(
    validUnityBridgeResult(),
  );

  assert.equal(event.resultContractVersion, "rehab-unity-result-v2");
  assert.equal(
    event.metricsSummary.resultContractVersion,
    "rehab-unity-result-v2",
  );
  assert.equal(event.collectionBatchId, "collection_batch_real_001");
  assert.equal(
    event.metricsSummary.collectionBatchId,
    "collection_batch_real_001",
  );

  const missingBatchResult = { ...validUnityBridgeResult() };
  Reflect.deleteProperty(missingBatchResult, "collectionBatchId");
  assert.throws(
    () => window.RehabUnityBridge.buildTrainingResultEvent(missingBatchResult),
    /collectionBatchId/,
  );
});

test("public Unity bridge rejects missing or wrong C# result contract versions", () => {
  const window = loadBridge();
  const result = validUnityBridgeResult();
  const missingTopLevelVersion = { ...result };
  Reflect.deleteProperty(missingTopLevelVersion, "resultContractVersion");
  assert.throws(
    () =>
      window.RehabUnityBridge.buildTrainingResultEvent(missingTopLevelVersion),
    /resultContractVersion/,
  );
  assert.throws(
    () =>
      window.RehabUnityBridge.buildTrainingResultEvent({
        ...result,
        metricsSummary: {
          ...result.metricsSummary,
          resultContractVersion: "rehab-unity-result-v1",
        },
      }),
    /resultContractVersion/,
  );
});

test("public Unity bridge rejects a C# result missing metricsSummary.collectionBatchId", () => {
  const window = loadBridge();
  const result = validUnityBridgeResult();
  const metricsSummary = { ...result.metricsSummary };
  Reflect.deleteProperty(metricsSummary, "collectionBatchId");

  assert.throws(
    () =>
      window.RehabUnityBridge.buildTrainingResultEvent({
        ...result,
        metricsSummary,
      }),
    /metricsSummary\.collectionBatchId/,
  );
});

test("public Unity bridge rejects conflicting C# collectionBatchId fields", () => {
  const window = loadBridge();
  const result = validUnityBridgeResult();

  assert.throws(
    () =>
      window.RehabUnityBridge.buildTrainingResultEvent({
        ...result,
        metricsSummary: {
          ...result.metricsSummary,
          collectionBatchId: "different-batch",
        },
      }),
    /collectionBatchId fields must match/,
  );
});

test("public Unity bridge compares C# collectionBatchId fields without trimming", () => {
  const window = loadBridge();
  const result = validUnityBridgeResult();

  assert.throws(
    () =>
      window.RehabUnityBridge.buildTrainingResultEvent({
        ...result,
        metricsSummary: {
          ...result.metricsSummary,
          collectionBatchId: " collection_batch_real_001",
        },
      }),
    /collectionBatchId fields must match/,
  );
});

test("public Unity bridge requires sampling windows on every motion metric", () => {
  const window = loadBridge();
  const result = validUnityBridgeResult();
  const metricWithoutWindow = { ...result.motionMetrics[0] };
  Reflect.deleteProperty(metricWithoutWindow, "windowStartedAt");

  assert.throws(
    () =>
      window.RehabUnityBridge.buildTrainingResultEvent({
        ...result,
        motionMetrics: [metricWithoutWindow, ...result.motionMetrics.slice(1)],
      }),
    /windowStartedAt/,
  );
});

test("public Unity bridge requires all formal Unity metric types", () => {
  const window = loadBridge();
  const result = validUnityBridgeResult();

  assert.throws(
    () =>
      window.RehabUnityBridge.buildTrainingResultEvent({
        ...result,
        motionMetrics: result.motionMetrics.filter(
          (item) => item.metricType !== "difficulty_level",
        ),
      }),
    /difficulty_level/,
  );
});

test("public Unity bridge rejects non-finite metric values and confidence", () => {
  const window = loadBridge();
  const result = validUnityBridgeResult();

  assert.throws(
    () =>
      window.RehabUnityBridge.buildTrainingResultEvent({
        ...result,
        motionMetrics: [
          { ...result.motionMetrics[0], metricValue: Number.NaN },
          ...result.motionMetrics.slice(1),
        ],
      }),
    /finite number/,
  );
  assert.throws(
    () =>
      window.RehabUnityBridge.buildTrainingResultEvent({
        ...result,
        motionMetrics: [
          { ...result.motionMetrics[0], confidence: Number.POSITIVE_INFINITY },
          ...result.motionMetrics.slice(1),
        ],
      }),
    /finite number/,
  );
});

function dynamicDifficultyEvidence(
  eventOverrides: Record<string, unknown> = {},
) {
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
        ...eventOverrides,
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

test("public Unity bridge treats blank safetyClampReason as absent when difficulty changes", () => {
  const window = loadBridge();
  const event = window.RehabUnityBridge.buildTrainingResultEvent(
    validUnityBridgeResult({
      metricsSummary: {
        source: "unity_webgl",
        resultContractVersion: "rehab-unity-result-v2",
        collectionBatchId: "collection_batch_real_001",
        dynamicDifficultyEvidence: dynamicDifficultyEvidence({
          safetyClampReason: "",
        }),
      },
    }),
  );

  assert.equal(
    "safetyClampReason" in
      event.metricsSummary.dynamicDifficultyEvidence.events[0],
    false,
  );
});

test("public Unity bridge still requires safetyClampReason when difficulty is unchanged", () => {
  const window = loadBridge();

  assert.throws(
    () =>
      window.RehabUnityBridge.buildTrainingResultEvent(
        validUnityBridgeResult({
          metricsSummary: {
            source: "unity_webgl",
            resultContractVersion: "rehab-unity-result-v2",
            collectionBatchId: "collection_batch_real_001",
            dynamicDifficultyEvidence: dynamicDifficultyEvidence({
              before: {
                speed: 1,
                complexityLevel: 2,
              },
              after: {
                speed: 1,
                complexityLevel: 2,
              },
              safetyClampReason: "",
            }),
          },
        }),
      ),
    /safetyClampReason is required when difficulty is unchanged/,
  );
});
