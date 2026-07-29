import {
  getBrowserPoseGameplayProfile,
  type BrowserPoseGameDefinition,
} from "./browser-pose-game-library";
import type { DynamicDifficultyRuntimeParameters } from "./dynamic-difficulty-evidence";
import type { DynamicDifficultyEvidenceEvent } from "./dynamic-difficulty-evidence";
import type { BrowserPoseRuntimeDifficultyState } from "./browser-pose-dynamic-difficulty";

export type BrowserPoseTargetKind =
  | "action"
  | "sequence_step"
  | "steady_hold"
  | "bilateral_pair"
  | "balance_shift_zone"
  | "trajectory_trace"
  | "distractor";

export type BrowserPoseBilateralTargetPoint = {
  side: "left" | "right";
  x: number;
  y: number;
  radius: number;
  hitAtMs?: number;
};

export type BrowserPoseHandHits = {
  left: boolean;
  right: boolean;
  wrongSide: boolean;
};

export type BrowserPoseBalanceDirection = "left" | "center" | "right";

export type BrowserPoseTrajectoryCheckpoint = {
  x: number;
  y: number;
  radius: number;
  label: string;
  hitAtMs?: number;
};

export type BrowserPoseTarget = {
  id: number;
  side: "left" | "right" | "both";
  kind: BrowserPoseTargetKind;
  x: number;
  y: number;
  radius: number;
  minimumLandmarkVisibility: number;
  gameplayLabel: string;
  appearedAtMs: number;
  expiresAtMs: number;
  sequenceStep?: number;
  sequenceLength?: number;
  steadyHoldStartedAtMs?: number;
  steadyHoldRequiredMs?: number;
  steadyBestHoldMs?: number;
  bilateralLeftTarget?: BrowserPoseBilateralTargetPoint;
  bilateralRightTarget?: BrowserPoseBilateralTargetPoint;
  bilateralExpectedSide?: "left" | "right" | "both";
  bilateralWrongSideRecorded?: boolean;
  balanceExpectedDirection?: BrowserPoseBalanceDirection;
  balanceHoldStartedAtMs?: number;
  balanceHoldRequiredMs?: number;
  balanceBestHoldMs?: number;
  balanceDirectionErrorRecorded?: boolean;
  trajectoryCheckpoints?: BrowserPoseTrajectoryCheckpoint[];
  currentTrajectoryCheckpoint?: number;
  trajectoryStartedAtMs?: number;
  trajectoryLastTrackedAtMs?: number;
};

export type BrowserPoseGameplayStats = {
  startedAtMs: number;
  startedAtIso: string;
  targetDurationSeconds: number;
  gameDefinition: BrowserPoseGameDefinition;
  scoringProfile: BrowserPoseGameDefinition["scoringProfile"];
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
  balanceLastDirection?: BrowserPoseBalanceDirection;
  balanceLastCenterOffset?: number;
  balanceLastStabilityDelta?: number;
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
  reactionTimes: number[];
  activeTarget?: BrowserPoseTarget;
  nextTargetId: number;
  lastTargetEndedAtMs: number;
  previousLeftWrist?: { x: number; y: number };
  previousRightWrist?: { x: number; y: number };
  motionTravel: number;
  lastSnapshotAtMs: number;
  qualityReasons: string[];
  distractorAvoidanceCount: number;
  distractorErrorCount: number;
  difficultyAdjustmentEvents: DynamicDifficultyEvidenceEvent[];
  runtimeDifficulty?: BrowserPoseRuntimeDifficultyState;
};

