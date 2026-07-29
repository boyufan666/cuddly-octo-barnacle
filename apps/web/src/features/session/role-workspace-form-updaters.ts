import type { Dispatch, SetStateAction } from "react";
import { buildUnityBuildForm } from "@/features/admin/admin-payload-builders";
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
import type { CaregiverNoteFormState } from "@/features/caregiver/CaregiverReminderPanel";
import type {
  CollectionBatchFormState,
  TrainingReviewFormState,
} from "@/features/doctor/DoctorWorkspaceContainer";
import {
  emptyUnityBuildForm,
  type CaregiverBindingFormState,
  type CollectionConditionFormState,
  type CollectionProtocolFormState,
  type RegistrationRequestFormState,
} from "@/features/session/role-workspace-state";
import {
  type AssessmentDraftFormState,
  type AssessmentDraftFormField,
  type Ad8AssessmentFormField,
  type Ad8AssessmentFormState,
  updateAd8AssessmentFormField,
  updateAssessmentDraftFormField,
} from "@/lib/ai-assessment-draft";
import { mergeBrowserPoseEvidencePrefill } from "@/lib/browser-pose-evidence-prefill";
import type { AiConversationFormState } from "@/features/patient/AssessmentDialoguePage";
import type { AuditLogFilters, GameContent } from "@/types/api";

type RoleWorkspaceFormUpdaterDependencies = {
  adminGameContents?: GameContent[];
  setAd8AssessmentForm: Dispatch<SetStateAction<Ad8AssessmentFormState>>;
  setAiConversationForm: Dispatch<SetStateAction<AiConversationFormState>>;
  setAssessmentForm: Dispatch<SetStateAction<AssessmentDraftFormState>>;
  setAuditLogFilters: Dispatch<SetStateAction<AuditLogFilters>>;
  setBrowserPoseEvidenceForm: Dispatch<
    SetStateAction<BrowserPoseEvidenceFormState>
  >;
  setCaregiverAccountForm: Dispatch<SetStateAction<CaregiverAccountFormState>>;
  setCaregiverBindingForm: Dispatch<SetStateAction<CaregiverBindingFormState>>;
  setCaregiverCommentForms: Dispatch<SetStateAction<Record<string, string>>>;
  setCaregiverNoteForm: Dispatch<SetStateAction<CaregiverNoteFormState>>;
  setCollectionBatchForm: Dispatch<SetStateAction<CollectionBatchFormState>>;
  setCollectionConditionForm: Dispatch<
    SetStateAction<CollectionConditionFormState>
  >;
  setCollectionProtocolForm: Dispatch<
    SetStateAction<CollectionProtocolFormState>
  >;
  setDataExportForm: Dispatch<SetStateAction<DataExportFormState>>;
  setGameContentCreateForm: Dispatch<
    SetStateAction<GameContentCreateFormState>
  >;
  setRegistrationRequestForm: Dispatch<
    SetStateAction<RegistrationRequestFormState>
  >;
  setTrainingReviewForm: Dispatch<SetStateAction<TrainingReviewFormState>>;
  setUnityBuildForm: Dispatch<SetStateAction<UnityBuildFormState>>;
  setUnityFieldEvidenceForm: Dispatch<
    SetStateAction<UnityFieldEvidenceFormState>
  >;
};

