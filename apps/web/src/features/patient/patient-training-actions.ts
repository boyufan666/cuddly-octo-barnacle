import { api } from "@/lib/api";
import { requireBrowserPoseCameraDeviceId } from "@/lib/browser-pose-camera-access";
import { trainingRuntimeRequiresCamera } from "@/lib/formal-training-content-readiness";
import type {
  CollectionBatch,
  PatientProfile,
  RehabPlan,
  RehabPlanItem,
  StartTrainingSessionRequest,
  SubmitTrainingResultRequest,
  TrainingRecordSession,
  TrainingRecoveryContext,
  TrainingRecordsResponse,
  TrainingSession,
} from "@/types/api";

const activeTrainingSessionStatuses = new Set(["started", "in_progress"]);
const trainingRecoveryContextKeys = [
  "patientId",
  "rehabPlanId",
  "planItemId",
  "gameContentId",
  "collectionBatchId",
  "gameRunId",
  "clientStartedAt",
  "deviceCode",
  "calibrationStatus",
  "runtimeConfigSnapshot",
  "unityBuildVersion",
  "bridgeProtocolVersion",
  "startedAt",
].sort();
const blockedActiveTrainingSessionMessage =
  "训练记录出现异常，暂时无法继续，请联系工作人员处理。";

export type ActivePatientTrainingSessionResolution =
  | { status: "none" }
  | {
      status: "resumable";
      session: TrainingRecordSession;
      planItem: RehabPlanItem;
    }
  | { status: "blocked"; message: string };

export function resolveActivePatientTrainingSession({
  currentPlan,
  patientId,
  trainingRecords,
}: {
  currentPlan?: RehabPlan;
  patientId: string;
  trainingRecords?: TrainingRecordsResponse;
}): ActivePatientTrainingSessionResolution {
  if (!isPlainRecord(trainingRecords)) {
    return {
      status: "blocked",
      message: blockedActiveTrainingSessionMessage,
    };
  }
  const serializedSessions = trainingRecords.sessions;
  if (
    !Array.isArray(serializedSessions) ||
    !serializedSessions.every(isPlainRecord)
  ) {
    return {
      status: "blocked",
      message: blockedActiveTrainingSessionMessage,
    };
  }
  const sessions = serializedSessions as unknown as TrainingRecordSession[];
  const activeSessions = sessions.filter((session) =>
    activeTrainingSessionStatuses.has(session.sessionStatus),
  );
  if (activeSessions.length === 0) return { status: "none" };
  if (activeSessions.length > 1) {
    return {
      status: "blocked",
      message: blockedActiveTrainingSessionMessage,
    };
  }
  const session = activeSessions[0];
  const recoveryContext = readTrainingRecoveryContext(session);
  const planItem = currentPlan?.items.find(
    (item) => item.id === session.planItemId,
  );
  if (
    !currentPlan ||
    !currentPlan.isCurrent ||
    currentPlan.status !== "active" ||
    currentPlan.patientId !== patientId ||
    !hasText(session.id) ||
    session.result !== null ||
    !recoveryContext ||
    session.startedAt !== recoveryContext.startedAt ||
    session.calibrationStatus !== recoveryContext.calibrationStatus ||
    recoveryContext.patientId !== patientId ||
    recoveryContext.rehabPlanId !== currentPlan.id ||
    recoveryContext.planItemId !== session.planItemId ||
    !planItem ||
    planItem.rehabPlanId !== currentPlan.id ||
    recoveryContext.gameContentId !== planItem.gameContentId ||
    session.gameContent?.id !== recoveryContext.gameContentId ||
    !hasMatchingRecordedRuntimeContext(recoveryContext, planItem)
  ) {
    return {
      status: "blocked",
      message: blockedActiveTrainingSessionMessage,
    };
  }
  return {
    status: "resumable",
    session,
    planItem,
  };
}

