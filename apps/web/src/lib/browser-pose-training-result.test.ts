import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBrowserPoseTrainingResultPayload,
  type BrowserPoseTrainingStats,
} from "./browser-pose-training-result.ts";
import type { GameContent, TrainingSession } from "@/types/api";
import {
  createBrowserPoseRuntimeDifficulty,
  maybeUpdateBrowserPoseRuntimeDifficulty,
} from "./browser-pose-dynamic-difficulty.ts";
import type { DynamicDifficultyEvidence } from "./dynamic-difficulty-evidence.ts";

const game: GameContent = {
  id: "game-content-id",
  code: "garden_reach",
  name: "花园触达",
  trainingTargets: ["reaction", "upper_limb"],
  tags: ["反应", "中低强度"],
  defaultDuration: 1,
  defaultDifficulty: "standard",
  runtimeType: "browser_pose_canvas",
  manifestUrl: null,
  buildBaseUrl: null,
  gameVersion: "1.0.0",
  bridgeProtocolVersion: "1.0.0",
  buildStatus: "released",
  releaseChannel: "production",
  supportsCamera: true,
  supportsMicrophone: false,
  supportedInputModes: ["camera_pose"],
  requiredMetrics: [],
  status: "active",
};

const trainingSession: TrainingSession = {
  id: "training-session-id",
  patientId: "patient-profile-id",
  rehabPlanId: "rehab-plan-id",
  planItemId: "plan-item-id",
  gameContentId: "game-content-id",
  collectionBatchId: "collection-batch-real-001",
  gameRunId: "run-real-001",
  clientStartedAt: "2026-05-26T09:00:00.000Z",
  deviceCode: "camera-device-001",
  calibrationStatus: "completed",
  uploadAttemptCount: 0,
  sessionStatus: "in_progress",
  startedAt: "2026-05-26T09:00:00.000Z",
  syncStatus: "pending",
};

function stats(): BrowserPoseTrainingStats {
  return {
    startedAtMs: 1_000,
    startedAtIso: "2026-05-26T09:00:00.000Z",
    targetDurationSeconds: 60,
    scoringProfile: "reaction_reach",
    sampleCount: 1_200,
    validFrameCount: 1_080,
    visibilityTotal: 950,
    hits: 18,
    misses: 2,
    actionHitCount: 18,
    actionMissCount: 2,
    sequenceCorrectStepCount: 0,
    sequenceCompletedRoundCount: 0,
    sequenceErrorCount: 0,
    steadyWindowCount: 0,
    steadyStableWindowCount: 0,
    steadyMissedWindowCount: 0,
    steadyHoldBreakCount: 0,
    steadyHoldDurationMsTotal: 0,
    steadyBestHoldMs: 0,
    currentSteadyHoldMs: 0,
    steadyHoldRequiredMs: 700,
    bilateralWindowCount: 0,
    bilateralCompletedWindowCount: 0,
    bilateralMissedWindowCount: 0,
    bilateralSyncErrorCount: 0,
    bilateralWrongSideCount: 0,
    bilateralLeftHitCount: 0,
    bilateralRightHitCount: 0,
    bilateralPairTimeDiffMsTotal: 0,
    bilateralBestPairTimeDiffMs: 0,
    bilateralPairTimeDiffs: [],
    trajectoryWindowCount: 0,
    trajectoryCompletedWindowCount: 0,
    trajectoryMissedWindowCount: 0,
    trajectoryCheckpointHitCount: 0,
    trajectoryOffPathCount: 0,
    trajectoryPathDeviationTotal: 0,
    trajectoryPathDeviationSamples: 0,
    trajectoryBestDeviation: 0,
    trajectoryContinuousTraceMsTotal: 0,
    trajectoryBestContinuousTraceMs: 0,
    trajectorySmoothnessDeltaTotal: 0,
    trajectoryLastDeviation: undefined,
    balanceShiftWindowCount: 0,
    balanceShiftStableWindowCount: 0,
    balanceShiftMissedWindowCount: 0,
    balanceDirectionErrorCount: 0,
    balanceHoldBreakCount: 0,
    balanceHoldDurationMsTotal: 0,
    balanceBestHoldMs: 0,
    currentBalanceHoldMs: 0,
    balanceHoldRequiredMs: 620,
    balanceCenterOffsetTotal: 0,
    balanceCenterOffsetSamples: 0,
    balanceBestCenterOffset: 0,
    balanceStabilityDeltaTotal: 0,
    balanceLastCenterOffset: undefined,
    reactionTimes: [610, 720, 680, 760],
    motionTravel: 12,
    distractorAvoidanceCount: 0,
    distractorErrorCount: 0,
    difficultyAdjustmentEvents: recordedDifficultyEvents("accuracy_high"),
  };
}

