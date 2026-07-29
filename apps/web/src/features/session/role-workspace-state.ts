import type {
  CaregiverAccountFormState,
  DataExportFormState,
  GameContentCreateFormState,
  UnityBuildFormState,
} from "@/features/admin/admin-governance-forms";
import type {
  BrowserPoseEvidenceFormState,
  UnityFieldEvidenceFormState,
} from "@/features/admin/TrainingQualityEvidenceSection";
import type { AccountRequestFormState } from "@/features/auth/AuthEntryPanel";
import type { CaregiverNoteFormState } from "@/features/caregiver/CaregiverReminderPanel";
import type {
  CollectionBatchFormState,
  TrainingReviewFormState,
} from "@/features/doctor/DoctorWorkspaceContainer";
import type { TrainingReadiness } from "@/features/training-runtime/types";
import type {
  AuditLogFilters,
  ConsentType,
  FormalTrainingRuntime,
  TrainingSession,
} from "@/types/api";

export const defaultAuditLogFilters: AuditLogFilters = {
  result: "all",
  actorRole: "all",
  limit: 100,
};

export type ActionKey =
  | "assessment"
  | "aiAssessmentDraft"
  | "assessmentSpeechTranscript"
  | "speechAiAssessmentDraft"
  | "ttsSpeechOutput"
  | "aiConversation"
  | "recommend"
  | "confirmRisk"
  | "confirmPlan"
  | "startTraining"
  | "resumeTraining"
  | "abortTraining"
  | "checkDevice"
  | "checkPose"
  | "submitResult"
  | "reviewTraining"
  | "consent"
  | "revokeConsent"
  | "createCaregiver"
  | "createRegistrationRequest"
  | "reviewRegistrationRequest"
  | "bindCaregiver"
  | "revokeCaregiver"
  | "createCareCirclePost"
  | "createCareCircleComment"
  | "createGameContent"
  | "updateGameContentStatus"
  | "updateUnityBuild"
  | "createCollectionCondition"
  | "createCollectionProtocol"
  | "createCollectionBatch"
  | "refreshTrainingPreparation"
  | "auditLogs"
  | "exportData";

type PatientScopedWorkspaceStateResetters = {
  pendingPlan: () => void;
  selectedTrainingPlanItem: () => void;
  activeTrainingSession: () => void;
  trainingReadiness: () => void;
  trainingResultDraft: () => void;
  trainingReviewForm: () => void;
  collectionBatchForm: () => void;
  browserPoseEvidenceForm: () => void;
  unityFieldEvidenceForm: () => void;
  assessmentForm: () => void;
  aiConversationForm: () => void;
  ad8AssessmentForm: () => void;
  caregiverBindingForm: () => void;
  caregiverNoteForm: () => void;
  caregiverCommentForms: () => void;
  busyActions: () => void;
  actionStatus: () => void;
};

export function resetPatientScopedWorkspaceState(
  resetters: PatientScopedWorkspaceStateResetters,
) {
  resetters.pendingPlan();
  resetters.selectedTrainingPlanItem();
  resetters.activeTrainingSession();
  resetters.trainingReadiness();
  resetters.trainingResultDraft();
  resetters.trainingReviewForm();
  resetters.collectionBatchForm();
  resetters.browserPoseEvidenceForm();
  resetters.unityFieldEvidenceForm();
  resetters.assessmentForm();
  resetters.aiConversationForm();
  resetters.ad8AssessmentForm();
  resetters.caregiverBindingForm();
  resetters.caregiverNoteForm();
  resetters.caregiverCommentForms();
  resetters.busyActions();
  resetters.actionStatus();
}

export function shouldApplyRoleActionSideEffect({
  operationWorkspaceGeneration,
  activeWorkspaceGeneration,
  isWorkspaceMounted,
  operationSessionToken,
  activeSessionToken,
  operationPatientId,
  activePatientId,
}: {
  operationWorkspaceGeneration: number;
  activeWorkspaceGeneration: number;
  isWorkspaceMounted: boolean;
  operationSessionToken: string | null;
  activeSessionToken: string | null;
  operationPatientId: string | null;
  activePatientId: string | null;
}) {
  return (
    isWorkspaceMounted &&
    operationWorkspaceGeneration === activeWorkspaceGeneration &&
    operationSessionToken === activeSessionToken &&
    operationPatientId === activePatientId
  );
}

type PatientTrainingLifecycleAction = "resumeTraining" | "abortTraining";

export type PatientTrainingLifecycleClaim = Readonly<{
  action: PatientTrainingLifecycleAction;
}>;

export function claimPatientTrainingLifecycleAction(
  inFlight: { current: PatientTrainingLifecycleClaim | null },
  action: PatientTrainingLifecycleAction,
): PatientTrainingLifecycleClaim | null {
  if (inFlight.current) return null;
  const claim: PatientTrainingLifecycleClaim = { action };
  inFlight.current = claim;
  return claim;
}

export function releasePatientTrainingLifecycleAction(
  inFlight: { current: PatientTrainingLifecycleClaim | null },
  claim: PatientTrainingLifecycleClaim,
) {
  if (inFlight.current === claim) inFlight.current = null;
}

export function invalidatePatientScopedActionIdentity(
  generation: { current: number },
  inFlight: { current: PatientTrainingLifecycleClaim | null },
) {
  generation.current += 1;
  inFlight.current = null;
}

