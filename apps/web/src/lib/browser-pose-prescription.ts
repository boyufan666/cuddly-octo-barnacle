const invalidBrowserPosePrescriptionDurationMessage =
  "本次训练缺少合法的处方时长，不能开始训练。";

export const browserPoseTrainingResultContractVersion =
  "browser-pose-result-v1" as const;

export function requireBrowserPosePrescriptionDurationSeconds(
  durationMinutes: unknown,
) {
  if (
    typeof durationMinutes !== "number" ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0
  ) {
    throw new Error(invalidBrowserPosePrescriptionDurationMessage);
  }

  return durationMinutes * 60;
}

export function requireBrowserPoseClientStartedAt(value: unknown) {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error("训练会话 clientStartedAt 必须是精确 canonical ISO 时间。");
  }
  const startedAtMs = Date.parse(value);
  if (
    !Number.isFinite(startedAtMs) ||
    new Date(startedAtMs).toISOString() !== value
  ) {
    throw new Error("训练会话 clientStartedAt 必须是精确 canonical ISO 时间。");
  }
  return { iso: value, ms: startedAtMs };
}

export function requireBrowserPoseRuntimePrescription({
  runtimeConfigSnapshot,
  trainingSessionClientStartedAt,
  prescribedDurationSeconds,
}: {
  runtimeConfigSnapshot: unknown;
  trainingSessionClientStartedAt: unknown;
  prescribedDurationSeconds: number;
}) {
  if (
    !runtimeConfigSnapshot ||
    typeof runtimeConfigSnapshot !== "object" ||
    Array.isArray(runtimeConfigSnapshot)
  ) {
    throw new Error("训练会话缺少浏览器体感正式运行配置，不能启动训练。");
  }
  const snapshot = runtimeConfigSnapshot as Record<string, unknown>;
  if (snapshot.runtimeType !== "browser_pose_canvas") {
    throw new Error("训练会话运行配置不是浏览器体感训练，不能启动训练。");
  }
  if (
    snapshot.resultContractVersion !== browserPoseTrainingResultContractVersion
  ) {
    throw new Error(
      `浏览器体感结果合同版本必须是 ${browserPoseTrainingResultContractVersion}。`,
    );
  }
  const frozenStart = requireBrowserPoseClientStartedAt(
    snapshot.clientStartedAt,
  );
  const sessionStart = requireBrowserPoseClientStartedAt(
    trainingSessionClientStartedAt,
  );
  if (frozenStart.iso !== sessionStart.iso) {
    throw new Error(
      "训练会话服务端冻结 clientStartedAt 与会话开始时间不一致，不能启动正式训练。",
    );
  }
  const frozenDurationSeconds = snapshot.prescribedDurationSeconds;
  if (
    typeof frozenDurationSeconds !== "number" ||
    !Number.isSafeInteger(frozenDurationSeconds) ||
    frozenDurationSeconds <= 0 ||
    frozenDurationSeconds !== prescribedDurationSeconds
  ) {
    throw new Error("训练会话冻结处方时长与当前训练安排不一致，不能启动训练。");
  }
  return {
    clientStartedAt: frozenStart,
    prescribedDurationSeconds: frozenDurationSeconds,
  };
}

export function hasBrowserPosePrescriptionDurationElapsed({
  startedAtMs,
  timestampMs,
  targetDurationSeconds,
}: {
  startedAtMs: number;
  timestampMs: number;
  targetDurationSeconds: number;
}) {
  if (
    !Number.isFinite(startedAtMs) ||
    !Number.isFinite(timestampMs) ||
    !Number.isInteger(targetDurationSeconds) ||
    targetDurationSeconds <= 0 ||
    timestampMs < startedAtMs
  ) {
    throw new Error("本次训练的处方计时非法，训练已停止。");
  }
  return timestampMs - startedAtMs >= targetDurationSeconds * 1_000;
}