export type BrowserPoseTargetInteractionOutcome =
  | "action_hit"
  | "action_pending"
  | "action_missed"
  | "sequence_step_hit"
  | "sequence_step_missed"
  | "steady_hold_pending"
  | "steady_hold_completed"
  | "steady_hold_missed"
  | "bilateral_pair_pending"
  | "bilateral_pair_completed"
  | "bilateral_pair_missed"
  | "bilateral_pair_wrong_side"
  | "balance_shift_holding"
  | "balance_shift_completed"
  | "balance_shift_missed"
  | "balance_shift_wrong_direction"
  | "trajectory_trace_tracking"
  | "trajectory_trace_completed"
  | "trajectory_trace_off_path"
  | "trajectory_trace_missed"
  | "distractor_avoided"
  | "distractor_error"
  | "distractor_pending";

export type BrowserPoseTargetInteraction = {
  outcome: BrowserPoseTargetInteractionOutcome;
  shouldCloseTarget: boolean;
};

export function createBrowserPoseGameplayStats(
  gameDefinition: BrowserPoseGameDefinition,
  targetDurationSeconds: number,
  startedAtMs: number,
  startedAtIso = new Date().toISOString(),
): BrowserPoseGameplayStats {
  return {
    startedAtMs,
    startedAtIso,
    targetDurationSeconds,
    gameDefinition,
    scoringProfile: gameDefinition.scoringProfile,
    sampleCount: 0,
    validFrameCount: 0,
    visibilityTotal: 0,
    hits: 0,
    misses: 0,
    actionHitCount: 0,
    actionMissCount: 0,
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
    steadyHoldRequiredMs,
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
    balanceShiftWindowCount: 0,
    balanceShiftStableWindowCount: 0,
    balanceShiftMissedWindowCount: 0,
    balanceDirectionErrorCount: 0,
    balanceHoldBreakCount: 0,
    balanceHoldDurationMsTotal: 0,
    balanceBestHoldMs: 0,
    currentBalanceHoldMs: 0,
    balanceHoldRequiredMs,
    balanceCenterOffsetTotal: 0,
    balanceCenterOffsetSamples: 0,
    balanceBestCenterOffset: 0,
    balanceStabilityDeltaTotal: 0,
    balanceLastDirection: undefined,
    balanceLastCenterOffset: undefined,
    balanceLastStabilityDelta: undefined,
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
    reactionTimes: [],
    nextTargetId: 1,
    lastTargetEndedAtMs: startedAtMs - 1400,
    motionTravel: 0,
    lastSnapshotAtMs: startedAtMs,
    qualityReasons: [],
    distractorAvoidanceCount: 0,
    distractorErrorCount: 0,
    difficultyAdjustmentEvents: [],
  };
}

export function createBrowserPoseTarget(
  gameDefinition: BrowserPoseGameDefinition,
  id: number,
  timestampMs: number,
): BrowserPoseTarget {
  const pattern =
    gameDefinition.targetPattern[(id - 1) % gameDefinition.targetPattern.length];
  const gameplayProfile = getBrowserPoseGameplayProfile(
    gameDefinition.scoringProfile,
  );
  const kind = resolveBrowserPoseTargetKind(gameDefinition, id);
  const sequenceStep =
    kind === "sequence_step" ? ((id - 1) % sequenceLength) + 1 : undefined;
  const isSteadyHold = kind === "steady_hold";
  const bilateralTargets =
    kind === "bilateral_pair"
      ? buildBilateralTargetPair(pattern)
      : undefined;
  const trajectoryCheckpoints =
    kind === "trajectory_trace"
      ? buildTrajectoryCheckpoints(gameDefinition, id)
      : undefined;

  return {
    id,
    side: pattern.side,
    kind,
    x: pattern.x,
    y: pattern.y,
    radius: pattern.radius,
    minimumLandmarkVisibility: 0.45,
    gameplayLabel: buildBrowserPoseTargetGameplayLabel(
      gameplayProfile.targetPrefix,
      gameDefinition.scoringProfile,
      pattern.label,
      id,
      kind,
    ),
    appearedAtMs: timestampMs,
    expiresAtMs: timestampMs + gameDefinition.targetExpiresMs,
    sequenceStep,
    sequenceLength: kind === "sequence_step" ? sequenceLength : undefined,
    steadyHoldRequiredMs: isSteadyHold ? steadyHoldRequiredMs : undefined,
    steadyBestHoldMs: isSteadyHold ? 0 : undefined,
    bilateralLeftTarget: bilateralTargets?.left,
    bilateralRightTarget: bilateralTargets?.right,
    bilateralExpectedSide:
      kind === "bilateral_pair"
        ? pattern.side === "both"
          ? "both"
          : pattern.side
        : undefined,
    balanceExpectedDirection:
      kind === "balance_shift_zone"
        ? resolveBalanceExpectedDirection(pattern.side)
        : undefined,
    balanceHoldRequiredMs:
      kind === "balance_shift_zone" ? balanceHoldRequiredMs : undefined,
    balanceBestHoldMs: kind === "balance_shift_zone" ? 0 : undefined,
    trajectoryCheckpoints,
    currentTrajectoryCheckpoint: kind === "trajectory_trace" ? 0 : undefined,
  };
}