export function applyResumedPatientTrainingSessionState({
  resumedSession,
  setActiveScreen,
  setActiveTrainingSession,
  setSelectedTrainingPlanItemId,
  setTrainingResultDraft,
}: {
  resumedSession: TrainingSession;
  setActiveScreen: (screen: "game") => void;
  setActiveTrainingSession: (session: TrainingSession) => void;
  setSelectedTrainingPlanItemId: (planItemId: string) => void;
  setTrainingResultDraft: (draft: null) => void;
}) {
  setActiveTrainingSession(resumedSession);
  setSelectedTrainingPlanItemId(resumedSession.planItemId);
  setTrainingResultDraft(null);
  setActiveScreen("game");
}

export async function finalizeAbortedPatientTrainingSessionState({
  clearActiveTrainingSession,
  clearSelectedTrainingPlanItem,
  clearTrainingResultDraft,
  reloadRoleData,
  showToday,
}: {
  clearActiveTrainingSession: () => void;
  clearSelectedTrainingPlanItem: () => void;
  clearTrainingResultDraft: () => void;
  reloadRoleData: () => Promise<boolean>;
  showToday: () => void;
}) {
  if (!(await reloadRoleData())) return false;
  clearActiveTrainingSession();
  clearTrainingResultDraft();
  clearSelectedTrainingPlanItem();
  showToday();
  return true;
}

export const emptyCaregiverAccountForm: CaregiverAccountFormState = {
  account: "",
  initialPassword: "",
  displayName: "",
  mobilePhone: "",
};

export const emptyCaregiverNoteForm: CaregiverNoteFormState = {
  body: "",
  mood: "",
};

export type RegistrationRequestFormState = AccountRequestFormState;

export const emptyRegistrationRequestForm: RegistrationRequestFormState = {
  requestedRole: "patient",
  account: "",
  initialPassword: "",
  displayName: "",
  mobilePhone: "",
  gender: "",
  age: "",
  caregiverName: "",
  caregiverPhone: "",
  healthSummary: "",
};

export type CaregiverBindingFormState = {
  caregiverAccount: string;
  relation: string;
  summary: boolean;
  reminders: boolean;
  progress: boolean;
};

export const emptyCaregiverBindingForm: CaregiverBindingFormState = {
  caregiverAccount: "",
  relation: "",
  summary: true,
  reminders: true,
  progress: true,
};

export const emptyDataExportForm: DataExportFormState = {
  dataset: "patients",
  format: "csv",
  reason: "",
  dateFrom: "",
  dateTo: "",
  patientId: "",
  limit: "100",
};

export const emptyGameContentCreateForm: GameContentCreateFormState = {
  code: "",
  name: "",
  runtimeType: "unity_webgl",
  gameVersion: "",
  trainingTargetsText: "",
  tagsText: "",
  defaultDuration: "",
  defaultDifficulty: "",
  supportsCamera: "",
  supportsMicrophone: "",
  supportedInputModesText: "",
  requiredMetricsText: "",
};

export const emptyUnityBuildForm: UnityBuildFormState = {
  gameContentId: "",
  manifestUrl: "",
  buildBaseUrl: "",
  gameVersion: "",
  bridgeProtocolVersion: "1.0.0",
  buildStatus: "pending_assets",
  releaseChannel: "development",
  supportsCamera: true,
  supportsMicrophone: false,
  supportedInputModesText: "camera_pose",
  requiredMetricsText: "",
};

export type CollectionConditionFormState = {
  code: string;
  name: string;
  description: string;
  environmentText: string;
  deviceRequirementsText: string;
  taskParametersText: string;
  qualityRulesText: string;
};

export const emptyCollectionConditionForm: CollectionConditionFormState = {
  code: "",
  name: "",
  description: "",
  environmentText: "",
  deviceRequirementsText: "",
  taskParametersText: "",
  qualityRulesText: "",
};

export type CollectionProtocolFormState = {
  conditionId: string;
  gameContentId: string;
  code: string;
  name: string;
  version: string;
  runtimeType: FormalTrainingRuntime;
  requiredConsentTypes: ConsentType[];
  requiredInputModesText: string;
  requiredMetricsText: string;
  conditionRulesText: string;
  samplingConfigText: string;
  qualityGateText: string;
};

export const emptyCollectionProtocolForm: CollectionProtocolFormState = {
  conditionId: "",
  gameContentId: "",
  code: "",
  name: "",
  version: "1.0.0",
  runtimeType: "unity_webgl",
  requiredConsentTypes: ["privacy_policy", "camera_capture"],
  requiredInputModesText: "camera_pose",
  requiredMetricsText: "",
  conditionRulesText: "",
  samplingConfigText: "",
  qualityGateText: "",
};

export const emptyCollectionBatchForm: CollectionBatchFormState = {
  planItemId: "",
  protocolId: "",
  operatorNotes: "",
};

export const emptyTrainingReviewForm: TrainingReviewFormState = {
  resultId: "",
  reviewConclusion: "",
  reviewNote: "",
};

export const emptyBrowserPoseEvidenceForm: BrowserPoseEvidenceFormState = {
  acceptedAt: "",
  testerName: "",
  siteName: "",
  environment: "",
  browserName: "",
  browserVersion: "",
  cameraDeviceIdHash: "",
  cameraResolution: "",
  patientExportId: "",
  confirmedByDoctorId: "",
  confirmedAt: "",
  auditLogIdsText: "",
  screenshotPath: "",
  screenshotCapturedAt: "",
  recordingPath: "",
  recordingCapturedAt: "",
};

export const emptyUnityFieldEvidenceForm: UnityFieldEvidenceFormState = {
  ...emptyBrowserPoseEvidenceForm,
  deviceType: "",
  inputMode: "",
  deviceResolution: "",
  loaderLoadedAt: "",
  unityInstanceStartedAt: "",
  canvasResolution: "",
  devicePixelRatio: "",
};

export const emptyTrainingReadiness: TrainingReadiness = {
  cameraPermission: "unknown",
  poseRuntimeStatus: "unknown",
};
