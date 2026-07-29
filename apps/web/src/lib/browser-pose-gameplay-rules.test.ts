import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBrowserPoseDifficultyToTarget,
  createBrowserPoseGameplayStats,
  createBrowserPoseTarget,
  resolveBrowserPoseTargetInteraction,
} from "./browser-pose-gameplay-rules.ts";
import { getBrowserPoseGameDefinition } from "./browser-pose-game-library.ts";
import { createBrowserPoseRuntimeDifficulty } from "./browser-pose-dynamic-difficulty.ts";

test("selective sort treats distractor contact as inhibition error instead of a normal hit", () => {
  const definition = getBrowserPoseGameDefinition("nebula_sort");
  const stats = createBrowserPoseGameplayStats(definition, 60, 1_000);
  const distractorTarget = createBrowserPoseTarget(definition, 3, 2_000);

  assert.equal(distractorTarget.kind, "distractor");

  const interaction = resolveBrowserPoseTargetInteraction(stats, distractorTarget, {
    isInsideTarget: true,
    timestampMs: 2_530,
  });

  assert.equal(interaction.outcome, "distractor_error");
  assert.equal(stats.hits, 0);
  assert.equal(stats.misses, 1);
  assert.equal(stats.actionHitCount, 0);
  assert.equal(stats.actionMissCount, 0);
  assert.equal(stats.distractorErrorCount, 1);
  assert.deepEqual(stats.reactionTimes, []);
});

test("selective sort records a successfully ignored distractor when it expires untouched", () => {
  const definition = getBrowserPoseGameDefinition("nebula_sort");
  const stats = createBrowserPoseGameplayStats(definition, 60, 1_000);
  const distractorTarget = createBrowserPoseTarget(definition, 3, 2_000);

  const interaction = resolveBrowserPoseTargetInteraction(stats, distractorTarget, {
    isInsideTarget: false,
    timestampMs: distractorTarget.expiresAtMs,
  });

  assert.equal(interaction.outcome, "distractor_avoided");
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 0);
  assert.equal(stats.actionHitCount, 0);
  assert.equal(stats.actionMissCount, 0);
  assert.equal(stats.distractorAvoidanceCount, 1);
  assert.deepEqual(stats.reactionTimes, []);
});

test("memory sequence records correct sequence steps and completed rounds", () => {
  const definition = getBrowserPoseGameDefinition("mirror_sequence");
  const stats = createBrowserPoseGameplayStats(definition, 60, 1_000);
  const firstStep = createBrowserPoseTarget(definition, 1, 2_000);
  const thirdStep = createBrowserPoseTarget(definition, 3, 4_000);

  assert.equal(firstStep.kind, "sequence_step");
  assert.equal(firstStep.sequenceStep, 1);
  assert.equal(firstStep.sequenceLength, 3);
  assert.equal(thirdStep.sequenceStep, 3);

  resolveBrowserPoseTargetInteraction(stats, firstStep, {
    isInsideTarget: true,
    timestampMs: 2_420,
  });
  resolveBrowserPoseTargetInteraction(stats, thirdStep, {
    isInsideTarget: true,
    timestampMs: 4_550,
  });

  assert.equal(stats.actionHitCount, 2);
  assert.equal(stats.sequenceCorrectStepCount, 2);
  assert.equal(stats.sequenceCompletedRoundCount, 1);
  assert.equal(stats.sequenceErrorCount, 0);
});

test("memory sequence records missed sequence steps as sequence errors", () => {
  const definition = getBrowserPoseGameDefinition("mirror_sequence");
  const stats = createBrowserPoseGameplayStats(definition, 60, 1_000);
  const secondStep = createBrowserPoseTarget(definition, 2, 3_000);

  const interaction = resolveBrowserPoseTargetInteraction(stats, secondStep, {
    isInsideTarget: false,
    timestampMs: secondStep.expiresAtMs,
  });

  assert.equal(interaction.outcome, "sequence_step_missed");
  assert.equal(stats.actionMissCount, 1);
  assert.equal(stats.sequenceCorrectStepCount, 0);
  assert.equal(stats.sequenceCompletedRoundCount, 0);
  assert.equal(stats.sequenceErrorCount, 1);
});

