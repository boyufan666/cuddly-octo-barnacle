"use client";

import type { ComponentProps } from "react";
import type { PatientProfile, RehabPlan, RiskGrade, TrainingRecordsResponse } from "@/types/api";
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
  assessmentReview: ComponentProps<typeof AssessmentReviewPanel>;
  planForm: PlanEditorFormState;
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
  onConfirmPlan: ComponentProps<typeof PlanEditor>["onSubmit"];
  onTrainingReviewFormChange: <K extends keyof TrainingReviewQueueFormState>(
    field: K,
    value: TrainingReviewQueueFormState[K],
  ) => void;
  onSubmitTrainingReview: ComponentProps<typeof TrainingReviewQueue>["onSubmit"];
  onCollectionPreparationFormChange: ComponentProps<
    typeof DataCollectionReviewPanel
  >["onChange"];
  onCreateCollectionBatch: ComponentProps<
    typeof DataCollectionReviewPanel
  >["onCreateCollectionBatch"];
  isConfirmRiskDisabled?: boolean;
  isPlanBusy?: boolean;
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
  assessment: {
    eyebrow: "评估复核",
    title: "评估",
    subtitle: "复核量表、访谈和智能建议，形成医生确认的风险判断。",
  },
  plan: {
    eyebrow: "计划管理",
    title: "计划",
    subtitle: "确认训练方案，确保患者后续训练使用医生确认后的计划。",
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
  assessmentReview,
  planForm,
  trainingReviewForm,
  collectionPreparation,
  onSelectPatient,
  onConfirmRisk,
  onPlanFormChange,
  onConfirmPlan,
  onTrainingReviewFormChange,
  onSubmitTrainingReview,
  onCollectionPreparationFormChange,
  onCreateCollectionBatch,
  isConfirmRiskDisabled,
  isPlanBusy,
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

        {activeWorkspace === "assessment" ? (
          <AssessmentReviewPanel {...assessmentReview} />
        ) : null}

        {activeWorkspace === "plan" ? (
          <PlanEditor
            plan={selectedPlan}
            form={planForm}
            onChange={onPlanFormChange}
            onSubmit={onConfirmPlan}
            isBusy={isPlanBusy}
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
