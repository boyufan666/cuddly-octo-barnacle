"use client";

import { Radar } from "lucide-react";
import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { PhaserPoseStage as TrainingMotionStage } from "@/components/training/PhaserPoseStage";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  browserPoseGameRequiredMetrics,
  getBrowserPoseGameplayProfile,
  getBrowserPoseGameDefinition,
  requiresEnhancedBrowserPoseStage,
  type BrowserPoseGameDefinition,
} from "@/lib/browser-pose-game-library";
import {
  applyBrowserPoseDifficultyToTarget,
  createBrowserPoseGameplayStats,
  createBrowserPoseTarget,
  resolveBrowserPoseTargetInteraction,
  type BrowserPoseGameplayStats,
  type BrowserPoseHandHits,
  type BrowserPoseTarget,
} from "@/lib/browser-pose-gameplay-rules";
import {
  createBrowserPoseRuntimeDifficulty,
  maybeUpdateBrowserPoseRuntimeDifficulty,
} from "@/lib/browser-pose-dynamic-difficulty";
import {
  hasBrowserPosePrescriptionDurationElapsed,
  requireBrowserPoseRuntimePrescription,
  requireBrowserPosePrescriptionDurationSeconds,
} from "@/lib/browser-pose-prescription";
import { requireBrowserPoseCameraDeviceId } from "@/lib/browser-pose-camera-access";
import { buildBrowserPoseTrainingResultPayload } from "@/lib/browser-pose-training-result";
import {
  createPoseTrainingRuntime,
  poseModelVersion,
  type PoseLandmark,
  type PoseTrainingRuntime,
} from "@/lib/pose-readiness";
import { cn } from "@/lib/utils";
import type {
  RehabPlan,
  SubmitTrainingResultRequest,
  TrainingSession,
} from "@/types/api";
import {
  isPlainObject,
  readTrainingRuntimeEvidenceContext,
} from "./runtime-context";

type BrowserPoseGameSnapshot = {
  phase: "idle" | "loading" | "running" | "completed" | "error";
  message: string;
  elapsedSeconds: number;
  target?: BrowserPoseTarget;
  sampleCount: number;
  validFrameCount: number;
  averageVisibility: number;
  hits: number;
  misses: number;
  averageReactionTimeMs?: number;
  motionAccuracy: number;
  qualityReasons: string[];
  resultGeneratedAt?: string;
  actionHitCount: number;
  actionMissCount: number;
  sequenceStep?: number;
  sequenceLength?: number;
  sequenceCorrectStepCount: number;
  sequenceCompletedRoundCount: number;
  sequenceErrorCount: number;
  distractorAvoidanceCount: number;
  distractorErrorCount: number;
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
  balanceShiftWindowCount: number;
  balanceShiftStableWindowCount: number;
  balanceShiftMissedWindowCount: number;
  balanceDirectionErrorCount: number;
  balanceCenterOffsetTotal: number;
  balanceCenterOffsetSamples: number;
  balanceHoldDurationMsTotal: number;
  balanceBestHoldMs: number;
  balanceHoldBreakCount: number;
  currentBalanceHoldMs: number;
  balanceHoldRequiredMs: number;
  balanceBestCenterOffset: number;
  balanceStabilityDeltaTotal: number;
  balanceLastDirection?: "left" | "center" | "right";
  balanceLastCenterOffset?: number;
  balanceLastStabilityDelta?: number;
};

const emptyBrowserPoseGameSnapshotStats = {
  elapsedSeconds: 0,
  sampleCount: 0,
  validFrameCount: 0,
  averageVisibility: 0,
  hits: 0,
  misses: 0,
  motionAccuracy: 0,
  qualityReasons: [],
  actionHitCount: 0,
  actionMissCount: 0,
  sequenceCorrectStepCount: 0,
  sequenceCompletedRoundCount: 0,
  sequenceErrorCount: 0,
  distractorAvoidanceCount: 0,
  distractorErrorCount: 0,
  steadyWindowCount: 0,
  steadyStableWindowCount: 0,
  steadyMissedWindowCount: 0,
  steadyHoldBreakCount: 0,
  steadyHoldDurationMsTotal: 0,
  steadyBestHoldMs: 0,
  currentSteadyHoldMs: 0,
  steadyHoldRequiredMs: 0,
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
  balanceShiftWindowCount: 0,
  balanceShiftStableWindowCount: 0,
  balanceShiftMissedWindowCount: 0,
  balanceDirectionErrorCount: 0,
  balanceCenterOffsetTotal: 0,
  balanceCenterOffsetSamples: 0,
  balanceHoldDurationMsTotal: 0,
  balanceBestHoldMs: 0,
  balanceHoldBreakCount: 0,
  currentBalanceHoldMs: 0,
  balanceHoldRequiredMs: 0,
  balanceBestCenterOffset: 0,
  balanceStabilityDeltaTotal: 0,
} satisfies Omit<
  BrowserPoseGameSnapshot,
  "phase" | "message" | "target" | "averageReactionTimeMs" | "resultGeneratedAt"
>;

type BrowserPoseTrainingSurfaceProps = {
  durationMinutes: number;
  game: RehabPlan["items"][number]["gameContent"];
  trainingSession: TrainingSession;
  onResultReady: (payload: SubmitTrainingResultRequest) => void;
};

