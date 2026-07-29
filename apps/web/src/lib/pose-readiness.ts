import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import {
  openBrowserPoseCamera,
  requireBrowserPoseCameraDeviceId,
  stopMediaStream,
} from "./browser-pose-camera-access";
import {
  browserPoseModelUrl,
  browserPoseWasmBaseUrl,
  ensureBrowserPoseRuntimeAssets,
} from "./browser-pose-runtime-assets";
import { withBenignPoseConsoleErrorSuppressed } from "./pose-runtime-console";

export type PoseLandmark = NormalizedLandmark;

export type PoseReadinessResult = {
  poseRuntimeStatus: "ready";
  poseModelVersion: string;
  poseLandmarkCount: number;
  poseAverageVisibility: number;
  poseQualityFlag: "valid";
  cameraDeviceId: string;
  checkedAt: string;
};

export const poseModelVersion = "pose_landmarker_lite/float16/1";

let poseLandmarkerPromise: Promise<PoseLandmarker> | undefined;

export type PoseTrainingRuntime = {
  video: HTMLVideoElement;
  stream: MediaStream;
  poseModelVersion: string;
  deviceId: string;
  detect: (timestampMs: number) => PoseLandmark[];
  stop: () => void;
};

export async function checkPoseReadiness(): Promise<PoseReadinessResult> {
  const deviceId = requireBrowserPoseCameraDeviceId();
  const opened = await openBrowserPoseCamera({
    deviceId,
    width: { ideal: 640 },
    height: { ideal: 480 },
  });

  let video: HTMLVideoElement | undefined;
  try {
    video = await createReadyVideo(opened.stream);
    const poseLandmarker = await getPoseLandmarker();
    const result = detectPoseForVideo(poseLandmarker, video, performance.now());
    const pose = result.landmarks[0];
    if (!pose?.length) {
      throw new Error(
        "未检测到完整人体姿态，请确认全身或上半身进入摄像头画面。",
      );
    }

    const visibleLandmarks = pose.filter(
      (landmark) => (landmark.visibility ?? 0) >= 0.5,
    );
    const averageVisibility =
      pose.reduce((sum, landmark) => sum + (landmark.visibility ?? 0), 0) /
      pose.length;

    if (visibleLandmarks.length < 12 || averageVisibility < 0.45) {
      throw new Error(
        "姿态关键点置信度不足，请改善光线、站远一些并保持身体入镜。",
      );
    }

    return {
      poseRuntimeStatus: "ready",
      poseModelVersion,
      poseLandmarkCount: pose.length,
      poseAverageVisibility: Number(averageVisibility.toFixed(3)),
      poseQualityFlag: "valid",
      cameraDeviceId: opened.deviceId,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    if (video) releaseVideoElement(video);
    stopMediaStream(opened.stream);
  }
}

export async function createPoseTrainingRuntime({
  videoElement,
  deviceId,
  signal,
}: {
  videoElement: HTMLVideoElement;
  deviceId?: string;
  signal?: AbortSignal;
}): Promise<PoseTrainingRuntime> {
  throwIfPoseRuntimePreparationAborted(signal);
  const selectedDeviceId = requireBrowserPoseCameraDeviceId(deviceId);
  const opened = await openBrowserPoseCamera({
    deviceId: selectedDeviceId,
    width: { ideal: 960 },
    height: { ideal: 540 },
  });
  let released = false;
  const releaseCamera = () => {
    if (released) return;
    released = true;
    releaseVideoElement(videoElement);
    stopMediaStream(opened.stream);
  };
  const handleAbort = () => releaseCamera();
  signal?.addEventListener("abort", handleAbort, { once: true });

  try {
    await attachStreamToVideo(videoElement, opened.stream, signal);
    throwIfPoseRuntimePreparationAborted(signal);
    const poseLandmarker = await getPoseLandmarker();
    throwIfPoseRuntimePreparationAborted(signal);
    let stopped = false;
    return {
      video: videoElement,
      stream: opened.stream,
      poseModelVersion,
      deviceId: opened.deviceId,
      detect: (timestampMs) =>
        detectPoseForVideo(poseLandmarker, videoElement, timestampMs)
          .landmarks[0] ?? [],
      stop: () => {
        if (stopped) return;
        stopped = true;
        signal?.removeEventListener("abort", handleAbort);
        releaseCamera();
      },
    };
  } catch (error) {
    signal?.removeEventListener("abort", handleAbort);
    releaseCamera();
    throw error;
  }
}

export async function getPoseLandmarker() {
  poseLandmarkerPromise ??= createPoseLandmarker();
  return poseLandmarkerPromise;
}

async function createPoseLandmarker() {
  return withBenignPoseConsoleErrorSuppressed(async () => {
    await ensureBrowserPoseRuntimeAssets();
    const vision = await FilesetResolver.forVisionTasks(browserPoseWasmBaseUrl);
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: browserPoseModelUrl,
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  });
}

function detectPoseForVideo(
  poseLandmarker: PoseLandmarker,
  video: HTMLVideoElement,
  timestampMs: number,
) {
  return withBenignPoseConsoleErrorSuppressed(() =>
    poseLandmarker.detectForVideo(video, timestampMs),
  );
}

function createReadyVideo(stream: MediaStream) {
  const video = document.createElement("video");
  return attachStreamToVideo(video, stream);
}

function attachStreamToVideo(
  video: HTMLVideoElement,
  stream: MediaStream,
  signal?: AbortSignal,
) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
      signal?.removeEventListener("abort", handleAbort);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      releaseVideoElement(video);
      reject(error);
    };
    const handleLoadedMetadata = () => {
      void video
        .play()
        .then(() => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(video);
        })
        .catch((error: unknown) => {
          fail(
            error instanceof Error ? error : new Error("摄像头画面启动失败。"),
          );
        });
    };
    const handleError = () => {
      fail(new Error("摄像头画面读取失败。"));
    };
    const handleAbort = () => {
      fail(new Error("训练准备已停止，摄像头已关闭。"));
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("error", handleError);
    signal?.addEventListener("abort", handleAbort, { once: true });
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    const timeoutId = window.setTimeout(() => {
      fail(new Error("摄像头画面加载超时，请检查浏览器权限和设备占用情况。"));
    }, 8000);
    video.srcObject = stream;
    if (signal?.aborted) handleAbort();
  });
}

function releaseVideoElement(video: HTMLVideoElement) {
  if (video.srcObject === null) return;
  video.pause();
  video.srcObject = null;
}

function throwIfPoseRuntimePreparationAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("训练准备已停止，摄像头已关闭。");
  }
}