function recordedDifficultyEvents(
  outcome: "accuracy_high" | "accuracy_low",
) {
  const state = createBrowserPoseRuntimeDifficulty({
    startingLevel: 2,
    approvedPlanItemId: "plan-item-id",
    assessmentSourceId: "assessment-approved-001",
    gameRunId: "run-real-001",
    startedAtMs: 1_000,
    startedAtIso: "2026-05-26T09:00:00.000Z",
    baseTargetIntervalMs: 1_200,
    baseTargetLifetimeMs: 2_600,
  });
  maybeUpdateBrowserPoseRuntimeDifficulty(
    state,
    outcome === "accuracy_high"
      ? {
          timestampMs: 5_000,
          hits: 4,
          misses: 0,
          sampleCount: 120,
          validFrameCount: 116,
          reactionTimes: [620, 650, 600, 630],
        }
      : {
          timestampMs: 5_000,
          hits: 1,
          misses: 3,
          sampleCount: 120,
          validFrameCount: 60,
          reactionTimes: [900],
        },
  );
  return state.events;
}

test("buildBrowserPoseTrainingResultPayload emits API-ready valid browser pose metrics", async () => {
  const capturedStats = stats();
  const payload = await buildBrowserPoseTrainingResultPayload({
    stats: capturedStats,
    game,
    trainingSession,
    completedAtMs: 61_000,
    poseModelVersion: "MediaPipe PoseLandmarker 0.10.35",
    generatedAt: "2026-05-26T09:01:00.000Z",
  });

  assert.equal(payload.metricsSummary.source, "browser_pose_canvas");
  assert.equal(payload.metricsSummary.scoringProfile, "reaction_reach");
  assert.equal(payload.metricsSummary.gameplayResultLabel, "反应触达表现");
  assert.ok(
    payload.metricsSummary.profileStats &&
      typeof payload.metricsSummary.profileStats === "object" &&
      "scoringProfile" in payload.metricsSummary.profileStats,
  );
  assert.equal(
    payload.metricsSummary.profileStats.scoringProfile,
    "reaction_reach",
  );
  assert.equal(
    payload.metricsSummary.collectionBatchId,
    "collection-batch-real-001",
  );
  assert.equal(payload.metricsSummary.rawVideoStored, false);
  assert.deepEqual(payload.metricsSummary.dynamicDifficultyEvidence, {
    schemaVersion: "1.0.0",
    events: capturedStats.difficultyAdjustmentEvents,
  });
  assert.notEqual(
    capturedStats.difficultyAdjustmentEvents[0].adjustedAt,
    payload.metricsSummary.clientGeneratedAt,
  );
  assert.match(
    String(payload.metricsSummary.rawPayloadHash),
    /^sha256:[a-f0-9]{64}$/,
  );
  assert.equal(payload.motionMetrics.length, 4);
  assert.deepEqual(
    payload.motionMetrics.map((metric) => metric.metricType).sort(),
    [
      "arm_raise_accuracy",
      "pose_visibility_avg",
      "reaction_time_ms",
      "target_hit_rate",
    ],
  );
  for (const metric of payload.motionMetrics) {
    assert.equal(metric.qualityFlag, "valid");
    assert.equal(metric.rawSummary?.poseModelVersion, "MediaPipe PoseLandmarker 0.10.35");
    assert.equal(metric.rawSummary?.scoringProfile, "reaction_reach");
    assert.equal(metric.rawSummary?.resultLabel, "反应触达表现");
  }
});

