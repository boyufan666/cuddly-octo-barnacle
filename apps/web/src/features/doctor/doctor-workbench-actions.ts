import { api } from "@/lib/api";
import type {
  AssessmentRecord,
  ConfirmPlanRequest,
  CreateCollectionBatchRequest,
  PatientProfile,
  RehabPlan,
  ReviewAssessmentRequest,
  RiskGrade,
  SubmitTrainingReviewRequest,
  TrainingReviewConclusion,
} from "@/types/api";
import type { DataCollectionBatchFormState } from "./DataCollectionReviewPanel";
import type { PlanEditorFormState } from "./PlanEditor";
import type { TrainingReviewQueueFormState } from "./TrainingReviewQueue";

export type DoctorWorkbenchActionKey =
  | "confirmRisk"
  | "confirmPlan"
  | "createCollectionBatch"
  | "reviewTraining";

export type DoctorWorkbenchActionState = {
  isConfirmingRisk: boolean;
  isConfirmingPlan: boolean;
  isCreatingCollectionBatch: boolean;
  isReviewingTraining: boolean;
};

export function doctorWorkbenchActionState(
  busyAction: string | null | undefined,
): DoctorWorkbenchActionState {
  return {
    isConfirmingRisk: busyAction === "confirmRisk",
    isConfirmingPlan: busyAction === "confirmPlan",
    isCreatingCollectionBatch: busyAction === "createCollectionBatch",
    isReviewingTraining: busyAction === "reviewTraining",
  };
}

export function buildDoctorAssessmentReviewPayload(
  assessment: AssessmentRecord,
  risk: RiskGrade,
): ReviewAssessmentRequest {
  if (!assessment.id) {
    throw new Error("评估记录缺失，不能确认风险结论。");
  }
  if (!risk.isCurrent || !risk.riskLevel || !risk.systemRiskLevel) {
    throw new Error("当前风险证据不完整，不能确认风险结论。");
  }
  if (!risk.reasonSummary.trim()) {
    throw new Error("风险证据缺少原因摘要，不能确认风险结论。");
  }
  if (risk.confirmedAt || risk.confirmedById) {
    throw new Error("当前风险结论已由医生确认。");
  }

  return {
    decision: "approved",
    manualRiskLevel: risk.manualRiskLevel ?? risk.riskLevel,
    reviewNote: "已结合量表、访谈摘要和训练风险建议确认当前风险结论。",
  };
}

export function buildDoctorAssessmentReturnPayload(
  assessment: AssessmentRecord,
): ReviewAssessmentRequest {
  if (!assessment.id) {
    throw new Error("评估记录缺失，不能退回复核。");
  }
  return {
    decision: "returned",
    reviewNote: "评估材料需补充后再确认。",
  };
}

export function buildDoctorPlanConfirmationPayload(
  form: PlanEditorFormState,
  plan: RehabPlan,
): ConfirmPlanRequest {
  const dailyDuration = parsePositiveInteger(form.dailyDuration, "每日训练时长");
  const weekFrequency = parsePositiveInteger(form.weekFrequency, "每周训练频次");
  const adjustmentReason = parseRequiredText(form.adjustmentReason, "调整原因");

  return {
    dailyDuration,
    weekFrequency,
    adjustmentReason,
    difficultyLadder: {
      source: "doctor_adjustment",
      confirmedFromPlanId: plan.id,
      confirmedAt: new Date().toISOString(),
    },
    itemAdjustments: plan.items.map((item, index) => {
      const adjustment = form.itemAdjustments[index];
      return {
        gameContentId: item.gameContentId,
        durationMinutes: parsePositiveInteger(
          adjustment?.durationMinutes ?? String(item.durationMinutes),
          `${item.gameContent.name}训练时长`,
        ),
        frequencyPerWeek: parsePositiveInteger(
          adjustment?.frequencyPerWeek ?? String(item.frequencyPerWeek),
          `${item.gameContent.name}训练频次`,
        ),
        difficulty: parseRequiredText(
          adjustment?.difficulty ?? item.difficulty,
          `${item.gameContent.name}训练难度`,
        ),
      };
    }),
  };
}

export function buildDoctorCollectionBatchPayload(
  form: DataCollectionBatchFormState,
  patient: PatientProfile,
  currentPlan?: RehabPlan | null,
): CreateCollectionBatchRequest {
  if (!currentPlan) {
    throw new Error("当前患者还没有生效康复方案，不能创建训练准备记录。");
  }
  const planItem = currentPlan.items.find((item) => item.id === form.planItemId);
  if (!planItem) {
    throw new Error("请选择当前方案中的训练项目。");
  }
  const protocolId = parseRequiredText(form.protocolId, "正式训练准备规则");
  const operatorNotes = form.operatorNotes.trim();
  const payload: CreateCollectionBatchRequest = {
    patientId: patient.id,
    rehabPlanId: currentPlan.id,
    planItemId: planItem.id,
    gameContentId: planItem.gameContentId,
    protocolId,
    idempotencyKey: [
      "collection-batch",
      patient.id,
      currentPlan.id,
      planItem.id,
      protocolId,
    ].join(":"),
  };
  if (operatorNotes) {
    payload.operatorNotes = operatorNotes;
  }
  return payload;
}

export function buildDoctorTrainingReviewPayload(
  form: TrainingReviewQueueFormState,
): SubmitTrainingReviewRequest {
  const reviewConclusion = parseTrainingReviewConclusion(form.reviewConclusion);
  const reviewNote = form.reviewNote.trim();
  if (!reviewNote) {
    throw new Error("训练复核说明不能为空。");
  }

  return {
    reviewConclusion,
    reviewNote,
  };
}

export async function confirmPlan(
  planId: string,
  payload: ConfirmPlanRequest,
) {
  return api.confirmPlan(planId, payload);
}

export async function reviewAssessment(
  assessmentId: string,
  payload: ReviewAssessmentRequest,
) {
  return api.reviewAssessment(assessmentId, payload);
}

export async function createCollectionBatch(
  payload: CreateCollectionBatchRequest,
) {
  return api.createCollectionBatch(payload);
}

export async function refreshCollectionBatches(
  patientId: string,
) {
  return api.collectionBatches(patientId);
}

export async function reviewTrainingResult(
  resultId: string,
  payload: SubmitTrainingReviewRequest,
) {
  return api.reviewTrainingResult(resultId, payload);
}

function parsePositiveInteger(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label}不能为空。`);
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label}必须大于 0。`);
  }
  return Math.round(parsed);
}

function parseRequiredText(value: string, label: string) {
  const text = value.trim();
  if (!text) {
    throw new Error(`${label}不能为空。`);
  }
  return text;
}

function parseTrainingReviewConclusion(
  value: TrainingReviewQueueFormState["reviewConclusion"],
): TrainingReviewConclusion {
  if (
    value === "confirmed_abnormal" ||
    value === "accepted_valid" ||
    value === "excluded_from_analysis" ||
    value === "needs_retrain"
  ) {
    return value;
  }
  throw new Error("请选择训练复核结论。");
}