export function createRoleWorkspaceFormUpdaters({
  adminGameContents,
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
}: RoleWorkspaceFormUpdaterDependencies) {
  return {
    updateAssessmentForm(field: AssessmentDraftFormField, value: string) {
      setAssessmentForm((current) =>
        updateAssessmentDraftFormField(current, field, value),
      );
    },
    updateAd8AssessmentForm(field: Ad8AssessmentFormField, value: string) {
      setAd8AssessmentForm((current) =>
        updateAd8AssessmentFormField(current, field, value),
      );
    },
    updateAiConversationForm<K extends keyof AiConversationFormState>(
      field: K,
      value: AiConversationFormState[K],
    ) {
      setAiConversationForm((current) => ({ ...current, [field]: value }));
    },
    updateCaregiverNoteForm(
      field: keyof CaregiverNoteFormState,
      value: string,
    ) {
      setCaregiverNoteForm((current) => ({ ...current, [field]: value }));
    },
    updateCaregiverCommentForm(noteId: string, value: string) {
      setCaregiverCommentForms((current) => ({ ...current, [noteId]: value }));
    },
    updateRegistrationRequestForm<K extends keyof RegistrationRequestFormState>(
      field: K,
      value: RegistrationRequestFormState[K],
    ) {
      setRegistrationRequestForm((current) => ({ ...current, [field]: value }));
    },
    updateCaregiverAccountForm(
      field: keyof CaregiverAccountFormState,
      value: string,
    ) {
      setCaregiverAccountForm((current) => ({ ...current, [field]: value }));
    },
    updateCaregiverBindingForm(
      field: keyof CaregiverBindingFormState,
      value: string | boolean,
    ) {
      setCaregiverBindingForm((current) => ({ ...current, [field]: value }));
    },
    updateAuditLogFilters(
      field: keyof AuditLogFilters,
      value: AuditLogFilters[keyof AuditLogFilters],
    ) {
      setAuditLogFilters((current) => ({ ...current, [field]: value }));
    },
    updateDataExportForm(
      field: keyof DataExportFormState,
      value: DataExportFormState[keyof DataExportFormState],
    ) {
      setDataExportForm((current) => ({ ...current, [field]: value }));
    },
    updateBrowserPoseEvidenceForm(
      field: keyof BrowserPoseEvidenceFormState,
      value: string,
    ) {
      setBrowserPoseEvidenceForm((current) => ({ ...current, [field]: value }));
    },
    mergeBrowserPoseEvidenceForm(
      prefill: Partial<BrowserPoseEvidenceFormState>,
    ) {
      setBrowserPoseEvidenceForm((current) =>
        mergeBrowserPoseEvidencePrefill(current, prefill),
      );
    },
    updateUnityFieldEvidenceForm(
      field: keyof UnityFieldEvidenceFormState,
      value: string,
    ) {
      setUnityFieldEvidenceForm((current) => ({ ...current, [field]: value }));
    },
    updateGameContentCreateForm<K extends keyof GameContentCreateFormState>(
      field: K,
      value: GameContentCreateFormState[K],
    ) {
      setGameContentCreateForm((current) => ({ ...current, [field]: value }));
    },
    updateUnityBuildForm<K extends keyof UnityBuildFormState>(
      field: K,
      value: UnityBuildFormState[K],
    ) {
      if (field === "gameContentId" && typeof value === "string") {
        const selectedGame = adminGameContents?.find(
          (game) => game.id === value,
        );
        setUnityBuildForm(
          selectedGame
            ? buildUnityBuildForm(selectedGame)
            : emptyUnityBuildForm,
        );
        return;
      }
      setUnityBuildForm((current) => ({ ...current, [field]: value }));
    },
    updateCollectionConditionForm<K extends keyof CollectionConditionFormState>(
      field: K,
      value: CollectionConditionFormState[K],
    ) {
      setCollectionConditionForm((current) => ({ ...current, [field]: value }));
    },
    updateCollectionProtocolForm<K extends keyof CollectionProtocolFormState>(
      field: K,
      value: CollectionProtocolFormState[K],
    ) {
      if (field === "gameContentId" && typeof value === "string") {
        const selectedGame = adminGameContents?.find(
          (game) => game.id === value,
        );
        setCollectionProtocolForm((current) => ({
          ...current,
          gameContentId: value,
          runtimeType: selectedGame?.runtimeType ?? current.runtimeType,
          requiredInputModesText:
            selectedGame?.supportedInputModes.join(", ") ??
            current.requiredInputModesText,
          requiredMetricsText:
            selectedGame?.requiredMetrics !== undefined
              ? JSON.stringify(selectedGame.requiredMetrics, null, 2)
              : current.requiredMetricsText,
        }));
        return;
      }
      setCollectionProtocolForm((current) => ({ ...current, [field]: value }));
    },
    updateCollectionBatchForm<K extends keyof CollectionBatchFormState>(
      field: K,
      value: CollectionBatchFormState[K],
    ) {
      setCollectionBatchForm((current) => ({ ...current, [field]: value }));
    },
    updateTrainingReviewForm<K extends keyof TrainingReviewFormState>(
      field: K,
      value: TrainingReviewFormState[K],
    ) {
      setTrainingReviewForm((current) => ({ ...current, [field]: value }));
    },
  };
}