test("browser pose payload keeps recorded runtime difficulty instead of inferring from final aggregates", async () => {
  const payload = await buildBrowserPoseTrainingResultPayload({
    stats: {
      ...stats(),
      hits: 24,
      misses: 1,
      actionHitCount: 24,
      actionMissCount: 1,
      reactionTimes: [420, 460, 440, 430, 450],
      difficultyAdjustmentEvents: recordedDifficultyEvents("accuracy_low"),
    },
    game,
    trainingSession,
    completedAtMs: 61_000,
    poseModelVersion: "MediaPipe PoseLandmarker 0.10.35",
    generatedAt: "2026-05-26T09:01:00.000Z",
  });

  const evidence = payload.metricsSummary
    .dynamicDifficultyEvidence as DynamicDifficultyEvidence;
  assert.equal(evidence.events[0].triggerReason, "accuracy_low");
  assert.equal(evidence.events[0].before.complexityLevel, 2);
  assert.equal(evidence.events[0].after.complexityLevel, 1);
});

test("browser pose payload hard-fails without runtime difficulty events", async () => {
  await assert.rejects(
    buildBrowserPoseTrainingResultPayload({
      stats: {
        ...stats(),
        difficultyAdjustmentEvents: [],
      },
      game,
      trainingSession,
      completedAtMs: 61_000,
      poseModelVersion: "MediaPipe PoseLandmarker 0.10.35",
      generatedAt: "2026-05-26T09:01:00.000Z",
    }),
    /运行中动态难度事件/,
  );
});

test("steady breath payload records sustained hold and rhythm window evidence", async () => {
  const payload = await buildBrowserPoseTrainingResultPayload({
    stats: {
      ...stats(),
      scoringProfile: "steady_breath",
      hits: 7,
      misses: 2,
      actionHitCount: 7,
      actionMissCount: 2,
      steadyWindowCount: 9,
      steadyStableWindowCount: 7,
      steadyMissedWindowCount: 2,
      steadyHoldBreakCount: 3,
      steadyHoldDurationMsTotal: 6_300,
      steadyBestHoldMs: 1_160,
      currentSteadyHoldMs: 0,
      steadyHoldRequiredMs: 700,
      reactionTimes: [760, 880, 920, 840, 950, 990, 960],
    },
    game: {
      ...game,
      code: "balance_breath",
      name: "平衡呼吸舱",
      trainingTargets: ["attention", "balance", "upper_limb"],
    },
    trainingSession,
    completedAtMs: 61_000,
    poseModelVersion: "MediaPipe PoseLandmarker 0.10.35",
    generatedAt: "2026-05-26T09:01:00.000Z",
  });

  assert.equal(payload.metricsSummary.scoringProfile, "steady_breath");
  assert.deepEqual(payload.metricsSummary.profileStats, {
    scoringProfile: "steady_breath",
    rhythmWindowCount: 9,
    stableWindowCount: 7,
    driftWindowCount: 2,
    holdBreakCount: 3,
    averageHoldMs: 900,
    bestHoldMs: 1160,
    requiredHoldMs: 700,
    rhythmHitRate: payload.completionRate,
    stabilityScore: payload.motionAccuracy,
  });
});

test("memory sequence payload records step-level and round-level sequence evidence", async () => {
  const payload = await buildBrowserPoseTrainingResultPayload({
    stats: {
      ...stats(),
      scoringProfile: "memory_sequence",
      hits: 11,
      misses: 2,
      actionHitCount: 11,
      actionMissCount: 2,
      sequenceCorrectStepCount: 11,
      sequenceCompletedRoundCount: 3,
      sequenceErrorCount: 2,
    },
    game: {
      ...game,
      code: "mirror_sequence",
      name: "镜像序列",
      trainingTargets: ["memory", "executive", "upper_limb"],
    },
    trainingSession,
    completedAtMs: 61_000,
    poseModelVersion: "MediaPipe PoseLandmarker 0.10.35",
    generatedAt: "2026-05-26T09:01:00.000Z",
  });

  assert.equal(payload.metricsSummary.scoringProfile, "memory_sequence");
  assert.deepEqual(payload.metricsSummary.profileStats, {
    scoringProfile: "memory_sequence",
    sequenceStepCount: 13,
    sequenceCorrectStepCount: 11,
    sequenceCompletedRoundCount: 3,
    sequenceErrorCount: 2,
    sequenceRetentionScore: payload.completionRate,
  });
});