export function applyBrowserPoseDifficultyToTarget(
  target: BrowserPoseTarget,
  parameters: DynamicDifficultyRuntimeParameters,
) {
  target.radius = scaleRadius(target.radius, parameters.targetSizeScale);
  target.minimumLandmarkVisibility = parameters.minimumLandmarkVisibility;
  target.expiresAtMs = target.appearedAtMs + parameters.targetLifetimeMs;
  if (target.steadyHoldRequiredMs !== undefined) {
    target.steadyHoldRequiredMs = Math.round(
      target.steadyHoldRequiredMs * parameters.holdDurationScale,
    );
  }
  if (target.balanceHoldRequiredMs !== undefined) {
    target.balanceHoldRequiredMs = Math.round(
      target.balanceHoldRequiredMs * parameters.holdDurationScale,
    );
  }
  if (target.bilateralLeftTarget) {
    target.bilateralLeftTarget.radius = scaleRadius(
      target.bilateralLeftTarget.radius,
      parameters.targetSizeScale,
    );
  }
  if (target.bilateralRightTarget) {
    target.bilateralRightTarget.radius = scaleRadius(
      target.bilateralRightTarget.radius,
      parameters.targetSizeScale,
    );
  }
  for (const checkpoint of target.trajectoryCheckpoints ?? []) {
    checkpoint.radius = scaleRadius(
      checkpoint.radius,
      parameters.targetSizeScale,
    );
  }
  return target;
}