function readTrainingRecoveryContext(
  session: TrainingRecordSession,
): TrainingRecoveryContext | undefined {
  const value: unknown = session.recoveryContext;
  if (!isPlainRecord(value)) return undefined;
  const keys = Object.keys(value).sort();
  if (
    keys.length !== trainingRecoveryContextKeys.length ||
    !keys.every((key, index) => key === trainingRecoveryContextKeys[index])
  ) {
    return undefined;
  }
  if (
    !hasText(value.patientId) ||
    !hasText(value.rehabPlanId) ||
    !hasText(value.planItemId) ||
    !hasText(value.gameContentId) ||
    !hasText(value.collectionBatchId) ||
    !hasText(value.gameRunId) ||
    !hasText(value.clientStartedAt) ||
    !isNullableText(value.deviceCode) ||
    !hasText(value.calibrationStatus) ||
    !isPlainRecord(value.runtimeConfigSnapshot) ||
    !isNullableText(value.unityBuildVersion) ||
    !hasText(value.bridgeProtocolVersion) ||
    !hasText(value.startedAt)
  ) {
    return undefined;
  }
  return value as unknown as TrainingRecoveryContext;
}

function hasMatchingRecordedRuntimeContext(
  recoveryContext: TrainingRecoveryContext,
  planItem: RehabPlanItem,
) {
  const snapshot = recoveryContext.runtimeConfigSnapshot;
  if (!isPlainRecord(snapshot)) return false;
  const collectionBatch = snapshot.collectionBatch;
  return (
    snapshot.runtimeType === planItem.gameContent.runtimeType &&
    snapshot.approvedPlanItemId === planItem.id &&
    hasText(snapshot.assessmentSourceId) &&
    snapshot.startingLevelSource === "clinician_approved_plan" &&
    Number.isInteger(snapshot.startingDifficultyLevel) &&
    Number(snapshot.startingDifficultyLevel) >= 1 &&
    Number(snapshot.startingDifficultyLevel) <= 3 &&
    isPlainRecord(collectionBatch) &&
    collectionBatch.id === recoveryContext.collectionBatchId
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function isNullableText(value: unknown): value is string | null {
  return value === null || hasText(value);
}

export function validateResumedPatientTrainingSession({
  currentPlan,
  patientId,
  recordedSession,
  resumedSession,
}: {
  currentPlan: RehabPlan;
  patientId: string;
  recordedSession: TrainingRecordSession;
  resumedSession: TrainingSession;
}) {
  const recoveryContext = readTrainingRecoveryContext(recordedSession);
  const planItem = currentPlan.items.find(
    (item) => item.id === recordedSession.planItemId,
  );
  if (
    !recoveryContext ||
    !planItem ||
    !currentPlan.isCurrent ||
    currentPlan.status !== "active" ||
    currentPlan.patientId !== patientId ||
    !hasText(recordedSession.id) ||
    recordedSession.result !== null ||
    !activeTrainingSessionStatuses.has(recordedSession.sessionStatus) ||
    recordedSession.startedAt !== recoveryContext.startedAt ||
    recordedSession.calibrationStatus !== recoveryContext.calibrationStatus ||
    recoveryContext.patientId !== patientId ||
    recoveryContext.rehabPlanId !== currentPlan.id ||
    recoveryContext.planItemId !== recordedSession.planItemId ||
    recoveryContext.gameContentId !== planItem.gameContentId ||
    recordedSession.gameContent?.id !== recoveryContext.gameContentId ||
    planItem.rehabPlanId !== currentPlan.id ||
    !hasMatchingRecordedRuntimeContext(recoveryContext, planItem)
  ) {
    throw new Error(blockedActiveTrainingSessionMessage);
  }
  const matchingIdentity =
    resumedSession.id === recordedSession.id &&
    resumedSession.patientId === recoveryContext.patientId &&
    resumedSession.rehabPlanId === recoveryContext.rehabPlanId &&
    resumedSession.planItemId === recoveryContext.planItemId &&
    resumedSession.gameContentId === recoveryContext.gameContentId &&
    resumedSession.collectionBatchId === recoveryContext.collectionBatchId;
  const matchingRuntimeContext =
    resumedSession.gameRunId === recoveryContext.gameRunId &&
    resumedSession.clientStartedAt === recoveryContext.clientStartedAt &&
    resumedSession.startedAt === recoveryContext.startedAt &&
    resumedSession.deviceCode === recoveryContext.deviceCode &&
    resumedSession.calibrationStatus === recoveryContext.calibrationStatus &&
    resumedSession.unityBuildVersion === recoveryContext.unityBuildVersion &&
    resumedSession.bridgeProtocolVersion ===
      recoveryContext.bridgeProtocolVersion &&
    sameJsonValue(
      resumedSession.runtimeConfigSnapshot,
      recoveryContext.runtimeConfigSnapshot,
    );
  if (
    !matchingIdentity ||
    !matchingRuntimeContext ||
    !activeTrainingSessionStatuses.has(resumedSession.sessionStatus) ||
    resumedSession.result !== null
  ) {
    throw new Error(blockedActiveTrainingSessionMessage);
  }
  return resumedSession;
}

export function validateTrainingAbortReason(reason: string) {
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new Error("请填写终止原因后再继续。");
  }
  if (normalizedReason.length > 500) {
    throw new Error("终止原因不能超过 500 个字符。");
  }
  return normalizedReason;
}

export async function resumePatientTrainingSession({
  currentPlan,
  patientId,
  recordedSession,
}: {
  currentPlan: RehabPlan;
  patientId: string;
  recordedSession: TrainingRecordSession;
}) {
  const resumedSession = await api.resumeTrainingSession(recordedSession.id);
  return validateResumedPatientTrainingSession({
    currentPlan,
    patientId,
    recordedSession,
    resumedSession,
  });
}

export async function abortPatientTrainingSession(
  sessionId: string,
  reason: string,
) {
  return api.abortTrainingSession(sessionId, {
    reason: validateTrainingAbortReason(reason),
  });
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameJsonValue(value, right[index]))
    );
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && sameJsonValue(left[key], right[key]),
    )
  );
}

