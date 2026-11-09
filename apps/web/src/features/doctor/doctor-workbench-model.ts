import type { ComponentProps } from "react";
import type {
  AssessmentRecord,
  CollectionBatch,
  CollectionCondition,
  CollectionProtocol,
  PatientProfile,
  RehabPlan,
  RehabPlanItem,
  RiskGrade,
  TrainingRecordsResponse,
} from "@/types/api";
import type { AssessmentReviewPanel } from "./AssessmentReviewPanel";
import type { DataCollectionReviewPanel } from "./DataCollectionReviewPanel";
import type { PlanEditorFormState } from "./PlanEditor";

type DoctorPlanEditorFormState = PlanEditorFormState;

type DoctorWorkbenchModelInput = {
  patient?: PatientProfile;
  collectionBatches?: CollectionBatch[];
  collectionProtocols?: CollectionProtocol[];
  collectionBatchForm: ComponentProps<typeof DataCollectionReviewPanel>["form"];
  trainingRecords?: TrainingRecordsResponse;
};

export type DoctorWorkbenchModel = {
  assessmentReview: ComponentProps<typeof AssessmentReviewPanel>;
  confirmedPlan?: RehabPlan;
  currentAssessment?: AssessmentRecord;
  currentPlan?: RehabPlan;
  currentRisk?: RiskGrade;
  planRecommendation: DoctorPlanRecommendationState;
  planEditorForm: DoctorPlanEditorFormState;
  collectionPreparation: Pick<
    ComponentProps<typeof DataCollectionReviewPanel>,
    | "currentPlanName"
    | "batchesAvailable"
    | "form"
    | "matchingProtocols"
    | "planItems"
    | "readyBatch"
    | "selectedPlanItem"
  >;
};

export type DoctorPlanRecommendationState = {
  assessmentConfirmed: boolean;
  assessmentStatusLabel: string;
  blockers: string[];
  canRecommend: boolean;
  riskConfirmed: boolean;
  riskStatusLabel: string;
};

export function buildDoctorWorkbenchModel({
  patient,
  collectionBatches,
  collectionProtocols,
  collectionBatchForm,
  trainingRecords,
}: DoctorWorkbenchModelInput): DoctorWorkbenchModel {
  const currentPlan = resolvePendingPlan(patient);
  const confirmedPlan = resolveConfirmedCurrentPlan(patient);
  const currentAssessment = patient?.assessments?.[0];
  const currentRisk = resolveAssessmentRisk(currentAssessment);
  const assessmentReview = buildDoctorAssessmentReview(
    currentAssessment,
    currentRisk,
  );
  const planRecommendation = buildDoctorPlanRecommendationState(
    patient,
    currentAssessment,
    currentRisk,
    currentPlan,
  );
  const selectedPlanItem =
    confirmedPlan?.items.find(
      (item) => item.id === collectionBatchForm.planItemId,
    ) ??
    resolvePreparedPlanItem(
      confirmedPlan,
      collectionBatches,
      collectionProtocols,
    ) ??
    resolveNextPlanItem(confirmedPlan, trainingRecords) ??
    confirmedPlan?.items[0];
  const matchingProtocols = selectedPlanItem
    ? collectionProtocols === undefined
      ? undefined
      : resolveCollectionProtocolsForPlanItem(
          collectionProtocols,
          selectedPlanItem,
        )
    : [];
  const readyBatch =
    confirmedPlan && selectedPlanItem
      ? findReadyCollectionBatch(
          collectionBatches,
          collectionProtocols,
          confirmedPlan.id,
          selectedPlanItem,
          collectionBatchForm.protocolId || undefined,
        )
      : undefined;

  return {
    assessmentReview,
    confirmedPlan,
    currentAssessment,
    currentPlan,
    currentRisk,
    planRecommendation,
    planEditorForm: buildDoctorPlanEditorForm(currentPlan),
    collectionPreparation: {
      batchesAvailable: collectionBatches !== undefined,
      currentPlanName: confirmedPlan?.planName,
      form: collectionBatchForm,
      matchingProtocols,
      planItems: confirmedPlan?.items ?? [],
      readyBatch,
      selectedPlanItem,
    },
  };
}

export function buildDoctorPlanEditorForm(
  plan?: RehabPlan | null,
): DoctorPlanEditorFormState {
  if (!plan) {
    return {
      dailyDuration: "",
      weekFrequency: "",
      adjustmentReason: "",
      itemAdjustments: [],
    };
  }

  return {
    dailyDuration: String(plan.dailyDuration),
    weekFrequency: String(plan.weekFrequency),
    adjustmentReason: "",
    itemAdjustments: plan.items.map((item) => ({
      gameContentId: item.gameContentId,
      durationMinutes: String(item.durationMinutes),
      frequencyPerWeek: String(item.frequencyPerWeek),
      difficulty: item.difficulty,
    })),
  };
}

export function resolveConfirmedCurrentPlan(patient?: PatientProfile) {
  return patient?.rehabPlans.find(
    (plan) => plan.isCurrent && plan.status === "active",
  );
}

