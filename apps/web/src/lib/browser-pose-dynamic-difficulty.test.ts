import assert from "node:assert/strict";
import test from "node:test";
import {
  createBrowserPoseRuntimeDifficulty,
  maybeUpdateBrowserPoseRuntimeDifficulty,
} from "./browser-pose-dynamic-difficulty.ts";

const context = {
  startingLevel: 2,
  approvedPlanItemId: "plan-item-001",
  assessmentSourceId: "assessment-001",
  gameRunId: "game-run-001",
  startedAtMs: 1_000,
  startedAtIso: "2026-07-13T09:00:00.000Z",
  baseTargetIntervalMs: 1_200,
  baseTargetLifetimeMs: 2_600,
};

test("runtime difficulty waits for a complete real target window", () => {
  const state = createBrowserPoseRuntimeDifficulty(context);

  const event = maybeUpdateBrowserPoseRuntimeDifficulty(state, {
    timestampMs: 4_000,
    hits: 3,
    misses: 0,
    sampleCount: 90,
    validFrameCount: 85,
    reactionTimes: [650, 700, 680],
  });

  assert.equal(event, undefined);
  assert.equal(state.currentLevel, 2);
  assert.deepEqual(state.events, []);
});

test("high-accuracy runtime window changes observable target parameters immediately", () => {
  const state = createBrowserPoseRuntimeDifficulty(context);

  const event = maybeUpdateBrowserPoseRuntimeDifficulty(state, {
    timestampMs: 5_000,
    hits: 4,
    misses: 0,
    sampleCount: 120,
    validFrameCount: 116,
    reactionTimes: [620, 650, 600, 630],
  });

  assert.ok(event);
  assert.equal(event.triggerReason, "accuracy_high");
  assert.deepEqual(event.before, {
    speed: 1,
    complexityLevel: 2,
    targetSizeScale: 1,
    minimumLandmarkVisibility: 0.45,
    holdDurationScale: 1,
    targetIntervalMs: 1_200,
    targetLifetimeMs: 2_600,
  });
  assert.deepEqual(event.after, {
    speed: 1.2,
    complexityLevel: 3,
    targetSizeScale: 0.85,
    minimumLandmarkVisibility: 0.5,
    holdDurationScale: 1.15,
    targetIntervalMs: 1_000,
    targetLifetimeMs: 2_167,
  });
  assert.deepEqual(event.metricsWindow, {
    windowStartedAt: "2026-07-13T09:00:00.000Z",
    windowEndedAt: "2026-07-13T09:00:04.000Z",
    hitCount: 4,
    missCount: 0,
    sampleCount: 120,
    validFrameCount: 116,
    averageReactionTimeMs: 625,
    completionRate: 1,
    validFrameRatio: 0.967,
    motionAccuracy: 0.993,
  });
  assert.equal(event.adjustedAt, "2026-07-13T09:00:04.000Z");
  assert.equal(event.runtimeFrameId, "game-run-001:frame:5000");
  assert.equal(
    event.runtimeWindowId,
    "game-run-001:difficulty-window:1:1000-5000",
  );
  assert.equal(state.currentLevel, 3);
  assert.deepEqual(state.currentParameters, event.after);
  assert.deepEqual(state.events, [event]);
});

test("low-accuracy runtime window reduces speed and enlarges future targets", () => {
  const state = createBrowserPoseRuntimeDifficulty(context);

  const event = maybeUpdateBrowserPoseRuntimeDifficulty(state, {
    timestampMs: 5_000,
    hits: 1,
    misses: 3,
    sampleCount: 100,
    validFrameCount: 60,
    reactionTimes: [900],
  });

  assert.ok(event);
  assert.equal(event.triggerReason, "accuracy_low");
  assert.equal(event.before.complexityLevel, 2);
  assert.equal(event.after.complexityLevel, 1);
  assert.equal(event.after.speed, 0.8);
  assert.equal(event.after.targetSizeScale, 1.15);
  assert.equal(event.after.minimumLandmarkVisibility, 0.4);
  assert.equal(event.after.targetIntervalMs, 1_500);
  assert.equal(event.after.targetLifetimeMs, 3_250);
});

test("runtime difficulty records an unchanged safety-clamped decision honestly", () => {
  const state = createBrowserPoseRuntimeDifficulty({
    ...context,
    startingLevel: 3,
  });

  const event = maybeUpdateBrowserPoseRuntimeDifficulty(state, {
    timestampMs: 5_000,
    hits: 4,
    misses: 0,
    sampleCount: 120,
    validFrameCount: 120,
    reactionTimes: [500, 520, 540, 560],
  });

  assert.ok(event);
  assert.equal(event.triggerReason, "accuracy_high");
  assert.deepEqual(event.after, event.before);
  assert.equal(event.safetyClampReason, "clinician_limit:max_complexity");
});
