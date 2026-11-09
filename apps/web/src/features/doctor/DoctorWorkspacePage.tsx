"use client";

import type { ComponentProps } from "react";
import type {
  PatientProfile,
  RehabPlan,
  RiskGrade,
  TrainingRecordsResponse,
} from "@/types/api";
import { AccountReviewPanel } from "@/features/admin/AccountReviewPanel";
import { AiConversationReviewPanel } from "./AiConversationReviewPanel";
import { AssessmentReviewPanel } from "./AssessmentReviewPanel";
import { DataCollectionReviewPanel } from "./DataCollectionReviewPanel";
import { PatientClinicalSummary } from "./PatientClinicalSummary";
import { PatientQueue } from "./PatientQueue";
import { PlanEditor, type PlanEditorFormState } from "./PlanEditor";
import {
  TrainingReviewQueue,
  type TrainingReviewQueueFormState,
} from "./TrainingReviewQueue";

export type DoctorWorkspaceId =
  | "patients"
  | "registration"
  | "assessment"
  | "plan"
  | "preparation"
  | "review";

type DoctorWorkspacePageProps = {
  activeWorkspace: DoctorWorkspaceId;
  patients?: PatientProfile[];
  selectedPatient?: PatientProfile | null;
  selectedPatientId?: string | null;
  selectedPlan?: RehabPlan | null;
  trainingRecords?: TrainingRecordsResponse | null;
  registrationReview: ComponentProps<typeof AccountReviewPanel>;
  aiConversationReview: ComponentProps<typeof AiConversationReviewPanel>;
  assessmentReview: ComponentProps<typeof AssessmentReviewPanel>;
  planForm: PlanEditorFormState;
  planRecommendationState: ComponentProps<
    typeof PlanEditor
  >["recommendationState"];
  planRecommendationError: string | null;
  trainingReviewForm: TrainingReviewQueueFormState;
  collectionPreparation: Omit<
    ComponentProps<typeof DataCollectionReviewPanel>,
    "isBusy" | "onChange" | "onCreateCollectionBatch"
  >;
  onSelectPatient: (patientId: string) => void | Promise<void>;
  onConfirmRisk?: (risk: RiskGrade) => void | Promise<void>;
  onPlanFormChange: <K extends keyof PlanEditorFormState>(
    field: K,
    value: PlanEditorFormState[K],
  ) => void;
  onRecommendPlan: ComponentProps<typeof PlanEditor>["onRecommend"];
  onConfirmPlan: ComponentProps<typeof PlanEditor>["onSubmit"];
  onTrainingReviewFormChange: <K extends keyof TrainingReviewQueueFormState>(
    field: K,
    value: TrainingReviewQueueFormState[K],
  ) => void;
  onSubmitTrainingReview: ComponentProps<
    typeof TrainingReviewQueue
  >["onSubmit"];
  onCollectionPreparationFormChange: ComponentProps<
    typeof DataCollectionReviewPanel
  >["onChange"];
  onCreateCollectionBatch: ComponentProps<
    typeof DataCollectionReviewPanel
  >["onCreateCollectionBatch"];
  isConfirmRiskDisabled?: boolean;
  isPlanBusy: boolean;
  isRecommendingPlan: boolean;
  isCollectionPreparationBusy?: boolean;
  isTrainingReviewBusy?: boolean;
};

const doctorWorkspaceCopy: Record<
  DoctorWorkspaceId,
  { eyebrow: string; title: string; subtitle: string }