test("steady breath requires a sustained hold before a window is completed", () => {
  const definition = getBrowserPoseGameDefinition("balance_breath");
  const stats = createBrowserPoseGameplayStats(definition, 60, 1_000);
  const holdTarget = createBrowserPoseTarget(definition, 1, 2_000);

  assert.equal(holdTarget.kind, "steady_hold");
  assert.equal(holdTarget.steadyHoldRequiredMs, 700);

  const firstFrame = resolveBrowserPoseTargetInteraction(stats, holdTarget, {
    isInsideTarget: true,
    timestampMs: 2_120,
  });
  const earlyFrame = resolveBrowserPoseTargetInteraction(stats, holdTarget, {
    isInsideTarget: true,
    timestampMs: 2_650,
  });

  assert.equal(stats.hits, 0);
  assert.equal(stats.misses, 0);
  assert.equal(stats.actionHitCount, 0);
  assert.equal(stats.steadyStableWindowCount, 0);
  assert.equal(stats.steadyMissedWindowCount, 0);
  assert.deepEqual(stats.reactionTimes, []);

  const completedFrame = resolveBrowserPoseTargetInteraction(stats, holdTarget, {
    isInsideTarget: true,
    timestampMs: 2_850,
  });

  assert.equal(firstFrame.outcome, "steady_hold_pending");
  assert.equal(earlyFrame.outcome, "steady_hold_pending");
  assert.equal(completedFrame.outcome, "steady_hold_completed");
  assert.equal(stats.actionHitCount, 1);
  assert.equal(stats.steadyStableWindowCount, 1);
  assert.equal(stats.steadyMissedWindowCount, 0);
  assert.equal(stats.steadyHoldDurationMsTotal, 730);
  assert.equal(stats.currentSteadyHoldMs, 0);
  assert.deepEqual(stats.reactionTimes, [730]);
});

test("steady breath records hold breaks and missed stability windows", () => {
  const definition = getBrowserPoseGameDefinition("balance_breath");
  const stats = createBrowserPoseGameplayStats(definition, 60, 1_000);
  const holdTarget = createBrowserPoseTarget(definition, 1, 2_000);

  resolveBrowserPoseTargetInteraction(stats, holdTarget, {
    isInsideTarget: true,
    timestampMs: 2_120,
  });
  resolveBrowserPoseTargetInteraction(stats, holdTarget, {
    isInsideTarget: false,
    timestampMs: 2_420,
  });
  const missedFrame = resolveBrowserPoseTargetInteraction(stats, holdTarget, {
    isInsideTarget: false,
    timestampMs: holdTarget.expiresAtMs,
  });

  assert.equal(missedFrame.outcome, "steady_hold_missed");
  assert.equal(stats.actionMissCount, 1);
  assert.equal(stats.steadyStableWindowCount, 0);
  assert.equal(stats.steadyMissedWindowCount, 1);
  assert.equal(stats.steadyHoldBreakCount, 1);
  assert.equal(stats.currentSteadyHoldMs, 0);
});

test("steady breath restarts the required hold duration after leaving the target", () => {
  const definition = getBrowserPoseGameDefinition("balance_breath");
  const stats = createBrowserPoseGameplayStats(definition, 60, 1_000);
  const holdTarget = createBrowserPoseTarget(definition, 1, 2_000);

  resolveBrowserPoseTargetInteraction(stats, holdTarget, {
    isInsideTarget: true,
    timestampMs: 2_100,
  });
  resolveBrowserPoseTargetInteraction(stats, holdTarget, {
    isInsideTarget: false,
    timestampMs: 2_500,
  });
  const restartedEarlyFrame = resolveBrowserPoseTargetInteraction(stats, holdTarget, {
    isInsideTarget: true,
    timestampMs: 2_940,
  });
  const restartedCompletedFrame = resolveBrowserPoseTargetInteraction(stats, holdTarget, {
    isInsideTarget: true,
    timestampMs: 3_650,
  });

  assert.equal(restartedEarlyFrame.outcome, "steady_hold_pending");
  assert.equal(restartedCompletedFrame.outcome, "steady_hold_completed");
  assert.equal(stats.steadyHoldBreakCount, 1);
  assert.equal(stats.steadyStableWindowCount, 1);
  assert.equal(stats.steadyHoldDurationMsTotal, 710);
  assert.equal(stats.currentSteadyHoldMs, 0);
  assert.deepEqual(stats.reactionTimes, [710]);
});

