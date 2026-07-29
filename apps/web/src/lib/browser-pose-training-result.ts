import type {
  GameContent,
  SubmitTrainingResultRequest,
  TrainingSession,
} from "@/types/api";
import {
  browserPoseTrainingResultContractVersion,
  requireBrowserPoseClientStartedAt,
} from "./browser-pose-prescription";
import {
  getBrowserPoseGameplayProfile,
  type BrowserPoseGameplayProfile,
  type BrowserPoseScoringProfile,
} from "./browser-pose-game-library";
import { buildBrowserPoseDynamicDifficultyEvidence } from "./dynamic-difficulty-evidence";
import type { DynamicDifficultyEvidenceEvent } from "./dynamic-difficulty-evidence";

type BrowserPoseTrainingScoringProfile =
  | BrowserPoseScoringProfile
  | "balance_shift";

type BrowserPoseTrainingGameplayProfile = Omit<
  BrowserPoseGameplayProfile,
  "scoringProfile"
> & {
  scoringProfile: BrowserPoseTrainingScoringProfile;
};

export type BrowserPoseTrainingStats = {
  startedAtMs: number;
  startedAtIso: string;
  targetDurationSeconds: number;
  scoringProfile: BrowserPoseTrainingScoringProfile;
  sampleCount: number;
  validFrameCount: number;
  visibilityTotal: number;
  hits: number;
  misses: number;
  actionHitCount: number;
  actionMissCount: number;
  sequenceCorrectStepCount: number;
  sequenceCompletedRoundCount: number;
  sequenceErrorCount: number;
  steadyWindowCount: number;
  steadyStableWindowCount: number;
  steadyMissedWindowCount: number;
  steadyHoldBreakCount: number;
  steadyHoldDurationMsTotal: number;
  steadyBestHoldMs: number;
  currentSteadyHoldMs: number;
  steadyHoldRequiredMs: number;
  bilateralWindowCount: number;
  bilateralCompletedWindowCount: number;
  bilateralMissedWindowCount: number;
  bilateralSyncErrorCount: number;
  bilateralWrongSideCount: number;
  bilateralLeftHitCount: number;
  bilateralRightHitCount: number;
  bilateralPairTimeDiffMsTotal: number;
  bilateralBestPairTimeDiffMs: number;
  bilateralPairTimeDiffs: number[];
  trajectoryWindowCount: number;
  trajectoryCompletedWindowCount: number;
  trajectoryMissedWindowCount: number;
  trajectoryCheckpointHitCount: number;
  trajectoryOffPathCount: number;
  trajectoryPathDeviationTotal: number;
  trajectoryPathDeviationSamples: number;
  trajectoryBestDeviation: number;
  trajectoryContinuousTraceMsTotal: number;
  trajectoryBestContinuousTraceMs: number;
  trajectorySmoothnessDeltaTotal: number;
  trajectoryLastDeviation?: number;
  balanceShiftWindowCount: number;
  balanceShiftStableWindowCount: number;
  balanceShiftMissedWindowCount: number;
  balanceDirectionErrorCount: number;
  balanceHoldBreakCount: number;
  balanceHoldDurationMsTotal: number;
  balanceBestHoldMs: number;
  currentBalanceHoldMs: number;
  balanceHoldRequiredMs: number;
  balanceCenterOffsetTotal: number;
  balanceCenterOffsetSamples: number;
  balanceBestCenterOffset: number;
  balanceStabilityDeltaTotal: number;
  balanceLastCenterOffset?: number;
  reactionTimes: number[];
  motionTravel: number;
  distractorAvoidanceCount: number;
  distractorErrorCount: number;
  difficultyAdjustmentEvents: DynamicDifficultyEvidenceEvent[];
};

const balanceShiftGameplayProfile: BrowserPoseTrainingGameplayProfile = {
  scoringProfile: "balance_shift",
  targetPrefix: "重心转移",
  stagePrompt:
    "沿中心线左右转移重心并稳定保持，系统重点记录中心偏移、方向控制和姿态平稳。",
  scoringHint: "稳定窗口越多、中心偏移越小、方向错误越少，重心转移得分越高。",
  resultLabel: "重心转移控制",
  liveStatLabels: {
    actionWindows: "稳定/偏移",
    reaction: "保持时长",
  },
  scoreWeights: {
    completion: 38,
    accuracy: 42,
    validFrame: 14,
    reaction: 6,
  },
};

