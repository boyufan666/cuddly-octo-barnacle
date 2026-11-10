export const poseReadinessObservationMs = 5_000;
export const poseReadinessSampleIntervalMs = 200;
export const poseReadinessRequiredSamples = 3;
export const poseVideoFrameTimeoutMs = 8_000;

type VisibilityLandmark = { visibility?: number };
export type PoseFrame = { timestampMs: number; mediaTime: number };
export type PoseObservation = {
  poseLandmarkCount: number;
  poseAverageVisibility: number;
};

/** One bounded observation, never a camera reopen or a failed-check retry. */
export async function observePoseReadiness(
  video: HTMLVideoElement,
  detect: (timestampMs: number) => readonly VisibilityLandmark[],
  signal?: AbortSignal,
): Promise<PoseObservation> {
  const deadline = performance.now() + poseReadinessObservationMs;
  let previousMediaTime: number | undefined;
  let lastSampleTimestamp = -Infinity;
  let detectedPoses = 0;
  let validSamples = 0;
  let consecutive = 0;
  let minimumVisibility = 1;
  let lastCount = 0;
  let lastFrameReceivedAt = performance.now();

  while (performance.now() < deadline) {
    const remaining = deadline - performance.now();
    let frame: PoseFrame;
    try {
      frame = await waitForPoseVideoFrame(
        video,
        previousMediaTime,
        remaining,
        signal,
      );
    } catch (error) {
      if (error instanceof PoseVideoFrameTimeout) {
        if (
          performance.now() >= deadline &&
          performance.now() - lastFrameReceivedAt < 1_500
        )
          break;
        throw new Error(
          "摄像头画面未持续更新，站位检查超时。请检查设备后重新发起检查。",
        );
      }
      throw error;
    }
    lastFrameReceivedAt = performance.now();
    previousMediaTime = frame.mediaTime;
    if (frame.timestampMs - lastSampleTimestamp < poseReadinessSampleIntervalMs)
      continue;
    lastSampleTimestamp = frame.timestampMs;
    const pose = detect(frame.timestampMs);
    const average = pose.length
      ? pose.reduce((sum, point) => sum + (point.visibility ?? 0), 0) /
        pose.length
      : 0;
    const visibleCount = pose.filter(
      (point) => (point.visibility ?? 0) >= 0.5,
    ).length;
    if (pose.length) detectedPoses += 1;
    if (visibleCount >= 12 && average >= 0.45) {
      validSamples += 1;
      consecutive += 1;
      minimumVisibility = Math.min(minimumVisibility, average);
      lastCount = pose.length;
      if (
        consecutive >= poseReadinessRequiredSamples &&
        performance.now() <= deadline
      ) {
        return {
          poseLandmarkCount: lastCount,
          poseAverageVisibility: Number(minimumVisibility.toFixed(3)),
        };
      }
    } else {
      consecutive = 0;
      minimumVisibility = 1;
    }
  }

  if (!detectedPoses) {
    throw new Error(
      "观察期间未检测到人体姿态。请通过实时预览确认本人正面入镜、光线充足后重新检查。",
    );
  }
  if (!validSamples) {
    throw new Error(
      "姿态关键点置信度不足。请改善光线并保持身体入镜后重新检查。",
    );
  }
  throw new Error(
    "观察期间姿态未连续达到检查标准。请保持身体入镜并稳定后重新检查。",
  );
}

export class PoseVideoFrameTimeout extends Error {
  constructor() {
    super("摄像头未在规定时间内提供有效视频帧。");
  }
}

/** Uses a decoded-frame callback, or the browser's current-data/media-time capability. */
export function waitForPoseVideoFrame(
  video: HTMLVideoElement,
  previousMediaTime: number | undefined,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<PoseFrame> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let frameHandle: number | undefined;
    let animationHandle: number | undefined;
    const usesVideoFrameCallback =
      typeof video.requestVideoFrameCallback === "function";
    const cleanup = () => {
      clearTimeout(timeout);
      if (frameHandle !== undefined)
        video.cancelVideoFrameCallback(frameHandle);
      if (animationHandle !== undefined) cancelAnimationFrame(animationHandle);
      video.removeEventListener("error", handleError);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("loadeddata", handleLoadedData);
      signal?.removeEventListener("abort", handleAbort);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const handleError = () =>
      fail(new Error("摄像头视频读取失败，站位检查已停止。"));
    const handleEnded = () =>
      fail(new Error("摄像头视频已结束，站位检查已停止。"));
    const handleAbort = () => fail(new Error("训练准备已停止，摄像头已关闭。"));
    const accept = (timestampMs: number, mediaTime: number) => {
      if (
        video.readyState < 2 ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0 ||
        !Number.isFinite(mediaTime) ||
        (previousMediaTime !== undefined && mediaTime <= previousMediaTime)
      )
        return false;
      settled = true;
      cleanup();
      resolve({ timestampMs, mediaTime });
      return true;
    };
    const requestVideoFrame = () => {
      frameHandle = video.requestVideoFrameCallback((now, metadata) => {
        frameHandle = undefined;
        if (!accept(now, metadata.mediaTime)) requestVideoFrame();
      });
    };
    const pollCurrentData = () => {
      animationHandle = requestAnimationFrame((now) => {
        animationHandle = undefined;
        if (!accept(now, video.currentTime)) pollCurrentData();
      });
    };
    const handleLoadedData = () => {
      if (!usesVideoFrameCallback && animationHandle === undefined)
        pollCurrentData();
    };
    const timeout = setTimeout(
      () => fail(new PoseVideoFrameTimeout()),
      Math.max(0, timeoutMs),
    );
    video.addEventListener("error", handleError);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("loadeddata", handleLoadedData);
    signal?.addEventListener("abort", handleAbort, { once: true });
    if (signal?.aborted) handleAbort();
    else if (video.error) handleError();
    else if (video.ended) handleEnded();
    else if (usesVideoFrameCallback) requestVideoFrame();
    else if (video.readyState >= 2) pollCurrentData();
  });
}
