"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type {
  AiConversationSession,
  AssessmentRecord,
  CollectionBatch,
  CollectionProtocol,
  ConfirmPlanRequest,
  CreateAssessmentRequest,
  PatientProfile,
  RegistrationRequest,
  RehabPlan,
  RiskGrade,
  ReviewAiConversationRequest,
  ReviewRegistrationRequest,
  SubmitTrainingReviewRequest,
  TrainingRecordsResponse,
  TrainingReviewConclusion,
} from "@/types/api";
import {
  DoctorWorkspacePage,
  type DoctorWorkspaceId,
} from "./DoctorWorkspacePage";
import {
  buildDoctorPlanEditorForm,
  buildDoctorWorkbenchModel,
  type DoctorWorkbenchModel,
} from "./doctor-workbench-model";

export type CollectionBatchFormState = {
  operatorNotes: string;
  planItemId: string;
  protocolId: string;
};

export type TrainingReviewFormState = {
  resultId: string;
  reviewConclusion: "" | TrainingReviewConclusion;
  reviewNote: string;
};

type DoctorWorkspaceContainerProps = {
  activeWorkspace: DoctorWorkspaceId;
  aiConversations?: AiConversationSession[];
  collectionBatchForm: CollectionBatchFormState;
  collectionBatches?: CollectionBatch[];
  collectionProtocols?: CollectionProtocol[];
  isConfirmingPlan: boolean;
  isConfirmingRisk: boolean;
  isCreatingCollectionBatch: boolean;
  isReviewingTraining: boolean;
  isReviewingRegistrationRequest: boolean;
  onCollectionBatchFormChange: <K extends keyof CollectionBatchFormState>(
    field: K,
    value: CollectionBatchFormState[K],
  ) => void;
  onConfirmPlan: (
    plan: RehabPlan,
    payload: ConfirmPlanRequest,
  ) => Promise<void>;
  onConfirmRisk: (
    assessment: AssessmentRecord,
    risk: RiskGrade,
  ) => Promise<void>;
  onCreateAssessment: (
    payload: CreateAssessmentRequest,
  ) => Promise<AssessmentRecord>;
  onReturnAssessment: (assessment: AssessmentRecord) => Promise<void>;
  onReviewAiConversation: (
    sessionId: string,
    payload: ReviewAiConversationRequest,
  ) => Promise<AiConversationSession>;
  onReviewRegistrationRequest: (
    request: RegistrationRequest,
    decision: ReviewRegistrationRequest["decision"],
    decisionReason: string,
  ) => Promise<void>;
  onCreateCollectionBatch: (form: CollectionBatchFormState) => Promise<void>;
  onReviewFormChange: <K extends keyof TrainingReviewFormState>(
    field: K,
    value: TrainingReviewFormState[K],
  ) => void;
  onSelectPatient: (patientId: string) => Promise<void>;
  onSubmitTrainingReview: (form: TrainingReviewFormState) => Promise<void>;
  patient?: PatientProfile;
  patients?: PatientProfile[];
  reviewForm: TrainingReviewFormState;
  registrationRequests?: RegistrationRequest[];
  selectedPatientId?: string | null;
  trainingRecords?: TrainingRecordsResponse;
};

