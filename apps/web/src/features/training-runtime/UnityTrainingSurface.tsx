"use client";

import { MonitorCheck } from "lucide-react";
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  createPoseTrainingRuntime,
  type PoseTrainingRuntime,
} from "@/lib/pose-readiness";
import { isGameReadyForTraining } from "@/lib/formal-training-content-readiness";
import {
  createUnityPoseHitTracker,
  type UnityPoseGuidanceSnapshot,
} from "@/lib/unity-pose-guidance";
import {
  createUnityTrainingRuntimeFailureState,
  loadRehabUnityBridge,
} from "@/lib/unity-runtime-bridge";
import {
  isExpectedUnityTrainingMessageSource,
  isUnityTrainingResultCandidate,
  parseUnityTrainingResultBridgeEvent,
  toUnityRuntimeDurationSeconds,
  unityTrainingResultContractVersion,
  type UnityTrainingResultBridgeEvent,
} from "@/lib/unity-training-bridge";
import { cn } from "@/lib/utils";
import { isLoopbackHttpOrigin } from "@/lib/runtime-origin";
import type {
  RehabPlan,
  SubmitTrainingResultRequest,
  TrainingSession,
} from "@/types/api";
import {
  readManifestString,
  readTrainingRuntimeEvidenceContext,
  readUnityRuntimeClientStartedAt,
  readUnityRuntimeMinConfidence,
} from "./runtime-context";
import {
  fetchValidatedUnityManifest,
  type UnityManifest,
} from "@/lib/unity-manifest";

type UnityManifestState =
  | { state: "idle"; message: string }
  | { state: "loading"; message: string }
  | { state: "ready"; message: string; manifest: UnityManifest }
  | { state: "error"; message: string };

const emptyUnityPoseGuidanceSnapshot: UnityPoseGuidanceSnapshot = {
  status: "no_pose",
  instruction: "请面对摄像头并让上半身完整入镜。",
  averageVisibility: 0,
};

type UnityPoseFeedbackState = {
  stableFrames: number;
  requiredStableFrames: number;
  sentHitCount: number;
  lastFrameAtMs?: number;
  lastAcceptedAtMs?: number;
};

const emptyUnityPoseFeedback: UnityPoseFeedbackState = {
  stableFrames: 0,
  requiredStableFrames: 2,
  sentHitCount: 0,
};

function readRequiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }
  return value.trim();
}

declare global {
  interface Window {
    RehabTrainingRuntimeConfig?: Record<string, unknown>;
    createUnityInstance?: (
      canvas: HTMLCanvasElement,
      config: Record<string, unknown>,
    ) => Promise<UnityInstance>;
  }
}

type UnityInstance = {
  SendMessage: (
    objectName: string,
    methodName: string,
    parameter?: string,
  ) => void;
  Quit?: () => Promise<void>;
};

type ActiveUnityInstance = {
  sessionId: string;
  instance: UnityInstance;
};

type UnityTrainingSurfaceProps = {
  durationMinutes: number;
  game: RehabPlan["items"][number]["gameContent"];
  onResultReady: (payload: SubmitTrainingResultRequest) => void;
  trainingSession: TrainingSession;
};