test("bilateral coordination completes a window only after both hands hit their assigned sides", () => {
  const definition = getBrowserPoseGameDefinition("bilateral_rhythm_sync");
  const stats = createBrowserPoseGameplayStats(definition, 60, 1_000);
  const pairTarget = createBrowserPoseTarget(definition, 1, 2_000);

  assert.equal(pairTarget.kind, "bilateral_pair");
  assert.equal(pairTarget.side, "both");
  assert.equal(pairTarget.bilateralLeftTarget?.side, "left");
  assert.equal(pairTarget.bilateralRightTarget?.side, "right");

  const leftOnly = resolveBrowserPoseTargetInteraction(stats, pairTarget, {
    isInsideTarget: false,
    handHits: { left: true, right: false, wrongSide: false },
    timestampMs: 2_240,
  });
  const bothHands = resolveBrowserPoseTargetInteraction(stats, pairTarget, {
    isInsideTarget: false,
    handHits: { left: true, right: true, wrongSide: false },
    timestampMs: 2_560,
  });

  assert.equal(leftOnly.outcome, "bilateral_pair_pending");
  assert.equal(bothHands.outcome, "bilateral_pair_completed");
  assert.equal(stats.bilateralWindowCount, 1);
  assert.equal(stats.bilateralCompletedWindowCount, 1);
  assert.equal(stats.bilateralMissedWindowCount, 0);
  assert.equal(stats.bilateralLeftHitCount, 1);
  assert.equal(stats.bilateralRightHitCount, 1);
  assert.deepEqual(stats.bilateralPairTimeDiffs, [320]);
  assert.deepEqual(stats.reactionTimes, [560]);
});

test("bilateral coordination does not complete from generic target contact without hand evidence", () => {
  const definition = getBrowserPoseGameDefinition("bilateral_rhythm_sync");
  const stats = createBrowserPoseGameplayStats(definition, 60, 1_000);
  const pairTarget = createBrowserPoseTarget(definition, 1, 2_000);

  const interaction = resolveBrowserPoseTargetInteraction(stats, pairTarget, {
    isInsideTarget: true,
    timestampMs: 2_320,
  });

  assert.equal(interaction.outcome, "bilateral_pair_pending");
  assert.equal(interaction.shouldCloseTarget, false);
  assert.equal(stats.bilateralCompletedWindowCount, 0);
  assert.equal(stats.bilateralLeftHitCount, 0);
  assert.equal(stats.bilateralRightHitCount, 0);
});

test("bilateral coordination single-side windows use the visible target as the assigned hand zone", () => {
  const definition = getBrowserPoseGameDefinition("bilateral_rhythm_sync");
  const leftTarget = createBrowserPoseTarget(definition, 2, 3_000);
  const rightTarget = createBrowserPoseTarget(definition, 3, 4_000);

  assert.equal(leftTarget.kind, "bilateral_pair");
  assert.equal(leftTarget.side, "left");
  assert.equal(leftTarget.bilateralExpectedSide, "left");
  assert.equal(leftTarget.bilateralLeftTarget?.x, leftTarget.x);
  assert.equal(leftTarget.bilateralLeftTarget?.y, leftTarget.y);
  assert.equal(leftTarget.bilateralLeftTarget?.radius, leftTarget.radius);
  assert.equal(leftTarget.bilateralRightTarget, undefined);

  assert.equal(rightTarget.kind, "bilateral_pair");
  assert.equal(rightTarget.side, "right");
  assert.equal(rightTarget.bilateralExpectedSide, "right");
  assert.equal(rightTarget.bilateralRightTarget?.x, rightTarget.x);
  assert.equal(rightTarget.bilateralRightTarget?.y, rightTarget.y);
  assert.equal(rightTarget.bilateralRightTarget?.radius, rightTarget.radius);
  assert.equal(rightTarget.bilateralLeftTarget, undefined);
});

test("bilateral coordination records wrong hand contact and missed pair windows", () => {
  const definition = getBrowserPoseGameDefinition("bilateral_rhythm_sync");
  const stats = createBrowserPoseGameplayStats(definition, 60, 1_000);
  const pairTarget = createBrowserPoseTarget(definition, 1, 2_000);

  const wrongSide = resolveBrowserPoseTargetInteraction(stats, pairTarget, {
    isInsideTarget: false,
    handHits: { left: false, right: false, wrongSide: true },
    timestampMs: 2_180,
  });
  const missed = resolveBrowserPoseTargetInteraction(stats, pairTarget, {
    isInsideTarget: false,
    handHits: { left: true, right: false, wrongSide: false },
    timestampMs: pairTarget.expiresAtMs,
  });

  assert.equal(wrongSide.outcome, "bilateral_pair_wrong_side");
  assert.equal(missed.outcome, "bilateral_pair_missed");
  assert.equal(stats.bilateralWindowCount, 1);
  assert.equal(stats.bilateralCompletedWindowCount, 0);
  assert.equal(stats.bilateralMissedWindowCount, 1);
  assert.equal(stats.bilateralWrongSideCount, 1);
  assert.equal(stats.actionMissCount, 1);
  assert.deepEqual(stats.bilateralPairTimeDiffs, []);
});

