import assert from "node:assert/strict";
import test from "node:test";
import { isMotionStageReadyForTraining } from "./BrowserPoseTrainingSurface";

test("uses the synchronous Phaser ready signal while React state is still stale", () => {
  const motionStageReadyRef = { current: true };

  assert.equal(isMotionStageReadyForTraining(false, motionStageReadyRef), true);
});

test("keeps the enhanced stage gate closed until Phaser reports ready", () => {
  const motionStageReadyRef = { current: false };

  assert.equal(
    isMotionStageReadyForTraining(false, motionStageReadyRef),
    false,
  );
});