test("selective sort payload separates target hits from distractor inhibition evidence", async () => {
  const payload = await buildBrowserPoseTrainingResultPayload({
    stats: {
      ...stats(),
      scoringProfile: "selective_sort",
      hits: 12,
      misses: 3,
      actionHitCount: 8,
      actionMissCount: 1,
      distractorAvoidanceCount: 4,
      distractorErrorCount: 2,
    },
    game: {
      ...game,
      code: "nebula_sort",
      name: "星云分拣",
      trainingTargets: ["attention", "executive", "upper_limb"],
    },
    trainingSession,
    completedAtMs: 61_000,
    poseModelVersion: "MediaPipe PoseLandmarker 0.10.35",
    generatedAt: "2026-05-26T09:01:00.000Z",
  });

  assert.equal(payload.metricsSummary.scoringProfile, "selective_sort");
  assert.deepEqual(payload.metricsSummary.profileStats, {
    scoringProfile: "selective_sort",
    sortedTargetCount: 8,
    missedTargetCount: 1,
    distractorAvoidanceCount: 4,
    distractorErrorCount: 2,
    selectiveAttentionScore: payload.motionAccuracy,
  });
});

test("bilateral coordination payload records sync timing and wrong hand evidence", async () => {
  const payload = await buildBrowserPoseTrainingResultPayload({
    stats: {
      ...stats(),
      scoringProfile: "bilateral_coordination",
      hits: 9,
      misses: 3,
      actionHitCount: 9,
      actionMissCount: 3,
      bilateralWindowCount: 12,
      bilateralCompletedWindowCount: 9,
      bilateralMissedWindowCount: 3,
      bilateralSyncErrorCount: 2,
      bilateralWrongSideCount: 4,
      bilateralLeftHitCount: 9,
      bilateralRightHitCount: 8,
      bilateralPairTimeDiffMsTotal: 1_620,
      bilateralBestPairTimeDiffMs: 80,
      bilateralPairTimeDiffs: [80, 120, 160, 180, 200, 210, 220, 230, 220],
      reactionTimes: [560, 620, 590, 710, 660, 640, 680, 700, 610],
    },
    game: {
      ...game,
      code: "bilateral_rhythm_sync",
      name: "双手节拍协同",
      trainingTargets: ["coordination", "attention", "upper_limb"],
    },
    trainingSession,
    completedAtMs: 61_000,
    poseModelVersion: "MediaPipe PoseLandmarker 0.10.35",
    generatedAt: "2026-05-26T09:01:00.000Z",
  });

  assert.equal(payload.metricsSummary.scoringProfile, "bilateral_coordination");
  assert.equal(payload.motionMetrics.length, 4);
  assert.ok(
    payload.motionMetrics.every(
      (metric) => metric.rawSummary?.scoringProfile === "bilateral_coordination",
    ),
  );
  assert.ok(
    payload.motionMetrics.every(
      (metric) =>
        metric.rawSummary?.profileStats &&
        typeof metric.rawSummary.profileStats === "object" &&
        "coordinationScore" in metric.rawSummary.profileStats,
    ),
  );
  assert.deepEqual(payload.metricsSummary.profileStats, {
    scoringProfile: "bilateral_coordination",
    coordinationWindowCount: 12,
    completedCoordinationWindowCount: 9,
    missedCoordinationWindowCount: 3,
    syncErrorCount: 2,
    wrongSideCount: 4,
    leftHitCount: 9,
    rightHitCount: 8,
    averagePairTimeDiffMs: 180,
    bestPairTimeDiffMs: 80,
    bilateralCompletionRate: payload.completionRate,
    coordinationScore: payload.motionAccuracy,
  });
});