export function patientTrainingPrepNextStepMessage(requiresCamera: boolean) {
  return requiresCamera
    ? "请先完成摄像头设备检测和站位检查。"
    : "请确认训练安排后开始训练。";
}

export async function refreshTrainingPreparation(patientId: string) {
  return api.collectionBatches(patientId);
}

export type StartPatientTrainingSessionInput = {
  patient: PatientProfile;
  currentPlan: RehabPlan;
  planItem: RehabPlanItem;
  collectionBatch: CollectionBatch;
  cameraDeviceId?: string;
};

export async function startTrainingSession({
  patient,
  currentPlan,
  planItem,
  collectionBatch,
  cameraDeviceId,
}: StartPatientTrainingSessionInput) {
  const deviceCode = trainingRuntimeRequiresCamera(planItem.gameContent)
    ? requireBrowserPoseCameraDeviceId(cameraDeviceId ?? null)
    : undefined;
  const gameRunId = createTrainingGameRunId(
    patient.id,
    planItem.gameContent.code,
  );
  const clientStartedAt = new Date().toISOString();
  const request: StartTrainingSessionRequest = {
    patientId: patient.id,
    rehabPlanId: currentPlan.id,
    planItemId: planItem.id,
    gameContentId: planItem.gameContentId,
    collectionBatchId: collectionBatch.id,
    gameRunId,
    deviceCode,
    calibrationStatus: "checked",
    clientStartedAt,
    idempotencyKey: ["web-training", patient.id, planItem.id, gameRunId].join(
      ":",
    ),
  };
  return {
    gameRunId,
    clientStartedAt,
    trainingSession: await api.startTrainingSession(request),
  };
}

export async function submitTrainingResult(
  trainingSessionId: string,
  payload: SubmitTrainingResultRequest,
) {
  return api.submitTrainingResult(trainingSessionId, payload);
}

function createTrainingGameRunId(patientId: string, gameCode: string) {
  if (typeof crypto === "undefined" || !("randomUUID" in crypto)) {
    throw new Error("训练暂时无法开始，请稍后重试或联系医师。");
  }
  const randomId = crypto.randomUUID();
  return `${patientId}:${gameCode}:${randomId}`;
}