export function resolvePendingPlan(patient?: PatientProfile) {
  return patient?.rehabPlans.find(
    (plan) => plan.status === "pending_confirm" && !plan.isCurrent,
  );
}

export function resolveCurrentRisk(patient?: PatientProfile) {
  return patient?.riskGrades.find((riskGrade) => riskGrade.isCurrent);
}

export function resolveAssessmentRisk(assessment?: AssessmentRecord) {
  return assessment?.riskGrades?.find((riskGrade) => riskGrade.isCurrent);
}

export function buildDoctorPlanRecommendationState(
  patient: PatientProfile | undefined,
  assessment: AssessmentRecord | undefined,
  risk: RiskGrade | undefined,
  pendingPlan: RehabPlan | undefined,
): DoctorPlanRecommendationState {
  if (!patient) {
    return {
      assessmentConfirmed: false,
      assessmentStatusLabel: "未选择患者",
      blockers: ["请先选择患者，再检查正式评估与风险确认状态。"],
      canRecommend: false,
      riskConfirmed: false,
      riskStatusLabel: "未选择患者",
    };
  }

  const assessmentConfirmed = assessment?.status === "doctor_confirmed";
  const riskConfirmed = isRiskConfirmed(risk);
  const blockers: string[] = [];

  if (!assessment) {
    blockers.push("当前患者没有可用于方案生成的结构化评估记录。");
  } else if (!assessmentConfirmed) {
    blockers.push("当前评估尚未由医师确认为正式评估。");
  }

  if (!risk) {
    blockers.push("当前评估没有关联的当前风险评级。");
  } else if (!riskConfirmed) {
    blockers.push("当前风险评级尚未由医师完整确认。");
  }

  if (pendingPlan) {
    blockers.push("已有待确认推荐方案，请先调整并确认下发。");
  }

  return {
    assessmentConfirmed,
    assessmentStatusLabel: assessmentStatusLabel(assessment),
    blockers,
    canRecommend: blockers.length === 0,
    riskConfirmed,
    riskStatusLabel: riskConfirmationLabel(risk),
  };
}

export function resolveCollectionProtocolsForPlanItem(
  protocols: CollectionProtocol[] | undefined,
  planItem: RehabPlanItem,
) {
  return (protocols ?? []).filter(
    (protocol) =>
      protocol.status === "active" &&
      protocol.runtimeType === planItem.gameContent.runtimeType &&
      (!protocol.gameContentId ||
        protocol.gameContentId === planItem.gameContentId),
  );
}

export function findReadyCollectionBatch(
  batches: CollectionBatch[] | undefined,
  protocols: CollectionProtocol[] | undefined,
  currentPlanId: string,
  planItem: RehabPlanItem,
  protocolId?: string,
) {
  const protocolById = new Map(
    (protocols ?? []).map((protocol) => [protocol.id, protocol]),
  );
  return (batches ?? []).find((batch) => {
    const protocol = batch.protocol ?? protocolById.get(batch.protocolId);
    return (
      batch.status === "ready" &&
      batch.rehabPlanId === currentPlanId &&
      batch.planItemId === planItem.id &&
      batch.gameContentId === planItem.gameContentId &&
      (!protocolId || batch.protocolId === protocolId) &&
      Boolean(batch.patientId) &&
      protocol?.status === "active" &&
      protocol.runtimeType === planItem.gameContent.runtimeType &&
      (!protocol.gameContentId ||
        protocol.gameContentId === planItem.gameContentId)
    );
  });
}

function resolvePreparedPlanItem(
  plan: RehabPlan | undefined,
  batches: CollectionBatch[] | undefined,
  protocols: CollectionProtocol[] | undefined,
) {
  return plan?.items.find((item) =>
    Boolean(findReadyCollectionBatch(batches, protocols, plan.id, item)),
  );
}

export function doctorTrainingCategoryLabel(targets: string[]) {
  const combined = targets.join(" ");
  if (/运动|动作|上肢|下肢|平衡|姿态|pose|motion|reach/i.test(combined)) {
    return "运动训练";
  }
  return "思维训练";
}

