import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  observePoseReadiness,
  PoseVideoFrameTimeout,
  poseReadinessObservationMs,
  poseReadinessRequiredSamples,
  poseReadinessSampleIntervalMs,
  waitForPoseVideoFrame,
} from "./pose-readiness-observation";

const restorers: Array<() => void> = [];
afterEach(() => {
  while (restorers.length) restorers.pop()?.();
});
function installGlobal(name: string, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  restorers.push(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else Reflect.deleteProperty(globalThis, name);
  });
}
class FrameVideo extends EventTarget {
  readyState = 2;
  videoWidth = 640;
  videoHeight = 480;
  currentTime = 0;
  error = null;
  ended = false;
  nextId = 0;
  callbacks = new Map<number, VideoFrameRequestCallback>();
  onRequest?: () => void;
  requestVideoFrameCallback(callback: VideoFrameRequestCallback) {
    const id = ++this.nextId;
    this.callbacks.set(id, callback);
    this.onRequest?.();
    return id;
  }
  cancelVideoFrameCallback(id: number) {
    this.callbacks.delete(id);
  }
  frame(now: number, mediaTime: number) {
    const [entry] = this.callbacks;
    assert.ok(entry);
    this.callbacks.delete(entry[0]);
    this.currentTime = mediaTime;
    entry[1](now, { mediaTime } as VideoFrameCallbackMetadata);
  }
  asVideo() {
    return this as unknown as HTMLVideoElement;
  }
}
function autoFrames() {
  let now = 0;
  const video = new FrameVideo();
  installGlobal("performance", { now: () => now });
  video.onRequest = () =>
    queueMicrotask(() => {
      now += 100;
      video.frame(now, now / 1000);
    });
  return video;
}
const goodPose = () => Array.from({ length: 33 }, () => ({ visibility: 0.7 }));

test("one observation uses 5s/200ms/3-sample policy on new frames", async () => {
  assert.equal(poseReadinessObservationMs, 5_000);
  assert.equal(poseReadinessSampleIntervalMs, 200);
  assert.equal(poseReadinessRequiredSamples, 3);
  const video = autoFrames();
  const timestamps: number[] = [];
  const result = await observePoseReadiness(video.asVideo(), (timestamp) => {
    timestamps.push(timestamp);
    return goodPose();
  });
  assert.deepEqual(timestamps, [100, 300, 500]);
  assert.deepEqual(result, {
    poseLandmarkCount: 33,
    poseAverageVisibility: 0.7,
  });
  assert.equal(video.callbacks.size, 0);
});
test("a failed sampled frame resets the consecutive sequence", async () => {
  const video = autoFrames();
  let calls = 0;
  await observePoseReadiness(video.asVideo(), () =>
    ++calls === 2 ? [] : goodPose(),
  );
  assert.equal(calls, 5);
});
test("original visible-count and average-visibility thresholds remain enforced", async () => {
  await assert.rejects(
    observePoseReadiness(autoFrames().asVideo(), () => [
      ...Array.from({ length: 11 }, () => ({ visibility: 1 })),
      ...Array.from({ length: 22 }, () => ({ visibility: 0.49 })),
    ]),
    /置信度不足/,
  );
  await assert.rejects(
    observePoseReadiness(autoFrames().asVideo(), () => [
      ...Array.from({ length: 12 }, () => ({ visibility: 0.5 })),
      ...Array.from({ length: 21 }, () => ({ visibility: 0.4 })),
    ]),
    /置信度不足/,
  );
  const result = await observePoseReadiness(autoFrames().asVideo(), () => [
    ...Array.from({ length: 12 }, () => ({ visibility: 0.5 })),
    ...Array.from({ length: 8 }, () => ({ visibility: 0.375 })),
  ]);
  assert.equal(result.poseAverageVisibility, 0.45);
});
test("no-pose and intermittently valid observations fail distinctly within one window", async () => {
  await assert.rejects(
    observePoseReadiness(autoFrames().asVideo(), () => []),
    /观察期间未检测到人体姿态/,
  );
  let samples = 0;
  await assert.rejects(
    observePoseReadiness(autoFrames().asVideo(), () =>
      ++samples % 2 ? goodPose() : [],
    ),
    /未连续达到/,
  );
  assert.ok(samples <= 25);
});
test("decoded frames require current image data, dimensions and forward media time", async () => {
  const video = new FrameVideo();
  let settled = false;
  const result = waitForPoseVideoFrame(video.asVideo(), 1, 100).then(
    (frame) => {
      settled = true;
      return frame;
    },
  );
  video.readyState = 1;
  video.frame(10, 2);
  await Promise.resolve();
  assert.equal(settled, false);
  video.readyState = 2;
  video.videoWidth = 0;
  video.frame(20, 2);
  await Promise.resolve();
  assert.equal(settled, false);
  video.videoWidth = 640;
  video.frame(30, 1);
  await Promise.resolve();
  assert.equal(settled, false);
  video.frame(40, 0.5);
  await Promise.resolve();
  assert.equal(settled, false);
  video.frame(50, 2);
  assert.deepEqual(await result, { timestampMs: 50, mediaTime: 2 });
});
test("browser without decoded-frame callbacks uses loadeddata and advancing media time", async () => {
  const video = new FrameVideo();
  Object.defineProperty(video, "requestVideoFrameCallback", {
    value: undefined,
  });
  video.readyState = 1;
  let callback: FrameRequestCallback | undefined;
  installGlobal("requestAnimationFrame", (next: FrameRequestCallback) => {
    callback = next;
    return 1;
  });
  installGlobal("cancelAnimationFrame", () => {
    callback = undefined;
  });
  const result = waitForPoseVideoFrame(video.asVideo(), 1, 100);
  assert.equal(callback, undefined);
  video.readyState = 2;
  video.dispatchEvent(new Event("loadeddata"));
  assert.ok(callback);
  video.currentTime = 1;
  advanceAnimationFrame(10);
  assert.ok(callback);
  video.currentTime = 2;
  advanceAnimationFrame(20);
  assert.deepEqual(await result, { timestampMs: 20, mediaTime: 2 });
  assert.equal(callback, undefined);

  function advanceAnimationFrame(now: number) {
    const next: FrameRequestCallback | undefined = callback;
    assert.ok(next);
    callback = undefined;
    next(now);
  }
});
test("frame timeout, video failure and abort reject and clear pending callbacks", async () => {
  const timeoutVideo = new FrameVideo();
  await assert.rejects(
    waitForPoseVideoFrame(timeoutVideo.asVideo(), undefined, 5),
    PoseVideoFrameTimeout,
  );
  assert.equal(timeoutVideo.callbacks.size, 0);
  const failedVideo = new FrameVideo();
  const failure = waitForPoseVideoFrame(failedVideo.asVideo(), undefined, 100);
  failedVideo.dispatchEvent(new Event("error"));
  await assert.rejects(failure, /视频读取失败/);
  assert.equal(failedVideo.callbacks.size, 0);
  const abortedVideo = new FrameVideo();
  const controller = new AbortController();
  const aborted = waitForPoseVideoFrame(
    abortedVideo.asVideo(),
    undefined,
    100,
    controller.signal,
  );
  controller.abort();
  await assert.rejects(aborted, /训练准备已停止/);
  assert.equal(abortedVideo.callbacks.size, 0);
});
