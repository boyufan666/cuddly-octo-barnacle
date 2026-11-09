"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RoleShell } from "@/components/layout/RoleShell";
import { AdminOverviewPage } from "@/features/admin/AdminOverviewPage";
import {
  auditLogs as fetchAdminAuditLogs,
  downloadExportedFile,
  exportData as exportAdminData,
} from "@/features/admin/admin-governance-actions";
import {
  buildCreateCaregiverAccountPayload,
  buildCollectionConditionPayload,
  buildCollectionProtocolPayload,
  buildDataExportPayload,
  buildGameContentCreatePayload,
  buildUnityBuildForm,
  buildUnityBuildPayload,
  validateAuditLogFilters,
} from "@/features/admin/admin-payload-builders";
import type {
  CaregiverAccountFormState,
  DataExportFormState,
  GameContentCreateFormState,
  UnityBuildFormState,
} from "@/features/admin/admin-governance-forms";
import {
  type BrowserPoseEvidenceFormState,
  type UnityFieldEvidenceFormState,
} from "@/features/admin/TrainingQualityEvidenceSection";
import type { TrainingReadiness } from "@/features/training-runtime/types";
import {
  DoctorWorkspaceContainer,
  type CollectionBatchFormState,
  type TrainingReviewFormState,
} from "@/features/doctor/DoctorWorkspaceContainer";
import {
  buildDoctorAssessmentReturnPayload,
  buildDoctorAssessmentReviewPayload,
  buildDoctorCollectionBatchPayload,
  buildDoctorTrainingReviewPayload,
  confirmPlan as confirmDoctorPlan,
  createCollectionBatch as createDoctorCollectionBatch,
  refreshCollectionBatches,
  reviewAssessment,
  reviewTrainingResult,
} from "@/features/doctor/doctor-workbench-actions";
import { AuthEntryPanel } from "@/features/auth/AuthEntryPanel";
import { buildCreateRegistrationRequestPayload } from "@/features/auth/account-request-payload";
import { CaregiverWorkspacePage } from "@/features/caregiver/CaregiverWorkspacePage";
import { buildCaregiverWorkspaceModel } from "@/features/caregiver/caregiver-workspace-model";
import type { CaregiverNoteFormState } from "@/features/caregiver/CaregiverReminderPanel";
import { PlanConfirmationWorkspace } from "@/features/doctor/PlanConfirmationWorkspace";
import {
  AssessmentScreen,
  emptyAd8AssessmentForm,
  emptyAiConversationForm,
  emptyAssessmentForm,
  findActiveAiConversation,
  upsertAiConversationMessages,
  upsertAiConversationSession,
  type AiConversationFormState,
  type AssessmentFormState,
  type AssessmentSpeechRecording,
} from "@/features/patient/AssessmentDialoguePage";
import { DevicePermissionCenterPage } from "@/features/patient/DevicePermissionCenterPage";
import { PatientWorkspacePage } from "@/features/patient/PatientWorkspacePage";
import type { PatientTrainingResultDraft } from "@/features/patient/TrainingRuntimePage";
import { PatientTrainingRuntimeStage } from "@/features/patient/PatientTrainingRuntimeStage";
import { PlanSuggestionPage } from "@/features/patient/PlanSuggestionPage";
import {
  consentLabel,
  patientConsentVersion,
  summarizePatientConsents,
} from "@/features/patient/patient-consent-model";
import { buildCaregiverRelationPayload } from "@/features/patient/patient-caregiver-relation";
import {
  buildPlanPrerequisiteState,
  resolveConfirmedCurrentPlan,
} from "@/features/patient/plan-suggestion-model";
import {
  abortPatientTrainingSession,
  refreshTrainingPreparation,
  resumePatientTrainingSession,
  startTrainingSession,
  submitTrainingResult,
} from "@/features/patient/patient-training-actions";
import { validateCapturedPatientTrainingResult } from "@/features/patient/patient-training-result-boundary";
import {
  checkCameraReadiness,
  findPlanItem,
  isCompletedTrainingSession,
  mergePoseReadiness,
  patientTrainingPrepNextStepMessage,
  resolveTrainingPrepCameraRequirement,
  trainingPrepSyncedStatus,
} from "@/features/patient/patient-readiness-orchestration";
import {
  buildNavigationSections,
  hasCaregiverPatientScope,
  isAdminRole,
  isPatientLikeRole,
  resolveActiveRoleNavId,
  resolveAuthorizedRoleNavigationItems,
  resolveHomeScreen,
  roleNavigationItemMatchesScreen,
  screens,
  visibleScreensByRole,
  type RoleNavigationId,
  type ScreenId,
} from "@/features/session/role-navigation";
import {
  adminWorkspaceFromNavId,
  canRecommendRehabPlan,
  canUsePatientAiAssessment,
  caregiverWorkspaceSectionFromNavId,
  doctorWorkspaceFromNavId,
  gameBuildStatusLabel,
  gameContentStatusLabel,
  hasAdminPermission,
  isPatientWorkspaceScreen,
  mergeCollectionConditions,
  resolveAiAssessmentRoute,
  resolveRoleWorkspaceAiAssessmentRoute,
  roleLabel,
  upsertCollectionCondition,
} from "@/features/session/role-workspace-model";
import {
  applyResumedPatientTrainingSessionState,
  claimPatientTrainingLifecycleAction,
  defaultAuditLogFilters,
  emptyBrowserPoseEvidenceForm,
  emptyCaregiverAccountForm,
  emptyCaregiverBindingForm,
  emptyCaregiverNoteForm,
  emptyCollectionBatchForm,
  emptyCollectionConditionForm,
  emptyCollectionProtocolForm,
  emptyDataExportForm,
  emptyGameContentCreateForm,
  emptyRegistrationRequestForm,
  emptyTrainingReadiness,
  emptyTrainingReviewForm,
  emptyUnityBuildForm,
  emptyUnityFieldEvidenceForm,
  finalizeAbortedPatientTrainingSessionState,
  invalidatePatientScopedActionIdentity,
  releasePatientTrainingLifecycleAction,
  resetPatientScopedWorkspaceState,
  shouldApplyRoleActionSideEffect,
  type ActionKey,
  type CaregiverBindingFormState,
  type CollectionConditionFormState,
  type CollectionProtocolFormState,
  type PatientTrainingLifecycleClaim,
  type RegistrationRequestFormState,
} from "@/features/session/role-workspace-state";
import {
  useRoleData,
  type RoleDataCameraSelectionTransfer,
} from "@/features/session/useRoleData";
import {
  isPatientSelectionAuthorized,
  shouldApplyAuthenticatedSideEffect,
  useRoleSession,
} from "@/features/session/useRoleSession";
import { CaregiverPatientSelector } from "@/features/session/CaregiverPatientSelector";
import { RoleDataPanelErrors } from "@/features/session/RoleDataPanelErrors";
import { ApiError, api } from "@/lib/api";
import {
  applyAiAssessmentDraftToForm,
  applySpeechAiAssessmentDraftToForm,
  createStagedAiAssessmentDraft,
  isStagedAiAssessmentDraftForRequest,
  type Ad8AssessmentFormState,
  type AssessmentDraftFormField,
  type StagedAiAssessmentDraft,
} from "@/lib/ai-assessment-draft";
import {
  applyAssessmentSpeechTranscriptToForm,
  buildAssessmentSpeechTranscriptRequest,
} from "@/lib/assessment-speech-transcript";
import { createCurrentPageHighCostRequestRegistry } from "@/lib/high-cost-request-intent";
import { requireBrowserPoseCameraSelection } from "@/lib/browser-pose-camera-access";
import {
  isGameReadyForTraining,
  trainingRuntimeRequiresCamera,
} from "@/lib/formal-training-content-readiness";
import { checkPoseReadiness } from "@/lib/pose-readiness";
import {
  createStagedTtsSpeechOutput,
  isStagedTtsSpeechOutputForRequest,
  playTtsSpeechOutputAudio,
  type StagedTtsSpeechOutput,
} from "@/lib/tts-speech-output";
import {
  createRetainedHighCostResultErrorHandler,
  extractErrorMessage,
  doctorSafeActionStatus,
  parseRequiredTrimmedText,
  patientSafeActionStatus,
  patientSafeTrainingActionErrorMessage,
  updateBusyActions,
} from "@/features/session/action-status";
import { createRoleWorkspaceFormUpdaters } from "@/features/session/role-workspace-form-updaters";
import { deriveRoleWorkspaceTrainingContext } from "@/features/session/role-workspace-training-context";
import { createAiConversationActions } from "@/features/session/ai-conversation-actions";
import {
  requestAiAssessmentDraft,
  requestAiConversationMessage,
  requestAssessmentSpeechTranscript,
  requestTtsSpeechOutput,
} from "@/features/session/high-cost-request-actions";
import type {
  AssessmentRecord,
  AuditLogFilters,
  CollectionCondition,
  ConsentType,
  CaregiverRelation,
  ConsentRecord,
  ConfirmPlanRequest,
  CreateCaregiverAccountRequest,
  CreateCollectionBatchRequest,
  CreateCollectionConditionRequest,
  CreateCollectionProtocolRequest,
  CreateGameContentRequest,
  CreateRegistrationRequest,
  DataExportRequest,
  AuthenticatedSession,
  RegistrationRequest,
  RehabPlan,
  ReviewAssessmentRequest,
  ReviewRegistrationRequest,
  RiskGrade,
  SubmitTrainingResultRequest,
  SubmitTrainingReviewRequest,
  TrainingSession,
  UpdateGameContentStatusRequest,
  UpdateUnityBuildRequest,
} from "@/types/api";

export {
  applyResumedPatientTrainingSessionState,
  claimPatientTrainingLifecycleAction,
  finalizeAbortedPatientTrainingSessionState,
  invalidatePatientScopedActionIdentity,
  releasePatientTrainingLifecycleAction,
  resetPatientScopedWorkspaceState,
  shouldApplyRoleActionSideEffect,
};
export type { PatientTrainingLifecycleClaim };

type InteractiveTtsSpeechScenario =
  | "assessment_prompt"
  | "training_encouragement";

const interactiveTtsSpeechOutputCopy = {
  assessment_prompt: {
    consentRequiredMessage:
      "请先签署评估数据处理授权，再生成题目播报语音。",
    label: "题目播报",
    playedMessage: "题目播报语音已播放，可继续完成评估。",
  },
  training_encouragement: {
    consentRequiredMessage:
      "请先签署智能服务数据处理授权，再生成训练鼓励语音。",
    label: "训练鼓励",
    playedMessage: "训练鼓励语音已播放，请继续按屏幕提示完成训练。",
  },
} satisfies Record<
  InteractiveTtsSpeechScenario,
  {
    consentRequiredMessage: string;
    label: string;
    playedMessage: string;
  }
>;

