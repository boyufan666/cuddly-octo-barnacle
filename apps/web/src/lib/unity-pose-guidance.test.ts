import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUnityPoseGuidanceSnapshot,
  createUnityPoseHitTracker,
  type UnityPoseGuidanceLandmark,
} from "./unity-pose-guidance.ts";

function landmarks(
  left?: Partial<UnityPoseGuidanceLandmark>,
  right?: Partial<UnityPoseGuidanceLandmark>,
) {
  const values: UnityPoseGuidanceLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 0.8,
  }));
  values[15] = { x: 0.2, y: 0.35, visibility: 0.9, ...left };
  values[16] = { x: 0.8, y: 0.4, visibility: 0.92, ...right };
  return values;
}

test("buildUnityPoseGuidanceSnapshot shows mirrored wrist cursors for visible hands", () => {
  const snapshot = buildUnityPoseGuidanceSnapshot(landmarks(), {
    minVisibility: 0.45,
  });

  assert.equal(snapshot.status, "tracking");
  assert.equal(snapshot.leftWrist?.screenX, 0.8);
  assert.equal(snapshot.rightWrist?.screenX, 0.2);
  assert.match(snapshot.instruction, /右手|左手|目标/);
});

test("buildUnityPoseGuidanceSnapshot reports low visibility without inventing cursors", () => {
  const snapshot = buildUnityPoseGuidanceSnapshot(
    landmarks({ visibility: 0.2 }, { visibility: 0.25 }),
    { minVisibility: 0.45 },
  );

  assert.equal(snapshot.status, "low_visibility");
  assert.equal(snapshot.leftWrist, undefined);
  assert.equal(snapshot.rightWrist, undefined);
  assert.match(snapshot.instruction, /光线|入镜|站/);
});

test("buildUnityPoseGuidanceSnapshot reports missing pose when landmarks are absent", () => {
  const snapshot = buildUnityPoseGuidanceSnapshot([], { minVisibility: 0.45 });

  assert.equal(snapshot.status, "no_pose");
  assert.equal(snapshot.leftWrist, undefined);
  assert.equal(snapshot.rightWrist, undefined);
  assert.match(snapshot.instruction, /摄像头|入镜/);
});

test("createUnityPoseHitTracker emits only after stable real wrist frames", () => {
  const tracker = createUnityPoseHitTracker({
    minVisibility: 0.45,
    stableFrameCount: 2,
    minIntervalMs: 180,
  });
  const first = tracker.update(landmarks(), 1_000);
  const second = tracker.update(landmarks(), 1_040);

  assert.equal(first.reachHit, undefined);
  assert.equal(first.stableFrames, 1);
  assert.equal(first.requiredStableFrames, 2);
  assert.equal(second.reachHit?.source, "camera_pose");
  assert.equal(second.reachHit?.targetId, "webgl-pose-1");
  assert.equal(second.reachHit?.confidence, 0.92);
  assert.equal(second.reachHit?.x, -0.9);
  assert.equal(second.stableFrames, 2);
  assert.equal(second.requiredStableFrames, 2);
});

test("createUnityPoseHitTracker throttles rapid repeated hits and rejects low confidence", () => {
  const tracker = createUnityPoseHitTracker({
    minVisibility: 0.45,
    stableFrameCount: 2,
    minIntervalMs: 180,
  });
  tracker.update(landmarks(), 1_000);
  const first = tracker.update(landmarks(), 1_040);
  const throttled = tracker.update(landmarks(), 1_080);
  const lowConfidence = tracker.update(
    landmarks({ visibility: 0.1 }, { visibility: 0.1 }),
    1_260,
  );

  assert.ok(first.reachHit);
  assert.equal(throttled.reachHit, undefined);
  assert.equal(throttled.stableFrames, 3);
  assert.equal(lowConfidence.reachHit, undefined);
  assert.equal(lowConfidence.guidance.status, "low_visibility");
  assert.equal(lowConfidence.stableFrames, 0);
});
