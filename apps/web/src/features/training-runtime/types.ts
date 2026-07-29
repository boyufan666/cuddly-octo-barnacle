export type TrainingReadiness = {
  cameraPermission: "unknown" | "requesting" | "granted" | "denied";
  cameraDeviceId?: string;
  cameraLabel?: string;
  checkedAt?: string;
  error?: string;
  poseRuntimeStatus: "unknown" | "loading" | "ready" | "error";
  poseModelVersion?: string;
  poseLandmarkCount?: number;
  poseAverageVisibility?: number;
  poseQualityFlag?: "valid";
  poseCheckedAt?: string;
  poseError?: string;
};
