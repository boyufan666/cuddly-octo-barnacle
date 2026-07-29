import {
  buildTodayTrainingRecords,
  findPlanItem,
  findReadyCollectionBatch,
  resolveTrainingPrepCameraRequirement,
} from "@/features/patient/patient-readiness-orchestration";
import { resolveActivePatientTrainingSession } from "@/features/patient/patient-training-actions";
import { resolveConfirmedCurrentPlan } from "@/features/patient/plan-suggestion-model";
import type { AppData } from "@/features/session/useRoleData";
import type { TrainingSession } from "@/types/api";

export function deriveRoleWorkspaceTrainingContext({
  activeTrainingSession,
  data,
  selectedTrainingPlanItemId,
}: {
  activeTrainingSession: TrainingSession | null;
  data: Pick<
    AppData,
    "collectionBatches" | "collectionProtocols" | "patient" | "trainingRecords"
  >;
  selectedTrainingPlanItemId: string | null;
}) {
  const currentPlan = resolveConfirmedCurrentPlan(data.patient);
  const visibleTrainingRecords = data.trainingRecords;
  const todayTrainingRecords = buildTodayTrainingRecords(
    visibleTrainingRecords,
  );
  const activeTrainingResolution = data.patient
    ? resolveActivePatientTrainingSession({
        currentPlan,
        patientId: data.patient.id,
        trainingRecords: visibleTrainingRecords,
      })
    : { status: "none" as const };
  const selectedTrainingPlanItem =
    currentPlan && selectedTrainingPlanItemId
      ? findPlanItem(currentPlan, selectedTrainingPlanItemId)
      : undefined;
  const selectedPlanItem = selectedTrainingPlanItem;
  const selectedPlanPrepRequirement = resolveTrainingPrepCameraRequirement(
    selectedPlanItem?.gameContent,
  );
  const activePlanItem = activeTrainingSession
    ? findPlanItem(currentPlan, activeTrainingSession.planItemId)
    : selectedPlanItem;
  const preparedCollectionBatch =
    data.patient && currentPlan && selectedPlanItem
      ? findReadyCollectionBatch(
          data.collectionBatches,
          data.collectionProtocols,
          data.patient.id,
          currentPlan.id,
          selectedPlanItem,
        )
      : undefined;

  return {
    activePlanItem,
    activeTrainingResolution,
    currentPlan,
    preparedCollectionBatch,
    selectedPlanItem,
    selectedPlanPrepRequirement,
    todayTrainingRecords,
    visibleTrainingRecords,
  };
}
