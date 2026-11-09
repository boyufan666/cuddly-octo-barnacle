import { resolveTrainingPrepCameraRequirement } from "@/lib/formal-training-content-readiness";
import type {
  CollectionBatch,
  CollectionProtocol,
  RehabPlan,
  TrainingRecordsResponse,
} from "@/types/api";
import type { TrainingReadiness } from "@/features/training-runtime/types";
import type { PoseReadinessResult } from "@/lib/pose-readiness";
import {
  openBrowserPoseCamera,
  stopMediaStream,
} from "@/lib/browser-pose-camera-access";
import { patientTrainingPrepNextStepMessage } from "./patient-training-actions";

export { patientTrainingPrepNextStepMessage, resolveTrainingPrepCameraRequirement };

export function trainingPrepSyncedStatus(requiresCamera: boolean) {
  return `训练安排已同步，${patientTrainingPrepNextStepMessage(requiresCamera)}`;
}

export function resolveNextPlanItem(
  plan: RehabPlan,
  trainingRecords?: TrainingRecordsResponse,
) {
  const completedPlanItemIds = new Set(
    trainingRecords?.sessions
      .filter(isCompletedTrainingSession)
      .map((session) => session.planItemId),
  );
  return plan.items.find((item) => !completedPlanItemIds.has(item.id));
}

export function findReadyCollectionBatch(
  batches: CollectionBatch[] | undefined,
  protocols: CollectionProtocol[] | undefined,
  patientId: string,
  currentPlanId: string,
  planItem: RehabPlan["items"][number],
) {
  const protocolById = new Map(
    (protocols ?? []).map((protocol) => [protocol.id, protocol]),
  );
  return (batches ?? []).find((batch) => {
    const protocol = batch.protocol ?? protocolById.get(batch.protocolId);
    return (
      batch.status === "ready" &&
      batch.patientId === patientId &&
      batch.rehabPlanId === currentPlanId &&
      batch.planItemId === planItem.id &&
      batch.gameContentId === planItem.gameContentId &&
      protocol?.status === "active" &&
      protocol.runtimeType === planItem.gameContent.runtimeType &&
      (!protocol.gameContentId ||
        protocol.gameContentId === planItem.gameContentId)
    );
  });
}

export function buildTodayTrainingRecords(
  trainingRecords?: TrainingRecordsResponse,
): TrainingRecordsResponse | undefined {
  if (!trainingRecords) return undefined;
  const todaySessions = trainingRecords.sessions.filter((session) =>
    isTodayDateTime(session.startedAt),
  );
  return buildTrainingRecordsFromSessions(todaySessions);
}

export function buildTrainingRecordsFromSessions(
  sessions: TrainingRecordsResponse["sessions"],
): TrainingRecordsResponse {
  const completedResults = sessions
    .filter(
      (session) =>
        session.sessionStatus === "completed" && Boolean(session.result),
    )
    .map((session) => session.result)
    .filter((result): result is NonNullable<typeof result> => Boolean(result));
  const validResults = sessions
    .filter(isCompletedTrainingSession)
    .map((session) => session.result)
    .filter((result): result is NonNullable<typeof result> => Boolean(result));

  return {
    sessions,
    summary: {
      totalSessions: sessions.length,
      completedSessions: sessions.filter(isCompletedTrainingSession).length,
      averageScore: validResults.length
        ? Math.round(
            validResults.reduce((sum, result) => sum + result.score, 0) /
              validResults.length,
          )
        : 0,
      abnormalCount: completedResults.filter(
        (result) => result.abnormalFlag || result.qualityFlag !== "valid",
      ).length,
    },
  };
}

export function isCompletedTrainingSession(
  session: TrainingRecordsResponse["sessions"][number],
) {
  return (
    session.sessionStatus === "completed" &&
    session.result?.qualityFlag === "valid" &&
    session.result.abnormalFlag === false
  );
}

export function isTodayDateTime(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export function findPlanItem(plan: RehabPlan | undefined, planItemId: string) {
  return plan?.items.find((item) => item.id === planItemId);
}

export function mergePoseReadiness(
  current: TrainingReadiness,
  result: PoseReadinessResult,
): TrainingReadiness {
  if (
    !current.cameraDeviceId ||
    current.cameraDeviceId !== result.cameraDeviceId
  ) {
    throw new Error("姿态预检使用的摄像头与设备检测结果不一致。");
  }
  return {
    ...current,
    poseRuntimeStatus: result.poseRuntimeStatus,
    poseModelVersion: result.poseModelVersion,
    poseLandmarkCount: result.poseLandmarkCount,
    poseAverageVisibility: result.poseAverageVisibility,
    poseQualityFlag: result.poseQualityFlag,
    poseCheckedAt: result.checkedAt,
    poseError: undefined,
  };
}

export async function checkCameraReadiness(): Promise<TrainingReadiness> {
  const opened = await openBrowserPoseCamera({
    width: { ideal: 640 },
    height: { ideal: 480 },
  });
  try {
    return {
      cameraPermission: "granted",
      cameraDeviceId: opened.deviceId,
      cameraLabel: opened.label,
      checkedAt: new Date().toISOString(),
      poseRuntimeStatus: "unknown",
    };
  } finally {
    stopMediaStream(opened.stream);
  }
}