export async function buildBrowserPoseTrainingResultPayload({
  stats,
  game,
  trainingSession,
  completedAtMs,
  poseModelVersion,
  generatedAt = new Date().toISOString(),
}: {
  stats: BrowserPoseTrainingStats;
  game: GameContent;
  trainingSession: TrainingSession;
  completedAtMs: number;
  poseModelVersion: string;
  generatedAt?: string;
}): Promise<SubmitTrainingResultRequest> {
  if (!trainingSession.collectionBatchId) {
    throw new Error("当前训练缺少准备记录，不能生成正式训练结果。");
  }
  const gameRunId = trainingSession.gameRunId?.trim();
  if (!gameRunId) {
    throw new Error("当前训练缺少真实运行标识，不能生成正式训练结果。");
  }
  const dynamicDifficultyEvidence = buildBrowserPoseDynamicDifficultyEvidence({
    events: stats.difficultyAdjustmentEvents,
    approvedPlanItemId: trainingSession.planItemId,
    gameRunId,
    generatedAt,
  });
  const completedDurationMs = completedAtMs - stats.startedAtMs;
  if (
    !Number.isFinite(completedDurationMs) ||
    !Number.isSafeInteger(stats.targetDurationSeconds) ||
    stats.targetDurationSeconds <= 0 ||
    completedDurationMs < stats.targetDurationSeconds * 1000
  ) {
    throw new Error("浏览器体感训练未达到冻结处方时长，不能生成正式结果。");
  }
  const durationSeconds = stats.targetDurationSeconds;
  const averageReactionTimeMs = Math.round(average(stats.reactionTimes) ?? 0);
  const completionRate = computeBrowserPoseCompletionRate(stats);
  const motionAccuracy = computeBrowserPoseAccuracy(
    stats,
    stats.scoringProfile,
  );
  const averageVisibility =
    stats.validFrameCount > 0
      ? stats.visibilityTotal / stats.validFrameCount
      : 0;
  const validFrameRatio =
    stats.sampleCount > 0 ? stats.validFrameCount / stats.sampleCount : 0;
  const exerciseIntensity = resolveExerciseIntensity(
    stats.motionTravel,
    durationSeconds,
  );
  const gameplayProfile = getBrowserPoseTrainingGameplayProfile(
    stats.scoringProfile,
  );
  const reactionScore = computeBrowserPoseReactionScore(stats);
  const score = Math.round(
    clamp(
      completionRate * gameplayProfile.scoreWeights.completion +
        motionAccuracy * gameplayProfile.scoreWeights.accuracy +
        validFrameRatio * gameplayProfile.scoreWeights.validFrame +
        reactionScore * gameplayProfile.scoreWeights.reaction,
      0,
      100,
    ),
  );
  const rawPayloadHash = await createTrainingPayloadHash({
    sessionId: trainingSession.id,
    gameRunId: trainingSession.gameRunId,
    stats: {
      sampleCount: stats.sampleCount,
      validFrameCount: stats.validFrameCount,
      hits: stats.hits,
      misses: stats.misses,
      actionHitCount: stats.actionHitCount,
      actionMissCount: stats.actionMissCount,
      sequenceCorrectStepCount: stats.sequenceCorrectStepCount,
      sequenceCompletedRoundCount: stats.sequenceCompletedRoundCount,
      sequenceErrorCount: stats.sequenceErrorCount,
      steadyWindowCount: stats.steadyWindowCount,
      steadyStableWindowCount: stats.steadyStableWindowCount,
      steadyMissedWindowCount: stats.steadyMissedWindowCount,
      steadyHoldBreakCount: stats.steadyHoldBreakCount,
      steadyHoldDurationMsTotal: stats.steadyHoldDurationMsTotal,
      steadyBestHoldMs: stats.steadyBestHoldMs,
      currentSteadyHoldMs: stats.currentSteadyHoldMs,
      steadyHoldRequiredMs: stats.steadyHoldRequiredMs,
      bilateralWindowCount: stats.bilateralWindowCount,
      bilateralCompletedWindowCount: stats.bilateralCompletedWindowCount,
      bilateralMissedWindowCount: stats.bilateralMissedWindowCount,
      bilateralSyncErrorCount: stats.bilateralSyncErrorCount,
      bilateralWrongSideCount: stats.bilateralWrongSideCount,
      bilateralLeftHitCount: stats.bilateralLeftHitCount,
      bilateralRightHitCount: stats.bilateralRightHitCount,
      bilateralPairTimeDiffMsTotal: stats.bilateralPairTimeDiffMsTotal,
      bilateralBestPairTimeDiffMs: stats.bilateralBestPairTimeDiffMs,
      bilateralPairTimeDiffs: stats.bilateralPairTimeDiffs,
      trajectoryWindowCount: stats.trajectoryWindowCount,
      trajectoryCompletedWindowCount: stats.trajectoryCompletedWindowCount,
      trajectoryMissedWindowCount: stats.trajectoryMissedWindowCount,
      trajectoryCheckpointHitCount: stats.trajectoryCheckpointHitCount,
      trajectoryOffPathCount: stats.trajectoryOffPathCount,
      trajectoryPathDeviationTotal: stats.trajectoryPathDeviationTotal,
      trajectoryPathDeviationSamples: stats.trajectoryPathDeviationSamples,
      trajectoryBestDeviation: stats.trajectoryBestDeviation,
      trajectoryContinuousTraceMsTotal: stats.trajectoryContinuousTraceMsTotal,
      trajectoryBestContinuousTraceMs: stats.trajectoryBestContinuousTraceMs,
      trajectorySmoothnessDeltaTotal: stats.trajectorySmoothnessDeltaTotal,
      trajectoryLastDeviation: stats.trajectoryLastDeviation,
      balanceShiftWindowCount: stats.balanceShiftWindowCount,
      balanceShiftStableWindowCount: stats.balanceShiftStableWindowCount,
      balanceShiftMissedWindowCount: stats.balanceShiftMissedWindowCount,
      balanceDirectionErrorCount: stats.balanceDirectionErrorCount,
      balanceHoldBreakCount: stats.balanceHoldBreakCount,
      balanceHoldDurationMsTotal: stats.balanceHoldDurationMsTotal,
      balanceBestHoldMs: stats.balanceBestHoldMs,
      currentBalanceHoldMs: stats.currentBalanceHoldMs,
      balanceHoldRequiredMs: stats.balanceHoldRequiredMs,
      balanceCenterOffsetTotal: stats.balanceCenterOffsetTotal,
      balanceCenterOffsetSamples: stats.balanceCenterOffsetSamples,
      balanceBestCenterOffset: stats.balanceBestCenterOffset,
      balanceStabilityDeltaTotal: stats.balanceStabilityDeltaTotal,
      balanceLastCenterOffset: stats.balanceLastCenterOffset,
      distractorAvoidanceCount: stats.distractorAvoidanceCount,
      distractorErrorCount: stats.distractorErrorCount,
      reactionTimes: stats.reactionTimes,
      motionTravel: stats.motionTravel,
      difficultyAdjustmentEvents: stats.difficultyAdjustmentEvents,
      durationSeconds,
      scoringProfile: stats.scoringProfile,
    },
  });
  const windowStartedAt = requireBrowserPoseClientStartedAt(
    stats.startedAtIso,
  ).iso;
  const windowEndedAt = generatedAt;
  const commonSummary = {
    validFrameRatio: Number(validFrameRatio.toFixed(3)),
    hitCount: stats.hits,
    missCount: stats.misses,
    sampleCount: stats.sampleCount,
    poseModelVersion,
    scoringProfile: stats.scoringProfile,
    resultLabel: gameplayProfile.resultLabel,
    scoringHint: gameplayProfile.scoringHint,
    profileStats: buildBrowserPoseProfileStats(stats, {
      completionRate,
      motionAccuracy,
      reactionScore,
      validFrameRatio,
    }),
  };

  return {
    score,
    completionRate: Number(completionRate.toFixed(3)),
    durationSeconds,
    reactionTimeMs: averageReactionTimeMs,
    motionAccuracy: Number(motionAccuracy.toFixed(3)),
    exerciseIntensity,
    metricsSummary: {
      source: "browser_pose_canvas",
      resultContractVersion: browserPoseTrainingResultContractVersion,
      collectionBatchId: trainingSession.collectionBatchId,
      gameRunId: trainingSession.gameRunId,
      gameVersion: game.gameVersion,
      protocolVersion: game.bridgeProtocolVersion,
      clientGeneratedAt: generatedAt,
      rawPayloadHash,
      deviceCode: trainingSession.deviceCode,
      poseModelVersion,
      scoringProfile: stats.scoringProfile,
      gameplayResultLabel: gameplayProfile.resultLabel,
      gameplayScoringHint: gameplayProfile.scoringHint,
      profileStats: buildBrowserPoseProfileStats(stats, {
        completionRate,
        motionAccuracy,
        reactionScore,
        validFrameRatio,
      }),
      validFrameRatio: Number(validFrameRatio.toFixed(3)),
      targetDurationSeconds: stats.targetDurationSeconds,
      difficultyAdjustmentCount: dynamicDifficultyEvidence.events.length,
      rawVideoStored: false,
      dynamicDifficultyEvidence,
    },
    motionMetrics: [
      {
        metricType: "reaction_time_ms",
        metricValue: averageReactionTimeMs,
        unit: "ms",
        confidence: Number(validFrameRatio.toFixed(3)),
        sampleCount: stats.reactionTimes.length,
        windowStartedAt,
        windowEndedAt,
        bodyPart: "upper_limb",
        qualityFlag: "valid",
        rawSummary: commonSummary,
      },
      {
        metricType: "target_hit_rate",
        metricValue: Number(completionRate.toFixed(3)),
        unit: "ratio",
        confidence: Number(validFrameRatio.toFixed(3)),
        sampleCount: stats.hits + stats.misses,
        windowStartedAt,
        windowEndedAt,
        bodyPart: "upper_limb",
        qualityFlag: "valid",
        rawSummary: commonSummary,
      },
      {
        metricType: "pose_visibility_avg",
        metricValue: Number(averageVisibility.toFixed(3)),
        unit: "ratio",
        confidence: Number(validFrameRatio.toFixed(3)),
        sampleCount: stats.validFrameCount,
        windowStartedAt,
        windowEndedAt,
        qualityFlag: "valid",
        rawSummary: commonSummary,
      },
      {
        metricType: "arm_raise_accuracy",
        metricValue: Number(motionAccuracy.toFixed(3)),
        unit: "ratio",
        confidence: Number(validFrameRatio.toFixed(3)),
        sampleCount: stats.hits + stats.misses,
        windowStartedAt,
        windowEndedAt,
        bodyPart: "upper_limb",
        qualityFlag: "valid",
        rawSummary: commonSummary,
      },
    ],
  };
}

