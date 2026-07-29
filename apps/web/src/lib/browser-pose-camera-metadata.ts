import {
  openBrowserPoseCamera,
  stopMediaStream,
} from "./browser-pose-camera-access";

export type BrowserPoseCameraMetadata = {
  cameraDeviceId: string;
  videoWidth: number;
  videoHeight: number;
};

export type BrowserPoseCameraMetadataOptions = {
  metadataTimeoutMs?: number;
};

export async function readBrowserPoseCameraMetadata(
  cameraDeviceId: string,
  options: BrowserPoseCameraMetadataOptions = {},
): Promise<BrowserPoseCameraMetadata> {
  const opened = await openBrowserPoseCamera({
    deviceId: cameraDeviceId,
  });
  let video: HTMLVideoElement | undefined;
  try {
    const metadataVideo = document.createElement("video");
    video = metadataVideo;
    metadataVideo.muted = true;
    metadataVideo.playsInline = true;
    metadataVideo.srcObject = opened.stream;

    const metadataTimeoutMs = options.metadataTimeoutMs ?? 5_000;
    await new Promise<void>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        cleanup();
        reject(new Error("读取摄像头视频元数据超时，不能预填分辨率字段。"));
      }, metadataTimeoutMs);
      function cleanup() {
        globalThis.clearTimeout(timeout);
        metadataVideo.removeEventListener("loadedmetadata", handleLoadedMetadata);
        metadataVideo.removeEventListener("error", handleError);
      }
      function handleLoadedMetadata() {
        cleanup();
        resolve();
      }
      function handleError() {
        cleanup();
        reject(new Error("读取摄像头视频元数据失败。"));
      }

      metadataVideo.addEventListener("loadedmetadata", handleLoadedMetadata, {
        once: true,
      });
      metadataVideo.addEventListener("error", handleError, { once: true });
    });

    if (!metadataVideo.videoWidth || !metadataVideo.videoHeight) {
      throw new Error("摄像头未返回真实视频分辨率，不能预填分辨率字段。");
    }

    return {
      cameraDeviceId,
      videoWidth: metadataVideo.videoWidth,
      videoHeight: metadataVideo.videoHeight,
    };
  } finally {
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    stopMediaStream(opened.stream);
  }
}