export function BrowserPoseTrainingSurface(
  props: BrowserPoseTrainingSurfaceProps,
) {
  const { durationMinutes, game, trainingSession, onResultReady } = props;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const runtimeRef = useRef<PoseTrainingRuntime | null>(null);
  const animationRef = useRef<number | null>(null);
  const preparationAbortRef = useRef<AbortController | null>(null);
  const resultSubmittedRef = useRef(false);
  const mountedRef = useRef(false);
  const runTokenRef = useRef(0);
  const statsRef = useRef<BrowserPoseGameplayStats | null>(null);
  const motionStageReadyRef = useRef(false);
  const [motionStageReady, setMotionStageReady] = useState(false);
  const [snapshot, setSnapshot] = useState<BrowserPoseGameSnapshot>({
    ...emptyBrowserPoseGameSnapshotStats,
    phase: "idle",
    message: "准备开始训练",
  });

  const gameDefinitionState = readBrowserPoseGameDefinitionForScreen(game.code);
  const gameDefinition = gameDefinitionState.ok
    ? gameDefinitionState.value
    : undefined;
  const durationState = readBrowserPosePrescriptionDuration(durationMinutes);
  const targetDurationSeconds = durationState.ok ? durationState.value : 0;
  const isRunning =
    snapshot.phase === "loading" || snapshot.phase === "running";
  const requiresEnhancedStage = gameDefinition
    ? requiresEnhancedBrowserPoseStage(gameDefinition)
    : false;

  useEffect(() => {
    mountedRef.current = true;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        (preparationAbortRef.current ||
          runtimeRef.current ||
          animationRef.current !== null)
      ) {
        event.preventDefault();
        stopGame();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      mountedRef.current = false;
      runTokenRef.current += 1;
      stopBrowserPoseRuntime(runtimeRef, animationRef, preparationAbortRef);
    };
  }, []);

  async function startGame() {
    if (!videoRef.current || isRunning) return;
    if (!durationState.ok) {
      setSnapshot((current) => ({
        ...current,
        phase: "error",
        message: durationState.message,
      }));
      return;
    }
    if (!gameDefinition) {
      setSnapshot((current) => ({
        ...current,
        phase: "error",
        message: gameDefinitionState.message,
      }));
      return;
    }
    if (
      requiresEnhancedStage &&
      !isMotionStageReadyForTraining(motionStageReady, motionStageReadyRef)
    ) {
      setSnapshot((current) => ({
        ...current,
        phase: "error",
        message: "训练画面尚未就绪，不能开始本次训练。",
      }));
      return;
    }
    if (!isBrowserPoseGameReady(game)) {
      setSnapshot((current) => ({
        ...current,
        phase: "error",
        message: "该训练内容尚未准备好，请联系工作人员。",
      }));
      return;
    }

    stopBrowserPoseRuntime(runtimeRef, animationRef, preparationAbortRef);
    const runToken = runTokenRef.current + 1;
    runTokenRef.current = runToken;
    resultSubmittedRef.current = false;
    statsRef.current = null;
    const preparationController = new AbortController();
    preparationAbortRef.current = preparationController;
    setSnapshot({
      ...emptyBrowserPoseGameSnapshotStats,
      phase: "loading",
      message: "正在打开摄像头并准备训练画面",
    });

    try {
      const selectedDeviceId = requireBrowserPoseCameraDeviceId(
        trainingSession.deviceCode ?? null,
      );
      const runtime = await createPoseTrainingRuntime({
        videoElement: videoRef.current,
        deviceId: selectedDeviceId,
        signal: preparationController.signal,
      });
      if (!mountedRef.current || runTokenRef.current !== runToken) {
        runtime.stop();
        return;
      }
      if (preparationAbortRef.current === preparationController) {
        preparationAbortRef.current = null;
      }
      runtimeRef.current = runtime;
      statsRef.current = createInitialBrowserPoseStats(
        targetDurationSeconds,
        gameDefinition,
        trainingSession,
      );
      setSnapshot((current) => ({
        ...current,
        phase: "running",
        message: gameDefinition.patientInstruction,
      }));
      animationRef.current = window.requestAnimationFrame((timestampMs) =>
        tickBrowserPoseGame(timestampMs),
      );
    } catch (error) {
      stopBrowserPoseRuntime(runtimeRef, animationRef, preparationAbortRef);
      if (!mountedRef.current || runTokenRef.current !== runToken) return;
      setSnapshot((current) => ({
        ...current,
        phase: "error",
        message: resolveBrowserPoseRuntimeErrorMessage(error),
      }));
    }
  }

  function tickBrowserPoseGame(timestampMs: number) {
    const runtime = runtimeRef.current;
    const stats = statsRef.current;
    if (!runtime || !stats) return;

    try {
      const landmarks = runtime.detect(timestampMs);
      updateBrowserPoseStats(stats, landmarks, timestampMs);
      const nextSnapshot = buildBrowserPoseSnapshot(
        stats,
        "running",
        stats.gameDefinition.patientInstruction,
        timestampMs,
      );
      const isFinished = hasBrowserPosePrescriptionDurationElapsed({
        startedAtMs: stats.startedAtMs,
        timestampMs,
        targetDurationSeconds: stats.targetDurationSeconds,
      });

      if (isFinished) {
        finishGame(timestampMs);
        return;
      }

      if (timestampMs - stats.lastSnapshotAtMs >= 250) {
        stats.lastSnapshotAtMs = timestampMs;
        setSnapshot(nextSnapshot);
      }
      animationRef.current = window.requestAnimationFrame((nextTimestampMs) =>
        tickBrowserPoseGame(nextTimestampMs),
      );
    } catch (error) {
      stopBrowserPoseRuntime(runtimeRef, animationRef, preparationAbortRef);
      setSnapshot((current) => ({
        ...current,
        phase: "error",
        message: resolveBrowserPoseRuntimeErrorMessage(error),
      }));
      return;
    }
  }

  function finishGame(completedAtMs: number) {
    const stats = statsRef.current;
    if (!stats || resultSubmittedRef.current) return;
    const capturedRunToken = runTokenRef.current;
    resultSubmittedRef.current = true;
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    expireCurrentTarget(stats, completedAtMs);
    const qualityReasons = resolveBrowserPoseQualityReasons(
      stats,
      completedAtMs,
    );
    if (qualityReasons.length) {
      setSnapshot(
        buildBrowserPoseSnapshot(
          { ...stats, qualityReasons },
          "error",
          `本次训练画面不够稳定：${qualityReasons.join("；")}`,
          completedAtMs,
        ),
      );
      stopBrowserPoseRuntime(runtimeRef, animationRef, preparationAbortRef);
      return;
    }

    stopBrowserPoseRuntime(runtimeRef, animationRef, preparationAbortRef);
    try {
      buildBrowserPoseTrainingResultPayload({
        stats,
        game,
        trainingSession,
        completedAtMs,
        poseModelVersion,
      })
        .then((payload) => {
          if (!mountedRef.current || runTokenRef.current !== capturedRunToken)
            return;
          onResultReady(payload);
          setSnapshot({
            ...buildBrowserPoseSnapshot(
              stats,
              "completed",
              "本次训练已完成，请提交结果",
              completedAtMs,
            ),
            resultGeneratedAt: String(payload.metricsSummary.clientGeneratedAt),
          });
          stopBrowserPoseRuntime(runtimeRef, animationRef, preparationAbortRef);
        })
        .catch(() => {
          if (!mountedRef.current || runTokenRef.current !== capturedRunToken)
            return;
          setSnapshot(
            buildBrowserPoseSnapshot(
              stats,
              "error",
              "本次训练未能完成，请重新开始。",
              completedAtMs,
            ),
          );
          stopBrowserPoseRuntime(runtimeRef, animationRef, preparationAbortRef);
        });
    } catch {
      stopBrowserPoseRuntime(runtimeRef, animationRef, preparationAbortRef);
      setSnapshot(
        buildBrowserPoseSnapshot(
          stats,
          "error",
          "本次训练未能完成，请重新开始。",
          completedAtMs,
        ),
      );
    }
  }

  function stopGame() {
    runTokenRef.current += 1;
    stopBrowserPoseRuntime(runtimeRef, animationRef, preparationAbortRef);
    statsRef.current = null;
    setSnapshot((current) => ({
      ...current,
      phase: "idle",
      message: "训练已停止，未生成本次表现",
      target: undefined,
    }));
  }

  const progress = Math.min(
    100,
    targetDurationSeconds > 0
      ? Math.round((snapshot.elapsedSeconds / targetDurationSeconds) * 100)
      : 0,
  );
  const activeTarget = snapshot.target;
  const instruction =
    gameDefinition?.patientInstruction ?? gameDefinitionState.message;
  const clinicalPurpose =
    gameDefinition?.clinicalPurpose ?? "该训练内容尚未准备好，请联系工作人员。";
  const gameplayProfile = gameDefinition
    ? getBrowserPoseGameplayProfile(gameDefinition.scoringProfile)
    : undefined;
  const visiblePhase = durationState.ok ? snapshot.phase : "error";
  const visibleMessage = durationState.ok
    ? snapshot.message
    : durationState.message;
  const stageTitle =
    visiblePhase === "completed"
      ? "训练完成"
      : visiblePhase === "error"
        ? "需要重新完成"
        : `准备开始${game.name}`;
  const gameplayStats = resolveBrowserPoseGameplayStatsDisplay(snapshot);

  return (
    <div className="training-stage-shell mt-4 overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] text-[var(--ink-strong)] shadow-[var(--shadow-panel)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line-subtle)] bg-[var(--surface-muted)] px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase text-[var(--accent-strong)]">
            {game.name}
          </p>
          <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-[var(--ink-soft)]">
            {clinicalPurpose}
          </p>
        </div>
        <Chip status={browserPosePhaseStatus(visiblePhase)}>
          {browserPosePhaseLabel(visiblePhase)}
        </Chip>
      </div>
      <div className="relative aspect-video min-h-[clamp(280px,42vw,420px)] overflow-hidden bg-[var(--surface-muted)]">
        <video
          ref={videoRef}
          className="h-full w-full scale-x-[-1] object-cover opacity-80"
          muted
          playsInline
        />
        <div className="pointer-events-none absolute inset-0 bg-[var(--surface-inverse-muted)]" />
        {gameDefinition && requiresEnhancedBrowserPoseStage(gameDefinition) ? (
          <TrainingMotionStage
            gameName={game.name}
            profile={gameDefinition.scoringProfile}
            phase={snapshot.phase}
            onReady={() => {
              motionStageReadyRef.current = true;
              setMotionStageReady(true);
            }}
            onError={() => {
              motionStageReadyRef.current = false;
              setMotionStageReady(false);
              runTokenRef.current += 1;
              stopBrowserPoseRuntime(
                runtimeRef,
                animationRef,
                preparationAbortRef,
              );
              statsRef.current = null;
              setSnapshot((current) => ({
                ...current,
                phase: "error",
                message: resolvePatientTrainingStageErrorMessage(),
              }));
            }}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-5 rounded-[var(--radius-card)] border border-[var(--line-inverse)]" />
        {renderBrowserPoseVisibleTargets(activeTarget)}
        {snapshot.phase !== "running" ? (
          <div className="absolute inset-0 grid place-items-center bg-[var(--surface-paper)] p-8 text-center">
            <div className="max-w-xl rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-6 shadow-[var(--shadow-panel)]">
              <Badge label="训练准备状态" icon={Radar} />
              <h4 className="mt-5 text-2xl font-bold text-[var(--ink-strong)]">
                {stageTitle}
              </h4>
              <p className="mt-3 font-medium leading-7 text-[var(--ink-soft)]">
                {visibleMessage}
              </p>
              <p className="mt-4 text-xs font-bold text-[var(--ink-soft)]">
                {durationState.ok
                  ? `本次训练约 ${targetDurationSeconds} 秒，平台不会保存完整视频。`
                  : "处方时长不可用，训练不会启动。"}
              </p>
              <p className="mt-3 text-sm font-medium leading-6 text-[var(--ink-soft)]">
                {instruction}
              </p>
              {gameplayProfile ? (
                <p className="mt-3 text-sm font-bold leading-6 text-[var(--accent-strong)]">
                  {gameplayProfile.scoringHint}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <div className="grid gap-3 border-t border-[var(--line-subtle)] bg-[var(--surface-paper)] p-5 md:grid-cols-4">
        <div className="md:col-span-4">
          <Progress value={progress} />
        </div>
        <PatientTrainingStat
          label="训练表现"
          value={`${Math.round(snapshot.motionAccuracy * 100)}%`}
        />
        <PatientTrainingStat
          label="画面状态"
          value={resolvePatientFrameStatus(snapshot)}
        />
        <PatientTrainingStat
          label={gameplayStats.primaryLabel}
          value={gameplayStats.primaryValue}
        />
        <PatientTrainingStat
          label={gameplayStats.secondaryLabel}
          value={gameplayStats.secondaryValue}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line-subtle)] bg-[var(--surface-muted)] p-5">
        <p className="max-w-2xl font-medium leading-7 text-[var(--ink-soft)]">
          {snapshot.phase === "idle" ? instruction : snapshot.message}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            className="touch-manipulation"
            disabled={isRunning || !durationState.ok}
            onClick={() => void startGame()}
          >
            {snapshot.phase === "completed" ? "重新训练" : "开始训练"}
          </Button>
          {isRunning ? (
            <Button
              aria-keyshortcuts="Escape"
              className="touch-manipulation"
              type="button"
              onClick={stopGame}
              intent="secondary"
            >
              停止训练
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function isMotionStageReadyForTraining(
  motionStageReady: boolean,
  motionStageReadyRef: Pick<MutableRefObject<boolean>, "current">,
) {
  return motionStageReady || motionStageReadyRef.current;
}

function PatientTrainingStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-h-[96px] rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] p-4">
      <p className="text-xs font-bold uppercase text-[var(--accent-strong)]">
        {label}
      </p>
      <strong className="mt-2 block text-2xl font-bold text-[var(--ink-strong)]">
        {value}
      </strong>
    </div>
  );
}

function resolvePatientFrameStatus(snapshot: BrowserPoseGameSnapshot) {
  if (snapshot.phase === "idle" || snapshot.phase === "loading")
    return "准备中";
  if (!snapshot.sampleCount) return "请站稳";
  const ratio = snapshot.validFrameCount / snapshot.sampleCount;
  if (ratio >= 0.82) return "稳定";
  if (ratio >= 0.62) return "请保持";
  return "调整站位";
}

function renderBrowserPoseVisibleTargets(target?: BrowserPoseTarget) {
  if (!target) return null;
  if (target.kind === "balance_shift_zone") {
    const direction =
      target.x < 0.42 ? "左侧" : target.x > 0.58 ? "右侧" : "中线";
    return (
      <>
        <div
          className="pointer-events-none absolute bottom-[18%] top-[18%] w-1 -translate-x-1/2 rounded-[var(--radius-control)] bg-[var(--warning-line)]"
          style={{ left: "50%" }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute left-[18%] right-[18%] top-1/2 h-2 -translate-y-1/2 rounded-[var(--radius-control)] bg-[var(--accent-soft)]"
          aria-hidden="true"
        />
        <BrowserPoseVisibleTarget
          x={target.x}
          y={target.y}
          radius={target.radius}
          label={`${resolvePatientTargetLabel(target)} · ${direction}`}
          tone="warning"
        />
      </>
    );
  }
  if (target.kind === "trajectory_trace") {
    const checkpoints = target.trajectoryCheckpoints ?? [];
    const pathPoints = checkpoints
      .map((checkpoint) => `${checkpoint.x * 100},${checkpoint.y * 100}`)
      .join(" ");

    return (
      <>
        {checkpoints.length > 1 ? (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              className="text-[var(--accent-soft-strong)] opacity-35"
              points={pathPoints}
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              className="text-[var(--warning-line)] opacity-85"
              points={pathPoints}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="4 3"
            />
          </svg>
        ) : null}
        {checkpoints.map((checkpoint, index) => {
          const currentIndex = target.currentTrajectoryCheckpoint ?? 0;
          const isCompleted = checkpoint.hitAtMs !== undefined;
          const isCurrent = index === currentIndex;
          return (
            <BrowserPoseVisibleTarget
              key={`${target.id}-trajectory-${index}`}
              x={checkpoint.x}
              y={checkpoint.y}
              radius={checkpoint.radius}
              label={`${index + 1}`}
              tone={isCompleted ? "success" : isCurrent ? "warning" : "info"}
            />
          );
        })}
      </>
    );
  }

  if (target.kind === "bilateral_pair") {
    const targets =
      target.bilateralExpectedSide === "both"
        ? [
            target.bilateralLeftTarget
              ? {
                  ...target.bilateralLeftTarget,
                  label: "左手",
                  tone: "info" as const,
                }
              : undefined,
            target.bilateralRightTarget
              ? {
                  ...target.bilateralRightTarget,
                  label: "右手",
                  tone: "success" as const,
                }
              : undefined,
          ].filter(Boolean)
        : [
            {
              x: target.x,
              y: target.y,
              radius: target.radius,
              label: target.bilateralExpectedSide === "left" ? "左手" : "右手",
              tone:
                target.bilateralExpectedSide === "left"
                  ? ("info" as const)
                  : ("success" as const),
            },
          ];

    return (
      <>
        {targets.map((visibleTarget) =>
          visibleTarget ? (
            <BrowserPoseVisibleTarget
              key={`${target.id}-${visibleTarget.label}`}
              x={visibleTarget.x}
              y={visibleTarget.y}
              radius={visibleTarget.radius}
              label={`${resolvePatientTargetLabel(target)} · ${visibleTarget.label}`}
              tone={visibleTarget.tone}
            />
          ) : null,
        )}
      </>
    );
  }

  return (
    <BrowserPoseVisibleTarget
      x={target.x}
      y={target.y}
      radius={target.radius}
      label={resolvePatientTargetLabel(target)}
      tone={
        target.kind === "distractor"
          ? "danger"
          : target.kind === "steady_hold"
            ? "info"
            : target.side === "left"
              ? "info"
              : target.side === "both"
                ? "warning"
                : "success"
      }
    />
  );
}

function resolvePatientTargetLabel(target: BrowserPoseTarget) {
  if (target.kind === "distractor") return "请避开";
  if (target.kind === "sequence_step") {
    return target.sequenceStep ? `第 ${target.sequenceStep} 步` : "按顺序";
  }
  if (target.kind === "steady_hold") return "保持";
  if (target.kind === "bilateral_pair") return "双手配合";
  if (target.kind === "balance_shift_zone") return "平衡移动";
  if (target.kind === "trajectory_trace") return "跟随路线";
  if (target.side === "left") return "左手";
  if (target.side === "right") return "右手";
  return "完成动作";
}

function BrowserPoseVisibleTarget({
  x,
  y,
  radius,
  label,
  tone,
}: {
  x: number;
  y: number;
  radius: number;
  label: string;
  tone: "info" | "success" | "warning" | "danger";
}) {
  const toneClassName = {
    info: "border-[var(--accent-strong)] bg-[var(--accent-soft)] text-[var(--accent-stronger)]",
    success:
      "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success)]",
    warning:
      "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning)]",
    danger:
      "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger)]",
  };

  return (
    <div
      className={cn(
        "pointer-events-none absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[var(--radius-card)] border-4 shadow-[var(--shadow-panel)]",
        toneClassName[tone],
      )}
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        height: `${radius * 220}px`,
        width: `${radius * 220}px`,
      }}
    >
      <span className="rounded-[var(--radius-control)] bg-[var(--surface-paper)] px-3 py-1 text-sm font-bold">
        {label}
      </span>
    </div>
  );
}

function resolveBrowserPoseGameplayStatsDisplay(
  snapshot: BrowserPoseGameSnapshot,
) {
  if (snapshot.target?.kind === "sequence_step") {
    const sequencePosition =
      snapshot.sequenceStep && snapshot.sequenceLength
        ? `${snapshot.sequenceStep}/${snapshot.sequenceLength}`
        : "等待下一步";
    return {
      primaryLabel: "当前进度",
      primaryValue: `${sequencePosition} · ${snapshot.sequenceCompletedRoundCount}轮`,
      secondaryLabel: "完成情况",
      secondaryValue: `${snapshot.sequenceCorrectStepCount}步完成 / ${snapshot.sequenceErrorCount}次需重试`,
    };
  }

  if (snapshot.target?.kind === "distractor") {
    return {
      primaryLabel: "选择完成",
      primaryValue: `${snapshot.distractorAvoidanceCount}次完成 / ${snapshot.distractorErrorCount}次需重试`,
      secondaryLabel: "训练节奏",
      secondaryValue: formatPatientTrainingPace(snapshot.averageReactionTimeMs),
    };
  }

  if (snapshot.target?.kind === "steady_hold") {
    return {
      primaryLabel: "保持完成",
      primaryValue: `${snapshot.steadyStableWindowCount}/${snapshot.steadyWindowCount}`,
      secondaryLabel: "保持状态",
      secondaryValue: formatPatientHoldProgress(
        snapshot.currentSteadyHoldMs,
        snapshot.steadyHoldRequiredMs,
      ),
    };
  }

  if (snapshot.target?.kind === "bilateral_pair") {
    const averagePairTimeDiffMs =
      snapshot.bilateralPairTimeDiffs.length > 0
        ? Math.round(
            snapshot.bilateralPairTimeDiffMsTotal /
              snapshot.bilateralPairTimeDiffs.length,
          )
        : 0;
    return {
      primaryLabel: "双手完成",
      primaryValue: `${snapshot.bilateralCompletedWindowCount}/${snapshot.bilateralWindowCount}`,
      secondaryLabel: "配合节奏",
      secondaryValue: formatPatientCoordinationPace(
        averagePairTimeDiffMs,
        snapshot.bilateralWrongSideCount,
      ),
    };
  }

  if (snapshot.target?.kind === "trajectory_trace") {
    const checkpointCount = snapshot.target.trajectoryCheckpoints?.length ?? 0;
    const currentCheckpoint = Math.min(
      snapshot.target.currentTrajectoryCheckpoint ?? 0,
      checkpointCount,
    );
    return {
      primaryLabel: "路线进度",
      primaryValue:
        checkpointCount > 0
          ? `${currentCheckpoint}/${checkpointCount}步`
          : `${snapshot.trajectoryCompletedWindowCount}/${snapshot.trajectoryWindowCount}`,
      secondaryLabel: "跟随状态",
      secondaryValue: snapshot.trajectoryOffPathCount
        ? `${snapshot.trajectoryOffPathCount}次需调整`
        : "跟随提示",
    };
  }

  if (snapshot.target?.kind === "balance_shift_zone") {
    const averageCenterOffset =
      snapshot.balanceCenterOffsetSamples > 0
        ? snapshot.balanceCenterOffsetTotal /
          snapshot.balanceCenterOffsetSamples
        : snapshot.balanceLastCenterOffset;
    const directionLabel =
      snapshot.balanceLastDirection === "left"
        ? "左"
        : snapshot.balanceLastDirection === "right"
          ? "右"
          : snapshot.balanceLastDirection === "center"
            ? "中"
            : "训练中";
    return {
      primaryLabel: "平衡进度",
      primaryValue: `${snapshot.balanceShiftStableWindowCount}/${snapshot.balanceShiftWindowCount}`,
      secondaryLabel: "移动状态",
      secondaryValue:
        averageCenterOffset === undefined
          ? directionLabel
          : `${resolvePatientBalanceControlLabel(averageCenterOffset)} · ${directionLabel}`,
    };
  }

  return {
    primaryLabel: "动作完成",
    primaryValue: `${snapshot.actionHitCount}次完成 / ${snapshot.actionMissCount}次需重试`,
    secondaryLabel: "训练节奏",
    secondaryValue: formatPatientTrainingPace(snapshot.averageReactionTimeMs),
  };
}

function formatPatientHoldProgress(currentMs: number, requiredMs: number) {
  if (!requiredMs || !currentMs) return "准备中";
  const progress = currentMs / requiredMs;
  if (progress >= 1) return "本次已完成";
  if (progress >= 0.6) return "继续保持";
  return "开始保持";
}

function formatPatientTrainingPace(value?: number) {
  if (!value) return "训练中";
  if (value <= 900) return "节奏较快";
  if (value <= 1600) return "节奏稳定";
  return "放慢一点";
}

function formatPatientCoordinationPace(
  averagePairTimeDiffMs: number,
  wrongSideCount: number,
) {
  if (wrongSideCount > 0) return `${wrongSideCount}次需重试`;
  if (!averagePairTimeDiffMs) return "训练中";
  return averagePairTimeDiffMs <= 450 ? "配合稳定" : "继续配合";
}

function resolvePatientBalanceControlLabel(centerOffset: number) {
  if (centerOffset <= 0.1) return "稳定";
  if (centerOffset <= 0.2) return "接近目标";
  return "继续调整";
}

function readBrowserPoseGameDefinitionForScreen(
  code: string,
):
  | { ok: true; value: BrowserPoseGameDefinition; message: string }
  | { ok: false; message: string } {
  try {
    const definition = getBrowserPoseGameDefinition(code);
    return {
      ok: true,
      value: definition,
      message: definition.patientInstruction,
    };
  } catch {
    return {
      ok: false,
      message: resolvePatientTrainingStageErrorMessage(),
    };
  }
}

function resolvePatientTrainingStageErrorMessage() {
  return "训练画面暂不可开始，请返回今日任务或联系工作人员。";
}

function stopBrowserPoseRuntime(
  runtimeRef: MutableRefObject<PoseTrainingRuntime | null>,
  animationRef: MutableRefObject<number | null>,
  preparationAbortRef: MutableRefObject<AbortController | null>,
) {
  preparationAbortRef.current?.abort();
  preparationAbortRef.current = null;
  if (animationRef.current !== null) {
    window.cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  }
  runtimeRef.current?.stop();
  runtimeRef.current = null;
}

function createInitialBrowserPoseStats(
  targetDurationSeconds: number,
  gameDefinition: BrowserPoseGameDefinition,
  trainingSession: TrainingSession,
): BrowserPoseGameplayStats {
  const startedAtMs = performance.now();
  const frozenRuntime = requireBrowserPoseRuntimePrescription({
    runtimeConfigSnapshot: trainingSession.runtimeConfigSnapshot,
    trainingSessionClientStartedAt: trainingSession.clientStartedAt,
    prescribedDurationSeconds: targetDurationSeconds,
  });
  const startedAtIso = frozenRuntime.clientStartedAt.iso;
  const evidenceContext = readTrainingRuntimeEvidenceContext(
    trainingSession.runtimeConfigSnapshot,
  );
  const gameRunId = trainingSession.gameRunId?.trim();
  if (!gameRunId) {
    throw new Error("训练运行标识缺失，不能启动动态难度训练。");
  }
  const runtimeDifficulty = createBrowserPoseRuntimeDifficulty({
    startingLevel: evidenceContext.startingDifficultyLevel,
    approvedPlanItemId: evidenceContext.approvedPlanItemId,
    assessmentSourceId: evidenceContext.assessmentSourceId,
    gameRunId,
    startedAtMs,
    startedAtIso,
    baseTargetIntervalMs: gameDefinition.targetIntervalMs,
    baseTargetLifetimeMs: gameDefinition.targetExpiresMs,
  });
  const stats = createBrowserPoseGameplayStats(
    gameDefinition,
    frozenRuntime.prescribedDurationSeconds,
    startedAtMs,
    startedAtIso,
  );
  stats.runtimeDifficulty = runtimeDifficulty;
  stats.difficultyAdjustmentEvents = runtimeDifficulty.events;
  return stats;
}

function updateBrowserPoseStats(
  stats: BrowserPoseGameplayStats,
  landmarks: PoseLandmark[],
  timestampMs: number,
) {
  const runtimeDifficulty = requireBrowserPoseRuntimeDifficulty(stats);
  const difficultyParameters = runtimeDifficulty.currentParameters;
  stats.sampleCount += 1;
  const visibility = averagePoseVisibility(landmarks);
  if (
    visibility >= difficultyParameters.minimumLandmarkVisibility &&
    landmarks.length >= 20
  ) {
    stats.validFrameCount += 1;
    stats.visibilityTotal += visibility;
  }

  updateWristTravel(
    stats,
    landmarks,
    difficultyParameters.minimumLandmarkVisibility,
  );
  if (
    !stats.activeTarget &&
    timestampMs - stats.lastTargetEndedAtMs >=
      runtimeDifficulty.currentParameters.targetIntervalMs
  ) {
    stats.activeTarget = applyBrowserPoseDifficultyToTarget(
      createBrowserPoseTarget(
        stats.gameDefinition,
        stats.nextTargetId,
        timestampMs,
      ),
      runtimeDifficulty.currentParameters,
    );
    if (stats.activeTarget.steadyHoldRequiredMs !== undefined) {
      stats.steadyHoldRequiredMs = stats.activeTarget.steadyHoldRequiredMs;
    }
    if (stats.activeTarget.balanceHoldRequiredMs !== undefined) {
      stats.balanceHoldRequiredMs = stats.activeTarget.balanceHoldRequiredMs;
    }
    stats.nextTargetId += 1;
  }

  const target = stats.activeTarget;
  if (!target) return;
  const trajectoryDeviation = resolveBrowserPoseTrajectoryDeviation(
    landmarks,
    target,
  );
  const balanceEvidence = resolveBrowserPoseBalanceEvidence(
    stats,
    landmarks,
    target,
  );
  const interactionPayload: Parameters<
    typeof resolveBrowserPoseTargetInteraction
  >[2] & {
    trajectoryDeviation?: number;
    balanceCenterOffset?: number;
    balanceStabilityDelta?: number;
    balanceDirection?: "left" | "center" | "right";
  } = {
    isInsideTarget: isBrowserPoseTargetHit(landmarks, target),
    handHits: resolveBrowserPoseTargetHandHits(landmarks, target),
    timestampMs,
  };
  if (trajectoryDeviation !== undefined) {
    interactionPayload.trajectoryDeviation = trajectoryDeviation;
  }
  if (balanceEvidence) {
    interactionPayload.balanceCenterOffset =
      balanceEvidence.balanceCenterOffset;
    interactionPayload.balanceStabilityDelta =
      balanceEvidence.balanceStabilityDelta;
    interactionPayload.balanceDirection = balanceEvidence.balanceDirection;
  }
  const interaction = resolveBrowserPoseTargetInteraction(
    stats,
    target,
    interactionPayload,
  );
  if (interaction.shouldCloseTarget) {
    stats.activeTarget = undefined;
    stats.lastTargetEndedAtMs = timestampMs;
    maybeUpdateBrowserPoseRuntimeDifficulty(runtimeDifficulty, {
      timestampMs,
      hits: stats.hits,
      misses: stats.misses,
      sampleCount: stats.sampleCount,
      validFrameCount: stats.validFrameCount,
      reactionTimes: stats.reactionTimes,
    });
  }
}

function expireCurrentTarget(
  stats: BrowserPoseGameplayStats,
  timestampMs: number,
) {
  if (!stats.activeTarget) return;
  resolveBrowserPoseTargetInteraction(stats, stats.activeTarget, {
    isInsideTarget: false,
    timestampMs: Math.max(timestampMs, stats.activeTarget.expiresAtMs),
  });
  stats.activeTarget = undefined;
  stats.lastTargetEndedAtMs = timestampMs;
}

function averagePoseVisibility(landmarks: PoseLandmark[]) {
  if (!landmarks.length) return 0;
  return (
    landmarks.reduce((sum, landmark) => sum + (landmark.visibility ?? 0), 0) /
    landmarks.length
  );
}

function selectTargetWrist(
  landmarks: PoseLandmark[],
  side: "left" | "right",
  minimumLandmarkVisibility: number,
) {
  const wrist = landmarks[side === "left" ? 15 : 16];
  if (!wrist || (wrist.visibility ?? 0) < minimumLandmarkVisibility) {
    return undefined;
  }
  return wrist;
}

function isBrowserPoseTargetHit(
  landmarks: PoseLandmark[],
  target: BrowserPoseTarget,
) {
  if (target.kind === "balance_shift_zone") {
    return isBrowserPoseBalanceShiftHit(landmarks, target);
  }
  if (target.kind === "trajectory_trace") {
    return isBrowserPoseTrajectoryCheckpointHit(landmarks, target);
  }
  if (target.side === "both") {
    const leftWrist = selectTargetWrist(
      landmarks,
      "left",
      target.minimumLandmarkVisibility,
    );
    const rightWrist = selectTargetWrist(
      landmarks,
      "right",
      target.minimumLandmarkVisibility,
    );
    return (
      Boolean(leftWrist && isWristInsideTarget(leftWrist, target)) &&
      Boolean(rightWrist && isWristInsideTarget(rightWrist, target))
    );
  }
  const wrist = selectTargetWrist(
    landmarks,
    target.side,
    target.minimumLandmarkVisibility,
  );
  return Boolean(wrist && isWristInsideTarget(wrist, target));
}

function isBrowserPoseBalanceShiftHit(
  landmarks: PoseLandmark[],
  target: BrowserPoseTarget,
) {
  const balanceEvidence = resolveBrowserPoseBalanceEvidence(
    undefined,
    landmarks,
    target,
  );
  return Boolean(
    balanceEvidence && isBalanceDirectionInsideTarget(balanceEvidence, target),
  );
}

function isBrowserPoseTrajectoryCheckpointHit(
  landmarks: PoseLandmark[],
  target: BrowserPoseTarget,
) {
  const wrist = selectTrajectoryTrackingWrist(landmarks, target);
  const checkpoint = resolveActiveTrajectoryCheckpoint(target);
  return Boolean(wrist && checkpoint && isWristInsideTarget(wrist, checkpoint));
}

function resolveBrowserPoseTargetHandHits(
  landmarks: PoseLandmark[],
  target: BrowserPoseTarget,
): BrowserPoseHandHits | undefined {
  if (target.kind !== "bilateral_pair") return undefined;
  const leftWrist = selectTargetWrist(
    landmarks,
    "left",
    target.minimumLandmarkVisibility,
  );
  const rightWrist = selectTargetWrist(
    landmarks,
    "right",
    target.minimumLandmarkVisibility,
  );
  const leftCorrect = Boolean(
    leftWrist &&
    target.bilateralLeftTarget &&
    isWristInsideTarget(leftWrist, target.bilateralLeftTarget),
  );
  const rightCorrect = Boolean(
    rightWrist &&
    target.bilateralRightTarget &&
    isWristInsideTarget(rightWrist, target.bilateralRightTarget),
  );
  const wrongSide =
    target.bilateralExpectedSide === "left"
      ? Boolean(rightWrist && isWristInsideTarget(rightWrist, target))
      : target.bilateralExpectedSide === "right"
        ? Boolean(leftWrist && isWristInsideTarget(leftWrist, target))
        : Boolean(
            leftWrist &&
            target.bilateralRightTarget &&
            isWristInsideTarget(leftWrist, target.bilateralRightTarget),
          ) ||
          Boolean(
            rightWrist &&
            target.bilateralLeftTarget &&
            isWristInsideTarget(rightWrist, target.bilateralLeftTarget),
          );
  return {
    left: leftCorrect,
    right: rightCorrect,
    wrongSide,
  };
}

function resolveBrowserPoseTrajectoryDeviation(
  landmarks: PoseLandmark[],
  target: BrowserPoseTarget,
) {
  if (target.kind !== "trajectory_trace") return undefined;
  const wrist = selectTrajectoryTrackingWrist(landmarks, target);
  const checkpoint = resolveActiveTrajectoryCheckpoint(target);
  if (!wrist || !checkpoint) return undefined;
  const mirroredX = 1 - wrist.x;
  const dx = mirroredX - checkpoint.x;
  const dy = wrist.y - checkpoint.y;
  return Math.sqrt(dx * dx + dy * dy);
}

type BrowserPoseBalanceEvidence = {
  balanceCenterOffset: number;
  balanceStabilityDelta: number;
  balanceDirection: "left" | "center" | "right";
};

type BrowserPoseBalanceStats = BrowserPoseGameplayStats & {
  previousBalanceCenterOffset?: number;
};

function resolveBrowserPoseBalanceEvidence(
  stats: BrowserPoseGameplayStats | undefined,
  landmarks: PoseLandmark[],
  target: BrowserPoseTarget,
): BrowserPoseBalanceEvidence | undefined {
  if (target.kind !== "balance_shift_zone") return undefined;
  const bodyCenter = resolveBrowserPoseBodyCenter(
    landmarks,
    target.minimumLandmarkVisibility,
  );
  if (!bodyCenter) return undefined;
  const balanceCenterOffset = bodyCenter.x - 0.5;
  const previousOffset = (stats as BrowserPoseBalanceStats | undefined)
    ?.previousBalanceCenterOffset;
  const balanceStabilityDelta =
    previousOffset === undefined
      ? 0
      : Math.abs(balanceCenterOffset - previousOffset);
  if (stats) {
    (stats as BrowserPoseBalanceStats).previousBalanceCenterOffset =
      balanceCenterOffset;
  }
  return {
    balanceCenterOffset,
    balanceStabilityDelta,
    balanceDirection: resolveBrowserPoseBalanceDirection(balanceCenterOffset),
  };
}

function resolveBrowserPoseBodyCenter(
  landmarks: PoseLandmark[],
  minimumLandmarkVisibility: number,
) {
  const points = [
    landmarks[11],
    landmarks[12],
    landmarks[23],
    landmarks[24],
  ].filter((landmark): landmark is PoseLandmark =>
    Boolean(
      landmark && (landmark.visibility ?? 0) >= minimumLandmarkVisibility,
    ),
  );
  if (points.length < 2) return undefined;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function resolveBrowserPoseBalanceDirection(
  balanceCenterOffset: number,
): "left" | "center" | "right" {
  if (balanceCenterOffset < -0.08) return "left";
  if (balanceCenterOffset > 0.08) return "right";
  return "center";
}

function isBalanceDirectionInsideTarget(
  balanceEvidence: BrowserPoseBalanceEvidence,
  target: BrowserPoseTarget,
) {
  const expectedDirection = resolveBrowserPoseBalanceTargetDirection(target);
  if (balanceEvidence.balanceDirection !== expectedDirection) return false;
  return balanceEvidence.balanceStabilityDelta <= 0.035;
}

function resolveBrowserPoseBalanceTargetDirection(
  target: Pick<BrowserPoseTarget, "x">,
): "left" | "center" | "right" {
  if (target.x < 0.42) return "left";
  if (target.x > 0.58) return "right";
  return "center";
}

function resolveActiveTrajectoryCheckpoint(target: BrowserPoseTarget) {
  const checkpoints = target.trajectoryCheckpoints ?? [];
  const checkpointIndex = target.currentTrajectoryCheckpoint ?? 0;
  if (checkpointIndex < 0 || checkpointIndex >= checkpoints.length) {
    return undefined;
  }
  return checkpoints[checkpointIndex];
}

function selectTrajectoryTrackingWrist(
  landmarks: PoseLandmark[],
  target: BrowserPoseTarget,
) {
  if (target.side === "left") {
    return selectTargetWrist(
      landmarks,
      "left",
      target.minimumLandmarkVisibility,
    );
  }
  if (target.side === "right") {
    return selectTargetWrist(
      landmarks,
      "right",
      target.minimumLandmarkVisibility,
    );
  }
  const leftWrist = selectTargetWrist(
    landmarks,
    "left",
    target.minimumLandmarkVisibility,
  );
  const rightWrist = selectTargetWrist(
    landmarks,
    "right",
    target.minimumLandmarkVisibility,
  );
  const checkpoint = resolveActiveTrajectoryCheckpoint(target);
  if (!checkpoint) return leftWrist ?? rightWrist;
  if (!leftWrist) return rightWrist;
  if (!rightWrist) return leftWrist;
  return wristDistanceToTarget(leftWrist, checkpoint) <=
    wristDistanceToTarget(rightWrist, checkpoint)
    ? leftWrist
    : rightWrist;
}

function isWristInsideTarget(
  wrist: PoseLandmark,
  target: Pick<BrowserPoseTarget, "x" | "y" | "radius">,
) {
  const mirroredX = 1 - wrist.x;
  const dx = mirroredX - target.x;
  const dy = wrist.y - target.y;
  return Math.sqrt(dx * dx + dy * dy) <= target.radius;
}

function wristDistanceToTarget(
  wrist: PoseLandmark,
  target: Pick<BrowserPoseTarget, "x" | "y">,
) {
  const mirroredX = 1 - wrist.x;
  const dx = mirroredX - target.x;
  const dy = wrist.y - target.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function updateWristTravel(
  stats: BrowserPoseGameplayStats,
  landmarks: PoseLandmark[],
  minimumLandmarkVisibility: number,
) {
  const leftWrist = selectTargetWrist(
    landmarks,
    "left",
    minimumLandmarkVisibility,
  );
  const rightWrist = selectTargetWrist(
    landmarks,
    "right",
    minimumLandmarkVisibility,
  );
  if (leftWrist && stats.previousLeftWrist) {
    stats.motionTravel += distanceBetweenPosePoints(
      stats.previousLeftWrist,
      leftWrist,
    );
  }
  if (rightWrist && stats.previousRightWrist) {
    stats.motionTravel += distanceBetweenPosePoints(
      stats.previousRightWrist,
      rightWrist,
    );
  }
  if (leftWrist) {
    stats.previousLeftWrist = { x: leftWrist.x, y: leftWrist.y };
  }
  if (rightWrist) {
    stats.previousRightWrist = { x: rightWrist.x, y: rightWrist.y };
  }
}

function distanceBetweenPosePoints(
  previous: { x: number; y: number },
  current: { x: number; y: number },
) {
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function buildBrowserPoseSnapshot(
  stats: BrowserPoseGameplayStats,
  phase: BrowserPoseGameSnapshot["phase"],
  message: string,
  timestampMs: number,
): BrowserPoseGameSnapshot {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((timestampMs - stats.startedAtMs) / 1000),
  );
  const averageVisibility =
    stats.validFrameCount > 0
      ? stats.visibilityTotal / stats.validFrameCount
      : 0;
  return {
    phase,
    message,
    elapsedSeconds,
    target: stats.activeTarget,
    sampleCount: stats.sampleCount,
    validFrameCount: stats.validFrameCount,
    averageVisibility: Number(averageVisibility.toFixed(3)),
    hits: stats.hits,
    misses: stats.misses,
    averageReactionTimeMs: average(stats.reactionTimes),
    motionAccuracy: computeBrowserPoseAccuracy(stats),
    qualityReasons: stats.qualityReasons,
    actionHitCount: stats.actionHitCount,
    actionMissCount: stats.actionMissCount,
    sequenceStep: stats.activeTarget?.sequenceStep,
    sequenceLength: stats.activeTarget?.sequenceLength,
    sequenceCorrectStepCount: stats.sequenceCorrectStepCount,
    sequenceCompletedRoundCount: stats.sequenceCompletedRoundCount,
    sequenceErrorCount: stats.sequenceErrorCount,
    distractorAvoidanceCount: stats.distractorAvoidanceCount,
    distractorErrorCount: stats.distractorErrorCount,
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
    balanceShiftWindowCount: stats.balanceShiftWindowCount,
    balanceShiftStableWindowCount: stats.balanceShiftStableWindowCount,
    balanceShiftMissedWindowCount: stats.balanceShiftMissedWindowCount,
    balanceDirectionErrorCount: stats.balanceDirectionErrorCount,
    balanceCenterOffsetTotal: stats.balanceCenterOffsetTotal,
    balanceCenterOffsetSamples: stats.balanceCenterOffsetSamples,
    balanceHoldDurationMsTotal: stats.balanceHoldDurationMsTotal,
    balanceBestHoldMs: stats.balanceBestHoldMs,
    balanceHoldBreakCount: stats.balanceHoldBreakCount,
    currentBalanceHoldMs: stats.currentBalanceHoldMs,
    balanceHoldRequiredMs: stats.balanceHoldRequiredMs,
    balanceBestCenterOffset: stats.balanceBestCenterOffset,
    balanceStabilityDeltaTotal: stats.balanceStabilityDeltaTotal,
    balanceLastDirection: stats.balanceLastDirection,
    balanceLastCenterOffset: stats.balanceLastCenterOffset,
    balanceLastStabilityDelta: stats.balanceLastStabilityDelta,
  };
}

function resolveBrowserPoseQualityReasons(
  stats: BrowserPoseGameplayStats,
  completedAtMs: number,
) {
  const durationSeconds = Math.round(
    (completedAtMs - stats.startedAtMs) / 1000,
  );
  const reasons: string[] = [];
  const validFrameRatio =
    stats.sampleCount > 0 ? stats.validFrameCount / stats.sampleCount : 0;
  const averageVisibility =
    stats.validFrameCount > 0
      ? stats.visibilityTotal / stats.validFrameCount
      : 0;

  if (durationSeconds < stats.gameDefinition.minDurationSeconds) {
    reasons.push(`训练时长不足 ${stats.gameDefinition.minDurationSeconds} 秒`);
  }
  if (stats.sampleCount <= 0) {
    reasons.push("没有完成可保存的训练动作");
  }
  if (validFrameRatio < stats.gameDefinition.minValidFrameRatio) {
    reasons.push(
      `入镜稳定时间低于 ${Math.round(stats.gameDefinition.minValidFrameRatio * 100)}%`,
    );
  }
  if (averageVisibility < stats.gameDefinition.minAverageVisibility) {
    reasons.push("身体和双手入镜不完整");
  }
  if (stats.hits + stats.misses < stats.gameDefinition.minActionWindows) {
    reasons.push("完成的动作次数不足");
  }
  if (!stats.reactionTimes.length) {
    if (stats.gameDefinition.scoringProfile === "steady_breath") {
      reasons.push("保持动作时间还不够");
    } else if (
      stats.gameDefinition.scoringProfile === "bilateral_coordination"
    ) {
      reasons.push("双手配合次数还不够");
    } else if (stats.gameDefinition.scoringProfile === "trajectory_tracking") {
      reasons.push("路线跟随次数还不够");
    } else if (stats.gameDefinition.scoringProfile === "balance_shift") {
      reasons.push("平衡移动练习次数还不够");
    } else {
      reasons.push("完成动作次数还不够");
    }
  }
  if (
    stats.gameDefinition.scoringProfile === "trajectory_tracking" &&
    stats.trajectoryPathDeviationSamples > 0
  ) {
    const averagePathDeviation =
      stats.trajectoryPathDeviationTotal / stats.trajectoryPathDeviationSamples;
    if (averagePathDeviation > 0.32) {
      reasons.push("跟随路线不够稳定");
    }
  }
  return reasons;
}

function computeBrowserPoseCompletionRate(stats: BrowserPoseGameplayStats) {
  const totalTargets = stats.hits + stats.misses;
  if (!totalTargets) return 0;
  return clamp(stats.hits / totalTargets, 0, 1);
}

function computeBrowserPoseAccuracy(stats: BrowserPoseGameplayStats) {
  const hitRate = computeBrowserPoseCompletionRate(stats);
  const reactionScore =
    stats.reactionTimes.length > 0
      ? clamp(1 - (average(stats.reactionTimes) ?? 2600) / 2600, 0, 1)
      : 0;
  const validFrameRatio =
    stats.sampleCount > 0 ? stats.validFrameCount / stats.sampleCount : 0;
  const averageVisibility =
    stats.validFrameCount > 0
      ? stats.visibilityTotal / stats.validFrameCount
      : 0;
  const stabilityScore = clamp(
    validFrameRatio * 0.55 + averageVisibility * 0.45,
    0,
    1,
  );
  if (stats.gameDefinition.scoringProfile === "memory_sequence") {
    return clamp(
      hitRate * 0.66 + stabilityScore * 0.24 + reactionScore * 0.1,
      0,
      1,
    );
  }
  if (stats.gameDefinition.scoringProfile === "selective_sort") {
    return clamp(
      hitRate * 0.7 + reactionScore * 0.22 + stabilityScore * 0.08,
      0,
      1,
    );
  }
  if (stats.gameDefinition.scoringProfile === "steady_breath") {
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
  if (stats.gameDefinition.scoringProfile === "bilateral_coordination") {
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
  if (stats.gameDefinition.scoringProfile === "trajectory_tracking") {
    const checkpointRate =
      stats.trajectoryWindowCount > 0
        ? clamp(
            stats.trajectoryCheckpointHitCount /
              Math.max(1, stats.trajectoryWindowCount * 4),
            0,
            1,
          )
        : 0;
    const deviationScore =
      stats.trajectoryPathDeviationSamples > 0
        ? clamp(
            1 -
              stats.trajectoryPathDeviationTotal /
                stats.trajectoryPathDeviationSamples /
                0.36,
            0,
            1,
          )
        : 0;
    const smoothnessScore =
      stats.trajectoryPathDeviationSamples > 1
        ? clamp(
            1 -
              stats.trajectorySmoothnessDeltaTotal /
                (stats.trajectoryPathDeviationSamples - 1) /
                0.22,
            0,
            1,
          )
        : deviationScore;
    return clamp(
      hitRate * 0.34 +
        checkpointRate * 0.3 +
        deviationScore * 0.24 +
        smoothnessScore * 0.12,
      0,
      1,
    );
  }
  if (stats.gameDefinition.scoringProfile === "balance_shift") {
    const balanceWindowCount = stats.balanceShiftWindowCount;
    const balanceStableWindowCount = stats.balanceShiftStableWindowCount;
    const balanceDirectionErrorCount = stats.balanceDirectionErrorCount;
    const balanceCenterOffsetSamples = stats.balanceCenterOffsetSamples;
    const balanceHoldDurationMsTotal = stats.balanceHoldDurationMsTotal;
    const balanceWindowRate =
      balanceWindowCount > 0
        ? clamp(balanceStableWindowCount / balanceWindowCount, 0, 1)
        : hitRate;
    const directionScore =
      balanceWindowCount > 0
        ? clamp(1 - balanceDirectionErrorCount / balanceWindowCount, 0, 1)
        : 0;
    const holdScore =
      balanceStableWindowCount > 0
        ? clamp(
            balanceHoldDurationMsTotal / balanceStableWindowCount / 900,
            0,
            1,
          )
        : 0;
    const evidenceScore = balanceCenterOffsetSamples > 0 ? 1 : 0;
    return clamp(
      balanceWindowRate * 0.42 +
        directionScore * 0.24 +
        holdScore * 0.18 +
        stabilityScore * 0.12 +
        evidenceScore * 0.04,
      0,
      1,
    );
  }
  return clamp(hitRate * 0.75 + reactionScore * 0.25, 0, 1);
}

function average(values: number[]) {
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readBrowserPosePrescriptionDuration(
  durationMinutes: unknown,
): { ok: true; value: number } | { ok: false; message: string } {
  try {
    return {
      ok: true,
      value: requireBrowserPosePrescriptionDurationSeconds(durationMinutes),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "本次训练缺少合法的处方时长，不能开始训练。",
    };
  }
}

function requireBrowserPoseRuntimeDifficulty(stats: BrowserPoseGameplayStats) {
  if (!stats.runtimeDifficulty) {
    throw new Error("运行中动态难度状态缺失，训练已停止。");
  }
  return stats.runtimeDifficulty;
}

function resolveBrowserPoseRuntimeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : "";
  if (/本地训练识别资源|校验本地训练识别资源/.test(message)) {
    return "训练识别资源缺失或校验失败，请联系工作人员处理。";
  }
  if (/摄像头|设备|授权/.test(message)) {
    return message;
  }
  if (/处方时长|动态难度|批准方案|评估来源/.test(message)) {
    return message;
  }
  return "训练启动失败，请重新开始或联系工作人员。";
}

function browserPosePhaseLabel(phase: BrowserPoseGameSnapshot["phase"]) {
  if (phase === "loading") return "正在准备训练";
  if (phase === "running") return "训练进行中";
  if (phase === "completed") return "已完成";
  if (phase === "error") return "需要重新完成";
  return "待开始";
}

function browserPosePhaseStatus(
  phase: BrowserPoseGameSnapshot["phase"],
): "ready" | "pending" | "blocked" | "complete" | "review" {
  if (phase === "completed") return "complete";
  if (phase === "error") return "blocked";
  if (phase === "idle" || phase === "loading") return "pending";
  return "ready";
}

function isBrowserPoseGameReady(
  game: RehabPlan["items"][number]["gameContent"],
) {
  return (
    game.status === "active" &&
    game.runtimeType === "browser_pose_canvas" &&
    game.buildStatus === "released" &&
    Boolean(game.gameVersion?.trim()) &&
    game.bridgeProtocolVersion === "1.0.0" &&
    game.supportedInputModes.includes("camera_pose") &&
    browserPoseGameRequiredMetrics.every((metricType) =>
      requiredMetricsInclude(game.requiredMetrics, metricType),
    )
  );
}

function requiredMetricsInclude(value: unknown, metricType: string) {
  return (
    Array.isArray(value) &&
    value.some(
      (item) =>
        isPlainObject(item) &&
        typeof item.metricType === "string" &&
        item.metricType === metricType,
    )
  );
}

function Badge({ label, icon: Icon }: { label: string; icon: typeof Radar }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-bold text-[var(--accent-strong)]">
      <Icon className="h-4 w-4" />
      {label}
    </div>
  );
}

function Chip({
  children,
  status = "ready",
}: {
  children: React.ReactNode;
  status?: "ready" | "pending" | "blocked" | "complete" | "review";
}) {
  return <StatusBadge status={status}>{children}</StatusBadge>;
}

function Progress({ value }: { value: number }) {
  return (
    <div className="h-3 rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-1">
      <div
        className="h-full rounded-[var(--radius-control)] bg-[var(--accent-strong)] transition-[width] duration-150"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
