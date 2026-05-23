import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

export type PoseLandmark = NormalizedLandmark;

export type PoseReadinessResult = {
  poseRuntimeStatus: "ready";
  poseModelVersion: string;
  poseLandmarkCount: number;
  poseAverageVisibility: number;
  poseQualityFlag: "valid";
  checkedAt: string;
};

const visionWasmBaseUrl =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const poseModelUrl =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
export const poseModelVersion = "pose_landmarker_lite/float16/1";

let poseLandmarkerPromise: Promise<PoseLandmarker> | undefined;

export type PoseTrainingRuntime = {
  video: HTMLVideoElement;
  stream: MediaStream;
  poseModelVersion: string;
  detect: (timestampMs: number) => PoseLandmark[];
  stop: () => void;
};

export async function checkPoseReadiness(): Promise<PoseReadinessResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前浏览器不支持摄像头姿态识别，请使用 Chrome、Edge 或 Safari 16.4+。");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: "user",
    },
    audio: false,
  });

  try {
    const video = await createReadyVideo(stream);
    const poseLandmarker = await getPoseLandmarker();
    const result = poseLandmarker.detectForVideo(video, performance.now());
    const pose = result.landmarks[0];
    if (!pose?.length) {
      throw new Error("未检测到完整人体姿态，请确认全身或上半身进入摄像头画面。");
    }

    const visibleLandmarks = pose.filter(
      (landmark) => (landmark.visibility ?? 0) >= 0.5,
    );
    const averageVisibility =
      pose.reduce((sum, landmark) => sum + (landmark.visibility ?? 0), 0) /
      pose.length;

    if (visibleLandmarks.length < 12 || averageVisibility < 0.45) {
      throw new Error("姿态关键点置信度不足，请改善光线、站远一些并保持身体入镜。");
    }

    return {
      poseRuntimeStatus: "ready",
      poseModelVersion,
      poseLandmarkCount: pose.length,
      poseAverageVisibility: Number(averageVisibility.toFixed(3)),
      poseQualityFlag: "valid",
      checkedAt: new Date().toISOString(),
    };
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

export async function createPoseTrainingRuntime({
  videoElement,
  deviceId,
}: {
  videoElement: HTMLVideoElement;
  deviceId?: string;
}): Promise<PoseTrainingRuntime> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前浏览器不支持摄像头姿态识别，请使用 Chrome、Edge 或 Safari 16.4+。");
  }

  const video: MediaTrackConstraints = {
    width: { ideal: 960 },
    height: { ideal: 540 },
    facingMode: "user",
  };
  if (deviceId) {
    video.deviceId = { exact: deviceId };
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video,
    audio: false,
  });

  try {
    await attachStreamToVideo(videoElement, stream);
    const poseLandmarker = await getPoseLandmarker();
    return {
      video: videoElement,
      stream,
      poseModelVersion,
      detect: (timestampMs) =>
        poseLandmarker.detectForVideo(videoElement, timestampMs).landmarks[0] ?? [],
      stop: () => {
        videoElement.pause();
        videoElement.srcObject = null;
        stream.getTracks().forEach((track) => track.stop());
      },
    };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
}

export async function getPoseLandmarker() {
  poseLandmarkerPromise ??= createPoseLandmarker();
  return poseLandmarkerPromise;
}

async function createPoseLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(visionWasmBaseUrl);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: poseModelUrl,
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

function createReadyVideo(stream: MediaStream) {
  const video = document.createElement("video");
  return attachStreamToVideo(video, stream);
}

function attachStreamToVideo(video: HTMLVideoElement, stream: MediaStream) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = stream;

    const timeoutId = window.setTimeout(() => {
      reject(new Error("摄像头画面加载超时，请检查浏览器权限和设备占用情况。"));
    }, 8000);

    video.onloadedmetadata = () => {
      void video
        .play()
        .then(() => {
          window.clearTimeout(timeoutId);
          resolve(video);
        })
        .catch((error: unknown) => {
          window.clearTimeout(timeoutId);
          reject(
            error instanceof Error
              ? error
              : new Error("摄像头画面启动失败。"),
          );
        });
    };

    video.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(new Error("摄像头画面读取失败。"));
    };
  });
}
