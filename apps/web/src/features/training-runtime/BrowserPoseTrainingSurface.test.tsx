import assert from "node:assert/strict";
import test from "node:test";
import {
  isMotionStageReadyForTraining,
  resolveBrowserPoseBodyCenter,
} from "./BrowserPoseTrainingSurface";

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

test("body-center control uses the same mirrored screen coordinates as the video and wrists", () => {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0.7,
    y: 0.5,
    z: 0,
    visibility: 0,
  }));
  for (const index of [11, 12, 23, 24]) landmarks[index].visibility = 0.9;
  const center = resolveBrowserPoseBodyCenter(landmarks, 0.45);
  assert.ok(center);
  assert.ok(Math.abs(center.x - 0.3) < 1e-9);
  assert.equal(center.y, 0.5);
  landmarks[23].visibility = 0;
  landmarks[24].visibility = 0;
  assert.ok(resolveBrowserPoseBodyCenter(landmarks, 0.45));
  landmarks[12].visibility = 0;
  assert.equal(resolveBrowserPoseBodyCenter(landmarks, 0.45), undefined);
});