function computeBrowserPoseCompletionRate(stats: BrowserPoseTrainingStats) {
  const totalTargets = stats.hits + stats.misses;
  if (!totalTargets) return 0;
  return clamp(stats.hits / totalTargets, 0, 1);
}

function computeBrowserPoseAccuracy(
  stats: BrowserPoseTrainingStats,
  scoringProfile: BrowserPoseTrainingScoringProfile,
) {
  const hitRate = computeBrowserPoseCompletionRate(stats);
  const reactionScore = computeBrowserPoseReactionScore(stats);
  const stabilityScore = computeBrowserPoseStabilityScore(stats);
  if (scoringProfile === "memory_sequence") {
    return clamp(
      hitRate * 0.66 + stabilityScore * 0.24 + reactionScore * 0.1,
      0,
      1,
    );
  }
  if (scoringProfile === "selective_sort") {
    return clamp(
      hitRate * 0.7 + reactionScore * 0.22 + stabilityScore * 0.08,
      0,
      1,
    );
  }
  if (scoringProfile === "steady_breath") {
    const steadyHoldScore =
      stats.steadyStableWindowCount > 0 && stats.steadyHoldRequiredMs > 0
        ? clamp(
            stats.steadyHoldDurationMsTotal /
              stats.steadyStableWindowCount /
              stats.steadyHoldRequiredMs,
            0,
            1,
          )
        : 0;
    return clamp(
      stabilityScore * 0.42 + hitRate * 0.36 + steadyHoldScore * 0.22,
      0,
      1,
    );
  }
  if (scoringProfile === "bilateral_coordination") {
    const syncScore =
      stats.bilateralPairTimeDiffs.length > 0
        ? clamp(1 - (average(stats.bilateralPairTimeDiffs) ?? 600) / 600, 0, 1)
        : 0;
    const wrongSideScore =
      stats.bilateralWindowCount > 0
        ? clamp(
            1 - stats.bilateralWrongSideCount / stats.bilateralWindowCount,
            0,
            1,
          )
        : 0;
    return clamp(
      hitRate * 0.45 +
        syncScore * 0.32 +
        wrongSideScore * 0.13 +
        stabilityScore * 0.1,
      0,
      1,
    );
  }
  if (scoringProfile === "trajectory_tracking") {
    const trackingCompletionRate =
      stats.trajectoryWindowCount > 0
        ? clamp(
            stats.trajectoryCompletedWindowCount / stats.trajectoryWindowCount,
            0,
            1,
          )
        : hitRate;
    const averagePathDeviation =
      stats.trajectoryPathDeviationSamples > 0
        ? stats.trajectoryPathDeviationTotal /
          stats.trajectoryPathDeviationSamples
        : 0;
    const pathDeviationScore =
      stats.trajectoryPathDeviationSamples > 0
        ? clamp(1 - averagePathDeviation / 0.36, 0, 1)
        : 0;
    const smoothnessSampleCount = Math.max(
      0,
      stats.trajectoryPathDeviationSamples - 1,
    );
    const averageSmoothnessDelta =
      smoothnessSampleCount > 0
        ? stats.trajectorySmoothnessDeltaTotal / smoothnessSampleCount
        : 0;
    const smoothnessScore =
      smoothnessSampleCount > 0
        ? clamp(1 - averageSmoothnessDelta / 0.36, 0, 1)
        : 0;
    return clamp(
      trackingCompletionRate * 0.4 +
        pathDeviationScore * 0.32 +
        smoothnessScore * 0.16 +
        stabilityScore * 0.12,
      0,
      1,
    );
  }
  if (scoringProfile === "balance_shift") {
    const balanceCompletionRate =
      stats.balanceShiftWindowCount > 0
        ? clamp(
            stats.balanceShiftStableWindowCount / stats.balanceShiftWindowCount,
            0,
            1,
          )
        : hitRate;
    const averageCenterOffset =
      stats.balanceCenterOffsetSamples > 0
        ? stats.balanceCenterOffsetTotal / stats.balanceCenterOffsetSamples
        : 0;
    const centerOffsetScore =
      stats.balanceCenterOffsetSamples > 0
        ? clamp(1 - averageCenterOffset / 0.42, 0, 1)
        : 0;
    const averageStabilityDelta =
      stats.balanceCenterOffsetSamples > 0
        ? stats.balanceStabilityDeltaTotal / stats.balanceCenterOffsetSamples
        : 0;
    const postureStabilityScore =
      stats.balanceCenterOffsetSamples > 0
        ? clamp(1 - averageStabilityDelta / 0.18, 0, 1)
        : 0;
    const directionalControlScore =
      stats.balanceShiftWindowCount > 0
        ? clamp(
            1 -
              stats.balanceDirectionErrorCount / stats.balanceShiftWindowCount,
            0,
            1,
          )
        : 0;
    return clamp(
      balanceCompletionRate * 0.34 +
        centerOffsetScore * 0.24 +
        postureStabilityScore * 0.18 +
        directionalControlScore * 0.14 +
        stabilityScore * 0.1,
      0,
      1,
    );
  }
  if (scoringProfile === "reaction_reach") {
    return clamp(hitRate * 0.75 + reactionScore * 0.25, 0, 1);
  }
  return assertNeverScoringProfile(scoringProfile);
}

