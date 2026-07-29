"use client";

import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import type {
  CaregiverRelation,
  CaregiverSummaryResponse,
  ConsentRecord,
  ConsentType,
  PatientProfile,
  RehabPlan,
  SubmitTrainingResultRequest,
  TrainingRecordsResponse,
  TrainingSession,
} from "@/types/api";
import { PatientProfilePage, type PatientCaregiverBindingFormState } from "./PatientProfilePage";
import { TodayTrainingPage } from "./TodayTrainingPage";
import { TrainingPrepChecklist } from "./TrainingPrepChecklist";
import {
  PatientTrainingSessionPage,
  type PatientTrainingResultDraft,
} from "./TrainingRuntimePage";
import { TrainingResultPage } from "./TrainingResultPage";
import type { ActivePatientTrainingSessionResolution } from "./patient-training-actions";

export type PatientWorkspaceScreen = "today" | "prep" | "game" | "result" | "profile";

type TrainingTask = RehabPlan["items"][number];

const patientWorkspaceLabels: Record<PatientWorkspaceScreen, string> = {
  today: "今日训练",
  prep: "训练准备",
  game: "进行训练",
  result: "训练结果",
  profile: "我的资料与授权",
};

type PatientTrainingReadinessView = {
  cameraPermission: "unknown" | "requesting" | "granted" | "denied";
  cameraDeviceId?: string;
  checkedAt?: string;
  error?: string;
  poseCheckStatus: "unknown" | "loading" | "ready" | "error";
  poseCheckedAt?: string;
  poseError?: string;
};

type PatientWorkspacePageProps = {
  active: PatientWorkspaceScreen;
  activeTrainingResolution: ActivePatientTrainingSessionResolution;
  caregiverBindingForm: PatientCaregiverBindingFormState;
  caregiverSummary?: CaregiverSummaryResponse;
  currentPlan?: RehabPlan;
  gameReady: boolean;
  hasCameraConsent: boolean;
  hasTrainingPreparation: boolean;
  isAbortingTraining: boolean;
  isBindingCaregiver: boolean;
  isBusyStartingTraining: boolean;
  isConsentBusy: boolean;
  isRefreshingPreparation: boolean;
  isRevokingCaregiver: boolean;
  isRevokingConsent: boolean;
  isSubmittingResult: boolean;
  isResumingTraining: boolean;
  onAbortTraining: (reason: string) => Promise<void>;
  onBackToday: () => void;
  onBindCaregiver: (form: PatientCaregiverBindingFormState) => Promise<void>;
  onCaregiverBindingFormChange: (
    field: keyof PatientCaregiverBindingFormState,
    value: string | boolean,
  ) => void;
  onCheckDevice: () => Promise<void>;
  onCheckPose: () => Promise<void>;
  onEnterTrainingPrep: (planItem?: TrainingTask) => void;
  onGrantConsent: (consentType: ConsentType) => Promise<void>;
  onRefreshTrainingPreparation: (planItem?: TrainingTask) => Promise<void>;
  onResumeTraining: () => Promise<void>;
  onRevokeCaregiver: (relation: CaregiverRelation) => Promise<void>;
  onRevokeConsent: (record: ConsentRecord) => Promise<void>;
  onStartTraining: () => Promise<void>;
  onSubmitResult: () => Promise<void>;
  onTrainingResultReady: (payload: SubmitTrainingResultRequest) => void;
  onViewRecords: () => void;
  patient?: PatientProfile;
  readiness: PatientTrainingReadinessView;
  renderTrainingStage: (
    onResultReady: (payload: SubmitTrainingResultRequest) => void,
  ) => ReactNode;
  requiresCameraCheck: boolean;
  selectedPlanItem?: TrainingTask;
  todayTrainingRecords?: TrainingRecordsResponse;
  trainingResultDraft?: PatientTrainingResultDraft | null;
  trainingSession?: TrainingSession | null;
  visibleTrainingRecords?: TrainingRecordsResponse;
};