export function DoctorWorkspaceContainer({
  activeWorkspace,
  aiConversations,
  collectionBatchForm,
  collectionBatches,
  collectionProtocols,
  isConfirmingPlan,
  isConfirmingRisk,
  isCreatingCollectionBatch,
  isReviewingTraining,
  isReviewingRegistrationRequest,
  onCollectionBatchFormChange,
  onConfirmPlan,
  onConfirmRisk,
  onCreateAssessment,
  onReturnAssessment,
  onReviewAiConversation,
  onReviewRegistrationRequest,
  onCreateCollectionBatch,
  onReviewFormChange,
  onSelectPatient,
  onSubmitTrainingReview,
  patient,
  patients,
  reviewForm,
  registrationRequests,
  selectedPatientId,
  trainingRecords,
}: DoctorWorkspaceContainerProps) {
  const model = buildDoctorWorkbenchModel({
    patient,
    collectionBatches,
    collectionProtocols,
    collectionBatchForm,
    trainingRecords,
  });
  return (
    <DoctorWorkspaceContent
      key={`${patient?.id}:${model.currentPlan?.id}:${model.confirmedPlan?.id}:${model.currentAssessment?.id}:${model.currentAssessment?.status}`}
      activeWorkspace={activeWorkspace}
      aiConversations={aiConversations}
      model={model}
      patient={patient}
      patients={patients}
      selectedPatientId={selectedPatientId}
      trainingRecords={trainingRecords}
      reviewForm={reviewForm}
      registrationRequests={registrationRequests}
      onSelectPatient={onSelectPatient}
      onConfirmPlan={onConfirmPlan}
      onConfirmRisk={onConfirmRisk}
      onCreateAssessment={onCreateAssessment}
      onReturnAssessment={onReturnAssessment}
      onReviewAiConversation={onReviewAiConversation}
      onReviewRegistrationRequest={onReviewRegistrationRequest}
      onTrainingReviewFormChange={onReviewFormChange}
      onSubmitTrainingReview={(resultId, payload) =>
        onSubmitTrainingReview({
          resultId,
          reviewConclusion: payload.reviewConclusion,
          reviewNote: payload.reviewNote,
        })
      }
      onCollectionPreparationFormChange={onCollectionBatchFormChange}
      onCreateCollectionBatch={onCreateCollectionBatch}
      isPlanBusy={isConfirmingPlan}
      isConfirmRiskBusy={isConfirmingRisk}
      isCollectionPreparationBusy={isCreatingCollectionBatch}
      isTrainingReviewBusy={isReviewingTraining}
      isReviewingRegistrationRequest={isReviewingRegistrationRequest}
    />
  );
}