test("trajectory tracking records continuous tracking error and smoothness evidence", () => {
  const definition = getBrowserPoseGameDefinition("orbital_trace_follow");
  const stats = createBrowserPoseGameplayStats(definition, 60, 1_000);
  const traceTarget = createBrowserPoseTarget(definition, 1, 2_000);

  assert.equal(traceTarget.kind, "trajectory_trace");
  assert.equal(traceTarget.side, "both");
  assert.equal(traceTarget.trajectoryCheckpoints?.length, 4);
  assert.equal(traceTarget.currentTrajectoryCheckpoint, 0);

  const firstFrame = resolveBrowserPoseTargetInteraction(stats, traceTarget, {
    isInsideTarget: true,
    trajectoryDeviation: 0.08,
    timestampMs: 2_120,
  });
  const secondFrame = resolveBrowserPoseTargetInteraction(stats, traceTarget, {
    isInsideTarget: true,
    trajectoryDeviation: 0.12,
    timestampMs: 2_420,
  });
  const missedFrame = resolveBrowserPoseTargetInteraction(stats, traceTarget, {
    isInsideTarget: false,
    trajectoryDeviation: 0.38,
    timestampMs: 2_720,
  });

  assert.equal(firstFrame.outcome, "trajectory_trace_tracking");
  assert.equal(secondFrame.outcome, "trajectory_trace_tracking");
  assert.equal(missedFrame.outcome, "trajectory_trace_off_path");
  assert.equal(stats.trajectoryPathDeviationSamples, 3);
  assert.equal(stats.trajectoryCheckpointHitCount, 2);
  assert.equal(stats.trajectoryOffPathCount, 1);
  assert.equal(stats.trajectoryPathDeviationTotal, 0.58);
  assert.equal(stats.trajectoryBestDeviation, 0.08);
  assert.equal(stats.trajectorySmoothnessDeltaTotal, 0.34);
});

test("trajectory tracking completes a window when enough continuous samples were tracked", () => {
  const definition = getBrowserPoseGameDefinition("orbital_trace_follow");
  const stats = createBrowserPoseGameplayStats(definition, 60, 1_000);
  const traceTarget = createBrowserPoseTarget(definition, 1, 2_000);

  resolveBrowserPoseTargetInteraction(stats, traceTarget, {
    isInsideTarget: true,
    trajectoryDeviation: 0.08,
    timestampMs: 2_100,
  });
  resolveBrowserPoseTargetInteraction(stats, traceTarget, {
    isInsideTarget: true,
    trajectoryDeviation: 0.07,
    timestampMs: 2_320,
  });
  resolveBrowserPoseTargetInteraction(stats, traceTarget, {
    isInsideTarget: true,
    trajectoryDeviation: 0.06,
    timestampMs: 2_540,
  });
  const completedFrame = resolveBrowserPoseTargetInteraction(stats, traceTarget, {
    isInsideTarget: true,
    trajectoryDeviation: 0.1,
    timestampMs: 2_760,
  });

  assert.equal(completedFrame.outcome, "trajectory_trace_completed");
  assert.equal(completedFrame.shouldCloseTarget, true);
  assert.equal(stats.trajectoryWindowCount, 1);
  assert.equal(stats.trajectoryCompletedWindowCount, 1);
  assert.equal(stats.trajectoryMissedWindowCount, 0);
  assert.equal(stats.trajectoryCheckpointHitCount, 4);
  assert.equal(stats.trajectoryContinuousTraceMsTotal, 660);
  assert.equal(stats.trajectoryBestContinuousTraceMs, 660);
  assert.equal(stats.actionHitCount, 1);
  assert.deepEqual(stats.reactionTimes, [660]);
});