export function PatientWorkspacePage({
  active,
  activeTrainingResolution,
  caregiverBindingForm,
  caregiverSummary,
  currentPlan,
  gameReady,
  hasCameraConsent,
  hasTrainingPreparation,
  isAbortingTraining,
  isBindingCaregiver,
  isBusyStartingTraining,
  isConsentBusy,
  isRefreshingPreparation,
  isRevokingCaregiver,
  isRevokingConsent,
  isSubmittingResult,
  isResumingTraining,
  onAbortTraining,
  onBackToday,
  onBindCaregiver,
  onCaregiverBindingFormChange,
  onCheckDevice,
  onCheckPose,
  onEnterTrainingPrep,
  onGrantConsent,
  onRefreshTrainingPreparation,
  onResumeTraining,
  onRevokeCaregiver,
  onRevokeConsent,
  onStartTraining,
  onSubmitResult,
  onTrainingResultReady,
  onViewRecords,
  patient,
  readiness,
  renderTrainingStage,
  requiresCameraCheck,
  selectedPlanItem,
  todayTrainingRecords,
  trainingResultDraft,
  trainingSession,
  visibleTrainingRecords,
}: PatientWorkspacePageProps) {
  if (active === "today") {
    return (
      <PatientWorkspaceFrame active={active}>
        <TodayTrainingPage
          activeTrainingResolution={activeTrainingResolution}
          caregiverSummary={caregiverSummary}
          currentPlan={currentPlan}
          isAbortingTraining={isAbortingTraining}
          isResumingTraining={isResumingTraining}
          onAbortTraining={onAbortTraining}
          onResumeTraining={onResumeTraining}
          onStartPreparation={onEnterTrainingPrep}
          onViewRecords={onViewRecords}
          patient={patient}
          todayTrainingRecords={todayTrainingRecords}
        />
      </PatientWorkspaceFrame>
    );
  }

  if (active === "prep") {
    return (
      <PatientWorkspaceFrame active={active}>
        <TrainingPrepChecklist
          gameReady={gameReady}
          hasCameraConsent={hasCameraConsent}
          hasTrainingPreparation={hasTrainingPreparation}
          isBusy={isBusyStartingTraining}
          isRefreshingPreparation={isRefreshingPreparation}
          onCheckDevice={onCheckDevice}
          onCheckPose={onCheckPose}
          onRefreshTrainingPreparation={() =>
            onRefreshTrainingPreparation(selectedPlanItem)
          }
          onStartTraining={onStartTraining}
          planItem={selectedPlanItem}
          readiness={readiness}
          requiresCameraCheck={requiresCameraCheck}
        />
      </PatientWorkspaceFrame>
    );
  }

  if (active === "game") {
    if (!trainingSession || !selectedPlanItem) {
      return (
        <PatientWorkspaceFrame active={active}>
          <EmptyState
            title="训练尚未开始"
            description="请先在今日训练或训练准备页面开始本次训练。"
          />
        </PatientWorkspaceFrame>
      );
    }

    return (
      <PatientWorkspaceFrame active={active}>
        <PatientTrainingSessionPage
          ariaSummary="训练表现"
          isBusy={isSubmittingResult}
          onTrainingResultReady={onTrainingResultReady}
          onSubmitResult={() => onSubmitResult()}
          planItem={selectedPlanItem}
          primaryActionLabel="完成本次训练"
          renderTrainingStage={renderTrainingStage}
          resultDraft={trainingResultDraft}
        />
      </PatientWorkspaceFrame>
    );
  }

  if (active === "result") {
    return (
      <PatientWorkspaceFrame active={active}>
        <TrainingResultPage
          onBackToday={onBackToday}
          trainingRecords={visibleTrainingRecords}
        />
      </PatientWorkspaceFrame>
    );
  }

  return (
    <PatientWorkspaceFrame active={active}>
        <PatientProfilePage
          caregiverBindingForm={caregiverBindingForm}
          isBindingCaregiver={isBindingCaregiver}
          isConsentBusy={isConsentBusy}
          isRevokingCaregiver={isRevokingCaregiver}
          isRevokingConsent={isRevokingConsent}
        onBindCaregiver={onBindCaregiver}
          onCaregiverBindingFormChange={onCaregiverBindingFormChange}
          onGrantConsent={onGrantConsent}
          onRevokeCaregiver={onRevokeCaregiver}
        onRevokeConsent={onRevokeConsent}
        patient={patient}
      />
    </PatientWorkspaceFrame>
  );
}

function PatientWorkspaceFrame({
  active,
  children,
}: {
  active: PatientWorkspaceScreen;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={patientWorkspaceLabels[active]}
      data-testid="patient-primary-workspace"
    >
      {children}
    </section>
  );
}
