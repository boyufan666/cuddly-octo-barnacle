import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionProtocolPayload,
} from "./admin-payload-builders.ts";
import type { CollectionProtocolGovernanceFormState } from "./CollectionConditionGovernance.tsx";

function collectionProtocolForm(
  overrides: Partial<CollectionProtocolGovernanceFormState> = {},
): CollectionProtocolGovernanceFormState {
  return {
    conditionId: "condition-id",
    gameContentId: "game-id",
    code: "unity-quality-gate",
    name: "Unity 质量门禁",
    version: "1.0.0",
    runtimeType: "unity_webgl",
    requiredConsentTypes: ["camera_capture"],
    requiredInputModesText: "camera_pose",
    requiredMetricsText: '["reaction_time_ms"]',
    conditionRulesText: "{}",
    samplingConfigText: "{}",
    qualityGateText: '{"minConfidence":0.8}',
    ...overrides,
  };
}

test("buildCollectionProtocolPayload accepts the canonical Unity minConfidence quality gate", () => {
  const payload = buildCollectionProtocolPayload(collectionProtocolForm());

  assert.deepEqual(payload.qualityGate, { minConfidence: 0.8 });
});

test("buildCollectionProtocolPayload rejects Unity legacy and extra quality gate fields", () => {
  assert.throws(
    () =>
      buildCollectionProtocolPayload(
        collectionProtocolForm({
          qualityGateText: '{"minPoseVisibility":0.8}',
        }),
      ),
    /minConfidence/,
  );
  assert.throws(
    () =>
      buildCollectionProtocolPayload(
        collectionProtocolForm({
          qualityGateText: '{"minConfidence":0.8,"qualityFlag":"valid"}',
        }),
      ),
    /minConfidence/,
  );
});

test("buildCollectionProtocolPayload requires a numeric Unity minConfidence within range", () => {
  assert.throws(
    () =>
      buildCollectionProtocolPayload(
        collectionProtocolForm({ qualityGateText: '{"minConfidence":"0.8"}' }),
      ),
    /minConfidence/,
  );
  assert.throws(
    () =>
      buildCollectionProtocolPayload(
        collectionProtocolForm({ qualityGateText: '{"minConfidence":1.01}' }),
      ),
    /minConfidence/,
  );
  assert.throws(
    () =>
      buildCollectionProtocolPayload(
        collectionProtocolForm({ qualityGateText: '{"minConfidence":0}' }),
      ),
    /minConfidence/,
  );
});

test("buildCollectionProtocolPayload preserves non-Unity quality gate schemas", () => {
  const payload = buildCollectionProtocolPayload(
    collectionProtocolForm({
      runtimeType: "cognitive_web",
      qualityGateText: '{"requireCompletion":true}',
    }),
  );

  assert.deepEqual(payload.qualityGate, { requireCompletion: true });
});