export function resolveBrowserPoseTargetInteraction(
  stats: BrowserPoseGameplayStats,
  target: BrowserPoseTarget,
  {
    isInsideTarget,
    handHits,
    trajectoryDeviation,
    balanceCenterOffset,
    balanceStabilityDelta,
    balanceDirection,
    timestampMs,
  }: {
    isInsideTarget: boolean;
    handHits?: BrowserPoseHandHits;
    trajectoryDeviation?: number;
    balanceCenterOffset?: number;
    balanceStabilityDelta?: number;
    balanceDirection?: BrowserPoseBalanceDirection;
    timestampMs: number;
  },
): BrowserPoseTargetInteraction {
  if (target.kind === "distractor") {
    if (isInsideTarget) {
      stats.misses += 1;
      stats.distractorErrorCount += 1;
      return { outcome: "distractor_error", shouldCloseTarget: true };
    }
    if (timestampMs >= target.expiresAtMs) {
      stats.hits += 1;
      stats.distractorAvoidanceCount += 1;
      return { outcome: "distractor_avoided", shouldCloseTarget: true };
    }
    return { outcome: "distractor_pending", shouldCloseTarget: false };
  }

  if (target.kind === "sequence_step") {
    if (isInsideTarget) {
      stats.hits += 1;
      stats.actionHitCount += 1;
      stats.sequenceCorrectStepCount += 1;
      if (target.sequenceStep === target.sequenceLength) {
        stats.sequenceCompletedRoundCount += 1;
      }
      stats.reactionTimes.push(timestampMs - target.appearedAtMs);
      return { outcome: "sequence_step_hit", shouldCloseTarget: true };
    }
    if (timestampMs >= target.expiresAtMs) {
      stats.misses += 1;
      stats.actionMissCount += 1;
      stats.sequenceErrorCount += 1;
      return { outcome: "sequence_step_missed", shouldCloseTarget: true };
    }
    return { outcome: "action_pending", shouldCloseTarget: false };
  }

  if (target.kind === "steady_hold") {
    if (isInsideTarget) {
      if (target.steadyHoldStartedAtMs === undefined) {
        target.steadyHoldStartedAtMs = timestampMs;
      }
      const holdDurationMs = timestampMs - target.steadyHoldStartedAtMs;
      target.steadyBestHoldMs = Math.max(target.steadyBestHoldMs ?? 0, holdDurationMs);
      stats.currentSteadyHoldMs = holdDurationMs;
      stats.steadyBestHoldMs = Math.max(stats.steadyBestHoldMs, holdDurationMs);
      if (
        target.steadyHoldRequiredMs !== undefined &&
        holdDurationMs >= target.steadyHoldRequiredMs
      ) {
        stats.hits += 1;
        stats.actionHitCount += 1;
        stats.steadyWindowCount += 1;
        stats.steadyStableWindowCount += 1;
        stats.steadyHoldDurationMsTotal += holdDurationMs;
        stats.reactionTimes.push(holdDurationMs);
        stats.currentSteadyHoldMs = 0;
        return { outcome: "steady_hold_completed", shouldCloseTarget: true };
      }
      return { outcome: "steady_hold_pending", shouldCloseTarget: false };
    }
    if (target.steadyHoldStartedAtMs !== undefined) {
      stats.steadyHoldBreakCount += 1;
      target.steadyHoldStartedAtMs = undefined;
      stats.currentSteadyHoldMs = 0;
    }
    if (timestampMs >= target.expiresAtMs) {
      stats.misses += 1;
      stats.actionMissCount += 1;
      stats.steadyWindowCount += 1;
      stats.steadyMissedWindowCount += 1;
      stats.currentSteadyHoldMs = 0;
      return { outcome: "steady_hold_missed", shouldCloseTarget: true };
    }
    return { outcome: "steady_hold_pending", shouldCloseTarget: false };
  }

  if (target.kind === "bilateral_pair") {
    if (!handHits) {
      if (timestampMs >= target.expiresAtMs) {
        stats.misses += 1;
        stats.actionMissCount += 1;
        stats.bilateralWindowCount += 1;
        stats.bilateralMissedWindowCount += 1;
        return { outcome: "bilateral_pair_missed", shouldCloseTarget: true };
      }
      return { outcome: "bilateral_pair_pending", shouldCloseTarget: false };
    }
    if (handHits.wrongSide && !target.bilateralWrongSideRecorded) {
      stats.bilateralWrongSideCount += 1;
      target.bilateralWrongSideRecorded = true;
      return { outcome: "bilateral_pair_wrong_side", shouldCloseTarget: false };
    }
    if (handHits.left && target.bilateralLeftTarget?.hitAtMs === undefined) {
      if (target.bilateralLeftTarget) {
        target.bilateralLeftTarget.hitAtMs = timestampMs;
      }
    }
    if (handHits.right && target.bilateralRightTarget?.hitAtMs === undefined) {
      if (target.bilateralRightTarget) {
        target.bilateralRightTarget.hitAtMs = timestampMs;
      }
    }

    const leftHitAtMs = target.bilateralLeftTarget?.hitAtMs;
    const rightHitAtMs = target.bilateralRightTarget?.hitAtMs;
    const isLeftWindowComplete =
      target.bilateralExpectedSide === "left" && leftHitAtMs !== undefined;
    const isRightWindowComplete =
      target.bilateralExpectedSide === "right" && rightHitAtMs !== undefined;
    const isBothWindowComplete =
      target.bilateralExpectedSide === "both" &&
      leftHitAtMs !== undefined &&
      rightHitAtMs !== undefined;
    if (isLeftWindowComplete || isRightWindowComplete || isBothWindowComplete) {
      stats.hits += 1;
      stats.actionHitCount += 1;
      stats.bilateralWindowCount += 1;
      stats.bilateralCompletedWindowCount += 1;
      if (leftHitAtMs !== undefined) {
        stats.bilateralLeftHitCount += 1;
      }
      if (rightHitAtMs !== undefined) {
        stats.bilateralRightHitCount += 1;
      }
      if (leftHitAtMs !== undefined && rightHitAtMs !== undefined) {
        const pairTimeDiffMs = Math.abs(rightHitAtMs - leftHitAtMs);
        stats.bilateralPairTimeDiffMsTotal += pairTimeDiffMs;
        stats.bilateralPairTimeDiffs.push(pairTimeDiffMs);
        stats.bilateralBestPairTimeDiffMs =
          stats.bilateralBestPairTimeDiffMs === 0
            ? pairTimeDiffMs
            : Math.min(stats.bilateralBestPairTimeDiffMs, pairTimeDiffMs);
        if (pairTimeDiffMs > bilateralSyncErrorThresholdMs) {
          stats.bilateralSyncErrorCount += 1;
        }
      }
      stats.reactionTimes.push(timestampMs - target.appearedAtMs);
      return { outcome: "bilateral_pair_completed", shouldCloseTarget: true };
    }

    if (timestampMs >= target.expiresAtMs) {
      stats.misses += 1;
      stats.actionMissCount += 1;
      stats.bilateralWindowCount += 1;
      stats.bilateralMissedWindowCount += 1;
      if (leftHitAtMs !== undefined) {
        stats.bilateralLeftHitCount += 1;
      }
      if (rightHitAtMs !== undefined) {
        stats.bilateralRightHitCount += 1;
      }
      return { outcome: "bilateral_pair_missed", shouldCloseTarget: true };
    }
    return { outcome: "bilateral_pair_pending", shouldCloseTarget: false };
  }

  if (target.kind === "balance_shift_zone") {
    if (typeof balanceCenterOffset !== "number") {
      if (!stats.qualityReasons.includes("缺少重心转移证据")) {
        stats.qualityReasons.push("缺少重心转移证据");
      }
      if (timestampMs >= target.expiresAtMs) {
        stats.misses += 1;
        stats.balanceShiftWindowCount += 1;
        stats.balanceShiftMissedWindowCount += 1;
        stats.currentBalanceHoldMs = 0;
        return { outcome: "balance_shift_missed", shouldCloseTarget: true };
      }
      return { outcome: "balance_shift_holding", shouldCloseTarget: false };
    }

    balanceCenterOffset = roundBalanceMetric(Math.abs(balanceCenterOffset));
    stats.balanceCenterOffsetSamples += 1;
    stats.balanceCenterOffsetTotal += balanceCenterOffset;
    stats.balanceCenterOffsetTotal = roundBalanceMetric(
      stats.balanceCenterOffsetTotal,
    );
    if (
      stats.balanceBestCenterOffset === 0 ||
      balanceCenterOffset < stats.balanceBestCenterOffset
    ) {
      stats.balanceBestCenterOffset = balanceCenterOffset;
    }
    if (typeof balanceStabilityDelta === "number") {
      stats.balanceStabilityDeltaTotal += Math.max(0, balanceStabilityDelta);
      stats.balanceStabilityDeltaTotal = roundBalanceMetric(
        stats.balanceStabilityDeltaTotal,
      );
    }
    stats.balanceLastCenterOffset = balanceCenterOffset;
    stats.balanceLastDirection = balanceDirection;
    stats.balanceLastStabilityDelta =
      typeof balanceStabilityDelta === "number"
        ? roundBalanceMetric(balanceStabilityDelta)
        : undefined;

    const isWrongDirection =
      balanceDirection !== undefined &&
      target.balanceExpectedDirection !== undefined &&
      balanceDirection !== target.balanceExpectedDirection;
    if (isWrongDirection && !target.balanceDirectionErrorRecorded) {
      stats.balanceDirectionErrorCount += 1;
      target.balanceDirectionErrorRecorded = true;
      if (timestampMs >= target.expiresAtMs) {
        stats.misses += 1;
        stats.balanceShiftWindowCount += 1;
        stats.balanceShiftMissedWindowCount += 1;
        stats.currentBalanceHoldMs = 0;
        return { outcome: "balance_shift_missed", shouldCloseTarget: true };
      }
      return { outcome: "balance_shift_wrong_direction", shouldCloseTarget: false };
    }

    if (isInsideTarget) {
      if (target.balanceHoldStartedAtMs === undefined) {
        target.balanceHoldStartedAtMs = timestampMs;
      }
      const balanceHoldDurationMs = timestampMs - target.balanceHoldStartedAtMs;
      target.balanceBestHoldMs = Math.max(
        target.balanceBestHoldMs ?? 0,
        balanceHoldDurationMs,
      );
      stats.currentBalanceHoldMs = balanceHoldDurationMs;
      stats.balanceBestHoldMs = Math.max(
        stats.balanceBestHoldMs,
        balanceHoldDurationMs,
      );
      if (
        target.balanceHoldRequiredMs !== undefined &&
        balanceHoldDurationMs >= target.balanceHoldRequiredMs
      ) {
        stats.hits += 1;
        stats.balanceShiftWindowCount += 1;
        stats.balanceShiftStableWindowCount += 1;
        stats.balanceHoldDurationMsTotal += balanceHoldDurationMs;
        stats.reactionTimes.push(balanceHoldDurationMs);
        stats.currentBalanceHoldMs = 0;
        return { outcome: "balance_shift_completed", shouldCloseTarget: true };
      }
      return { outcome: "balance_shift_holding", shouldCloseTarget: false };
    }

    if (target.balanceHoldStartedAtMs !== undefined) {
      stats.balanceHoldBreakCount += 1;
      target.balanceHoldStartedAtMs = undefined;
      stats.currentBalanceHoldMs = 0;
    }

    if (timestampMs >= target.expiresAtMs) {
      stats.misses += 1;
      stats.balanceShiftWindowCount += 1;
      stats.balanceShiftMissedWindowCount += 1;
      stats.currentBalanceHoldMs = 0;
      return { outcome: "balance_shift_missed", shouldCloseTarget: true };
    }
    return { outcome: "balance_shift_holding", shouldCloseTarget: false };
  }

  if (target.kind === "trajectory_trace") {
    if (typeof trajectoryDeviation !== "number") {
      if (!stats.qualityReasons.includes("缺少轨迹追踪证据")) {
        stats.qualityReasons.push("缺少轨迹追踪证据");
      }
      if (timestampMs >= target.expiresAtMs) {
        stats.misses += 1;
        stats.actionMissCount += 1;
        stats.trajectoryWindowCount += 1;
        stats.trajectoryMissedWindowCount += 1;
        return { outcome: "trajectory_trace_missed", shouldCloseTarget: true };
      }
      return { outcome: "trajectory_trace_tracking", shouldCloseTarget: false };
    }
    trajectoryDeviation = roundTrajectoryMetric(Math.max(0, trajectoryDeviation));
    stats.trajectoryPathDeviationSamples += 1;
    stats.trajectoryPathDeviationTotal += trajectoryDeviation;
    stats.trajectoryPathDeviationTotal = roundTrajectoryMetric(
      stats.trajectoryPathDeviationTotal,
    );
    if (
      stats.trajectoryBestDeviation === 0 ||
      trajectoryDeviation < stats.trajectoryBestDeviation
    ) {
      stats.trajectoryBestDeviation = trajectoryDeviation;
    }
    const previousDeviation = stats.trajectoryLastDeviation;
    if (previousDeviation !== undefined) {
      const smoothnessDelta =
        isInsideTarget || trajectoryDeviation <= previousDeviation
          ? Math.abs(trajectoryDeviation - previousDeviation)
          : Math.abs(trajectoryDeviation - stats.trajectoryBestDeviation);
      stats.trajectorySmoothnessDeltaTotal = roundTrajectoryMetric(
        stats.trajectorySmoothnessDeltaTotal + smoothnessDelta,
      );
    }
    stats.trajectoryLastDeviation = trajectoryDeviation;

    if (!isInsideTarget) {
      stats.trajectoryOffPathCount += 1;
      if (timestampMs >= target.expiresAtMs) {
        stats.misses += 1;
        stats.actionMissCount += 1;
        stats.trajectoryWindowCount += 1;
        stats.trajectoryMissedWindowCount += 1;
        return { outcome: "trajectory_trace_missed", shouldCloseTarget: true };
      }
      return { outcome: "trajectory_trace_off_path", shouldCloseTarget: false };
    }

    if (target.trajectoryStartedAtMs === undefined) {
      target.trajectoryStartedAtMs = timestampMs;
    }
    target.trajectoryLastTrackedAtMs = timestampMs;
    const currentCheckpointIndex = target.currentTrajectoryCheckpoint ?? 0;
    const checkpoint = target.trajectoryCheckpoints?.[currentCheckpointIndex];
    if (checkpoint && checkpoint.hitAtMs === undefined) {
      checkpoint.hitAtMs = timestampMs;
      target.currentTrajectoryCheckpoint = currentCheckpointIndex + 1;
      stats.trajectoryCheckpointHitCount += 1;
    }

    const checkpointCount = target.trajectoryCheckpoints?.length ?? 0;
    if ((target.currentTrajectoryCheckpoint ?? 0) >= checkpointCount) {
      const continuousTraceMs = timestampMs - (target.trajectoryStartedAtMs ?? timestampMs);
      stats.hits += 1;
      stats.actionHitCount += 1;
      stats.trajectoryWindowCount += 1;
      stats.trajectoryCompletedWindowCount += 1;
      stats.trajectoryContinuousTraceMsTotal += continuousTraceMs;
      stats.trajectoryBestContinuousTraceMs = Math.max(
        stats.trajectoryBestContinuousTraceMs,
        continuousTraceMs,
      );
      stats.reactionTimes.push(continuousTraceMs);
      return { outcome: "trajectory_trace_completed", shouldCloseTarget: true };
    }

    if (timestampMs >= target.expiresAtMs) {
      stats.misses += 1;
      stats.actionMissCount += 1;
      stats.trajectoryWindowCount += 1;
      stats.trajectoryMissedWindowCount += 1;
      return { outcome: "trajectory_trace_missed", shouldCloseTarget: true };
    }
    return { outcome: "trajectory_trace_tracking", shouldCloseTarget: false };
  }

  if (isInsideTarget) {
    stats.hits += 1;
    stats.actionHitCount += 1;
    stats.reactionTimes.push(timestampMs - target.appearedAtMs);
    return { outcome: "action_hit", shouldCloseTarget: true };
  }
  if (timestampMs >= target.expiresAtMs) {
    stats.misses += 1;
    stats.actionMissCount += 1;
    return { outcome: "action_missed", shouldCloseTarget: true };
  }
  return { outcome: "action_pending", shouldCloseTarget: false };
}

