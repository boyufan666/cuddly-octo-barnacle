import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUnityPoseGuidanceSnapshot,
  assertUnityReachInputContract,
  createUnityPoseHitTracker,
  type UnityPoseGuidanceLandmark,
} from "./unity-pose-guidance.ts";

function landmarks(
  left?: Partial<UnityPoseGuidanceLandmark>,
  right?: Partial<UnityPoseGuidanceLandmark>,
) {
  const values: UnityPoseGuidanceLandmark[] = Array.from(
    { length: 33 },
    () => ({
      x: 0.5,
      y: 0.5,
      visibility: 0.8,
    }),
  );
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

  assert.equal(first.reachHits.length, 0);
  assert.equal(first.stableFrames, 1);
  assert.equal(first.requiredStableFrames, 2);
  assert.equal(second.reachHits[1]?.source, "camera_pose");
  assert.equal(second.reachHits[0]?.targetId, "webgl-pose-1");
  assert.equal(second.reachHits[1]?.confidence, 0.92);
  assert.equal(second.reachHits[1]?.screenX, 0.2);
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

  assert.ok(first.reachHits.length);
  assert.equal(throttled.reachHits.length, 0);
  assert.equal(throttled.stableFrames, 3);
  assert.equal(lowConfidence.reachHits.length, 0);
  assert.equal(lowConfidence.guidance.status, "low_visibility");
  assert.equal(lowConfidence.stableFrames, 0);
});

test("both wrists retain independent stable frames and unique viewport events", () => {
  const tracker = createUnityPoseHitTracker({
    minVisibility: 0.8,
    stableFrameCount: 2,
    minIntervalMs: 180,
  });
  tracker.update(landmarks(), 1000);
  const result = tracker.update(landmarks(), 1040);
  assert.equal(result.reachHits.length, 2);
  assert.deepEqual(
    result.reachHits.map((x) => x.side),
    ["left", "right"],
  );
  assert.notEqual(result.reachHits[0].targetId, result.reachHits[1].targetId);
  for (const hit of result.reachHits)
    assert.equal(hit.coordinateSpace, "mirrored_viewport");
  const oneLost = tracker.update(landmarks({ visibility: 0.1 }), 1250);
  assert.deepEqual(
    oneLost.reachHits.map((x) => x.side),
    ["right"],
  );
  const recovering = tracker.update(landmarks(), 1500);
  assert.deepEqual(
    recovering.reachHits.map((x) => x.side),
    ["right"],
  );
  const recovered = tracker.update(landmarks(), 1710);
  assert.deepEqual(
    recovered.reachHits.map((x) => x.side),
    ["left", "right"],
  );
});

test("reach input accepts matching 0.1.3 session and refuses old or mixed snapshots before camera startup", () => {
  const game = {
    code: "rhythm_reach_3d",
    gameVersion: "0.1.3",
    bridgeProtocolVersion: "1.0.0",
    manifestUrl: "/unity/rhythm_reach_3d/0.1.3/manifest.json",
    buildBaseUrl: "/unity/rhythm_reach_3d/0.1.3",
  };
  const session = {
    unityBuildVersion: "0.1.3",
    bridgeProtocolVersion: "1.0.0",
    runtimeConfigSnapshot: { ...game },
  };
  assert.doesNotThrow(() => assertUnityReachInputContract(game, session));
  assert.throws(() =>
    assertUnityReachInputContract({ ...game, gameVersion: "0.1.2" }, session),
  );
  assert.throws(() =>
    assertUnityReachInputContract(game, {
      ...session,
      unityBuildVersion: "0.1.2",
    }),
  );
  assert.throws(() =>
    assertUnityReachInputContract(game, {
      ...session,
      runtimeConfigSnapshot: { ...game, gameVersion: "0.1.2" },
    }),
  );
  assert.throws(() =>
    assertUnityReachInputContract(game, {
      ...session,
      runtimeConfigSnapshot: {
        ...game,
        manifestUrl: "/unity/rhythm_reach_3d/0.1.2/manifest.json",
      },
    }),
  );
  assert.throws(() =>
    assertUnityReachInputContract(game, {
      ...session,
      runtimeConfigSnapshot: null,
    }),
  );
});