function computeBrowserPoseReactionScore(stats: BrowserPoseTrainingStats) {
  return stats.reactionTimes.length > 0
    ? clamp(1 - (average(stats.reactionTimes) ?? 2600) / 2600, 0, 1)
    : 0;
}

function computeBrowserPoseStabilityScore(stats: BrowserPoseTrainingStats) {
  const validFrameRatio =
    stats.sampleCount > 0 ? stats.validFrameCount / stats.sampleCount : 0;
  const averageVisibility =
    stats.validFrameCount > 0
      ? stats.visibilityTotal / stats.validFrameCount
      : 0;
  return clamp(validFrameRatio * 0.55 + averageVisibility * 0.45, 0, 1);
}

function buildBrowserPoseProfileStats(
  stats: BrowserPoseTrainingStats,
  scores: {
    completionRate: number;
    motionAccuracy: number;
    reactionScore: number;
    validFrameRatio: number;
  },
) {
  if (stats.scoringProfile === "memory_sequence") {
    return {
      scoringProfile: stats.scoringProfile,
      sequenceStepCount:
        stats.sequenceCorrectStepCount + stats.sequenceErrorCount,
      sequenceCorrectStepCount: stats.sequenceCorrectStepCount,
      sequenceCompletedRoundCount: stats.sequenceCompletedRoundCount,
      sequenceErrorCount: stats.sequenceErrorCount,
      sequenceRetentionScore: Number(scores.completionRate.toFixed(3)),
    };
  }
  if (stats.scoringProfile === "selective_sort") {
    return {
      scoringProfile: stats.scoringProfile,
      sortedTargetCount: stats.actionHitCount,
      missedTargetCount: stats.actionMissCount,
      distractorAvoidanceCount: stats.distractorAvoidanceCount,
      distractorErrorCount: stats.distractorErrorCount,
      selectiveAttentionScore: Number(scores.motionAccuracy.toFixed(3)),
    };
  }
  if (stats.scoringProfile === "steady_breath") {
    const averageHoldMs =
      stats.steadyStableWindowCount > 0
        ? Math.round(
            stats.steadyHoldDurationMsTotal / stats.steadyStableWindowCount,
          )
        : 0;
    return {
      scoringProfile: stats.scoringProfile,
      rhythmWindowCount: stats.steadyWindowCount,
      stableWindowCount: stats.steadyStableWindowCount,
      driftWindowCount: stats.steadyMissedWindowCount,
      holdBreakCount: stats.steadyHoldBreakCount,
      averageHoldMs,
      bestHoldMs: Math.round(stats.steadyBestHoldMs),
      requiredHoldMs: stats.steadyHoldRequiredMs,
      rhythmHitRate: Number(scores.completionRate.toFixed(3)),
      stabilityScore: Number(scores.motionAccuracy.toFixed(3)),
    };
  }
  if (stats.scoringProfile === "bilateral_coordination") {
    const averagePairTimeDiffMs =
      stats.bilateralPairTimeDiffs.length > 0
        ? Math.round(
            stats.bilateralPairTimeDiffMsTotal /
              stats.bilateralPairTimeDiffs.length,
          )
        : 0;
    return {
      scoringProfile: stats.scoringProfile,
      coordinationWindowCount: stats.bilateralWindowCount,
      completedCoordinationWindowCount: stats.bilateralCompletedWindowCount,
      missedCoordinationWindowCount: stats.bilateralMissedWindowCount,
      syncErrorCount: stats.bilateralSyncErrorCount,
      wrongSideCount: stats.bilateralWrongSideCount,
      leftHitCount: stats.bilateralLeftHitCount,
      rightHitCount: stats.bilateralRightHitCount,
      averagePairTimeDiffMs,
      bestPairTimeDiffMs: Math.round(stats.bilateralBestPairTimeDiffMs),
      bilateralCompletionRate: Number(scores.completionRate.toFixed(3)),
      coordinationScore: Number(scores.motionAccuracy.toFixed(3)),
    };
  }
  if (stats.scoringProfile === "trajectory_tracking") {
    const averagePathDeviation =
      stats.trajectoryPathDeviationSamples > 0
        ? stats.trajectoryPathDeviationTotal /
          stats.trajectoryPathDeviationSamples
        : 0;
    const averageContinuousTraceMs =
      stats.trajectoryCompletedWindowCount > 0
        ? Math.round(
            stats.trajectoryContinuousTraceMsTotal /
              stats.trajectoryCompletedWindowCount,
          )
        : 0;
    const smoothnessSampleCount = Math.max(
      0,
      stats.trajectoryPathDeviationSamples - 1,
    );
    const averageSmoothnessDelta =
      smoothnessSampleCount > 0
        ? stats.trajectorySmoothnessDeltaTotal / smoothnessSampleCount
        : 0;
    return {
      scoringProfile: stats.scoringProfile,
      trackingWindowCount: stats.trajectoryWindowCount,
      completedTrackingWindowCount: stats.trajectoryCompletedWindowCount,
      missedTrackingWindowCount: stats.trajectoryMissedWindowCount,
      checkpointHitCount: stats.trajectoryCheckpointHitCount,
      offPathCount: stats.trajectoryOffPathCount,
      deviationSampleCount: stats.trajectoryPathDeviationSamples,
      averagePathDeviation: Number(averagePathDeviation.toFixed(3)),
      bestPathDeviation: Number(stats.trajectoryBestDeviation.toFixed(3)),
      averageContinuousTraceMs,
      bestContinuousTraceMs: Math.round(stats.trajectoryBestContinuousTraceMs),
      averageSmoothnessDelta: Number(averageSmoothnessDelta.toFixed(3)),
      trackingCompletionRate: Number(scores.completionRate.toFixed(3)),
      trajectoryTrackingScore: Number(scores.motionAccuracy.toFixed(3)),
    };
  }
  if (stats.scoringProfile === "balance_shift") {
    const averageBalanceHoldMs =
      stats.balanceShiftStableWindowCount > 0
        ? Math.round(
            stats.balanceHoldDurationMsTotal /
              stats.balanceShiftStableWindowCount,
          )
        : 0;
    const averageCenterOffset =
      stats.balanceCenterOffsetSamples > 0
        ? stats.balanceCenterOffsetTotal / stats.balanceCenterOffsetSamples
        : 0;
    const averageStabilityDelta =
      stats.balanceCenterOffsetSamples > 0
        ? stats.balanceStabilityDeltaTotal / stats.balanceCenterOffsetSamples
        : 0;
    return {
      scoringProfile: stats.scoringProfile,
      balanceWindowCount: stats.balanceShiftWindowCount,
      stableBalanceWindowCount: stats.balanceShiftStableWindowCount,
      missedBalanceWindowCount: stats.balanceShiftMissedWindowCount,
      directionErrorCount: stats.balanceDirectionErrorCount,
      holdBreakCount: stats.balanceHoldBreakCount,
      averageBalanceHoldMs,
      bestBalanceHoldMs: Math.round(stats.balanceBestHoldMs),
      requiredBalanceHoldMs: stats.balanceHoldRequiredMs,
      centerOffsetSampleCount: stats.balanceCenterOffsetSamples,
      averageCenterOffset: Number(averageCenterOffset.toFixed(3)),
      bestCenterOffset: Number(stats.balanceBestCenterOffset.toFixed(3)),
      averageStabilityDelta: Number(averageStabilityDelta.toFixed(3)),
      balanceCompletionRate: Number(scores.completionRate.toFixed(3)),
      balanceShiftScore: Number(scores.motionAccuracy.toFixed(3)),
    };
  }
  if (stats.scoringProfile === "reaction_reach") {
    return {
      scoringProfile: stats.scoringProfile,
      reactionWindowCount: stats.hits + stats.misses,
      reactionHitCount: stats.hits,
      reactionScore: Number(scores.reactionScore.toFixed(3)),
    };
  }
  return assertNeverScoringProfile(stats.scoringProfile);
}

