import assert from "node:assert/strict";
import test from "node:test";
import {
  isMotionStageReadyForTraining,
  isBrowserPoseTargetHit,
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

test("garden reach counts a real landmark-derived hit and rejects outside/below-visibility contacts", async () => {
  const { getBrowserPoseGameDefinition } =
    await import("@/lib/browser-pose-game-library");
  const {
    createBrowserPoseGameplayStats,
    createBrowserPoseTarget,
    resolveBrowserPoseTargetInteraction,
  } = await import("@/lib/browser-pose-gameplay-rules");
  const definition = getBrowserPoseGameDefinition("garden_reach");
  const target = createBrowserPoseTarget(definition, 1, 1000);
  const stats = createBrowserPoseGameplayStats(definition, 60, 0);
  const pose = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0,
  }));
  const wrist = target.side === "left" ? 15 : 16;
  pose[wrist] = { x: 1 - target.x, y: target.y, z: 0, visibility: 0.9 };
  assert.equal(isBrowserPoseTargetHit(pose, target), true);
  resolveBrowserPoseTargetInteraction(stats, target, {
    isInsideTarget: isBrowserPoseTargetHit(pose, target),
    timestampMs: 1100,
  });
  assert.equal(stats.actionHitCount, 1);
  assert.equal(stats.hits, 1);
  pose[wrist].x = 1 - target.x - target.radius - 0.001;
  assert.equal(isBrowserPoseTargetHit(pose, target), false);
  pose[wrist].x = 1 - target.x;
  pose[wrist].visibility = target.minimumLandmarkVisibility - 0.001;
  assert.equal(isBrowserPoseTargetHit(pose, target), false);
});
