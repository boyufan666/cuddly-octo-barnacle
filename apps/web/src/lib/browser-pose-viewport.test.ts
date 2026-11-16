import assert from "node:assert/strict";
import test from "node:test";
import { browserPoseContentRect } from "./browser-pose-viewport";
test("4:3 video in 16:9 stage preserves complete image and target coordinates", () => {
  assert.deepEqual(browserPoseContentRect(960, 540, 640, 480), {
    left: 120,
    top: 0,
    width: 720,
    height: 540,
  });
});
test("16:9 video in 4:3 stage shares a letterboxed rectangle", () => {
  assert.deepEqual(browserPoseContentRect(640, 480, 960, 540), {
    left: 0,
    top: 60,
    width: 640,
    height: 360,
  });
});
test("normalized radius and mirrored hand positions project consistently at different sizes", () => {
  for (const [w, h] of [
    [960, 540],
    [640, 480],
    [360, 640],
  ]) {
    const rect = browserPoseContentRect(w, h, 640, 480)!;
    const radius = 0.12;
    const target = { x: 0.3, y: 0.4 };
    const leftWrist = { x: 0.7, y: 0.4 };
    const rightWrist = { x: 0.7, y: 0.4 };
    for (const hand of [leftWrist, rightWrist]) {
      assert.ok(
        Math.abs((1 - hand.x) * rect.width - target.x * rect.width) < 1e-9,
      );
      assert.equal(hand.y * rect.height, target.y * rect.height);
    }
    // Target ellipse's independent axes exactly represent the original normalized circle.
    assert.equal(2 * radius * rect.width, ((radius * 200) / 100) * rect.width);
    assert.equal(
      2 * radius * rect.height,
      ((radius * 200) / 100) * rect.height,
    );
  }
  assert.equal(browserPoseContentRect(0, 480, 640, 480), undefined);
});