test("trajectory tracking payload records continuous tracking quality evidence", async () => {
  const payload = await buildBrowserPoseTrainingResultPayload({
    stats: {
      ...stats(),
      scoringProfile: "trajectory_tracking",
      hits: 10,
      misses: 2,
      actionHitCount: 10,
      actionMissCount: 2,
      trajectoryWindowCount: 12,
      trajectoryCompletedWindowCount: 10,
      trajectoryMissedWindowCount: 2,
      trajectoryCheckpointHitCount: 42,
      trajectoryOffPathCount: 8,
      trajectoryPathDeviationTotal: 6,
      trajectoryPathDeviationSamples: 60,
      trajectoryBestDeviation: 0.03,
      trajectoryContinuousTraceMsTotal: 8_400,
      trajectoryBestContinuousTraceMs: 1_050,
      trajectorySmoothnessDeltaTotal: 4.2,
      trajectoryLastDeviation: 0.08,
      reactionTimes: [640, 680, 610, 720, 700, 660, 690, 710, 650, 670],
    },
    game: {
      ...game,
      code: "orbital_trace_follow",
      name: "轨迹追踪巡航",
      trainingTargets: ["attention", "visual_tracking", "upper_limb"],
    },
    trainingSession,
    completedAtMs: 61_000,
    poseModelVersion: "MediaPipe PoseLandmarker 0.10.35",
    generatedAt: "2026-05-26T09:01:00.000Z",
  });

  assert.equal(payload.metricsSummary.scoringProfile, "trajectory_tracking");
  assert.equal(payload.motionMetrics.length, 4);
  assert.ok(
    payload.motionMetrics.every(
      (metric) => metric.rawSummary?.scoringProfile === "trajectory_tracking",
    ),
  );
  assert.ok(
    payload.motionMetrics.every(
      (metric) =>
        metric.rawSummary?.profileStats &&
        typeof metric.rawSummary.profileStats === "object" &&
        "trajectoryTrackingScore" in metric.rawSummary.profileStats,
    ),
  );
  assert.deepEqual(payload.metricsSummary.profileStats, {
    scoringProfile: "trajectory_tracking",
    trackingWindowCount: 12,
    completedTrackingWindowCount: 10,
    missedTrackingWindowCount: 2,
    checkpointHitCount: 42,
    offPathCount: 8,
    deviationSampleCount: 60,
    averagePathDeviation: 0.1,
    bestPathDeviation: 0.03,
    averageContinuousTraceMs: 840,
    bestContinuousTraceMs: 1050,
    averageSmoothnessDelta: 0.071,
    trackingCompletionRate: payload.completionRate,
    trajectoryTrackingScore: payload.motionAccuracy,
  });
});

test("balance shift payload records centerline stability and directional control evidence", async () => {
  const payload = await buildBrowserPoseTrainingResultPayload({
    stats: {
      ...stats(),
      scoringProfile: "balance_shift",
      hits: 8,
      misses: 2,
      actionHitCount: 0,
      actionMissCount: 0,
      balanceShiftWindowCount: 10,
      balanceShiftStableWindowCount: 8,
      balanceShiftMissedWindowCount: 2,
      balanceDirectionErrorCount: 3,
      balanceHoldBreakCount: 4,
      balanceHoldDurationMsTotal: 6_720,
      balanceBestHoldMs: 980,
      currentBalanceHoldMs: 0,
      balanceHoldRequiredMs: 620,
      balanceCenterOffsetTotal: 8.4,
      balanceCenterOffsetSamples: 40,
      balanceBestCenterOffset: 0.04,
      balanceStabilityDeltaTotal: 2.4,
      balanceLastCenterOffset: 0.12,
      reactionTimes: [780, 820, 840, 860, 790, 810, 850, 970],
    },
    game: {
      ...game,
      code: "center_shift_bridge",
      name: "重心转移星桥",
      trainingTargets: ["balance", "posture_control", "attention"],
    },
    trainingSession,
    completedAtMs: 61_000,
    poseModelVersion: "MediaPipe PoseLandmarker 0.10.35",
    generatedAt: "2026-05-26T09:01:00.000Z",
  });

  assert.equal(payload.metricsSummary.scoringProfile, "balance_shift");
  assert.equal(payload.motionMetrics.length, 4);
  assert.ok(
    payload.motionMetrics.every(
      (metric) => metric.rawSummary?.scoringProfile === "balance_shift",
    ),
  );
  assert.ok(
    payload.motionMetrics.every(
      (metric) =>
        metric.rawSummary?.profileStats &&
        typeof metric.rawSummary.profileStats === "object" &&
        "balanceShiftScore" in metric.rawSummary.profileStats,
    ),
  );
  assert.deepEqual(payload.metricsSummary.profileStats, {
    scoringProfile: "balance_shift",
    balanceWindowCount: 10,
    stableBalanceWindowCount: 8,
    missedBalanceWindowCount: 2,
    directionErrorCount: 3,
    holdBreakCount: 4,
    averageBalanceHoldMs: 840,
    bestBalanceHoldMs: 980,
    requiredBalanceHoldMs: 620,
    centerOffsetSampleCount: 40,
    averageCenterOffset: 0.21,
    bestCenterOffset: 0.04,
    averageStabilityDelta: 0.06,
    balanceCompletionRate: payload.completionRate,
    balanceShiftScore: payload.motionAccuracy,
  });
});