function buildDoctorAssessmentReview(
  assessment: AssessmentRecord | undefined,
  risk: RiskGrade | undefined,
): ComponentProps<typeof AssessmentReviewPanel> {
  const riskConfirmed = isRiskConfirmed(risk);
  const confirmed = assessment?.status === "doctor_confirmed" && riskConfirmed;
  const reviewable = assessment?.status === "completed";
  const canApprove = Boolean(
    assessment && reviewable && risk && hasRiskEvidence(risk) && !riskConfirmed,
  );
  const canReturn = Boolean(assessment && reviewable);
  return {
    clinicalSummaries: [
      {
        title: "评估摘要",
        value: assessment ? assessmentSummaryLabel(assessment) : "待补齐评估",
        helper: assessment
          ? assessmentStatusLabel(assessment)
          : "患者完成结构化评估后可复核",
        status: assessment ? "ready" : "blocked",
      },
      {
        title: "风险等级",
        value: riskLabel(risk?.riskLevel),
        helper: risk ? risk.reasonSummary : "当前评估没有关联的当前风险评级",
        status: riskConfirmed ? "complete" : risk ? "pending" : "blocked",
      },
      {
        title: "医生结论",
        value: confirmed
          ? "正式评估已由医师确认"
          : reviewable
            ? "待医师确认正式评估"
            : assessmentStatusLabel(assessment),
        helper: "AI 与语音材料仅供辅助，不能自动形成正式评估",
        status: confirmed ? "complete" : reviewable ? "pending" : "blocked",
      },
    ],
    isApproveDisabled: !canApprove,
    isReturnDisabled: !canReturn,
    reviewStatusLabel: confirmed
      ? "正式评估已确认"
      : assessmentReviewStatusLabel(assessment),
    scores: [
      {
        label: "MMSE",
        value: assessment?.scoreSummary.mmse as string | number | undefined,
        helper: "0-30",
      },
      {
        label: "CDR",
        value: assessment?.scoreSummary.cdr as string | number | undefined,
        helper: "0-3",
      },
      {
        label: "AD-8",
        value: assessment?.scoreSummary.ad8Total as string | number | undefined,
        helper: "0-8",
      },
    ],
  };
}

function hasRiskEvidence(risk: RiskGrade) {
  return Boolean(
    risk.riskLevel && risk.systemRiskLevel && risk.reasonSummary.trim(),
  );
}

function isRiskConfirmed(risk?: RiskGrade) {
  return Boolean(risk?.confirmedAt && risk?.confirmedById);
}

function assessmentStatusLabel(assessment?: AssessmentRecord) {
  if (!assessment) return "无正式评估";
  if (assessment.status === "doctor_confirmed") return "已由医师确认正式评估";
  if (assessment.status === "completed") return "待医师确认正式评估";
  if (assessment.status === "returned_for_review") return "已退回复核";
  if (!assessment.status) return "评估状态缺失，不能作为正式评估";
  return `评估状态 ${assessment.status}，不能作为正式评估`;
}

function assessmentReviewStatusLabel(assessment?: AssessmentRecord) {
  if (!assessment) return "待补齐评估";
  if (assessment.status === "completed") return "待医师确认";
  if (assessment.status === "returned_for_review") return "已退回复核";
  if (assessment.status === "doctor_confirmed") return "确认记录不完整";
  return "当前状态不可确认";
}

function riskConfirmationLabel(risk?: RiskGrade) {
  if (!risk) return "当前评估无当前风险评级";
  if (isRiskConfirmed(risk)) return `${riskLabel(risk.riskLevel)} · 医师已确认`;
  if (risk.confirmedAt || risk.confirmedById) return "风险确认记录不完整";
  return `${riskLabel(risk.riskLevel)} · 待医师确认`;
}

function assessmentSummaryLabel(assessment: AssessmentRecord) {
  const completedAt = formatDateTime(
    assessment.completedAt ?? assessment.createdAt,
  );
  const typeLabel =
    assessment.assessmentType === "ad8"
      ? "AD-8照护者访谈"
      : assessment.assessmentType.toUpperCase();
  const physicalConditionLabel = assessment.physicalConditions?.length
    ? ` · 身体状况：${assessment.physicalConditions.join("、")}`
    : "";
  return `${typeLabel} · ${completedAt}${physicalConditionLabel}`;
}

function riskLabel(level?: RiskGrade["riskLevel"]) {
  if (level === "high") return "高风险";
  if (level === "moderate") return "中风险";
  if (level === "low") return "低风险";
  return "未评级";
}

function resolveNextPlanItem(
  plan?: RehabPlan,
  trainingRecords?: TrainingRecordsResponse,
) {
  if (!plan) return undefined;
  const completedPlanItemIds = new Set(
    trainingRecords?.sessions
      .filter((session) => session.sessionStatus === "completed")
      .map((session) => session.planItemId),
  );
  return plan.items.find((item) => !completedPlanItemIds.has(item.id));
}

function formatDateTime(value?: string | null) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function readConditionSnapshot(
  batch?: CollectionBatch,
): CollectionCondition | undefined {
  if (!batch?.conditionSnapshot) return undefined;
  const snapshot = batch.conditionSnapshot;
  if (typeof snapshot.name !== "string" || typeof snapshot.code !== "string") {
    return undefined;
  }
  return {
    id: typeof snapshot.id === "string" ? snapshot.id : batch.conditionId,
    code: snapshot.code,
    name: snapshot.name,
    description:
      typeof snapshot.description === "string"
        ? snapshot.description
        : undefined,
    environment: readRecord(snapshot.environment),
    deviceRequirements: readRecord(snapshot.deviceRequirements),
    taskParameters: readRecord(snapshot.taskParameters),
    qualityRules: readRecord(snapshot.qualityRules),
    status:
      typeof snapshot.status === "string" ? snapshot.status : batch.status,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