test("balance shift records stable centerline hold evidence without generic hand hits", () => {
  const definition = getBrowserPoseGameDefinition("center_shift_bridge");
  const stats = createBrowserPoseGameplayStats(definition, 60, 1_000);
  const shiftTarget = createBrowserPoseTarget(definition, 1, 2_000);

  assert.equal(shiftTarget.kind, "balance_shift_zone");
  assert.equal(shiftTarget.balanceExpectedDirection, "left");
  assert.equal(shiftTarget.balanceHoldRequiredMs, 620);

  const firstFrame = resolveBrowserPoseTargetInteraction(stats, shiftTarget, {
    isInsideTarget: true,
    balanceCenterOffset: -0.18,
    balanceStabilityDelta: 0.04,
    balanceDirection: "left",
    timestampMs: 2_100,
  });
  const secondFrame = resolveBrowserPoseTargetInteraction(stats, shiftTarget, {
    isInsideTarget: true,
    balanceCenterOffset: -0.2,
    balanceStabilityDelta: 0.03,
    balanceDirection: "left",
    timestampMs: 2_420,
  });
  const completedFrame = resolveBrowserPoseTargetInteraction(stats, shiftTarget, {
    isInsideTarget: true,
    balanceCenterOffset: -0.21,
    balanceStabilityDelta: 0.02,
    balanceDirection: "left",
    timestampMs: 2_760,
  });

  assert.equal(firstFrame.outcome, "balance_shift_holding");
  assert.equal(secondFrame.outcome, "balance_shift_holding");
  assert.equal(completedFrame.outcome, "balance_shift_completed");
  assert.equal(stats.hits, 1);
  assert.equal(stats.actionHitCount, 0);
  assert.equal(stats.balanceShiftWindowCount, 1);
  assert.equal(stats.balanceShiftStableWindowCount, 1);
  assert.equal(stats.balanceShiftMissedWindowCount, 0);
  assert.equal(stats.balanceDirectionErrorCount, 0);
  assert.equal(stats.balanceCenterOffsetSamples, 3);
  assert.equal(stats.balanceCenterOffsetTotal, 0.59);
  assert.equal(stats.balanceBestCenterOffset, 0.18);
  assert.equal(stats.balanceStabilityDeltaTotal, 0.09);
  assert.equal(stats.balanceLastDirection, "left");
  assert.equal(stats.balanceLastCenterOffset, 0.21);
  assert.equal(stats.balanceLastStabilityDelta, 0.02);
  assert.equal(stats.balanceHoldDurationMsTotal, 660);
  assert.equal(stats.balanceBestHoldMs, 660);
  assert.deepEqual(stats.reactionTimes, [660]);
});

test("balance shift records direction errors and missed stability windows", () => {
  const definition = getBrowserPoseGameDefinition("center_shift_bridge");
  const stats = createBrowserPoseGameplayStats(definition, 60, 1_000);
  const shiftTarget = createBrowserPoseTarget(definition, 2, 3_000);

  assert.equal(shiftTarget.kind, "balance_shift_zone");
  assert.equal(shiftTarget.balanceExpectedDirection, "center");

  const wrongDirection = resolveBrowserPoseTargetInteraction(stats, shiftTarget, {
    isInsideTarget: false,
    balanceCenterOffset: -0.24,
    balanceStabilityDelta: 0.12,
    balanceDirection: "left",
    timestampMs: 3_180,
  });
  const missed = resolveBrowserPoseTargetInteraction(stats, shiftTarget, {
    isInsideTarget: false,
    balanceCenterOffset: -0.26,
    balanceStabilityDelta: 0.1,
    balanceDirection: "left",
    timestampMs: shiftTarget.expiresAtMs,
  });

  assert.equal(wrongDirection.outcome, "balance_shift_wrong_direction");
  assert.equal(missed.outcome, "balance_shift_missed");
  assert.equal(stats.misses, 1);
  assert.equal(stats.actionMissCount, 0);
  assert.equal(stats.balanceShiftWindowCount, 1);
  assert.equal(stats.balanceShiftStableWindowCount, 0);
  assert.equal(stats.balanceShiftMissedWindowCount, 1);
  assert.equal(stats.balanceDirectionErrorCount, 1);
  assert.equal(stats.balanceCenterOffsetSamples, 2);
  assert.equal(stats.balanceStabilityDeltaTotal, 0.22);
  assert.equal(stats.balanceLastDirection, "left");
  assert.equal(stats.balanceLastCenterOffset, 0.26);
  assert.equal(stats.balanceLastStabilityDelta, 0.1);
});

test("runtime difficulty parameters alter the next real target size and timing", () => {
  const definition = getBrowserPoseGameDefinition("garden_reach");
  const difficulty = createBrowserPoseRuntimeDifficulty({
    startingLevel: 3,
    approvedPlanItemId: "plan-item-001",
    assessmentSourceId: "assessment-001",
    gameRunId: "game-run-001",
    startedAtMs: 1_000,
    startedAtIso: "2026-07-13T09:00:00.000Z",
    baseTargetIntervalMs: definition.targetIntervalMs,
    baseTargetLifetimeMs: definition.targetExpiresMs,
  });
  const target = createBrowserPoseTarget(definition, 1, 2_000);
  const baseRadius = target.radius;

  applyBrowserPoseDifficultyToTarget(target, difficulty.currentParameters);

  assert.equal(target.radius, Number((baseRadius * 0.85).toFixed(4)));
  assert.equal(target.expiresAtMs, 4_167);
  assert.equal(target.minimumLandmarkVisibility, 0.5);
});