function assertNeverScoringProfile(value: never): never {
  throw new Error(`未支持的浏览器体感计分模型：${String(value)}`);
}

function getBrowserPoseTrainingGameplayProfile(
  scoringProfile: BrowserPoseTrainingScoringProfile,
): BrowserPoseTrainingGameplayProfile {
  if (scoringProfile === "balance_shift") {
    return {
      ...balanceShiftGameplayProfile,
      liveStatLabels: { ...balanceShiftGameplayProfile.liveStatLabels },
      scoreWeights: { ...balanceShiftGameplayProfile.scoreWeights },
    };
  }
  return getBrowserPoseGameplayProfile(scoringProfile);
}

function resolveExerciseIntensity(
  motionTravel: number,
  durationSeconds: number,
): SubmitTrainingResultRequest["exerciseIntensity"] {
  const travelPerMinute =
    durationSeconds > 0 ? motionTravel / (durationSeconds / 60) : 0;
  if (travelPerMinute >= 18) return "high";
  if (travelPerMinute >= 8) return "moderate";
  return "low";
}

function average(values: number[]) {
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function createTrainingPayloadHash(value: unknown) {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "当前浏览器不支持 SHA-256 摘要能力，不能生成正式训练结果。",
    );
  }
  const json = JSON.stringify(value);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(json),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}