function resolveBrowserPoseTargetKind(
  gameDefinition: BrowserPoseGameDefinition,
  id: number,
): BrowserPoseTargetKind {
  if (gameDefinition.scoringProfile === "memory_sequence") {
    return "sequence_step";
  }
  if (gameDefinition.scoringProfile === "steady_breath") {
    return "steady_hold";
  }
  if (gameDefinition.scoringProfile === "bilateral_coordination") {
    return "bilateral_pair";
  }
  if (gameDefinition.scoringProfile === "balance_shift") {
    return "balance_shift_zone";
  }
  if (gameDefinition.scoringProfile === "trajectory_tracking") {
    return "trajectory_trace";
  }
  if (gameDefinition.scoringProfile === "selective_sort" && id % 3 === 0) {
    return "distractor";
  }
  return "action";
}

const sequenceLength = 3;
const steadyHoldRequiredMs = 700;
const bilateralSyncErrorThresholdMs = 240;
const balanceHoldRequiredMs = 620;

function scaleRadius(radius: number, scale: number) {
  return Number((radius * scale).toFixed(4));
}
const trajectoryCheckpointCount = 4;
const trajectoryMetricPrecision = 1_000_000;
const balanceMetricPrecision = 1_000_000;

function roundTrajectoryMetric(value: number) {
  return Math.round(value * trajectoryMetricPrecision) / trajectoryMetricPrecision;
}

