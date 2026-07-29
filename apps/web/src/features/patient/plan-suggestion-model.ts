import { isGameReadyForTraining } from "@/lib/formal-training-content-readiness";
import type { PatientProfile, RehabPlan } from "@/types/api";
import { summarizePatientConsents } from "./patient-consent-model";

export type StatusTone = "info" | "success" | "warning" | "danger" | "muted";

export type PlanPrerequisiteState = {
  canRecommend: boolean;
  items: Array<[string, string, StatusTone]>;
  blockers: Array<[string, string]>;
};

export const planPrerequisiteLabels = {
  patientProfile: "患者已建档",
  privacyConsent: "隐私授权已签署",
  aiConsent: "评估数据授权已签署",
  currentRisk: "当前风险评级",
  releasedTraining: "已发布正式训练内容",
  planState: "方案状态",
} as const;

export function resolveConfirmedCurrentPlan(patient?: PatientProfile) {
  return patient?.rehabPlans.find(
    (plan) => plan.isCurrent && plan.status === "active",
  );
}

export function resolveCurrentRisk(patient?: PatientProfile) {
  return patient?.riskGrades.find((riskGrade) => riskGrade.isCurrent);
}

export function resolvePendingPlan(patient?: PatientProfile) {
  return patient?.rehabPlans.find((plan) => plan.status === "pending_confirm");
}

export function buildPlanPrerequisiteState(
  patient?: PatientProfile,
  pendingPlan?: RehabPlan | null,
): PlanPrerequisiteState {
  const consentSummary = patient ? summarizePatientConsents(patient) : {};
  const currentRisk = resolveCurrentRisk(patient);
  const activePlan = resolveConfirmedCurrentPlan(patient);
  const items: Array<[string, string, StatusTone]> = [
    [
      planPrerequisiteLabels.patientProfile,
      patient ? "已建档" : "待建档",
      patient ? "success" : "warning",
    ],
    [
      planPrerequisiteLabels.privacyConsent,
      consentSummary.privacy_policy ? "已签署" : "待签署",
      consentSummary.privacy_policy ? "success" : "warning",
    ],
    [
      planPrerequisiteLabels.aiConsent,
      consentSummary.ai_processing ? "已签署" : "待签署",
      consentSummary.ai_processing ? "success" : "warning",
    ],
    [
      planPrerequisiteLabels.currentRisk,
      currentRisk ? riskLabel(currentRisk.riskLevel) : "未评估",
      currentRisk ? "success" : "warning",
    ],
    [
      planPrerequisiteLabels.planState,
      pendingPlan
        ? "待医师确认"
        : activePlan
          ? "已确认生效"
          : "待生成",
      pendingPlan ? "warning" : activePlan ? "success" : "info",
    ],
  ];
  const blockers = items
    .filter(([, , tone]) => tone === "warning" || tone === "danger")
    .filter(([label]) => label !== planPrerequisiteLabels.planState || Boolean(pendingPlan))
    .map(([label, value]) =>
      label === planPrerequisiteLabels.planState && pendingPlan
        ? [label, "已有待确认方案"]
        : [label, value],
    )
    .map(([label, value]) => [label, value] as [string, string]);

  return {
    canRecommend: blockers.length === 0,
    items,
    blockers,
  };
}

export function summarizeTrainingContentReadiness(plan?: RehabPlan | null): {
  label: string;
  description: string;
  tone: StatusTone;
} {
  if (!plan) {
    return {
      label: "待生成",
      description: "当前还没有推荐或已确认方案，需先完成评估并生成方案建议。",
      tone: "info",
    };
  }

  if (!plan.items.length) {
    return {
      label: "暂无",
      description: "当前方案没有训练项目，确认前需要先生成包含正式训练内容的方案。",
      tone: "warning",
    };
  }

  const unreadyItems = plan.items.filter(
    (item) => !isGameReadyForTraining(item.gameContent),
  );
  if (unreadyItems.length) {
    return {
      label: `${unreadyItems.length} 项待完善`,
      description: `训练内容 ${unreadyItems
        .map((item) => item.gameContent.name)
        .join("、")} 尚未完成正式配置。`,
      tone: "warning",
    };
  }

  return {
    label: "已准备",
    description: "当前方案中的训练内容已完成正式配置，可进入医生确认和训练准备。",
    tone: "success",
  };
}

export function riskLabel(risk?: "low" | "moderate" | "high" | null) {
  if (risk === "high") return "高风险";
  if (risk === "moderate") return "中度风险";
  if (risk === "low") return "低风险";
  return "未评估";
}

export function riskTone(risk?: "low" | "moderate" | "high" | null): StatusTone {
  if (risk === "high") return "danger";
  if (risk === "moderate") return "warning";
  if (risk === "low") return "success";
  return "info";
}

export function clinicalScoreLabel(value: unknown, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "未评估";
  return suffix ? `${value}${suffix}` : String(value);
}