> = {
  patients: {
    eyebrow: "临床工作台",
    title: "患者",
    subtitle: "查看负责患者和当前患者摘要，先确定本次需要处理的人。",
  },
  registration: {
    eyebrow: "患者准入",
    title: "注册申请",
    subtitle: "审核患者提交的账号开通申请，通过后患者才能进入评估与训练流程。",
  },
  assessment: {
    eyebrow: "评估复核",
    title: "评估",
    subtitle: "复核量表、访谈和智能建议，形成医生确认的风险判断。",
  },
  plan: {
    eyebrow: "计划管理",
    title: "计划",
    subtitle: "正式评估与风险确认后生成推荐方案，由医师逐项调整并确认下发。",
  },
  preparation: {
    eyebrow: "训练准备",
    title: "准备",
    subtitle: "基于已确认计划创建正式训练准备，保证患者训练前状态可追踪。",
  },
  review: {
    eyebrow: "训练复核",
    title: "复核",
    subtitle: "查看训练结果，保存医生复核结论。",
  },
};

export function DoctorWorkspacePage({
  activeWorkspace,
  patients,
  selectedPatient,
  selectedPatientId,
  selectedPlan,
  trainingRecords,
  registrationReview,
  aiConversationReview,
  assessmentReview,
  planForm,
  planRecommendationState,
  planRecommendationError,
  trainingReviewForm,
  collectionPreparation,
  onSelectPatient,
  onConfirmRisk,
  onPlanFormChange,
  onRecommendPlan,
  onConfirmPlan,
  onTrainingReviewFormChange,
  onSubmitTrainingReview,
  onCollectionPreparationFormChange,
  onCreateCollectionBatch,
  isConfirmRiskDisabled,
  isPlanBusy,
  isRecommendingPlan,
  isCollectionPreparationBusy,
  isTrainingReviewBusy,
}: DoctorWorkspacePageProps) {
  const copy = doctorWorkspaceCopy[activeWorkspace];

  return (
    <section className="min-w-0">
      <p className="text-xs font-black text-[var(--accent-strong)]">
        {copy.eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-black text-[var(--ink-strong)] md:text-3xl">
        {copy.title}
      </h2>
      <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-[var(--ink-soft)] md:text-base md:leading-7">
        {copy.subtitle}
      </p>

      <div className="mt-6 grid gap-5" data-testid="doctor-primary-workbench">
        {activeWorkspace === "patients" ? (
          <>
            <PatientQueue
              patients={patients}
              selectedPatientId={selectedPatientId}
              onSelectPatient={onSelectPatient}
            />
            <PatientClinicalSummary
              patient={selectedPatient}
              onConfirmRisk={onConfirmRisk}
              isConfirmRiskDisabled={isConfirmRiskDisabled}
            />
          </>
        ) : null}

        {activeWorkspace === "registration" ? (
          <AccountReviewPanel {...registrationReview} />
        ) : null}

        {activeWorkspace === "assessment" ? (
          <>
            <AiConversationReviewPanel
              key={`${selectedPatient?.id}:${aiConversationReview.aiConversations?.find((conversation) => conversation.status === "pending_human_review")?.id}`}
              {...aiConversationReview}
            />
            <AssessmentReviewPanel {...assessmentReview} />
          </>
        ) : null}

        {activeWorkspace === "plan" ? (
          <PlanEditor
            plan={selectedPlan}
            form={planForm}
            recommendationState={planRecommendationState}
            recommendationError={planRecommendationError}
            onChange={onPlanFormChange}
            onRecommend={onRecommendPlan}
            onSubmit={onConfirmPlan}
            isBusy={isPlanBusy}
            isRecommending={isRecommendingPlan}
          />
        ) : null}

        {activeWorkspace === "preparation" ? (
          <DataCollectionReviewPanel
            {...collectionPreparation}
            onChange={onCollectionPreparationFormChange}
            onCreateCollectionBatch={onCreateCollectionBatch}
            isBusy={Boolean(isCollectionPreparationBusy)}
          />
        ) : null}

        {activeWorkspace === "review" ? (
          <TrainingReviewQueue
            trainingRecords={trainingRecords}
            form={trainingReviewForm}
            onChange={onTrainingReviewFormChange}
            onSubmit={onSubmitTrainingReview}
            isBusy={isTrainingReviewBusy}
          />
        ) : null}
      </div>
    </section>
  );
}