export function UnityTrainingSurface(props: UnityTrainingSurfaceProps) {
  const { durationMinutes, game, onResultReady, trainingSession } = props;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const poseRuntimeRef = useRef<PoseTrainingRuntime | null>(null);
  const poseAnimationRef = useRef<number | null>(null);
  const failedRuntimeSessionIdRef = useRef<string | null>(null);
  const unityInstanceRef = useRef<ActiveUnityInstance | null>(null);
  const [manifestState, setManifestState] = useState<UnityManifestState>({
    state: "idle",
    message: "正在准备训练",
  });
  const [runtimeState, setRuntimeState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [poseGuidance, setPoseGuidance] = useState<UnityPoseGuidanceSnapshot>(
    emptyUnityPoseGuidanceSnapshot,
  );
  const [poseFeedback, setPoseFeedback] = useState<UnityPoseFeedbackState>(
    emptyUnityPoseFeedback,
  );
  const expectedBridgeContext = useMemo(
    () =>
      resolveExpectedUnityBridgeContext(
        trainingSession.id,
        trainingSession.gameRunId,
        game.gameVersion,
        trainingSession.collectionBatchId,
      ),
    [
      game.gameVersion,
      trainingSession.collectionBatchId,
      trainingSession.gameRunId,
      trainingSession.id,
    ],
  );
  const trainingScreenActive = runtimeState === "ready";
  const trainingScreenUnavailable = runtimeState === "error";

  const failUnityTrainingRuntime = useCallback(
    (reason: "source" | "result") => {
      failedRuntimeSessionIdRef.current = trainingSession.id;
      stopUnityPoseForwarding(poseRuntimeRef, poseAnimationRef);
      setPoseGuidance(emptyUnityPoseGuidanceSnapshot);
      setPoseFeedback(emptyUnityPoseFeedback);

      const activeUnityInstance = unityInstanceRef.current;
      if (activeUnityInstance?.sessionId === trainingSession.id) {
        unityInstanceRef.current = null;
        if (activeUnityInstance.instance.Quit) {
          void activeUnityInstance.instance.Quit();
        }
      }
      if (window.RehabTrainingRuntimeConfig?.sessionId === trainingSession.id) {
        delete window.RehabTrainingRuntimeConfig;
      }

      const failure = createUnityTrainingRuntimeFailureState(reason);
      setManifestState(failure.manifestState);
      setRuntimeState(failure.runtimeState);
    },
    [trainingSession.id],
  );

  useEffect(() => {
    if (!expectedBridgeContext) return;
    const bridgeContext = expectedBridgeContext;

    function handleMessage(event: MessageEvent) {
      if (!isUnityTrainingResultCandidate(event.data)) {
        return;
      }
      if (failedRuntimeSessionIdRef.current === trainingSession.id) {
        return;
      }

      if (
        !isExpectedUnityTrainingMessageSource(
          event,
          window.location.origin,
          window,
        )
      ) {
        failUnityTrainingRuntime("source");
        return;
      }

      const parsed = parseUnityTrainingResultBridgeEvent(
        event.data,
        bridgeContext,
      );

      if (!parsed.ok) {
        failUnityTrainingRuntime("result");
        return;
      }

      onResultReady(buildUnityTrainingResultPayload(parsed.value));
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    expectedBridgeContext,
    failUnityTrainingRuntime,
    onResultReady,
    trainingSession.id,
  ]);

  useEffect(() => {
    let cancelled = false;
    const runtimeAttemptBlocked = () =>
      cancelled || failedRuntimeSessionIdRef.current === trainingSession.id;

    async function loadUnity() {
      if (runtimeAttemptBlocked()) return;
      let clientStartedAt: string;
      try {
        clientStartedAt = readUnityRuntimeClientStartedAt(
          trainingSession.runtimeConfigSnapshot,
          trainingSession.clientStartedAt,
        );
      } catch (error) {
        if (runtimeAttemptBlocked()) return;
        setManifestState({
          state: "error",
          message: (error as Error).message,
        });
        setRuntimeState("error");
        return;
      }
      if (!expectedBridgeContext) {
        setManifestState({
          state: "error",
          message: "训练信息不完整，暂时不能开始训练。",
        });
        setRuntimeState("error");
        return;
      }
      if (!isGameReadyForTraining(game)) {
        setManifestState({
          state: "error",
          message: patientTrainingUnavailableMessage(),
        });
        setRuntimeState("error");
        return;
      }

      const manifestUrl = game.manifestUrl;
      if (!manifestUrl) {
        setManifestState({
          state: "error",
          message: patientTrainingUnavailableMessage(),
        });
        setRuntimeState("error");
        return;
      }

      setManifestState({ state: "loading", message: "正在准备训练" });
      setRuntimeState("loading");

      try {
        const { collectionBatchId, gameRunId, gameVersion } =
          expectedBridgeContext;
        const bridgeProtocolVersion = readRequiredText(
          game.bridgeProtocolVersion,
          "Unity 训练内容缺少桥接协议版本，不能启动正式训练。",
        );
        const deviceCode = readRequiredText(
          trainingSession.deviceCode,
          "Unity 训练会话缺少设备编号，不能启动正式训练。",
        );
        const durationSeconds = toUnityRuntimeDurationSeconds(durationMinutes);
        const manifest = await fetchValidatedUnityManifest({
          manifestUrl,
          game,
          origin: window.location.origin,
          allowInsecureOrigin: process.env.NODE_ENV !== "production" ||
            isLoopbackHttpOrigin(window.location.origin),
        });
        const runtime = readUnityRuntime(manifest);
        if (runtimeAttemptBlocked()) return;
        setManifestState({
          state: "ready",
          message: "训练进行中",
          manifest,
        });
        const evidenceContext = readTrainingRuntimeEvidenceContext(
          trainingSession.runtimeConfigSnapshot,
        );
        const minConfidence = readUnityRuntimeMinConfidence(
          trainingSession.runtimeConfigSnapshot,
        );
        window.RehabTrainingRuntimeConfig = {
          type: "training_config",
          action: "training_config",
          protocolVersion: bridgeProtocolVersion,
          resultContractVersion: unityTrainingResultContractVersion,
          sessionId: trainingSession.id,
          gameRunId,
          collectionBatchId,
          gameCode: game.code,
          gameVersion,
          bridgeProtocolVersion,
          unitySessionObjectName: runtime.unitySessionObjectName,
          runtimeConfigMethod: runtime.runtimeConfigMethod,
          startMethod: runtime.startMethod,
          reachHitMethod: runtime.reachHitMethod,
          difficultyMethod: runtime.difficultyMethod,
          explicitDifficulty: toUnityExplicitDifficultyFromStartingLevel(
            evidenceContext.startingDifficultyLevel,
          ),
          planItemId: trainingSession.planItemId,
          patientId: trainingSession.patientId,
          deviceCode,
          requiredMetrics: game.requiredMetrics,
          approvedPlanItemId: evidenceContext.approvedPlanItemId,
          assessmentSourceId: evidenceContext.assessmentSourceId,
          startingLevelSource: evidenceContext.startingLevelSource,
          startingDifficultyLevel: evidenceContext.startingDifficultyLevel,
          minConfidence,
          durationSeconds,
          clientStartedAt,
          generatedAt: new Date().toISOString(),
        };

        await loadRehabUnityBridge(loadScriptOnce);
        if (runtimeAttemptBlocked()) return;
        await loadScriptOnce(manifest.build.loaderUrl);
        if (runtimeAttemptBlocked()) return;

        const createUnityInstance = readUnityLoader();
        const canvas = document.getElementById(
          unityCanvasId(trainingSession.id),
        ) as HTMLCanvasElement | null;
        if (!canvas) {
          throw new Error("Unity canvas 未找到。");
        }

        const createdUnityInstance = await createUnityInstance(canvas, {
          dataUrl: manifest.build.dataUrl,
          frameworkUrl: manifest.build.frameworkUrl,
          codeUrl: manifest.build.codeUrl,
          companyName: "Rehab Platform",
          productName: game.name,
          productVersion: manifest.gameVersion,
        });

        if (runtimeAttemptBlocked()) {
          if (createdUnityInstance.Quit) {
            void createdUnityInstance.Quit();
          }
          return;
        }
        unityInstanceRef.current = {
          sessionId: trainingSession.id,
          instance: createdUnityInstance,
        };
        sendUnityRuntimeConfig(createdUnityInstance, runtime);
        await startUnityPoseForwarding({
          isCancelled: runtimeAttemptBlocked,
          unityInstance: createdUnityInstance,
          runtime,
          trainingSession,
          minConfidence,
          videoElement: videoRef.current,
          poseRuntimeRef,
          poseAnimationRef,
          onGuidance: setPoseGuidance,
          onFeedback: setPoseFeedback,
        });
        if (runtimeAttemptBlocked()) return;
        sendUnityStart(createdUnityInstance, runtime);
        setRuntimeState("ready");
      } catch {
        if (runtimeAttemptBlocked()) return;
        setManifestState({
          state: "error",
          message: patientTrainingUnavailableMessage(),
        });
        setRuntimeState("error");
      }
    }

    void loadUnity();

    return () => {
      cancelled = true;
      stopUnityPoseForwarding(poseRuntimeRef, poseAnimationRef);
      setPoseGuidance(emptyUnityPoseGuidanceSnapshot);
      setPoseFeedback(emptyUnityPoseFeedback);
      const activeUnityInstance = unityInstanceRef.current;
      if (activeUnityInstance?.sessionId === trainingSession.id) {
        unityInstanceRef.current = null;
        if (activeUnityInstance.instance.Quit) {
          void activeUnityInstance.instance.Quit();
        }
      }
      if (window.RehabTrainingRuntimeConfig?.sessionId === trainingSession.id) {
        delete window.RehabTrainingRuntimeConfig;
      }
    };
  }, [durationMinutes, expectedBridgeContext, game, trainingSession]);

  return (
    <div className="training-stage-shell mt-4 overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] text-[var(--ink-strong)] shadow-[var(--shadow-panel)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line-subtle)] bg-[var(--surface-muted)] px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase text-[var(--accent-strong)]">
            正在准备训练
          </p>
          <p className="mt-1 text-xs font-medium text-[var(--ink-soft)]">
            {trainingScreenActive
              ? "训练画面已准备"
              : trainingScreenUnavailable
                ? "训练画面暂不可开始"
                : "正在准备训练画面"}
          </p>
        </div>
        <Chip
          status={
            trainingScreenActive
              ? "complete"
              : trainingScreenUnavailable
                ? "blocked"
                : "pending"
          }
        >
          {trainingScreenActive
            ? "训练进行中"
            : trainingScreenUnavailable
              ? "训练暂不可开始"
              : "正在准备训练"}
        </Chip>
      </div>
      <div className="grid gap-4 p-4">
        <UnityPoseCameraPreview videoRef={videoRef} guidance={poseGuidance} />
        <div className="unity-stage-shell relative aspect-video min-h-[clamp(280px,42vw,420px)] min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-muted)]">
          <canvas
            id={unityCanvasId(trainingSession.id)}
            className="relative z-10 h-full w-full bg-[var(--surface-muted)]"
          />
          <UnityPoseGuidanceOverlay
            feedback={poseFeedback}
            guidance={poseGuidance}
          />
          {!trainingScreenActive ? (
            <div className="absolute inset-0 z-20 grid place-items-center bg-[var(--surface-paper)] p-6 text-center">
              <div className="max-w-xl rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-6 shadow-[var(--shadow-panel)]">
                <Badge label="训练准备状态" icon={MonitorCheck} />
                <h4 className="mt-5 text-2xl font-bold text-[var(--ink-strong)]">
                  {trainingScreenUnavailable
                    ? "训练暂不可开始"
                    : "正在准备训练画面"}
                </h4>
                <p className="mt-3 font-medium leading-7 text-[var(--ink-soft)]">
                  {manifestState.message}
                </p>
                <p className="mt-4 text-xs font-bold text-[var(--ink-soft)]">
                  训练记录已创建，完成后会保存本次训练结果。
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function resolveExpectedUnityBridgeContext(
  sessionId: unknown,
  gameRunId: unknown,
  gameVersion: unknown,
  collectionBatchId: unknown,
) {
  try {
    return {
      sessionId: readRequiredText(
        sessionId,
        "Unity 训练会话缺少会话标识，不能接收训练结果。",
      ),
      gameRunId: readRequiredText(
        gameRunId,
        "Unity 训练会话缺少运行批次，不能接收训练结果。",
      ),
      gameVersion: readRequiredText(
        gameVersion,
        "Unity 训练内容缺少游戏版本，不能接收训练结果。",
      ),
      collectionBatchId: readRequiredText(
        collectionBatchId,
        "Unity 训练会话缺少采集批次，不能接收训练结果。",
      ),
    };
  } catch {
    return null;
  }
}

function UnityPoseCameraPreview({
  guidance,
  videoRef,
}: {
  guidance: UnityPoseGuidanceSnapshot;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
}) {
  return (
    <div className="unity-pose-sidecar pointer-events-none grid w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] sm:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-xs font-bold uppercase text-[var(--accent-strong)]">
            站位提示
          </p>
          <p className="mt-1 text-sm font-bold text-[var(--ink-strong)]">
            摄像头预览
          </p>
          <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-[var(--ink-soft)]">
            保持上半身、双肩和双手在画面内，训练画面会更稳定。
          </p>
        </div>
        <span className="shrink-0 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-3 py-1 text-xs font-bold text-[var(--accent-strong)]">
          {unityPoseGuidanceStatusLabel(guidance.status)}
        </span>
      </div>
      <div className="relative aspect-video min-h-28 bg-[var(--ink-strong)] sm:aspect-[4/3] sm:min-h-0">
        <video
          ref={videoRef}
          className="h-full w-full scale-x-[-1] object-cover opacity-95"
          muted
          playsInline
        />
      </div>
    </div>
  );
}

function UnityPoseGuidanceOverlay({
  feedback,
  guidance,
}: {
  feedback: UnityPoseFeedbackState;
  guidance: UnityPoseGuidanceSnapshot;
}) {
  const statusTone =
    guidance.status === "tracking"
      ? "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success)]"
      : guidance.status === "low_visibility"
        ? "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning)]"
        : "border-[var(--line-strong)] bg-[var(--surface-muted)] text-[var(--ink-soft)]";
  const stableFramePercent = Math.min(
    100,
    Math.round(
      (feedback.stableFrames / Math.max(1, feedback.requiredStableFrames)) *
        100,
    ),
  );
  const movementStatus =
    feedback.sentHitCount > 0 ? "已完成动作" : "按提示完成动作";

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <UnityPoseCursorOverlay guidance={guidance} />
      <div className="absolute inset-x-4 top-4 max-w-[min(430px,calc(100%-2rem))] rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-3 shadow-[var(--shadow-panel)] sm:left-5 sm:right-auto sm:top-5 sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "rounded-[var(--radius-control)] border px-3 py-1 text-xs font-bold",
              statusTone,
            )}
          >
            {unityPoseGuidanceStatusLabel(guidance.status)}
          </span>
          <span className="rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] px-3 py-1 text-xs font-bold text-[var(--ink-soft)]">
            {movementStatus}
          </span>
        </div>
        <p className="mt-3 text-sm font-bold leading-6 text-[var(--ink-strong)] sm:text-base">
          {guidance.instruction}
        </p>
        <div className="mt-3 grid gap-2 rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] p-3">
          <div className="flex items-center justify-between gap-3 text-xs font-bold text-[var(--ink-soft)]">
            <span>画面稳定</span>
            <span>{stableFramePercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-paper)]">
            <div
              className="h-full rounded-[var(--radius-control)] bg-[var(--accent-strong)] transition-[width] duration-150"
              style={{ width: `${stableFramePercent}%` }}
            />
          </div>
          <div className="hidden grid-cols-3 gap-2 text-xs font-medium text-[var(--ink-soft)] sm:grid">
            <span>1. 保持站位</span>
            <span>2. 跟随提示</span>
            <span>3. 到达目标区域</span>
          </div>
        </div>
        <p className="mt-2 hidden text-xs font-medium leading-5 text-[var(--ink-soft)] sm:block">
          画面稳定后再按提示完成动作；请保持双肩和双手在画面内。
        </p>
      </div>
    </div>
  );
}

function UnityPoseCursorOverlay({
  guidance,
}: {
  guidance: UnityPoseGuidanceSnapshot;
}) {
  return (
    <>
      {guidance.leftWrist ? (
        <UnityPoseWristCursor cursor={guidance.leftWrist} />
      ) : null}
      {guidance.rightWrist ? (
        <UnityPoseWristCursor cursor={guidance.rightWrist} />
      ) : null}
    </>
  );
}

function UnityPoseWristCursor({
  cursor,
}: {
  cursor: NonNullable<UnityPoseGuidanceSnapshot["leftWrist"]>;
}) {
  return (
    <div
      className={cn(
        "absolute grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[var(--radius-card)] border-4 shadow-[var(--shadow-panel)]",
        cursor.side === "left"
          ? "border-[var(--accent-strong)] bg-[var(--accent-soft)] text-[var(--accent-stronger)]"
          : "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success)]",
      )}
      style={{
        left: `${cursor.screenX * 100}%`,
        top: `${cursor.screenY * 100}%`,
      }}
    >
      <span className="rounded-[var(--radius-control)] bg-[var(--surface-paper)] px-2 py-1 text-xs font-bold">
        {cursor.side === "left" ? "左手" : "右手"}
      </span>
    </div>
  );
}

function unityPoseGuidanceStatusLabel(
  status: UnityPoseGuidanceSnapshot["status"],
) {
  if (status === "tracking") return "识别稳定";
  if (status === "low_visibility") return "入镜不完整";
  return "等待入镜";
}

function patientTrainingUnavailableMessage() {
  return "训练画面暂不可用，请返回今日任务或联系工作人员。";
}

type UnityRuntimeDescriptor = {
  unitySessionObjectName: string;
  startMethod: string;
  runtimeConfigMethod: string;
  reachHitMethod: string;
  difficultyMethod: string;
};

function readUnityRuntime(manifest: UnityManifest): UnityRuntimeDescriptor {
  const runtime = manifest.runtime;
  const unitySessionObjectName = readManifestString(
    runtime?.unitySessionObjectName,
    "runtime.unitySessionObjectName",
  );
  return {
    unitySessionObjectName,
    startMethod: readManifestString(
      runtime?.startMethod,
      "runtime.startMethod",
    ),
    runtimeConfigMethod: readManifestString(
      runtime?.runtimeConfigMethod,
      "runtime.runtimeConfigMethod",
    ),
    reachHitMethod: readManifestString(
      runtime?.reachHitMethod,
      "runtime.reachHitMethod",
    ),
    difficultyMethod: readManifestString(
      runtime?.difficultyMethod,
      "runtime.difficultyMethod",
    ),
  };
}

function sendUnityRuntimeConfig(
  unityInstance: UnityInstance,
  runtime: UnityRuntimeDescriptor,
) {
  const config = window.RehabTrainingRuntimeConfig;
  if (!config) {
    throw new Error("Unity runtime config 缺失，不能启动正式训练。");
  }
  unityInstance.SendMessage(
    runtime.unitySessionObjectName,
    runtime.runtimeConfigMethod,
    JSON.stringify(config),
  );
  const explicitDifficulty = config.explicitDifficulty;
  if (typeof explicitDifficulty === "string" && explicitDifficulty.trim()) {
    unityInstance.SendMessage(
      runtime.unitySessionObjectName,
      runtime.difficultyMethod,
      explicitDifficulty,
    );
  }
}

async function startUnityPoseForwarding({
  isCancelled,
  unityInstance,
  runtime,
  trainingSession,
  minConfidence,
  videoElement,
  poseRuntimeRef,
  poseAnimationRef,
  onGuidance,
  onFeedback,
}: {
  isCancelled: () => boolean;
  unityInstance: UnityInstance;
  runtime: UnityRuntimeDescriptor;
  trainingSession: TrainingSession;
  minConfidence: number;
  videoElement: HTMLVideoElement | null;
  poseRuntimeRef: MutableRefObject<PoseTrainingRuntime | null>;
  poseAnimationRef: MutableRefObject<number | null>;
  onGuidance: (guidance: UnityPoseGuidanceSnapshot) => void;
  onFeedback: (feedback: UnityPoseFeedbackState) => void;
}) {
  if (!videoElement) {
    throw new Error("Unity 体感采集视频节点缺失，不能启动训练。");
  }
  const poseRuntime = await createPoseTrainingRuntime({
    videoElement,
    deviceId: trainingSession.deviceCode ?? undefined,
  });
  if (isCancelled()) {
    poseRuntime.stop();
    return;
  }
  poseRuntimeRef.current = poseRuntime;
  const hitTracker = createUnityPoseHitTracker({
    minVisibility: minConfidence,
    stableFrameCount: 2,
    minIntervalMs: 180,
  });
  let lastGuidanceUpdateAtMs = Number.NEGATIVE_INFINITY;
  let sentHitCount = 0;

  const forwardFrame = (timestampMs: number) => {
    const activeRuntime = poseRuntimeRef.current;
    if (!activeRuntime) return;
    const landmarks = activeRuntime.detect(timestampMs);
    const {
      guidance,
      lastAcceptedAtMs,
      reachHit,
      requiredStableFrames,
      stableFrames,
    } = hitTracker.update(landmarks, timestampMs);
    if (reachHit) {
      sentHitCount += 1;
    }
    if (timestampMs - lastGuidanceUpdateAtMs >= 80) {
      lastGuidanceUpdateAtMs = timestampMs;
      onGuidance(guidance);
      onFeedback({
        stableFrames,
        requiredStableFrames,
        sentHitCount,
        lastFrameAtMs: timestampMs,
        lastAcceptedAtMs,
      });
    }
    if (reachHit) {
      unityInstance.SendMessage(
        runtime.unitySessionObjectName,
        runtime.reachHitMethod,
        JSON.stringify(reachHit),
      );
      onFeedback({
        stableFrames,
        requiredStableFrames,
        sentHitCount,
        lastFrameAtMs: timestampMs,
        lastAcceptedAtMs,
      });
    }
    poseAnimationRef.current = window.requestAnimationFrame(forwardFrame);
  };

  poseAnimationRef.current = window.requestAnimationFrame(forwardFrame);
}

function buildUnityTrainingResultPayload(
  result: UnityTrainingResultBridgeEvent,
): SubmitTrainingResultRequest {
  return {
    score: result.score,
    completionRate: result.completionRate,
    durationSeconds: result.durationSeconds,
    reactionTimeMs: result.reactionTimeMs,
    motionAccuracy: result.motionAccuracy,
    exerciseIntensity: result.exerciseIntensity,
    metricsSummary: {
      ...result.metricsSummary,
      source: "unity_webgl",
      collectionBatchId: result.collectionBatchId,
      gameRunId: result.gameRunId,
      gameVersion: result.gameVersion,
      protocolVersion: result.protocolVersion,
      clientGeneratedAt: result.clientGeneratedAt,
      rawPayloadHash: result.rawPayloadHash,
    },
    motionMetrics: result.motionMetrics,
  };
}

function sendUnityStart(
  unityInstance: UnityInstance,
  runtime: UnityRuntimeDescriptor,
) {
  unityInstance.SendMessage(
    runtime.unitySessionObjectName,
    runtime.startMethod,
  );
}

function stopUnityPoseForwarding(
  poseRuntimeRef: MutableRefObject<PoseTrainingRuntime | null>,
  poseAnimationRef: MutableRefObject<number | null>,
) {
  if (poseAnimationRef.current !== null) {
    window.cancelAnimationFrame(poseAnimationRef.current);
    poseAnimationRef.current = null;
  }
  poseRuntimeRef.current?.stop();
  poseRuntimeRef.current = null;
}

function toUnityExplicitDifficulty(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "easy" ||
    normalized === "standard" ||
    normalized === "advanced"
  ) {
    return normalized;
  }
  throw new Error("Unity 训练难度必须明确配置为 easy、standard 或 advanced。");
}

function toUnityExplicitDifficultyFromStartingLevel(
  startingDifficultyLevel: number,
) {
  if (startingDifficultyLevel === 1) return toUnityExplicitDifficulty("easy");
  if (startingDifficultyLevel === 2)
    return toUnityExplicitDifficulty("standard");
  if (startingDifficultyLevel === 3)
    return toUnityExplicitDifficulty("advanced");
  throw new Error("Unity 起始难度等级必须是 1 到 3。");
}

function loadScriptOnce(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-unity-loader="${src}"]`,
    );
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }
    const script = existing ?? document.createElement("script");
    script.dataset.unityLoader = src;
    script.async = true;
    script.src = src;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Unity loader 加载失败：${src}`));
    if (!existing) {
      document.body.appendChild(script);
    }
  });
}

function readUnityLoader() {
  if (typeof window.createUnityInstance !== "function") {
    throw new Error("Unity loader 未提供 createUnityInstance。");
  }
  return window.createUnityInstance;
}

function unityCanvasId(sessionId: string) {
  return `unity-canvas-${sessionId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function Badge({
  label,
  icon: Icon,
}: {
  label: string;
  icon: typeof MonitorCheck;
}) {
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