export function RoleWorkspace() {
  const [active, setActiveScreen] = useState<ScreenId>("login");
  const [activeRoleNavId, setActiveRoleNavId] =
    useState<RoleNavigationId | null>("login");
  const [pendingPlan, setPendingPlan] = useState<RehabPlan | null>(null);
  const [selectedTrainingPlanItemId, setSelectedTrainingPlanItemId] = useState<
    string | null
  >(null);
  const [activeTrainingSession, setActiveTrainingSession] =
    useState<TrainingSession | null>(null);
  const [busyActions, setBusyActions] = useState<ReadonlySet<ActionKey>>(
    () => new Set(),
  );
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [assessmentForm, setAssessmentForm] =
    useState<AssessmentFormState>(emptyAssessmentForm);
  const [aiConversationForm, setAiConversationForm] =
    useState<AiConversationFormState>(emptyAiConversationForm);
  const [, setAd8AssessmentForm] = useState<Ad8AssessmentFormState>(
    emptyAd8AssessmentForm,
  );
  const [registrationRequestForm, setRegistrationRequestForm] =
    useState<RegistrationRequestFormState>(emptyRegistrationRequestForm);
  const [caregiverAccountForm, setCaregiverAccountForm] =
    useState<CaregiverAccountFormState>(emptyCaregiverAccountForm);
  const [caregiverBindingForm, setCaregiverBindingForm] =
    useState<CaregiverBindingFormState>(emptyCaregiverBindingForm);
  const [caregiverNoteForm, setCaregiverNoteForm] =
    useState<CaregiverNoteFormState>(emptyCaregiverNoteForm);
  const [caregiverCommentForms, setCaregiverCommentForms] = useState<
    Record<string, string>
  >({});
  const [dataExportForm, setDataExportForm] =
    useState<DataExportFormState>(emptyDataExportForm);
  const [gameContentCreateForm, setGameContentCreateForm] =
    useState<GameContentCreateFormState>(emptyGameContentCreateForm);
  const [unityBuildForm, setUnityBuildForm] =
    useState<UnityBuildFormState>(emptyUnityBuildForm);
  const [collectionConditionForm, setCollectionConditionForm] =
    useState<CollectionConditionFormState>(emptyCollectionConditionForm);
  const [collectionProtocolForm, setCollectionProtocolForm] =
    useState<CollectionProtocolFormState>(emptyCollectionProtocolForm);
  const [collectionBatchForm, setCollectionBatchForm] =
    useState<CollectionBatchFormState>(emptyCollectionBatchForm);
  const [localCollectionConditions, setLocalCollectionConditions] = useState<
    CollectionCondition[]
  >([]);
  const [trainingResultDraft, setTrainingResultDraft] =
    useState<PatientTrainingResultDraft | null>(null);
  const [trainingReviewForm, setTrainingReviewForm] =
    useState<TrainingReviewFormState>(emptyTrainingReviewForm);
  const [browserPoseEvidenceForm, setBrowserPoseEvidenceForm] =
    useState<BrowserPoseEvidenceFormState>(emptyBrowserPoseEvidenceForm);
  const [unityFieldEvidenceForm, setUnityFieldEvidenceForm] =
    useState<UnityFieldEvidenceFormState>(emptyUnityFieldEvidenceForm);
  const [trainingReadiness, setTrainingReadiness] = useState<TrainingReadiness>(
    emptyTrainingReadiness,
  );
  const [auditLogFilters, setAuditLogFilters] = useState<AuditLogFilters>(
    defaultAuditLogFilters,
  );
  const handleUnauthorizedRef = useRef<((error: unknown) => boolean) | null>(
    null,
  );
  const workspaceMountedRef = useRef(false);
  const activeWorkspaceGenerationRef = useRef(0);
  const activeRoleDataTokenRef = useRef<string | null>(null);
  const activePatientIdRef = useRef<string | null>(null);
  const patientTrainingLifecycleActionRef =
    useRef<PatientTrainingLifecycleClaim | null>(null);
  const stagedAiAssessmentDraftRef = useRef<StagedAiAssessmentDraft | null>(
    null,
  );
  const stagedTtsSpeechOutputRef = useRef<StagedTtsSpeechOutput | null>(null);
  const highCostRequestRegistryRef = useRef(
    createCurrentPageHighCostRequestRegistry(),
  );

  useEffect(() => {
    const highCostRequestRegistry = highCostRequestRegistryRef.current;
    workspaceMountedRef.current = true;
    activeWorkspaceGenerationRef.current += 1;
    return () => {
      workspaceMountedRef.current = false;
      activeWorkspaceGenerationRef.current += 1;
      activeRoleDataTokenRef.current = null;
      activePatientIdRef.current = null;
      patientTrainingLifecycleActionRef.current = null;
      stagedAiAssessmentDraftRef.current = null;
      stagedTtsSpeechOutputRef.current = null;
      highCostRequestRegistry.clear();
    };
  }, []);

  const captureRoleActionIdentity = useCallback(
    () => ({
      operationWorkspaceGeneration: activeWorkspaceGenerationRef.current,
      operationSessionToken: activeRoleDataTokenRef.current,
      operationPatientId: activePatientIdRef.current,
    }),
    [],
  );

  const isRoleActionIdentityCurrent = useCallback(
    (identity: ReturnType<typeof captureRoleActionIdentity>) =>
      shouldApplyRoleActionSideEffect({
        ...identity,
        activeWorkspaceGeneration: activeWorkspaceGenerationRef.current,
        isWorkspaceMounted: workspaceMountedRef.current,
        activeSessionToken: activeRoleDataTokenRef.current,
        activePatientId: activePatientIdRef.current,
      }),
    [],
  );

  const clearPatientScopedState = useCallback(() => {
    patientTrainingLifecycleActionRef.current = null;
    stagedAiAssessmentDraftRef.current = null;
    stagedTtsSpeechOutputRef.current = null;
    highCostRequestRegistryRef.current.clear();
    resetPatientScopedWorkspaceState({
      pendingPlan: () => setPendingPlan(null),
      selectedTrainingPlanItem: () => setSelectedTrainingPlanItemId(null),
      activeTrainingSession: () => setActiveTrainingSession(null),
      trainingReadiness: () => setTrainingReadiness(emptyTrainingReadiness),
      trainingResultDraft: () => setTrainingResultDraft(null),
      trainingReviewForm: () => setTrainingReviewForm(emptyTrainingReviewForm),
      collectionBatchForm: () =>
        setCollectionBatchForm(emptyCollectionBatchForm),
      browserPoseEvidenceForm: () =>
        setBrowserPoseEvidenceForm(emptyBrowserPoseEvidenceForm),
      unityFieldEvidenceForm: () =>
        setUnityFieldEvidenceForm(emptyUnityFieldEvidenceForm),
      assessmentForm: () => setAssessmentForm(emptyAssessmentForm),
      aiConversationForm: () => setAiConversationForm(emptyAiConversationForm),
      ad8AssessmentForm: () => setAd8AssessmentForm(emptyAd8AssessmentForm),
      caregiverBindingForm: () =>
        setCaregiverBindingForm(emptyCaregiverBindingForm),
      caregiverNoteForm: () => setCaregiverNoteForm(emptyCaregiverNoteForm),
      caregiverCommentForms: () => setCaregiverCommentForms({}),
      busyActions: () => setBusyActions(new Set()),
      actionStatus: () => setActionStatus(null),
    });
  }, []);

  const {
    clearRoleData,
    data,
    dataError,
    dataStatus,
    loadRoleData,
    panelErrors,
    setData,
    setDataError,
    setDataStatus,
  } = useRoleData({
    isRequestCurrent: (operationToken) =>
      shouldApplyAuthenticatedSideEffect({
        operationToken,
        activeSessionToken: activeRoleDataTokenRef.current,
      }),
    onUnauthorized: (message) => {
      handleUnauthorizedRef.current?.(new ApiError(message, 401));
    },
  });

  const clearAuthenticatedState = useCallback(
    (status: string, message?: string) => {
      activeRoleDataTokenRef.current = null;
      activePatientIdRef.current = null;
      clearRoleData(status, message);
      clearPatientScopedState();
      setGameContentCreateForm(emptyGameContentCreateForm);
      setUnityBuildForm(emptyUnityBuildForm);
      setCollectionConditionForm(emptyCollectionConditionForm);
      setCollectionProtocolForm(emptyCollectionProtocolForm);
      setLocalCollectionConditions([]);
      setAuditLogFilters(defaultAuditLogFilters);
      setRegistrationRequestForm(emptyRegistrationRequestForm);
      setActiveScreen("login");
      setActiveRoleNavId("login");
    },
    [clearPatientScopedState, clearRoleData],
  );

  const handleAuthenticated = useCallback(
    async (
      loginResponse: AuthenticatedSession,
      requestedPatientId?: string,
      { signal }: { signal?: AbortSignal } = {},
    ) => {
      const auditFilters = defaultAuditLogFilters;
      activeRoleDataTokenRef.current = loginResponse.requestEpoch;
      await loadRoleData(loginResponse, requestedPatientId, auditFilters, {
        signal,
      });
    },
    [loadRoleData],
  );

  const handleHomeResolved = useCallback(
    (loginResponse: AuthenticatedSession, patientId?: string) => {
      activePatientIdRef.current = patientId ?? null;
      const homeScreen = resolveHomeScreen(loginResponse);
      const authorizedNavigationItems = resolveAuthorizedRoleNavigationItems(
        loginResponse,
        patientId,
      );
      setActiveScreen(homeScreen);
      setActiveRoleNavId(
        resolveActiveRoleNavId(
          loginResponse.context.primaryRole,
          homeScreen,
          null,
          authorizedNavigationItems,
        ),
      );
    },
    [],
  );

  const {
    dataError: sessionDataError,
    dataStatus: sessionDataStatus,
    handleLogin,
    handleLogout,
    handlePasswordReset,
    handleUnauthorized,
    passwordResetRequired,
    selectedPatientId,
    session,
    setSelectedPatientId,
    setSession,
  } = useRoleSession({
    onAuthenticated: handleAuthenticated,
    onClearAuthenticatedState: clearAuthenticatedState,
    onHomeResolved: handleHomeResolved,
  });

  useEffect(() => {
    handleUnauthorizedRef.current = handleUnauthorized;
  }, [handleUnauthorized]);

  useEffect(() => {
    activeRoleDataTokenRef.current = session?.requestEpoch ?? null;
  }, [session?.requestEpoch]);

  useEffect(() => {
    activePatientIdRef.current = selectedPatientId;
  }, [selectedPatientId]);

  const displayedDataError = session
    ? dataError
    : (sessionDataError ?? dataError);
  const displayedDataStatus = session ? dataStatus : sessionDataStatus;

  const primaryRole = session?.context.primaryRole;
  const roleNavigationItems = session
    ? resolveAuthorizedRoleNavigationItems(
        session,
        selectedPatientId ?? undefined,
      )
    : undefined;
  const visibleScreens = session
    ? primaryRole
      ? screens.filter((screen) =>
          new Set(visibleScreensByRole[primaryRole]).has(screen.id),
        )
      : screens.filter((screen) => screen.id !== "login")
    : screens.filter((screen) => screen.id === "login");
  const navigationSections = buildNavigationSections(
    primaryRole,
    visibleScreens,
    roleNavigationItems,
  );
  const activeNavId = resolveActiveRoleNavId(
    primaryRole,
    active,
    activeRoleNavId,
    roleNavigationItems,
  );
  const {
    activePlanItem,
    activeTrainingResolution,
    currentPlan,
    preparedCollectionBatch,
    selectedPlanItem,
    selectedPlanPrepRequirement,
    todayTrainingRecords,
    visibleTrainingRecords,
  } = deriveRoleWorkspaceTrainingContext({
    activeTrainingSession,
    data,
    selectedTrainingPlanItemId,
  });
  const adminPermissions = session?.context.adminPermissions ?? [];
  const canManageUsers = hasAdminPermission(adminPermissions, "user.manage");
  const canReadAuditLogs = hasAdminPermission(adminPermissions, "audit.read");
  const canExportData = hasAdminPermission(adminPermissions, "data.export");
  const canCreateCaregiver = canManageUsers;
  const canManageGames = hasAdminPermission(adminPermissions, "game.manage");
  const canPublishGames = hasAdminPermission(adminPermissions, "game.publish");
  const canManageQualityEvidence = hasAdminPermission(
    adminPermissions,
    "quality_evidence.manage",
  );
  const collectionConditions = mergeCollectionConditions(
    data.collectionConditions,
    localCollectionConditions,
  );
  const patientLikeShell = isPatientLikeRole(primaryRole);
  const showTechnicalEvidence = isAdminRole(primaryRole);

  const startBusyAction = useCallback((action: ActionKey) => {
    setBusyActions((current) => updateBusyActions(current, action, true));
  }, []);

  const finishBusyAction = useCallback((action: ActionKey) => {
    setBusyActions((current) => updateBusyActions(current, action, false));
  }, []);

  const setActive = useCallback(
    (nextActive: ScreenId, nextNavId?: RoleNavigationId) => {
      if (session && roleNavigationItems) {
        const isAuthorized = nextNavId
          ? roleNavigationItems.some((item) => item.id === nextNavId)
          : roleNavigationItems.some((item) =>
              roleNavigationItemMatchesScreen(item, nextActive),
            );
        if (!isAuthorized) {
          setDataError("当前账号没有该工作区的访问权限。");
          return;
        }
      }
      setActiveScreen(nextActive);
      setActiveRoleNavId(
        resolveActiveRoleNavId(
          primaryRole,
          nextActive,
          nextNavId ?? null,
          roleNavigationItems,
        ),
      );
    },
    [primaryRole, roleNavigationItems, session, setDataError],
  );

  async function reloadRoleData(
    loginResponse: AuthenticatedSession,
    requestedPatientId?: string,
    cameraSelectionTransfer?: RoleDataCameraSelectionTransfer,
  ) {
    const identity = {
      operationWorkspaceGeneration: activeWorkspaceGenerationRef.current,
      operationSessionToken: loginResponse.requestEpoch,
      operationPatientId: requestedPatientId ?? null,
    };
    if (
      !shouldApplyRoleActionSideEffect({
        ...identity,
        activeWorkspaceGeneration: activeWorkspaceGenerationRef.current,
        isWorkspaceMounted: workspaceMountedRef.current,
        activeSessionToken: activeRoleDataTokenRef.current,
        activePatientId: activePatientIdRef.current,
      })
    ) {
      return false;
    }
    await loadRoleData(loginResponse, requestedPatientId, auditLogFilters, {
      cameraSelectionTransfer,
    });
    return shouldApplyRoleActionSideEffect({
      ...identity,
      activeWorkspaceGeneration: activeWorkspaceGenerationRef.current,
      isWorkspaceMounted: workspaceMountedRef.current,
      activeSessionToken: activeRoleDataTokenRef.current,
      activePatientId: activePatientIdRef.current,
    });
  }

  function handleRequestError(error: unknown, defaultMessage: string) {
    if (handleUnauthorized(error)) {
      return;
    }
    setActionStatus(null);
    setDataStatus(defaultMessage);
    const message = extractErrorMessage(error, defaultMessage);
    if (primaryRole === "doctor") {
      setDataError(doctorSafeActionStatus(message));
      return;
    }
    if (patientLikeShell) {
      setDataError(patientSafeActionStatus(message));
      return;
    }
    setDataError(message);
  }

  const handleRetainedHighCostResultError =
    createRetainedHighCostResultErrorHandler(
      primaryRole,
      patientLikeShell,
      setActionStatus,
      setDataStatus,
      setDataError,
    );

  const {
    handleCreateAssessmentFromAiConversation,
    handleReviewAiConversationFromDoctor,
  } = createAiConversationActions({
    aiConversations: data.aiConversations,
    captureRoleActionIdentity,
    handleRequestError,
    isRoleActionIdentityCurrent,
    patient: data.patient,
    primaryRole,
    reloadRoleData,
    session,
    setActionStatus,
    setDataError,
    setDataStatus,
  });

  function handleRoleNavigationChange(
    screen: ScreenId,
    navId: RoleNavigationId,
  ) {
    setActive(screen, navId);
  }

  async function handleSelectPatient(patientId: string) {
    if (!session) return;
    if (!isPatientSelectionAuthorized(session, patientId)) {
      setDataError("当前账号没有该患者的访问权限。");
      return;
    }
    invalidatePatientScopedActionIdentity(
      activeWorkspaceGenerationRef,
      patientTrainingLifecycleActionRef,
    );
    activePatientIdRef.current = patientId;
    setSelectedPatientId(patientId);
    clearPatientScopedState();
    setActionStatus("正在加载患者临床资料");
    if (await reloadRoleData(session, patientId)) {
      setActionStatus("患者已选中，临床摘要和相关资料已刷新。");
    }
  }

  const formUpdaters = createRoleWorkspaceFormUpdaters({
    adminGameContents: data.adminGameContents,
    setAd8AssessmentForm,
    setAiConversationForm,
    setAssessmentForm,
    setAuditLogFilters,
    setBrowserPoseEvidenceForm,
    setCaregiverAccountForm,
    setCaregiverBindingForm,
    setCaregiverCommentForms,
    setCaregiverNoteForm,
    setCollectionBatchForm,
    setCollectionConditionForm,
    setCollectionProtocolForm,
    setDataExportForm,
    setGameContentCreateForm,
    setRegistrationRequestForm,
    setTrainingReviewForm,
    setUnityBuildForm,
    setUnityFieldEvidenceForm,
  });

  function updateAssessmentForm(
    field: AssessmentDraftFormField,
    value: string,
  ) {
    formUpdaters.updateAssessmentForm(field, value);
  }

  function requireCurrentAiAssessmentRoute(form: AssessmentFormState) {
    return resolveRoleWorkspaceAiAssessmentRoute({
      formAssessmentType: form.assessmentType,
      formRiskLevel: form.riskLevel || undefined,
      assessments: data.assessments,
      patientRiskGrades: data.patient?.riskGrades,
    });
  }

  async function handleRefreshAuditLogs(filters: AuditLogFilters) {
    if (!session) return;
    const actionIdentity = captureRoleActionIdentity();
    if (!canReadAuditLogs) {
      setActionStatus("当前账号没有审计日志查询权限。");
      return;
    }

    try {
      validateAuditLogFilters(filters);
    } catch (error) {
      handleRequestError(error, "审计日志查询失败");
      return;
    }

    startBusyAction("auditLogs");
    setDataError(null);
    setActionStatus("正在查询审计日志");

    try {
      const auditLogs = await fetchAdminAuditLogs(filters);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      setAuditLogFilters(filters);
      setData((current) => ({ ...current, auditLogs }));
      setDataStatus("审计日志已加载");
      setActionStatus(`已按筛选条件查询到 ${auditLogs.length} 条审计日志。`);
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "审计日志查询失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("auditLogs");
      }
    }
  }

  async function handleExportData(form: DataExportFormState) {
    if (!session) return;
    const actionIdentity = captureRoleActionIdentity();
    if (!canExportData) {
      setActionStatus("当前账号没有脱敏数据导出权限。");
      return;
    }

    let payload: DataExportRequest;

    try {
      payload = buildDataExportPayload(form);
    } catch (error) {
      handleRequestError(error, "脱敏数据导出失败");
      return;
    }

    startBusyAction("exportData");
    setDataError(null);
    setActionStatus("正在生成脱敏导出文件");

    try {
      const exported = await exportAdminData(payload);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (canReadAuditLogs) {
        const auditLogs = await fetchAdminAuditLogs(auditLogFilters);
        if (!isRoleActionIdentityCurrent(actionIdentity)) return;
        setData((current) => ({ ...current, auditLogs }));
      }
      downloadExportedFile(exported);
      setActionStatus(
        canReadAuditLogs
          ? `脱敏导出文件 ${exported.filename} 已生成，导出操作已写入审计日志。`
          : `脱敏导出文件 ${exported.filename} 已生成，导出操作已写入审计日志。当前账号无审计查询权限，不能直接刷新日志列表。`,
      );
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "脱敏数据导出失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("exportData");
      }
    }
  }

  async function handleCreateRegistrationRequest(
    form: RegistrationRequestFormState,
  ) {
    const actionIdentity = captureRoleActionIdentity();
    let payload: CreateRegistrationRequest;

    try {
      payload = buildCreateRegistrationRequestPayload(form);
    } catch (error) {
      handleRequestError(error, "账号开通申请失败");
      return;
    }

    startBusyAction("createRegistrationRequest");
    setDataError(null);
    setActionStatus("正在提交账号开通申请");

    try {
      const request = await api.createRegistrationRequest(payload);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      setRegistrationRequestForm(emptyRegistrationRequestForm);
      setDataStatus("账号开通申请已提交");
      setActionStatus(
        `账号 ${request.account} 的开通申请已提交，机构工作人员审核通过后即可登录。`,
      );
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "账号开通申请失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("createRegistrationRequest");
      }
    }
  }

  async function handleReviewRegistrationRequest(
    request: RegistrationRequest,
    decision: ReviewRegistrationRequest["decision"],
    decisionReason: string,
  ) {
    if (!session) return;
    const actionIdentity = captureRoleActionIdentity();
    if (!canManageUsers && primaryRole !== "doctor") {
      setActionStatus("当前账号没有账号开通审核权限。");
      return;
    }

    startBusyAction("reviewRegistrationRequest");
    setDataError(null);
    setActionStatus(
      decision === "approved" ? "正在通过账号开通申请" : "正在退回账号开通申请",
    );

    try {
      await api.reviewRegistrationRequest(request.id, {
        decision,
        decisionReason,
      });
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      const registrationRequests =
        isAdminRole(primaryRole) || primaryRole === "doctor"
          ? await api.registrationRequests()
          : [];
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      setData((current) => ({
        ...current,
        registrationRequests,
      }));
      if (!(await reloadRoleData(session, selectedPatientId ?? undefined)))
        return;
      setActionStatus(
        decision === "approved"
          ? `已通过 ${request.displayName} 的账号申请。`
          : `已退回 ${request.displayName} 的账号申请。`,
      );
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "账号开通审核失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("reviewRegistrationRequest");
      }
    }
  }

  async function handleCreateCaregiverAccount(form: CaregiverAccountFormState) {
    if (!session) return;
    const actionIdentity = captureRoleActionIdentity();
    if (!canCreateCaregiver) {
      setActionStatus("当前账号没有家属账号创建权限。");
      return;
    }

    let payload: CreateCaregiverAccountRequest;

    try {
      payload = buildCreateCaregiverAccountPayload(form);
    } catch (error) {
      handleRequestError(error, "家属账号创建失败");
      return;
    }

    startBusyAction("createCaregiver");
    setDataError(null);
    setActionStatus("正在创建家属登录账号");

    try {
      const caregiver = await api.createCaregiverAccount(payload);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (!(await reloadRoleData(session, selectedPatientId ?? undefined)))
        return;
      setCaregiverAccountForm(emptyCaregiverAccountForm);
      setActionStatus(
        `家属账号 ${caregiver.account} 已创建。需患者本人签署家属共享授权并绑定后，家属才能查看摘要。`,
      );
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "家属账号创建失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("createCaregiver");
      }
    }
  }

  async function handleCreateAiAssessmentDraft(form: AssessmentFormState) {
    if (!session || !data.patient) return;
    const actionIdentity = captureRoleActionIdentity();
    const transcript = form.transcript.trim();
    if (!transcript) {
      handleRequestError(
        new Error("请先填写问答转写或评估摘要，再生成待复核评估建议。"),
        "待复核评估建议生成失败",
      );
      return;
    }
    let assessmentType: ReturnType<typeof requireCurrentAiAssessmentRoute>;
    try {
      assessmentType = requireCurrentAiAssessmentRoute(form);
    } catch (error) {
      handleRequestError(error, "待复核评估建议生成失败");
      return;
    }
    const draftRequest = {
      patientId: data.patient.id,
      assessmentType,
      physicalConditions: form.physicalConditions,
      transcript,
    };
    if (
      isStagedAiAssessmentDraftForRequest(
        stagedAiAssessmentDraftRef.current,
        draftRequest,
      )
    ) {
      try {
        const staged = stagedAiAssessmentDraftRef.current;
        if (!staged) return;
        const nextForm = applyAiAssessmentDraftToForm(form, staged.draft);
        stagedAiAssessmentDraftRef.current = null;
        setAssessmentForm(nextForm);
        setDataError(null);
        setDataStatus("待复核评估建议已回填");
        setActionStatus("已回填本次已返回的评估建议，未再次调用服务。");
      } catch (error) {
        handleRetainedHighCostResultError(
          error,
          "待复核评估建议已返回，未再次调用服务。",
          "待复核评估建议无法回填表单。请保留当前页面并联系管理员处理。",
        );
      }
      return;
    }
    startBusyAction("aiAssessmentDraft");
    setDataError(null);
    setActionStatus("正在生成待复核评估建议");
    try {
      const draft = await requestAiAssessmentDraft({
        registry: highCostRequestRegistryRef.current,
        draftRequest,
      });
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      stagedAiAssessmentDraftRef.current = createStagedAiAssessmentDraft({
        ...draftRequest,
        draft,
      });
      const nextForm = applyAiAssessmentDraftToForm(form, draft);
      stagedAiAssessmentDraftRef.current = null;
      setAssessmentForm(nextForm);
      setDataStatus("待复核评估建议已生成");
      setActionStatus(
        "待复核评估建议已填入表单，请由医生复核分数、摘要和置信度后再正式提交。",
      );
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (
        isStagedAiAssessmentDraftForRequest(
          stagedAiAssessmentDraftRef.current,
          draftRequest,
        )
      ) {
        handleRetainedHighCostResultError(
          error,
          "待复核评估建议已返回，未再次调用服务。",
          "待复核评估建议无法回填表单。请保留当前页面并联系管理员处理。",
        );
        return;
      }
      handleRequestError(error, "待复核评估建议生成失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("aiAssessmentDraft");
      }
    }
  }
  async function handleStartAiConversation() {
    if (!session || !data.patient) return;
    let assessmentType: ReturnType<typeof requireCurrentAiAssessmentRoute>;
    try {
      assessmentType = requireCurrentAiAssessmentRoute(assessmentForm);
    } catch (error) {
      handleRequestError(error, "智能对话创建失败");
      return;
    }
    const actionIdentity = captureRoleActionIdentity();
    startBusyAction("aiConversation");
    setDataError(null);
    setActionStatus("正在创建智能对话");
    try {
      const conversation = await api.startAiConversation({
        patientId: data.patient.id,
        assessmentType,
        physicalConditions: assessmentForm.physicalConditions,
      });
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (
        conversation.patientId !== data.patient.id ||
        resolveAiAssessmentRoute({
          assessmentType: conversation.assessmentType,
        }) !== assessmentType
      ) {
        throw new Error("智能对话返回的患者或评估路径与启动请求不一致。");
      }
      setAssessmentForm((current) => ({ ...current, assessmentType }));
      setAiConversationForm((current) => ({
        ...current,
        sessionId: conversation.id,
        summary: current.summary || "请根据本轮智能对话摘要补充医生复核意见。",
        reviewNote: current.reviewNote || "医生复核后再保存正式评估。",
      }));
      setData((current) => ({
        ...current,
        aiConversations: [conversation, ...(current.aiConversations ?? [])],
      }));
      setActionStatus(
        "智能对话已开始。请逐轮补充患者主诉、照护者观察和现场表现，系统回复后仍需提交给医生复核。",
      );
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "智能对话创建失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("aiConversation");
      }
    }
  }
  async function handleAppendAiConversationMessage() {
    if (!session || !data.patient) return;
    const actionIdentity = captureRoleActionIdentity();
    const conversationId =
      aiConversationForm.sessionId ||
      findActiveAiConversation(data.aiConversations)?.id ||
      "";
    const content = aiConversationForm.content.trim();
    if (!conversationId) {
      setDataStatus("智能对话未开始");
      setDataError("请先开始智能对话，再追加问答内容。");
      return;
    }
    if (!content) {
      setDataStatus("智能对话内容为空");
      setDataError("请输入本轮问答内容后再发送。");
      return;
    }
    const conversation = data.aiConversations?.find(
      (item) => item.id === conversationId,
    );
    if (!conversation) {
      setDataStatus("智能对话记录缺失");
      setDataError("当前 sessionId 没有对应的智能对话记录，已阻止发送。");
      return;
    }
    let assessmentType: ReturnType<typeof resolveAiAssessmentRoute>;
    try {
      assessmentType = resolveAiAssessmentRoute({
        assessmentType: conversation.assessmentType,
      });
    } catch (error) {
      handleRequestError(error, "智能对话发送失败");
      return;
    }
    startBusyAction("aiConversation");
    setDataError(null);
    setActionStatus("正在发送本轮智能对话");
    try {
      const result = await requestAiConversationMessage({
        registry: highCostRequestRegistryRef.current,
        patientId: data.patient.id,
        conversationId,
        assessmentType,
        physicalConditions: assessmentForm.physicalConditions,
        content,
      });
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      setAiConversationForm((current) => ({ ...current, content: "" }));
      setData((current) => ({
        ...current,
        aiConversations: upsertAiConversationMessages(
          current.aiConversations ?? [],
          conversationId,
          [result.userMessage, result.assistantMessage],
        ),
      }));
      setActionStatus(
        "本轮智能对话已返回。请继续追问，或整理摘要后提交给医生复核。",
      );
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "智能对话发送失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("aiConversation");
      }
    }
  }
  async function handleCompleteAiConversation() {
    if (!session || !data.patient) return;
    const actionIdentity = captureRoleActionIdentity();
    const conversationId =
      aiConversationForm.sessionId ||
      findActiveAiConversation(data.aiConversations)?.id ||
      "";
    const summary = aiConversationForm.summary.trim();
    const reviewNote = aiConversationForm.reviewNote.trim();
    if (!conversationId) {
      setDataStatus("智能对话未开始");
      setDataError("请先开始智能对话，再提交给医生复核。");
      return;
    }
    if (!summary || !reviewNote) {
      setDataStatus("智能对话待补充");
      setDataError("请补充对话摘要和医生复核说明后再提交。");
      return;
    }
    startBusyAction("aiConversation");
    setDataError(null);
    setActionStatus("正在提交智能对话给医生复核");
    try {
      const completed = await api.completeAiConversation(conversationId, {
        summary,
        reviewNote,
      });
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      setAiConversationForm(emptyAiConversationForm);
      setData((current) => ({
        ...current,
        aiConversations: upsertAiConversationSession(
          current.aiConversations ?? [],
          completed,
        ),
      }));
      setActionStatus(
        "智能对话已提交给医生复核。它不会直接保存为正式评估，需医生核对后再录入正式结论。",
      );
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "智能对话提交复核失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("aiConversation");
      }
    }
  }
  async function handleCreateAssessmentSpeechTranscript({
    recordingId,
    audioBlob,
    startedAtMs,
    endedAtMs,
  }: AssessmentSpeechRecording) {
    if (!session || !data.patient) {
      throw new Error("缺少登录会话或患者档案，不能提交语音转写。");
    }
    const actionIdentity = captureRoleActionIdentity();
    const consentState = summarizePatientConsents(data.patient);
    if (!consentState.microphone_capture) {
      const error = new Error("请先签署语音评估授权，再开始语音转写。");
      setDataStatus("语音转写被阻断");
      setDataError(error.message);
      throw error;
    }
    const assessmentType = requireCurrentAiAssessmentRoute(assessmentForm);
    const speechTranscriptRequest =
      await buildAssessmentSpeechTranscriptRequest({
        patientId: data.patient.id,
        assessmentType,
        physicalConditions: assessmentForm.physicalConditions,
        audioBlob,
        startedAtMs,
        endedAtMs,
      });
    if (!isRoleActionIdentityCurrent(actionIdentity)) return;
    startBusyAction("assessmentSpeechTranscript");
    setDataError(null);
    setActionStatus("正在上传本次评估录音并调用语音转写服务");
    try {
      const transcript = await requestAssessmentSpeechTranscript({
        registry: highCostRequestRegistryRef.current,
        recordingId,
        speechTranscriptRequest,
      });
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      setAssessmentForm((current) =>
        applyAssessmentSpeechTranscriptToForm(current, transcript),
      );
      setActionStatus(
        "语音转写已回填问答文本。请人工检查转写内容，再生成评估建议或补充分数。",
      );
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "语音转写失败");
      throw error;
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("assessmentSpeechTranscript");
      }
    }
  }
  async function handleCreateSpeechAiAssessmentDraft({
    recordingId,
    audioBlob,
    startedAtMs,
    endedAtMs,
  }: AssessmentSpeechRecording) {
    if (!session || !data.patient) {
      throw new Error("缺少登录会话或患者档案，不能生成语音评估建议。");
    }
    const actionIdentity = captureRoleActionIdentity();
    const consentState = summarizePatientConsents(data.patient);
    if (!consentState.microphone_capture) {
      const error = new Error("请先签署语音评估授权，再开始语音转写。");
      setDataStatus("语音评估建议被阻断");
      setDataError(error.message);
      throw error;
    }
    if (!consentState.ai_processing) {
      const error = new Error(
        "请先签署评估数据处理授权，再生成待复核评估建议。",
      );
      setDataStatus("语音评估建议被阻断");
      setDataError(error.message);
      throw error;
    }
    const assessmentType = requireCurrentAiAssessmentRoute(assessmentForm);
    const speechTranscriptRequest =
      await buildAssessmentSpeechTranscriptRequest({
        patientId: data.patient.id,
        assessmentType,
        physicalConditions: assessmentForm.physicalConditions,
        audioBlob,
        startedAtMs,
        endedAtMs,
      });
    if (!isRoleActionIdentityCurrent(actionIdentity)) return;
    startBusyAction("speechAiAssessmentDraft");
    setDataError(null);
    setActionStatus("正在转写评估录音，并生成待复核评估建议");

    let transcriptApplied = false;
    let draftRequest:
      | {
          patientId: string;
          assessmentType: string;
          physicalConditions: typeof assessmentForm.physicalConditions;
          transcript: string;
        }
      | undefined;
    try {
      const transcript = await requestAssessmentSpeechTranscript({
        registry: highCostRequestRegistryRef.current,
        recordingId,
        speechTranscriptRequest,
      });
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      const transcribedForm = applyAssessmentSpeechTranscriptToForm(
        assessmentForm,
        transcript,
      );
      setAssessmentForm(transcribedForm);
      transcriptApplied = true;
      setActionStatus("语音转写已回填表单，正在生成待复核评估建议。");
      const transcribedDraftRequest = {
        patientId: data.patient.id,
        assessmentType: resolveAiAssessmentRoute({
          assessmentType: transcript.assessmentType,
        }),
        physicalConditions: assessmentForm.physicalConditions,
        transcript: transcribedForm.transcript,
      };
      draftRequest = transcribedDraftRequest;
      let draft;
      try {
        draft = await requestAiAssessmentDraft({
          registry: highCostRequestRegistryRef.current,
          draftRequest: transcribedDraftRequest,
        });
      } catch {
        if (!isRoleActionIdentityCurrent(actionIdentity)) return;
        throw new Error(
          "语音转写已回填；待复核评估建议生成失败，请在现有转写基础上单独生成。",
        );
      }
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      stagedAiAssessmentDraftRef.current = createStagedAiAssessmentDraft({
        ...draftRequest,
        draft,
      });
      try {
        const nextForm = applySpeechAiAssessmentDraftToForm(
          assessmentForm,
          transcript,
          draft,
        );
        stagedAiAssessmentDraftRef.current = null;
        setAssessmentForm(nextForm);
        setActionStatus(
          "语音转写和评估建议已填入表单，请医生复核后再正式提交。",
        );
      } catch (error) {
        handleRetainedHighCostResultError(
          error,
          "语音转写与评估建议均已返回，未再次调用服务。",
          "评估建议无法回填表单。语音转写已保留，请保留当前页面并联系管理员处理。",
        );
        throw new Error(
          "语音转写已回填，但评估建议无法回填表单。请保留当前页面并联系管理员处理。",
        );
      }
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (
        !draftRequest ||
        !isStagedAiAssessmentDraftForRequest(
          stagedAiAssessmentDraftRef.current,
          draftRequest,
        )
      ) {
        handleRequestError(
          error,
          transcriptApplied
            ? "待复核评估建议生成失败。语音转写已回填到表单，可在现有转写基础上单独生成。"
            : "语音转写与评估建议生成失败",
        );
      }
      throw error;
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("speechAiAssessmentDraft");
      }
    }
  }
  async function handleCreateTtsSpeechOutput(
    text: string,
    scenario: InteractiveTtsSpeechScenario,
  ) {
    if (!session || !data.patient) {
      throw new Error("缺少登录会话或患者档案，不能生成语音输出。");
    }
    const actionIdentity = captureRoleActionIdentity();
    const copy = interactiveTtsSpeechOutputCopy[scenario];
    const consentState = summarizePatientConsents(data.patient);
    if (!consentState.ai_processing) {
      const error = new Error(copy.consentRequiredMessage);
      setDataStatus("语音输出被阻断");
      setDataError(error.message);
      throw error;
    }
    if (scenario === "training_encouragement" && !text.trim()) {
      throw new Error("训练鼓励文本不能为空。");
    }
    const speechText = parseRequiredTrimmedText(text, "题目播报文本");
    const ttsRequest = {
      patientId: data.patient.id,
      text: speechText,
      scenario,
    };
    if (
      isStagedTtsSpeechOutputForRequest(
        stagedTtsSpeechOutputRef.current,
        ttsRequest,
      )
    ) {
      try {
        const staged = stagedTtsSpeechOutputRef.current;
        if (!staged) return;
        await playTtsSpeechOutputAudio(staged.output);
        if (!isRoleActionIdentityCurrent(actionIdentity)) return;
        setDataError(null);
        setDataStatus(`${copy.label}语音已播放`);
        setActionStatus(`${copy.label}语音已播放，未再次调用服务。`);
      } catch (error) {
        if (!isRoleActionIdentityCurrent(actionIdentity)) return;
        handleRetainedHighCostResultError(
          error,
          `${copy.label}语音已生成，未再次调用服务。请检查浏览器播放权限后再次点击播放。`,
          `${copy.label}语音等待播放`,
        );
        throw error;
      }
      return;
    }
    startBusyAction("ttsSpeechOutput");
    setDataError(null);
    if (scenario === "assessment_prompt") {
      setActionStatus("正在生成题目播报语音");
    } else {
      setActionStatus("正在生成训练鼓励语音");
    }
    try {
      const output = await requestTtsSpeechOutput({
        registry: highCostRequestRegistryRef.current,
        ttsRequest,
      });
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      stagedTtsSpeechOutputRef.current = createStagedTtsSpeechOutput(
        ttsRequest,
        output,
      );
      await playTtsSpeechOutputAudio(output);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      setDataStatus(`${copy.label}语音已播放`);
      setActionStatus(copy.playedMessage);
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (
        isStagedTtsSpeechOutputForRequest(
          stagedTtsSpeechOutputRef.current,
          ttsRequest,
        )
      ) {
        handleRetainedHighCostResultError(
          error,
          `${copy.label}语音已生成，未再次调用服务。请检查浏览器播放权限后再次点击播放。`,
          `${copy.label}语音等待播放`,
        );
        throw error;
      }
      handleRequestError(error, `${copy.label}语音生成失败`);
      throw error;
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("ttsSpeechOutput");
      }
    }
  }

  async function handleGrantConsent(consentType: ConsentType) {
    if (!session || !data.patient) return;
    const actionIdentity = captureRoleActionIdentity();

    startBusyAction("consent");
    setDataError(null);
    setActionStatus("正在保存授权");

    try {
      await api.createConsent({
        patientId: data.patient.id,
        subjectUserId: session.user.id,
        consentType,
        consentVersion: patientConsentVersion,
        evidenceSnapshot: {
          source: "patient_web_consent",
          consentVersion: patientConsentVersion,
          consentType,
          subjectUserId: session.user.id,
          signedBy: session.user.displayName,
          signedAt: new Date().toISOString(),
        },
      });
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (!(await reloadRoleData(session, data.patient.id))) return;
      setActionStatus(`${consentLabel(consentType)} 授权已保存。`);
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "授权签署失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("consent");
      }
    }
  }

  async function handleRevokeConsent(record: ConsentRecord) {
    if (!session || !data.patient) return;
    const actionIdentity = captureRoleActionIdentity();

    startBusyAction("revokeConsent");
    setDataError(null);
    setActionStatus("正在关闭授权");

    try {
      await api.revokeConsent(record.id);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (!(await reloadRoleData(session, data.patient.id))) return;
      setActionStatus(
        record.consentType === "caregiver_sharing"
          ? "已撤回家属共享授权，家属端摘要和训练记录访问将立即失效。"
          : `${consentLabel(record.consentType)} 已关闭，相关功能将停止使用。`,
      );
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "授权撤回失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("revokeConsent");
      }
    }
  }

  async function handleBindCaregiver(form: CaregiverBindingFormState) {
    if (!session || !data.patient) return;
    const actionIdentity = captureRoleActionIdentity();

    startBusyAction("bindCaregiver");
    setDataError(null);
    setActionStatus("正在绑定家属账号");

    try {
      const payload = buildCaregiverRelationPayload(form);
      await api.createCaregiverRelation(data.patient.id, payload);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      const meResponse = await api.me();
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      const refreshedSession: AuthenticatedSession = {
        status: "authenticated",
        requestEpoch: session.requestEpoch,
        user: meResponse.user,
        context: meResponse.context,
      };
      if (!(await reloadRoleData(refreshedSession, data.patient.id))) return;
      setSession(refreshedSession);
      setCaregiverBindingForm(emptyCaregiverBindingForm);
      setActionStatus(`家属账号 ${payload.caregiverAccount} 已完成授权绑定。`);
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "家属绑定失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("bindCaregiver");
      }
    }
  }

  async function handleRevokeCaregiver(relation: CaregiverRelation) {
    if (!session || !data.patient) return;
    const actionIdentity = captureRoleActionIdentity();

    startBusyAction("revokeCaregiver");
    setDataError(null);
    setActionStatus("正在撤回家属绑定");

    try {
      await api.revokeCaregiverRelation(data.patient.id, relation.id);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (!(await reloadRoleData(session, data.patient.id))) return;
      setActionStatus(
        `已撤回 ${relation.caregiver.displayName} 的家属访问权限。`,
      );
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "家属绑定撤回失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("revokeCaregiver");
      }
    }
  }

  async function handleCreateCareCirclePost() {
    if (!session) return;
    const actionIdentity = captureRoleActionIdentity();
    const patientId = data.caregiverSummary?.patient.id ?? data.patient?.id;
    if (!patientId) return;
    if (
      primaryRole === "caregiver" &&
      !hasCaregiverPatientScope(session, patientId, "reminders")
    ) {
      setActionStatus("当前授权范围不允许写入家庭观察。");
      return;
    }

    let body: string;
    let mood: string | undefined;
    try {
      body = parseRequiredTrimmedText(caregiverNoteForm.body, "家庭观察");
      const trimmedMood = caregiverNoteForm.mood.trim();
      mood = trimmedMood ? trimmedMood : undefined;
    } catch (error) {
      handleRequestError(error, "家庭观察保存失败");
      return;
    }

    startBusyAction("createCareCirclePost");
    setDataError(null);
    setActionStatus("正在保存家庭观察");

    try {
      await api.createCareCirclePost(patientId, {
        body,
        ...(mood ? { mood } : {}),
      });
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (!(await reloadRoleData(session, patientId))) return;
      setCaregiverNoteForm(emptyCaregiverNoteForm);
      setActionStatus("家庭观察已保存，照护内容已刷新。");
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "家庭观察保存失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("createCareCirclePost");
      }
    }
  }

  async function handleCreateCareCircleComment(postId: string) {
    if (!session) return;
    const actionIdentity = captureRoleActionIdentity();
    const patientId = data.caregiverSummary?.patient.id ?? data.patient?.id;
    if (!patientId) return;
    if (
      primaryRole === "caregiver" &&
      !hasCaregiverPatientScope(session, patientId, "reminders")
    ) {
      setActionStatus("当前授权范围不允许写入家庭回应。");
      return;
    }

    let body: string;
    try {
      body = parseRequiredTrimmedText(
        caregiverCommentForms[postId] ?? "",
        "家庭回应",
      );
    } catch (error) {
      handleRequestError(error, "家庭回应保存失败");
      return;
    }

    startBusyAction("createCareCircleComment");
    setDataError(null);
    setActionStatus("正在保存家庭回应");

    try {
      await api.createCareCircleComment(postId, { body });
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (!(await reloadRoleData(session, patientId))) return;
      setCaregiverCommentForms((current) => {
        const next = { ...current };
        delete next[postId];
        return next;
      });
      setActionStatus("家庭回应已保存，照护内容已刷新。");
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "家庭回应保存失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("createCareCircleComment");
      }
    }
  }

  async function handleConfirmRisk(
    assessment: AssessmentRecord,
    risk: RiskGrade,
  ) {
    if (!session || !data.patient) return;
    const actionIdentity = captureRoleActionIdentity();

    let payload: ReviewAssessmentRequest;

    try {
      payload = buildDoctorAssessmentReviewPayload(assessment, risk);
    } catch (error) {
      handleRequestError(error, "评估风险确认失败");
      return;
    }

    startBusyAction("confirmRisk");
    setDataError(null);
    setActionStatus("正在确认评估风险结论");

    try {
      await reviewAssessment(assessment.id, payload);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (!(await reloadRoleData(session, data.patient.id))) return;
      setActionStatus("评估风险结论已确认，患者评估状态已刷新。");
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "评估风险确认失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("confirmRisk");
      }
    }
  }

  async function handleReturnAssessment(assessment: AssessmentRecord) {
    if (!session || !data.patient) return;
    const actionIdentity = captureRoleActionIdentity();

    let payload: ReviewAssessmentRequest;

    try {
      payload = buildDoctorAssessmentReturnPayload(assessment);
    } catch (error) {
      handleRequestError(error, "评估退回复核失败");
      return;
    }

    startBusyAction("confirmRisk");
    setDataError(null);
    setActionStatus("正在退回评估材料");

    try {
      await reviewAssessment(assessment.id, payload);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (!(await reloadRoleData(session, data.patient.id))) return;
      setActionStatus("评估材料已退回复核，患者评估状态已刷新。");
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "评估退回复核失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("confirmRisk");
      }
    }
  }

  async function handleRecommendPlan() {
    if (!session || !data.patient || !canRecommendRehabPlan(primaryRole))
      return;
    const actionIdentity = captureRoleActionIdentity();

    const readiness = buildPlanPrerequisiteState(data.patient, pendingPlan);
    if (!readiness.canRecommend) {
      setActionStatus(
        `暂不能生成推荐方案：${readiness.blockers
          .map(([label, value]) => `${label}：${value}`)
          .join("；")}。`,
      );
      return;
    }

    startBusyAction("recommend");
    setDataError(null);
    setActionStatus("正在生成待医师确认的个性化方案");

    try {
      const plan = await api.recommendPlan({
        patientId: data.patient.id,
      });
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (!(await reloadRoleData(session, data.patient.id))) return;
      setPendingPlan(plan);
      setActionStatus("已生成待医师确认方案，患者训练仍使用当前生效方案。");
      setActive("match");
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "康复方案生成失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("recommend");
      }
    }
  }

  async function handleConfirmPlan(
    plan: RehabPlan,
    payload: ConfirmPlanRequest,
  ) {
    if (!session || !data.patient) return;
    const actionIdentity = captureRoleActionIdentity();

    startBusyAction("confirmPlan");
    setDataError(null);
    setActionStatus("正在确认并下发康复方案");

    try {
      const confirmed = await confirmDoctorPlan(plan.id, payload);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (!(await reloadRoleData(session, confirmed.patientId))) return;
      setSelectedPatientId(confirmed.patientId);
      setPendingPlan(null);
      setActionStatus("康复方案已确认下发，患者端将使用新的当前生效方案。");
      setActive("plan");
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "康复方案确认失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("confirmPlan");
      }
    }
  }

  function handleEnterTrainingPrep(planItem?: RehabPlan["items"][number]) {
    if (!data.patient || !currentPlan) return;
    const planItemForPrep = planItem ?? selectedPlanItem;
    if (!planItemForPrep) return;
    const completedPlanItemIds = new Set(
      todayTrainingRecords?.sessions
        .filter(isCompletedTrainingSession)
        .map((session) => session.planItemId),
    );
    if (completedPlanItemIds.has(planItemForPrep.id)) {
      setSelectedTrainingPlanItemId(planItemForPrep.id);
      setDataError("该训练任务今日已完成，请选择未完成的训练任务。");
      setActive("today");
      return;
    }
    if (!findPlanItem(currentPlan, planItemForPrep.id)) {
      setDataError("所选训练任务不在当前生效方案中，请返回今日训练重新选择。");
      setActive("today");
      return;
    }
    const prepRequirement = resolveTrainingPrepCameraRequirement(
      planItemForPrep.gameContent,
    );
    if (!prepRequirement.ready) {
      setDataError(
        `训练内容 ${planItemForPrep.gameContent.name} 尚未完成发布配置，不能开始训练。`,
      );
      setActive("prep");
      return;
    }
    const requiresCamera = prepRequirement.requiresCameraCheck;
    const consentState = summarizePatientConsents(data.patient);
    if (requiresCamera && !consentState.camera_capture) {
      setDataError("请先在设备与权限中心确认摄像头授权。");
      setActive("device");
      return;
    }
    setSelectedTrainingPlanItemId(planItemForPrep.id);
    setActiveTrainingSession(null);
    setTrainingResultDraft(null);
    setActionStatus(patientTrainingPrepNextStepMessage(requiresCamera));
    setActive("prep");
    void handleRefreshTrainingPreparation(planItemForPrep);
  }

  async function handleRefreshTrainingPreparation(
    planItemOverride?: RehabPlan["items"][number],
  ) {
    if (!session || !data.patient) return;
    const actionIdentity = captureRoleActionIdentity();

    startBusyAction("refreshTrainingPreparation");
    setDataError(null);
    setActionStatus("正在同步训练安排");

    try {
      const refreshedBatches = await refreshTrainingPreparation(
        data.patient.id,
      );
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      setData((current) => ({
        ...current,
        collectionBatches: refreshedBatches,
      }));
      const planItemForRequirement = planItemOverride ?? selectedPlanItem;
      const prepRequirement = resolveTrainingPrepCameraRequirement(
        planItemForRequirement?.gameContent,
      );
      if (!prepRequirement.ready) {
        setActionStatus("训练安排已同步，但训练内容尚未完成正式配置。");
        return;
      }
      const requiresCamera = prepRequirement.requiresCameraCheck;
      setActionStatus(trainingPrepSyncedStatus(requiresCamera));
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "训练安排同步失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("refreshTrainingPreparation");
      }
    }
  }

  async function handleCheckTrainingDevice() {
    const actionIdentity = captureRoleActionIdentity();
    const prepRequirement = resolveTrainingPrepCameraRequirement(
      selectedPlanItem?.gameContent,
    );
    if (!prepRequirement.ready) {
      setDataError(prepRequirement.reason);
      setActive("prep");
      return;
    }
    const requiresCamera = prepRequirement.requiresCameraCheck;
    if (!requiresCamera) {
      setDataError(null);
      setActionStatus("本次训练不需要摄像头检查，请确认训练安排后开始训练。");
      return;
    }

    startBusyAction("checkDevice");
    setDataError(null);
    setTrainingReadiness((current) => ({
      ...current,
      cameraPermission: "requesting",
      error: undefined,
    }));

    try {
      const readiness = await checkCameraReadiness();
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      setTrainingReadiness((current) => ({
        ...current,
        ...readiness,
      }));
      setActionStatus("摄像头设备已确认。");
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      const message = patientSafeTrainingActionErrorMessage(
        error,
        "摄像头检测失败",
      );
      setTrainingReadiness((current) => ({
        ...current,
        cameraPermission: "denied",
        error: message,
      }));
      setDataError(message);
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("checkDevice");
      }
    }
  }

  async function handleCheckPoseReadiness() {
    const actionIdentity = captureRoleActionIdentity();
    const prepRequirement = resolveTrainingPrepCameraRequirement(
      selectedPlanItem?.gameContent,
    );
    if (!prepRequirement.ready) {
      setDataError(prepRequirement.reason);
      setActive("prep");
      return;
    }
    const requiresCamera = prepRequirement.requiresCameraCheck;
    if (!requiresCamera) {
      setDataError(null);
      setActionStatus("本次训练不需要站位检查，请确认训练安排后开始训练。");
      return;
    }

    startBusyAction("checkPose");
    setDataError(null);
    setTrainingReadiness((current) => ({
      ...current,
      poseRuntimeStatus: "loading",
      poseError: undefined,
    }));

    try {
      const result = await checkPoseReadiness();
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      setTrainingReadiness((current) => mergePoseReadiness(current, result));
      setActionStatus("体感识别已准备好，可以进入训练。");
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      const message = patientSafeTrainingActionErrorMessage(
        error,
        "站位检查失败",
      );
      setTrainingReadiness((current) => ({
        ...current,
        poseRuntimeStatus: "error",
        poseError: message,
      }));
      setDataError(message);
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("checkPose");
      }
    }
  }

  async function handleStartTraining() {
    if (!session || !data.patient || !currentPlan) return;
    const actionIdentity = captureRoleActionIdentity();
    const planItemForTraining = selectedPlanItem;
    if (!planItemForTraining) {
      setDataError("请先在今日训练中选择要开始的训练任务。");
      setActive("today");
      return;
    }
    const completedPlanItemIds = new Set(
      todayTrainingRecords?.sessions
        .filter(isCompletedTrainingSession)
        .map((session) => session.planItemId),
    );
    if (completedPlanItemIds.has(planItemForTraining.id)) {
      setDataError("该训练任务今日已完成，请选择未完成的训练任务。");
      setActive("today");
      return;
    }
    if (!findPlanItem(currentPlan, planItemForTraining.id)) {
      setDataError("所选训练任务不在当前生效方案中，请返回今日训练重新选择。");
      setActive("today");
      return;
    }
    if (!isGameReadyForTraining(planItemForTraining.gameContent)) {
      setDataError(
        `训练内容 ${planItemForTraining.gameContent.name} 尚未完成发布配置，不能开始训练。`,
      );
      setActive("prep");
      return;
    }
    const requiresCamera = trainingRuntimeRequiresCamera(
      planItemForTraining.gameContent,
    );
    const consentState = summarizePatientConsents(data.patient);
    if (requiresCamera && !consentState.camera_capture) {
      setDataError("请先确认摄像头授权，再开始训练。");
      setActive("device");
      return;
    }
    if (
      requiresCamera &&
      (trainingReadiness.cameraPermission !== "granted" ||
        !trainingReadiness.cameraDeviceId)
    ) {
      setDataError("请先完成摄像头设备检测，再开始训练。");
      setActive("prep");
      return;
    }
    if (requiresCamera && trainingReadiness.poseRuntimeStatus !== "ready") {
      setDataError("请先完成体感姿态识别检测，再开始训练。");
      setActive("prep");
      return;
    }
    if (!preparedCollectionBatch) {
      setDataError("今天的训练还未完成准备，请联系医师或工作人员处理。");
      setActive("prep");
      return;
    }

    startBusyAction("startTraining");
    setDataError(null);
    setActionStatus("正在进入训练");

    try {
      const selectedCamera = requiresCamera
        ? requireBrowserPoseCameraSelection(trainingReadiness.cameraDeviceId)
        : undefined;
      const cameraSelectionTransfer = selectedCamera
        ? {
            requestEpoch: session.requestEpoch,
            patientId: data.patient.id,
            selection: selectedCamera,
          }
        : undefined;
      const { gameRunId, clientStartedAt, trainingSession } =
        await startTrainingSession({
          patient: data.patient,
          currentPlan,
          planItem: planItemForTraining,
          collectionBatch: preparedCollectionBatch,
          cameraDeviceId: selectedCamera?.deviceId,
        });
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      const responseCollectionBatchId = trainingSession.collectionBatchId;
      if (!responseCollectionBatchId) {
        throw new Error("开始训练响应缺少采集批次，训练未启动。");
      }
      if (responseCollectionBatchId !== preparedCollectionBatch.id) {
        throw new Error(
          "开始训练响应的采集批次与已准备批次不一致，训练未启动。",
        );
      }
      setActiveTrainingSession({
        ...trainingSession,
        gameContent: planItemForTraining.gameContent,
        gameRunId,
        deviceCode: selectedCamera?.deviceId,
        calibrationStatus: "checked",
        clientStartedAt,
      });
      setTrainingResultDraft(null);
      if (
        !(await reloadRoleData(
          session,
          data.patient.id,
          cameraSelectionTransfer,
        ))
      )
        return;
      setActionStatus(`训练已开始：${planItemForTraining.gameContent.name}`);
      setActive("game");
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (handleUnauthorized(error)) return;
      setDataStatus("训练开始失败");
      setDataError(
        patientSafeTrainingActionErrorMessage(error, "训练开始失败"),
      );
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("startTraining");
      }
    }
  }

  async function handleResumeTraining() {
    if (!session || !data.patient || !currentPlan) return;
    const actionIdentity = captureRoleActionIdentity();
    if (activeTrainingResolution.status !== "resumable") {
      if (activeTrainingResolution.status === "blocked") {
        setDataError(activeTrainingResolution.message);
      }
      return;
    }
    const resumeClaim = claimPatientTrainingLifecycleAction(
      patientTrainingLifecycleActionRef,
      "resumeTraining",
    );
    if (!resumeClaim) return;

    startBusyAction("resumeTraining");
    setDataError(null);
    setActionStatus("正在继续本次训练");

    try {
      const resumedSession = await resumePatientTrainingSession({
        currentPlan,
        patientId: data.patient.id,
        recordedSession: activeTrainingResolution.session,
      });
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      applyResumedPatientTrainingSessionState({
        resumedSession,
        setActiveScreen: (screen) => setActive(screen),
        setActiveTrainingSession,
        setSelectedTrainingPlanItemId,
        setTrainingResultDraft,
      });
      setDataStatus("训练已恢复");
      setActionStatus("已继续尚未完成的训练。");
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (handleUnauthorized(error)) return;
      setDataStatus("训练恢复失败");
      setDataError(
        patientSafeTrainingActionErrorMessage(error, "训练恢复失败"),
      );
      setActionStatus(null);
    } finally {
      releasePatientTrainingLifecycleAction(
        patientTrainingLifecycleActionRef,
        resumeClaim,
      );
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("resumeTraining");
      }
    }
  }

  async function handleAbortTraining(reason: string) {
    if (!session || !data.patient || !currentPlan) return;
    const actionIdentity = captureRoleActionIdentity();
    if (activeTrainingResolution.status !== "resumable") {
      if (activeTrainingResolution.status === "blocked") {
        setDataError(activeTrainingResolution.message);
      }
      return;
    }
    const abortClaim = claimPatientTrainingLifecycleAction(
      patientTrainingLifecycleActionRef,
      "abortTraining",
    );
    if (!abortClaim) return;

    startBusyAction("abortTraining");
    setDataError(null);
    setActionStatus("正在终止本次训练");

    try {
      await abortPatientTrainingSession(
        activeTrainingResolution.session.id,
        reason,
      );
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      const finalized = await finalizeAbortedPatientTrainingSessionState({
        clearActiveTrainingSession: () => setActiveTrainingSession(null),
        clearSelectedTrainingPlanItem: () =>
          setSelectedTrainingPlanItemId(null),
        clearTrainingResultDraft: () => setTrainingResultDraft(null),
        reloadRoleData: async () => {
          const reloaded = await reloadRoleData(session, data.patient?.id);
          return reloaded && isRoleActionIdentityCurrent(actionIdentity);
        },
        showToday: () => setActive("today"),
      });
      if (!finalized || !isRoleActionIdentityCurrent(actionIdentity)) return;
      setDataStatus("训练已终止");
      setActionStatus("本次训练已终止，今日训练记录已刷新。");
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (handleUnauthorized(error)) return;
      setDataStatus("训练终止失败");
      setDataError(
        patientSafeTrainingActionErrorMessage(error, "训练终止失败"),
      );
      setActionStatus(null);
    } finally {
      releasePatientTrainingLifecycleAction(
        patientTrainingLifecycleActionRef,
        abortClaim,
      );
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("abortTraining");
      }
    }
  }

  async function handleCreateGameContent(form: GameContentCreateFormState) {
    if (!session) return;
    const actionIdentity = captureRoleActionIdentity();
    if (!canManageGames) {
      setActionStatus("当前账号没有训练内容管理权限。");
      return;
    }

    let payload: CreateGameContentRequest;

    try {
      payload = buildGameContentCreatePayload(form);
    } catch (error) {
      handleRequestError(error, "训练内容创建失败");
      return;
    }

    startBusyAction("createGameContent");
    setDataError(null);
    setActionStatus("正在创建训练内容");

    try {
      const created = await api.createGameContent(payload);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      const refreshedGames = await api.adminGameContents();
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      setData((current) => ({
        ...current,
        adminGameContents: refreshedGames,
      }));
      setGameContentCreateForm(emptyGameContentCreateForm);
      if (created.runtimeType === "unity_webgl") {
        setUnityBuildForm(buildUnityBuildForm(created));
      }
      setActionStatus(
        created.runtimeType === "browser_pose_canvas"
          ? `${created.name} 已作为浏览器体感训练发布，可进入康复方案推荐。`
          : `${created.name} 已创建为 ${gameContentStatusLabel(
              created.status,
            )}，资源状态为 ${gameBuildStatusLabel(
              created.buildStatus,
            )}。请继续上传并配置训练资源。`,
      );
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "训练内容创建失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("createGameContent");
      }
    }
  }

  async function handleUpdateGameContentStatus(
    gameContentId: string,
    status: UpdateGameContentStatusRequest["status"],
  ) {
    if (!session) return;
    const actionIdentity = captureRoleActionIdentity();
    if (!canManageGames) {
      setActionStatus("当前账号没有训练内容管理权限。");
      return;
    }

    startBusyAction("updateGameContentStatus");
    setDataError(null);
    setActionStatus("正在更新训练内容运营状态");

    try {
      const updated = await api.updateGameContentStatus(gameContentId, {
        status,
      });
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      const refreshedGames = await api.adminGameContents();
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      setData((current) => ({
        ...current,
        adminGameContents: refreshedGames,
      }));
      setActionStatus(
        `${updated.name} 已更新为 ${gameContentStatusLabel(updated.status)}。`,
      );
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "训练内容状态更新失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("updateGameContentStatus");
      }
    }
  }

  async function handleUpdateUnityBuild(form: UnityBuildFormState) {
    if (!session) return;
    const actionIdentity = captureRoleActionIdentity();
    if (!canManageGames) {
      setActionStatus("当前账号没有训练内容管理权限。");
      return;
    }

    let payload: UpdateUnityBuildRequest;

    try {
      payload = buildUnityBuildPayload(form, canPublishGames);
    } catch (error) {
      handleRequestError(error, "训练资源配置保存失败");
      return;
    }

    startBusyAction("updateUnityBuild");
    setDataError(null);
    setActionStatus("正在保存训练资源配置");

    try {
      const updated = await api.updateUnityBuild(form.gameContentId, payload);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      const refreshedGames = await api.adminGameContents();
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      setData((current) => ({
        ...current,
        adminGameContents: refreshedGames,
      }));
      setUnityBuildForm(buildUnityBuildForm(updated));
      setActionStatus(
        updated.buildStatus === "released"
          ? `${updated.name} 已发布为训练资源。`
          : `${updated.name} 训练资源配置已保存为 ${gameBuildStatusLabel(
              updated.buildStatus,
            )}。`,
      );
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "训练资源配置保存失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("updateUnityBuild");
      }
    }
  }

  async function handleCreateCollectionCondition(
    form: CollectionConditionFormState,
  ) {
    if (!session) return;
    const actionIdentity = captureRoleActionIdentity();
    if (!canManageGames) {
      setActionStatus("当前账号没有采集条件配置权限。");
      return;
    }

    let payload: CreateCollectionConditionRequest;

    try {
      payload = buildCollectionConditionPayload(form);
    } catch (error) {
      handleRequestError(error, "采集条件创建失败");
      return;
    }

    startBusyAction("createCollectionCondition");
    setDataError(null);
    setActionStatus("正在创建正式采集条件");

    try {
      const created = await api.createCollectionCondition(payload);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      const [refreshedConditions, refreshedProtocols] = await Promise.all([
        api.collectionConditions(),
        api.collectionProtocols(),
      ]);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      setData((current) => ({
        ...current,
        collectionConditions: refreshedConditions,
        collectionProtocols: refreshedProtocols,
      }));
      setLocalCollectionConditions((current) =>
        upsertCollectionCondition(current, created),
      );
      setCollectionConditionForm(emptyCollectionConditionForm);
      setCollectionProtocolForm((current) => ({
        ...current,
        conditionId: created.id,
      }));
      setActionStatus(
        `${created.name} 已创建，可继续绑定训练内容创建采集协议。`,
      );
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "采集条件创建失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("createCollectionCondition");
      }
    }
  }

  async function handleCreateCollectionProtocol(
    form: CollectionProtocolFormState,
  ) {
    if (!session) return;
    const actionIdentity = captureRoleActionIdentity();
    if (!canManageGames) {
      setActionStatus("当前账号没有采集协议配置权限。");
      return;
    }

    let payload: CreateCollectionProtocolRequest;

    try {
      payload = buildCollectionProtocolPayload(form);
    } catch (error) {
      handleRequestError(error, "采集协议创建失败");
      return;
    }

    startBusyAction("createCollectionProtocol");
    setDataError(null);
    setActionStatus("正在创建正式采集协议");

    try {
      const created = await api.createCollectionProtocol(payload);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      const [refreshedConditions, refreshedProtocols] = await Promise.all([
        api.collectionConditions(),
        api.collectionProtocols(),
      ]);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      setData((current) => ({
        ...current,
        collectionConditions: refreshedConditions,
        collectionProtocols: refreshedProtocols,
      }));
      if (created.condition) {
        setLocalCollectionConditions((current) =>
          upsertCollectionCondition(
            current,
            created.condition as CollectionCondition,
          ),
        );
      }
      setCollectionProtocolForm((current) => ({
        ...emptyCollectionProtocolForm,
        conditionId: current.conditionId,
      }));
      setActionStatus(
        `${created.name} ${created.version} 已启用，可由医师创建患者训练准备记录。`,
      );
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "采集协议创建失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("createCollectionProtocol");
      }
    }
  }

  async function handleCreateCollectionBatch(form: CollectionBatchFormState) {
    if (!session || !data.patient) return;
    const actionIdentity = captureRoleActionIdentity();

    let payload: CreateCollectionBatchRequest;

    try {
      const plan = resolveConfirmedCurrentPlan(data.patient);
      payload = buildDoctorCollectionBatchPayload(form, data.patient, plan);
    } catch (error) {
      handleRequestError(error, "训练准备记录创建失败");
      return;
    }

    startBusyAction("createCollectionBatch");
    setDataError(null);
    setActionStatus("正在创建患者训练准备记录");

    try {
      const created = await createDoctorCollectionBatch(payload);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      const refreshedBatches = await refreshCollectionBatches(data.patient.id);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      setData((current) => ({
        ...current,
        collectionBatches: refreshedBatches,
      }));
      setCollectionBatchForm(emptyCollectionBatchForm);
      setActionStatus(
        `${created.gameContent?.name ?? "训练项目"} 已完成训练准备，患者端可在设备检查通过后开始训练。`,
      );
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "训练准备记录创建失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("createCollectionBatch");
      }
    }
  }

  function handleTrainingResultReady(payload: SubmitTrainingResultRequest) {
    setTrainingResultDraft({ payload });
    setDataError(null);
  }

  async function handleSubmitTrainingResult() {
    if (
      !session ||
      !data.patient ||
      !activeTrainingSession ||
      !activePlanItem
    ) {
      return;
    }
    const actionIdentity = captureRoleActionIdentity();

    let payload: SubmitTrainingResultRequest;

    try {
      payload = validateCapturedPatientTrainingResult(
        trainingResultDraft?.payload,
        activePlanItem.gameContent.runtimeType,
        activeTrainingSession.collectionBatchId,
      );
    } catch (error) {
      if (handleUnauthorized(error)) return;
      setDataStatus("训练结果提交失败");
      setDataError(
        patientSafeTrainingActionErrorMessage(error, "训练结果提交失败"),
      );
      return;
    }

    startBusyAction("submitResult");
    setDataError(null);
    setActionStatus("正在提交本次训练结果");

    try {
      const result = await submitTrainingResult(
        activeTrainingSession.id,
        payload,
      );
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      setActiveTrainingSession((current) =>
        current
          ? {
              ...current,
              result,
              sessionStatus:
                result.qualityFlag === "valid" ? "completed" : "upload_failed",
              syncStatus: result.qualityFlag === "valid" ? "synced" : "failed",
              endedAt: new Date().toISOString(),
            }
          : current,
      );
      if (!(await reloadRoleData(session, data.patient.id))) return;
      setTrainingResultDraft(null);
      setSelectedTrainingPlanItemId(null);
      setActionStatus(
        result.qualityFlag === "valid"
          ? "本次训练已完成，训练进展已刷新。"
          : "本次训练已保存，医生会查看后给出建议。",
      );
      setActive("result");
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (handleUnauthorized(error)) return;
      setDataStatus("训练结果提交失败");
      setDataError(
        patientSafeTrainingActionErrorMessage(error, "训练结果提交失败"),
      );
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("submitResult");
      }
    }
  }

  async function handleSubmitTrainingReview(form: TrainingReviewFormState) {
    if (!session || !data.patient) return;
    const actionIdentity = captureRoleActionIdentity();

    let payload: SubmitTrainingReviewRequest;

    try {
      payload = buildDoctorTrainingReviewPayload(form);
    } catch (error) {
      handleRequestError(error, "训练复核提交失败");
      return;
    }

    startBusyAction("reviewTraining");
    setDataError(null);
    setActionStatus("正在提交训练复核结论");

    try {
      await reviewTrainingResult(form.resultId, payload);
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      if (!(await reloadRoleData(session, data.patient.id))) return;
      setTrainingReviewForm(emptyTrainingReviewForm);
      setActionStatus("训练复核结论已保存，患者训练记录已刷新。");
    } catch (error) {
      if (!isRoleActionIdentityCurrent(actionIdentity)) return;
      handleRequestError(error, "训练复核提交失败");
    } finally {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        finishBusyAction("reviewTraining");
      }
    }
  }

  return (
    <AppShell
      title="认知康复服务平台"
      className="h-dvh overflow-x-hidden bg-[var(--surface-page)] text-[var(--ink-strong)]"
    >
      <RoleShell
        actionStatus={actionStatus}
        activeNavId={activeNavId}
        dataError={displayedDataError}
        headerMeta={{
          roleLabel: roleLabel(primaryRole) ?? "机构访问",
          userLabel: session
            ? `${session.user.displayName} · ${roleLabel(primaryRole)}`
            : undefined,
        }}
        navigationSections={navigationSections}
        onLogout={session ? handleLogout : undefined}
        onNavigate={(screen, navId) => {
          if (navId) {
            handleRoleNavigationChange(screen, navId);
            return;
          }
          setActive(screen);
        }}
        patientLikeShell={patientLikeShell}
        role={primaryRole}
      >
        <RoleDataPanelErrors errors={panelErrors} />
        {active === "login" && (
          <AuthEntryPanel
            onLogin={handleLogin}
            onPasswordReset={handlePasswordReset}
            passwordResetRequired={passwordResetRequired}
            registrationRequestForm={registrationRequestForm}
            onRegistrationRequestFormChange={
              formUpdaters.updateRegistrationRequestForm
            }
            onCreateRegistrationRequest={handleCreateRegistrationRequest}
            isCreatingRegistrationRequest={busyActions.has(
              "createRegistrationRequest",
            )}
            dataStatus={displayedDataStatus}
          />
        )}
        {primaryRole === "patient" && isPatientWorkspaceScreen(active) && (
          <PatientWorkspacePage
            active={active}
            activeTrainingResolution={activeTrainingResolution}
            caregiverBindingForm={caregiverBindingForm}
            caregiverSummary={data.caregiverSummary}
            currentPlan={currentPlan}
            gameReady={selectedPlanPrepRequirement.ready}
            hasCameraConsent={
              data.patient
                ? Boolean(summarizePatientConsents(data.patient).camera_capture)
                : false
            }
            hasTrainingPreparation={Boolean(preparedCollectionBatch)}
            isBindingCaregiver={busyActions.has("bindCaregiver")}
            isAbortingTraining={busyActions.has("abortTraining")}
            isBusyStartingTraining={busyActions.has("startTraining")}
            isConsentBusy={busyActions.has("consent")}
            isRefreshingPreparation={busyActions.has(
              "refreshTrainingPreparation",
            )}
            isRevokingCaregiver={busyActions.has("revokeCaregiver")}
            isRevokingConsent={busyActions.has("revokeConsent")}
            isSubmittingResult={busyActions.has("submitResult")}
            isResumingTraining={busyActions.has("resumeTraining")}
            onAbortTraining={handleAbortTraining}
            onBackToday={() => setActive("today")}
            onBindCaregiver={handleBindCaregiver}
            onCaregiverBindingFormChange={
              formUpdaters.updateCaregiverBindingForm
            }
            onCheckDevice={handleCheckTrainingDevice}
            onCheckPose={handleCheckPoseReadiness}
            onEnterTrainingPrep={handleEnterTrainingPrep}
            onGrantConsent={handleGrantConsent}
            onRefreshTrainingPreparation={handleRefreshTrainingPreparation}
            onResumeTraining={handleResumeTraining}
            onRevokeCaregiver={handleRevokeCaregiver}
            onRevokeConsent={handleRevokeConsent}
            onStartTraining={handleStartTraining}
            onSubmitResult={handleSubmitTrainingResult}
            onTrainingResultReady={handleTrainingResultReady}
            onViewRecords={() => setActive("result")}
            patient={data.patient}
            readiness={{
              cameraPermission: trainingReadiness.cameraPermission,
              cameraDeviceId: trainingReadiness.cameraDeviceId,
              checkedAt: trainingReadiness.checkedAt,
              error: trainingReadiness.error,
              poseCheckStatus: trainingReadiness.poseRuntimeStatus,
              poseCheckedAt: trainingReadiness.poseCheckedAt,
              poseError: trainingReadiness.poseError,
            }}
            renderTrainingStage={(onResultReady) => (
              <PatientTrainingRuntimeStage
                isTtsBusy={busyActions.has("ttsSpeechOutput")}
                onCreateTtsSpeechOutput={({ scenario, text }) =>
                  handleCreateTtsSpeechOutput(text, scenario)
                }
                onResultReady={onResultReady}
                planItem={activePlanItem}
                trainingSession={activeTrainingSession}
              />
            )}
            requiresCameraCheck={
              selectedPlanPrepRequirement.ready
                ? selectedPlanPrepRequirement.requiresCameraCheck
                : false
            }
            selectedPlanItem={selectedPlanItem}
            todayTrainingRecords={todayTrainingRecords}
            trainingResultDraft={trainingResultDraft}
            trainingSession={activeTrainingSession}
            visibleTrainingRecords={visibleTrainingRecords}
          />
        )}
        {active === "device" && (
          <DevicePermissionCenterPage
            patient={data.patient}
            readiness={trainingReadiness}
            onGrantConsent={handleGrantConsent}
            onRevokeConsent={handleRevokeConsent}
            onCheckDevice={handleCheckTrainingDevice}
            onCheckPose={handleCheckPoseReadiness}
            isConsentBusy={busyActions.has("consent")}
            isRevokingConsent={busyActions.has("revokeConsent")}
            isCheckingDevice={busyActions.has("checkDevice")}
            isCheckingPose={busyActions.has("checkPose")}
          />
        )}
        {active === "assessment" && primaryRole !== "doctor" && (
          <AssessmentScreen
            assessments={data.assessments}
            onCreateAiAssessmentDraft={handleCreateAiAssessmentDraft}
            onCreateAssessmentSpeechTranscript={
              handleCreateAssessmentSpeechTranscript
            }
            onCreateSpeechAiAssessmentDraft={
              handleCreateSpeechAiAssessmentDraft
            }
            onCreateTtsSpeechOutput={(text) =>
              handleCreateTtsSpeechOutput(text, "assessment_prompt")
            }
            aiConversations={data.aiConversations}
            aiConversationForm={aiConversationForm}
            onAiConversationFormChange={formUpdaters.updateAiConversationForm}
            onStartAiConversation={handleStartAiConversation}
            onAppendAiConversationMessage={handleAppendAiConversationMessage}
            onCompleteAiConversation={handleCompleteAiConversation}
            assessmentForm={assessmentForm}
            onAssessmentFormChange={updateAssessmentForm}
            onAssessmentPhysicalConditionsChange={
              formUpdaters.updateAssessmentPhysicalConditions
            }
            hasMicrophoneConsent={
              data.patient
                ? Boolean(
                    summarizePatientConsents(data.patient).microphone_capture,
                  )
                : false
            }
            isDraftBusy={busyActions.has("aiAssessmentDraft")}
            isSpeechBusy={busyActions.has("assessmentSpeechTranscript")}
            isSpeechAiDraftBusy={busyActions.has("speechAiAssessmentDraft")}
            isTtsBusy={busyActions.has("ttsSpeechOutput")}
            isAiConversationBusy={busyActions.has("aiConversation")}
            showTechnicalEvidence={showTechnicalEvidence}
            canUseAiAssessment={canUsePatientAiAssessment(primaryRole)}
          />
        )}
        {active === "match" && canRecommendRehabPlan(primaryRole) && (
          <PlanSuggestionPage
            patient={data.patient}
            pendingPlan={pendingPlan}
            onRecommendPlan={handleRecommendPlan}
            isBusy={busyActions.has("recommend")}
          />
        )}
        {active === "family" && (
          <>
            {primaryRole === "caregiver" ? (
              <CaregiverPatientSelector
                onSelectPatient={(patientId) => {
                  void handleSelectPatient(patientId);
                }}
                options={data.caregiverPatientOptions}
                selectedPatientId={selectedPatientId}
              />
            ) : null}
            <CaregiverWorkspacePage
              activeSection={caregiverWorkspaceSectionFromNavId(activeNavId)}
              commentForms={caregiverCommentForms}
              isCreatingComment={busyActions.has("createCareCircleComment")}
              isCreatingNote={busyActions.has("createCareCirclePost")}
              model={buildCaregiverWorkspaceModel(
                data.caregiverSummary,
                data.careCircle,
              )}
              noteForm={caregiverNoteForm}
              onCommentFormChange={formUpdaters.updateCaregiverCommentForm}
              onCreateComment={handleCreateCareCircleComment}
              onCreateNote={handleCreateCareCirclePost}
              onNoteFormChange={formUpdaters.updateCaregiverNoteForm}
            />
          </>
        )}
        {primaryRole === "doctor" &&
          (active === "doctor" ||
            active === "assessment" ||
            active === "plan" ||
            active === "result") && (
            <DoctorWorkspaceContainer
              activeWorkspace={doctorWorkspaceFromNavId(activeNavId, active)}
              aiConversations={data.aiConversations}
              patients={data.patients}
              patient={data.patient}
              collectionProtocols={data.collectionProtocols}
              collectionBatches={data.collectionBatches}
              selectedPatientId={selectedPatientId}
              onSelectPatient={handleSelectPatient}
              onConfirmRisk={handleConfirmRisk}
              onCreateAssessment={handleCreateAssessmentFromAiConversation}
              onReturnAssessment={handleReturnAssessment}
              onReviewAiConversation={handleReviewAiConversationFromDoctor}
              isConfirmingRisk={busyActions.has("confirmRisk")}
              collectionBatchForm={collectionBatchForm}
              onCollectionBatchFormChange={
                formUpdaters.updateCollectionBatchForm
              }
              onCreateCollectionBatch={handleCreateCollectionBatch}
              isCreatingCollectionBatch={busyActions.has(
                "createCollectionBatch",
              )}
              trainingRecords={visibleTrainingRecords}
              reviewForm={trainingReviewForm}
              onReviewFormChange={formUpdaters.updateTrainingReviewForm}
              onSubmitTrainingReview={handleSubmitTrainingReview}
              isReviewingTraining={busyActions.has("reviewTraining")}
              isReviewingRegistrationRequest={busyActions.has(
                "reviewRegistrationRequest",
              )}
              registrationRequests={data.registrationRequests}
              onReviewRegistrationRequest={handleReviewRegistrationRequest}
              onConfirmPlan={handleConfirmPlan}
              isConfirmingPlan={busyActions.has("confirmPlan")}
            />
          )}
        {active === "plan" && primaryRole !== "doctor" && (
          <PlanConfirmationWorkspace
            patient={data.patient}
            onConfirmPlan={handleConfirmPlan}
            isBusy={busyActions.has("confirmPlan")}
          />
        )}
        {isAdminRole(primaryRole) &&
          (active === "admin" || active === "security") && (
            <AdminOverviewPage
              actions={{
                onCreateCaregiverAccount: handleCreateCaregiverAccount,
                onCreateCollectionCondition: handleCreateCollectionCondition,
                onCreateCollectionProtocol: handleCreateCollectionProtocol,
                onCreateGameContent: handleCreateGameContent,
                onExportData: handleExportData,
                onRefreshAuditLogs: handleRefreshAuditLogs,
                onReviewRegistrationRequest: handleReviewRegistrationRequest,
                onUpdateGameContentStatus: handleUpdateGameContentStatus,
                onUpdateUnityBuild: handleUpdateUnityBuild,
              }}
              activeWorkspace={adminWorkspaceFromNavId(activeNavId)}
              auditLogs={data.auditLogs}
              busy={{
                auditLogs: busyActions.has("auditLogs"),
                createCaregiver: busyActions.has("createCaregiver"),
                createCollectionCondition: busyActions.has(
                  "createCollectionCondition",
                ),
                createCollectionProtocol: busyActions.has(
                  "createCollectionProtocol",
                ),
                createGameContent: busyActions.has("createGameContent"),
                exportData: busyActions.has("exportData"),
                reviewRegistrationRequest: busyActions.has(
                  "reviewRegistrationRequest",
                ),
                updateGameContentStatus: busyActions.has(
                  "updateGameContentStatus",
                ),
                updateUnityBuild: busyActions.has("updateUnityBuild"),
              }}
              collectionConditions={collectionConditions}
              collectionProtocols={data.collectionProtocols}
              currentPlan={currentPlan}
              dashboard={data.adminDashboard}
              formHandlers={{
                onBrowserPoseEvidenceFormChange:
                  formUpdaters.updateBrowserPoseEvidenceForm,
                onBrowserPoseEvidenceFormPrefill:
                  formUpdaters.mergeBrowserPoseEvidenceForm,
                onCaregiverAccountFormChange:
                  formUpdaters.updateCaregiverAccountForm,
                onCollectionConditionFormChange:
                  formUpdaters.updateCollectionConditionForm,
                onCollectionProtocolFormChange:
                  formUpdaters.updateCollectionProtocolForm,
                onDataExportFormChange: formUpdaters.updateDataExportForm,
                onFiltersChange: formUpdaters.updateAuditLogFilters,
                onGameContentCreateFormChange:
                  formUpdaters.updateGameContentCreateForm,
                onUnityBuildFormChange: formUpdaters.updateUnityBuildForm,
                onUnityEvidenceFormChange:
                  formUpdaters.updateUnityFieldEvidenceForm,
              }}
              forms={{
                browserPoseEvidence: browserPoseEvidenceForm,
                caregiverAccount: caregiverAccountForm,
                collectionCondition: collectionConditionForm,
                collectionProtocol: collectionProtocolForm,
                dataExport: dataExportForm,
                filters: auditLogFilters,
                gameContentCreate: gameContentCreateForm,
                unityBuild: unityBuildForm,
                unityEvidence: unityFieldEvidenceForm,
              }}
              gameContents={data.adminGameContents}
              patient={data.patient}
              permissions={{
                canCreateCaregiver,
                canExportData,
                canManageGames,
                canManageQualityEvidence,
                canPublishGames,
                canReadAuditLogs,
              }}
              readiness={trainingReadiness}
              registrationRequests={data.registrationRequests}
              trainingRecords={visibleTrainingRecords}
            />
          )}
      </RoleShell>
    </AppShell>
  );
}