function DoctorWorkspaceContent({
  activeWorkspace,
  aiConversations,
  model,
  patient,
  patients,
  selectedPatientId,
  trainingRecords,
  reviewForm,
  registrationRequests,
  onSelectPatient,
  onConfirmPlan,
  onConfirmRisk,
  onCreateAssessment,
  onReturnAssessment,
  onReviewAiConversation,
  onReviewRegistrationRequest,
  onTrainingReviewFormChange,
  onSubmitTrainingReview,
  onCollectionPreparationFormChange,
  onCreateCollectionBatch,
  isPlanBusy,
  isConfirmRiskBusy,
  isCollectionPreparationBusy,
  isTrainingReviewBusy,
  isReviewingRegistrationRequest,
}: {
  activeWorkspace: DoctorWorkspaceId;
  aiConversations?: AiConversationSession[];
  model: DoctorWorkbenchModel;
  patient?: PatientProfile;
  patients?: PatientProfile[];
  selectedPatientId?: string | null;
  trainingRecords?: TrainingRecordsResponse;
  reviewForm: TrainingReviewFormState;
  registrationRequests?: RegistrationRequest[];
  onSelectPatient: (patientId: string) => Promise<void>;
  onConfirmPlan: (
    plan: RehabPlan,
    payload: ConfirmPlanRequest,
  ) => Promise<void>;
  onConfirmRisk: (
    assessment: AssessmentRecord,
    risk: RiskGrade,
  ) => Promise<void>;
  onCreateAssessment: (
    payload: CreateAssessmentRequest,
  ) => Promise<AssessmentRecord>;
  onReturnAssessment: (assessment: AssessmentRecord) => Promise<void>;
  onReviewAiConversation: (
    sessionId: string,
    payload: ReviewAiConversationRequest,
  ) => Promise<AiConversationSession>;
  onReviewRegistrationRequest: (
    request: RegistrationRequest,
    decision: ReviewRegistrationRequest["decision"],
    decisionReason: string,
  ) => Promise<void>;
  onTrainingReviewFormChange: <K extends keyof TrainingReviewFormState>(
    field: K,
    value: TrainingReviewFormState[K],
  ) => void;
  onSubmitTrainingReview: (
    resultId: string,
    payload: SubmitTrainingReviewRequest,
  ) => void | Promise<void>;
  onCollectionPreparationFormChange: <K extends keyof CollectionBatchFormState>(
    field: K,
    value: CollectionBatchFormState[K],
  ) => void;
  onCreateCollectionBatch: (form: CollectionBatchFormState) => Promise<void>;
  isPlanBusy: boolean;
  isConfirmRiskBusy: boolean;
  isCollectionPreparationBusy: boolean;
  isTrainingReviewBusy: boolean;
  isReviewingRegistrationRequest: boolean;
}) {
  const [recommendedPlan, setRecommendedPlan] = useState<RehabPlan | undefined>(
    () => model.currentPlan,
  );
  const [planEditorForm, setPlanEditorForm] = useState(
    () => model.planEditorForm,
  );
  const [isRecommendingPlan, setIsRecommendingPlan] = useState(false);
  const [planRecommendationError, setPlanRecommendationError] = useState<
    string | null
  >(null);

  function updatePlanEditorForm<K extends keyof typeof planEditorForm>(
    field: K,
    value: (typeof planEditorForm)[K],
  ) {
    setPlanEditorForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function recommendPlan() {
    if (
      !patient ||
      recommendedPlan ||
      !model.planRecommendation.canRecommend ||
      isRecommendingPlan
    ) {
      return;
    }

    setIsRecommendingPlan(true);
    setPlanRecommendationError(null);
    try {
      const recommendation = await api.recommendPlan({ patientId: patient.id });
      if (recommendation.patientId !== patient.id) {
        throw new Error("推荐方案与当前患者不一致，已阻止展示和确认。");
      }
      if (
        recommendation.status !== "pending_confirm" ||
        recommendation.isCurrent
      ) {
        throw new Error("接口返回的方案不是待确认状态，已阻止展示和确认。");
      }
      if (!recommendation.items.length) {
        throw new Error("推荐方案没有训练项目，已阻止展示和确认。");
      }
      if (!recommendation.recommendationReason.trim()) {
        throw new Error("推荐方案缺少推荐依据，已阻止展示和确认。");
      }

      setRecommendedPlan(recommendation);
      setPlanEditorForm(buildDoctorPlanEditorForm(recommendation));
    } catch (error) {
      setPlanRecommendationError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsRecommendingPlan(false);
    }
  }

  return (
    <DoctorWorkspacePage
      activeWorkspace={activeWorkspace}
      patients={patients}
      selectedPatient={patient}
      selectedPatientId={selectedPatientId}
      selectedPlan={recommendedPlan}
      trainingRecords={trainingRecords}
      registrationReview={{
        canReview: true,
        isBusy: isReviewingRegistrationRequest,
        onReviewRegistrationRequest,
        requests: registrationRequests,
      }}
      aiConversationReview={{
        aiConversations,
        assessments: patient?.assessments,
        patientId: patient?.id,
        onCreateAssessment,
        onReviewAiConversation,
      }}
      assessmentReview={{
        ...model.assessmentReview,
        onApprove: () => {
          if (!model.currentAssessment || !model.currentRisk) return;
          void onConfirmRisk(model.currentAssessment, model.currentRisk);
        },
        onReturn: () => {
          if (!model.currentAssessment) return;
          void onReturnAssessment(model.currentAssessment);
        },
        isApproveDisabled:
          model.assessmentReview.isApproveDisabled || isConfirmRiskBusy,
        isReturnDisabled:
          model.assessmentReview.isReturnDisabled || isConfirmRiskBusy,
      }}
      planForm={planEditorForm}
      planRecommendationState={model.planRecommendation}
      planRecommendationError={planRecommendationError}
      trainingReviewForm={reviewForm}
      collectionPreparation={model.collectionPreparation}
      onSelectPatient={onSelectPatient}
      onPlanFormChange={updatePlanEditorForm}
      onRecommendPlan={recommendPlan}
      onConfirmPlan={(payload) => {
        if (!recommendedPlan) return;
        return onConfirmPlan(recommendedPlan, payload);
      }}
      onConfirmRisk={(risk) => {
        if (!model.currentAssessment) return;
        void onConfirmRisk(model.currentAssessment, risk);
      }}
      onTrainingReviewFormChange={onTrainingReviewFormChange}
      onSubmitTrainingReview={onSubmitTrainingReview}
      onCollectionPreparationFormChange={onCollectionPreparationFormChange}
      onCreateCollectionBatch={onCreateCollectionBatch}
      isConfirmRiskDisabled={
        model.assessmentReview.isApproveDisabled || isConfirmRiskBusy
      }
      isPlanBusy={isPlanBusy}
      isRecommendingPlan={isRecommendingPlan}
      isCollectionPreparationBusy={isCollectionPreparationBusy}
      isTrainingReviewBusy={isTrainingReviewBusy}
    />
  );
}