function roundBalanceMetric(value: number) {
  return Math.round(value * balanceMetricPrecision) / balanceMetricPrecision;
}

function resolveBalanceExpectedDirection(
  side: BrowserPoseTarget["side"],
): BrowserPoseBalanceDirection {
  if (side === "left") return "left";
  if (side === "right") return "right";
  return "center";
}

function buildBilateralTargetPair(
  pattern: BrowserPoseGameDefinition["targetPattern"][number],
): {
  left?: BrowserPoseBilateralTargetPoint;
  right?: BrowserPoseBilateralTargetPoint;
} {
  if (pattern.side === "left") {
    return {
      left: {
        side: "left",
        x: pattern.x,
        y: pattern.y,
        radius: pattern.radius,
      },
    };
  }
  if (pattern.side === "right") {
    return {
      right: {
        side: "right",
        x: pattern.x,
        y: pattern.y,
        radius: pattern.radius,
      },
    };
  }
  const offset = Math.max(pattern.radius * 1.35, 0.12);
  return {
    left: {
      side: "left",
      x: Math.max(0.12, pattern.x - offset),
      y: pattern.y,
      radius: pattern.radius,
    },
    right: {
      side: "right",
      x: Math.min(0.88, pattern.x + offset),
      y: pattern.y,
      radius: pattern.radius,
    },
  };
}

