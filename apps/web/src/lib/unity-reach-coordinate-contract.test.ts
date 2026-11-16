import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sourceRoot = new URL(
  "../../../../unity/rhythm-reach-3d/Assets/Rehab/",
  import.meta.url,
);
const source = (file: string) =>
  readFileSync(new URL(file, sourceRoot), "utf8");

test("Unity requires explicit viewport identity and projects through the actual camera, with queued deduplicated hands", () => {
  const input = source("Scripts/PoseInputBridge.cs");
  assert.match(input, /payload\.coordinateSpace != "mirrored_viewport"/);
  assert.match(input, /string\.IsNullOrWhiteSpace\(payload\.targetId\)/);
  assert.match(input, /!receivedHitIds\.Add\(payload\.targetId\)/);
  assert.match(input, /pendingReachHits\.Enqueue\(payload\)/);
  assert.match(input, /pendingReachHits\.Dequeue\(\)/);
  assert.match(
    input,
    /inputCamera\.ViewportPointToRay\(new Vector3\(payload\.screenX, 1f - payload\.screenY, 0f\)\)/,
  );
  assert.match(input, /targetPlane\.Raycast\(ray, out distance\)/);
  assert.match(input, /reachHitWorldPosition = ray\.GetPoint\(distance\)/);
  assert.doesNotMatch(
    input,
    /new Vector3\(payload\.x, payload\.y, payload\.z\)/,
  );
  const detector = source("Scripts/TargetHitDetector.cs");
  assert.match(detector, /while \(poseInputBridge\.TryConsumeReachHit\(\)\)/);
  assert.match(detector, /maxHitDistance = 0\.95f/);
  assert.match(detector, /poseInputBridge\.ResetRuntimeInput\(\)/);
});

test("old screen-to-world mapping misses visibly overlapping lateral targets; actual perspective ray intersects each target", () => {
  const scene = source("Editor/RhythmReachSceneBuilder.cs");
  assert.match(scene, /new Vector3\(0f, 1\.25f, -6f\)/);
  assert.match(scene, /Quaternion\.Euler\(8f, 0f, 0f\)/);
  assert.match(scene, /camera\.fieldOfView = 56f/);
  const angle = (8 * Math.PI) / 180,
    s = Math.sin(angle),
    c = Math.cos(angle);
  const tan = Math.tan((28 * Math.PI) / 180),
    aspect = 16 / 9;
  for (const [x, y] of [
    [-1.5, 0],
    [1.5, 0],
    [0, 1.1],
    [0, 0],
    [0, -1.1],
  ]) {
    const cy = c * (y - 1.25) + s * 10,
      cz = -s * (y - 1.25) + c * 10;
    const u = 0.5 + x / (2 * cz * tan * aspect),
      v = 0.5 - cy / (2 * cz * tan);
    const oldDistance = Math.hypot(u * 3 - 1.5 - x, 1.1 - v * 2.2 - y);
    if (x !== 0)
      assert.ok(
        oldDistance > 0.95,
        "old mapping rejects a cursor exactly on a lateral target",
      );
    const dx = (u * 2 - 1) * tan * aspect,
      dy = ((1 - v) * 2 - 1) * tan;
    const worldDy = c * dy - s,
      worldDz = s * dy + c;
    const t = 10 / worldDz;
    assert.ok(Math.abs(dx * t - x) < 1e-10);
    assert.ok(Math.abs(1.25 + worldDy * t - y) < 1e-10);
  }
});
