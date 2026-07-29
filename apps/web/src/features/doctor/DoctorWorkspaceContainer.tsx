"use client";

import { useState } from "react";
import type {
  AssessmentRecord,
  CollectionBatch,
  CollectionProtocol,
  ConfirmPlanRequest,
  PatientProfile,
  RehabPlan,
  RiskGrade,
  SubmitTrainingReviewRequest,
  TrainingRecordsResponse,
  TrainingReviewConclusion,
} from "@/types/api";
import {
  DoctorWorkspacePage,
  type DoctorWorkspaceId,
} from "./DoctorWorkspacePage";
import { buildDoctorPlanConfirmationPayload } from "./doctor-workbench-actions";
import {
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
  collectionBatchForm: CollectionBatchFormState;
  collectionBatches?: CollectionBatch[];
  collectionProtocols?: CollectionProtocol[];
  isConfirmingPlan: boolean;
  isConfirmingRisk: boolean;
  isCreatingCollectionBatch: boolean;
  isReviewingTraining: boolean;
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
  onReturnAssessment: (assessment: AssessmentRecord) => Promise<void>;
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
  selectedPatientId?: string | null;
  trainingRecords?: TrainingRecordsResponse;
};

export function DoctorWorkspaceContainer({
  activeWorkspace,
  collectionBatchForm,
  collectionBatches,
  collectionProtocols,
  isConfirmingPlan,
  isConfirmingRisk,
  isCreatingCollectionBatch,
  isReviewingTraining,
  onCollectionBatchFormChange,
  onConfirmPlan,
  onConfirmRisk,
  onReturnAssessment,
  onCreateCollectionBatch,
  onReviewFormChange,
  onSelectPatient,
  onSubmitTrainingReview,
  patient,
  patients,
  reviewForm,
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
      key={`${patient?.id ?? "no-patient"}:${model.currentPlan?.id ?? "no-plan"}`}
      activeWorkspace={activeWorkspace}
      model={model}
      patient={patient}
      patients={patients}
      selectedPatientId={selectedPatientId}
      trainingRecords={trainingRecords}
      reviewForm={reviewForm}
      onSelectPatient={onSelectPatient}
      onConfirmPlan={onConfirmPlan}
      onConfirmRisk={onConfirmRisk}
      onReturnAssessment={onReturnAssessment}
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
    />
  );
}

function DoctorWorkspaceContent({
  activeWorkspace,
  model,
  patient,
  patients,
  selectedPatientId,
  trainingRecords,
  reviewForm,
  onSelectPatient,
  onConfirmPlan,
  onConfirmRisk,
  onReturnAssessment,
  onTrainingReviewFormChange,
  onSubmitTrainingReview,
  onCollectionPreparationFormChange,
  onCreateCollectionBatch,
  isPlanBusy,
  isConfirmRiskBusy,
  isCollectionPreparationBusy,
  isTrainingReviewBusy,
}: {
  activeWorkspace: DoctorWorkspaceId;
  model: DoctorWorkbenchModel;
  patient?: PatientProfile;
  patients?: PatientProfile[];
  selectedPatientId?: string | null;
  trainingRecords?: TrainingRecordsResponse;
  reviewForm: TrainingReviewFormState;
  onSelectPatient: (patientId: string) => Promise<void>;
  onConfirmPlan: (
    plan: RehabPlan,
    payload: ConfirmPlanRequest,
  ) => Promise<void>;
  onConfirmRisk: (
    assessment: AssessmentRecord,
    risk: RiskGrade,
  ) => Promise<void>;
  onReturnAssessment: (assessment: AssessmentRecord) => Promise<void>;
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
}) {
  const [planEditorForm, setPlanEditorForm] = useState(
    () => model.planEditorForm,
  );

  function updatePlanEditorForm<K extends keyof typeof planEditorForm>(
    field: K,
    value: (typeof planEditorForm)[K],
  ) {
    setPlanEditorForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <DoctorWorkspacePage
      activeWorkspace={activeWorkspace}
      patients={patients}
      selectedPatient={patient}
      selectedPatientId={selectedPatientId}
      selectedPlan={model.currentPlan}
      trainingRecords={trainingRecords}
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
      trainingReviewForm={reviewForm}
      collectionPreparation={model.collectionPreparation}
      onSelectPatient={onSelectPatient}
      onPlanFormChange={updatePlanEditorForm}
      onConfirmPlan={() => {
        if (!model.currentPlan) return;
        void onConfirmPlan(
          model.currentPlan,
          buildDoctorPlanConfirmationPayload(planEditorForm, model.currentPlan),
        );
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
      isCollectionPreparationBusy={isCollectionPreparationBusy}
      isTrainingReviewBusy={isTrainingReviewBusy}
    />
  );
}