function buildTrajectoryCheckpoints(
  gameDefinition: BrowserPoseGameDefinition,
  id: number,
): BrowserPoseTrajectoryCheckpoint[] {
  const start = (id - 1) % gameDefinition.targetPattern.length;
  return Array.from({ length: trajectoryCheckpointCount }, (_, offset) => {
    const point =
      gameDefinition.targetPattern[
        (start + offset) % gameDefinition.targetPattern.length
      ];
    return {
      x: point.x,
      y: point.y,
      radius: point.radius,
      label: point.label,
    };
  });
}

function buildBrowserPoseTargetGameplayLabel(
  targetPrefix: string,
  scoringProfile: BrowserPoseGameDefinition["scoringProfile"],
  patternLabel: string,
  id: number,
  kind: BrowserPoseTargetKind,
) {
  if (scoringProfile === "memory_sequence") {
    return `${targetPrefix} ${((id - 1) % 3) + 1} · ${patternLabel}`;
  }
  if (scoringProfile === "selective_sort" && kind === "distractor") {
    return `避开干扰 · ${patternLabel}`;
  }
  if (scoringProfile === "bilateral_coordination") {
    return `${targetPrefix} · ${patternLabel}`;
  }
  if (scoringProfile === "balance_shift") {
    return `${targetPrefix} · ${patternLabel}`;
  }
  if (scoringProfile === "trajectory_tracking") {
    return `${targetPrefix} · ${patternLabel}`;
  }
  return `${targetPrefix} · ${patternLabel}`;
}
