"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type {
  CaregiverSummaryResponse,
  PatientProfile,
  RehabPlan,
  TrainingRecordsResponse,
} from "@/types/api";
import {
  validateTrainingAbortReason,
  type ActivePatientTrainingSessionResolution,
} from "./patient-training-actions";
import {
  patientTrainingDifficultyLabel,
  patientTrainingTagsLabel,
  patientTrainingTargetsLabel,
} from "./patient-training-copy";

type TrainingTask = RehabPlan["items"][number];

type TodayTrainingPageProps = {
  activeTrainingResolution: ActivePatientTrainingSessionResolution;
  caregiverSummary?: CaregiverSummaryResponse;
  currentPlan?: RehabPlan;
  isAbortingTraining: boolean;
  isResumingTraining: boolean;
  onAbortTraining: (reason: string) => Promise<void>;
  onResumeTraining: () => Promise<void>;
  onStartPreparation: (task?: TrainingTask) => void;
  onViewRecords: () => void;
  patient?: PatientProfile;
  todayTrainingRecords?: TrainingRecordsResponse;
};

export function TodayTrainingPage({
  activeTrainingResolution,
  ...props
}: TodayTrainingPageProps) {
  const viewKey =
    activeTrainingResolution.status === "resumable"
      ? `resumable:${activeTrainingResolution.session.id}`
      : activeTrainingResolution.status;

  return (
    <TodayTrainingPageContent
      key={viewKey}
      activeTrainingResolution={activeTrainingResolution}
      {...props}
    />
  );
}

function TodayTrainingPageContent({
  activeTrainingResolution,
  caregiverSummary,
  currentPlan,
  isAbortingTraining,
  isResumingTraining,
  onAbortTraining,
  onResumeTraining,
  onStartPreparation,
  onViewRecords,
  patient,
  todayTrainingRecords,
}: TodayTrainingPageProps) {
  const [abortReason, setAbortReason] = useState("");
  const [showAbortForm, setShowAbortForm] = useState(false);
  const displayName = patient?.name ?? caregiverSummary?.patient.name ?? "用户";
  const tasks = currentPlan?.items ?? [];
  const completedPlanItemIds = new Set(
    todayTrainingRecords?.sessions
      .filter(
        (session) =>
          session.sessionStatus === "completed" && Boolean(session.result),
      )
      .map((session) => session.planItemId),
  );
  const nextTask = tasks.find((task) => !completedPlanItemIds.has(task.id));
  const allComplete =
    tasks.length > 0 &&
    tasks.every((task) => completedPlanItemIds.has(task.id));
  const resumableTraining =
    activeTrainingResolution.status === "resumable"
      ? activeTrainingResolution
      : undefined;
  const focusTask = resumableTraining?.planItem ?? nextTask;
  const focusTags = focusTask
    ? patientTrainingTagsLabel(focusTask.gameContent.tags)
    : [];
  const focusDifficulty = focusTask
    ? patientTrainingDifficultyLabel(focusTask.difficulty)
    : "";
  const primaryAction = resolvePrimaryAction({
    allComplete,
    hasCurrentPlan: Boolean(currentPlan),
    nextTask,
  });

  return (
    <section className="grid gap-5" data-testid="patient-today-flow">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black text-[var(--accent-strong)]">
            今日训练
          </p>
          <h2 className="mt-2 text-3xl font-black text-[var(--ink-strong)] md:text-4xl">
            今日训练
          </h2>
          <p className="mt-3 max-w-3xl text-base font-bold leading-7 text-[var(--ink-soft)]">
            {resumableTraining
              ? `${displayName}，请先继续尚未完成的训练。`
              : `${displayName}，按医生安排完成下一项训练，再查看记录。`}
          </p>
        </div>
        <StatusBadge
          status={allComplete ? "complete" : currentPlan ? "ready" : "pending"}
        >
          {resumableTraining
            ? "尚未完成"
            : allComplete
              ? "今日已完成"
              : nextTask
                ? "下一项训练"
                : "等待安排"}
        </StatusBadge>
      </div>

      <Card tone="patient" className="grid gap-5 bg-[var(--surface-muted)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black text-[var(--accent-strong)]">
              {resumableTraining ? "有一项训练尚未完成" : "下一项训练"}
            </p>
            <h3 className="mt-2 break-words text-3xl font-black text-[var(--ink-strong)]">
              {focusTask ? focusTask.gameContent.name : "等待医生下发训练安排"}
            </h3>
            <p className="mt-3 max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
              {focusTask
                ? `${patientTrainingTargetsLabel(focusTask.gameContent.trainingTargets)}。本次预计 ${focusTask.durationMinutes} 分钟${focusDifficulty ? `，${focusDifficulty}难度` : ""}。`
                : "医生确认康复计划后，这里会显示今天的训练项目。"}
            </p>
            {focusTags.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {focusTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] px-3 py-1 text-xs font-black text-[var(--ink-soft)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {activeTrainingResolution.status === "blocked" ? (
        <Card
          tone="patient"
          className="border-[var(--danger)] bg-[var(--surface-panel)]"
        >
          <h3 className="text-xl font-black text-[var(--ink-strong)]">
            暂时无法继续训练
          </h3>
          <p className="mt-2 font-bold leading-7 text-[var(--ink-soft)]">
            {activeTrainingResolution.message}
          </p>
        </Card>
      ) : resumableTraining ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-3">
            <Button
              aria-busy={isResumingTraining || undefined}
              className="w-full md:w-fit"
              data-testid="patient-resume-training"
              disabled={isResumingTraining || isAbortingTraining}
              onClick={() => void onResumeTraining()}
            >
              {isResumingTraining ? "正在继续训练" : "继续本次训练"}
            </Button>
            <Button
              aria-busy={isAbortingTraining || undefined}
              className="w-full md:w-fit"
              data-testid="patient-open-abort-training"
              disabled={isResumingTraining || isAbortingTraining}
              intent="secondary"
              onClick={() => setShowAbortForm(true)}
            >
              {isAbortingTraining ? "正在终止训练" : "终止本次训练"}
            </Button>
          </div>

          {showAbortForm ? (
            <Card
              aria-label="终止本次训练确认"
              className="grid gap-4 bg-[var(--surface-panel)]"
              tone="patient"
            >
              <div>
                <h3 className="text-xl font-black text-[var(--ink-strong)]">
                  请确认是否终止本次训练
                </h3>
                <p className="mt-2 font-bold leading-7 text-[var(--ink-soft)]">
                  请输入真实原因。终止后，本次未完成训练不会作为完成记录。
                </p>
              </div>
              <label
                className="grid gap-2 text-sm font-black text-[var(--ink-soft)]"
                htmlFor="patient-training-abort-reason"
              >
                终止原因
                <textarea
                  aria-describedby="patient-training-abort-reason-help"
                  className="min-h-28 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-4 py-3 text-base font-bold leading-7 text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
                  disabled={isAbortingTraining}
                  id="patient-training-abort-reason"
                  onChange={(event) => setAbortReason(event.target.value)}
                  value={abortReason}
                />
              </label>
              <p
                className="text-sm font-bold text-[var(--ink-soft)]"
                id="patient-training-abort-reason-help"
                role="status"
              >
                {abortReason.trim().length > 500
                  ? "终止原因不能超过 500 个字符。"
                  : `已输入 ${abortReason.trim().length}/500 个字符`}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  aria-busy={isAbortingTraining || undefined}
                  disabled={
                    isAbortingTraining ||
                    isResumingTraining ||
                    !isValidAbortReason(abortReason)
                  }
                  intent="danger"
                  onClick={() =>
                    void onAbortTraining(
                      validateTrainingAbortReason(abortReason),
                    )
                  }
                >
                  {isAbortingTraining ? "正在终止训练" : "确认终止本次训练"}
                </Button>
                <Button
                  disabled={isAbortingTraining || isResumingTraining}
                  intent="quiet"
                  onClick={() => {
                    setAbortReason("");
                    setShowAbortForm(false);
                  }}
                >
                  取消
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      ) : (
        <Button
          className="w-full md:w-fit"
          data-testid="patient-next-action"
          disabled={primaryAction.disabled}
          onClick={
            primaryAction.kind === "records"
              ? onViewRecords
              : () => onStartPreparation(nextTask)
          }
        >
          {primaryAction.label}
        </Button>
      )}
    </section>
  );
}

function isValidAbortReason(reason: string) {
  const normalizedReason = reason.trim();
  return normalizedReason.length >= 1 && normalizedReason.length <= 500;
}

function resolvePrimaryAction({
  allComplete,
  hasCurrentPlan,
  nextTask,
}: {
  allComplete: boolean;
  hasCurrentPlan: boolean;
  nextTask?: TrainingTask;
}) {
  if (!hasCurrentPlan) {
    return {
      disabled: true,
      kind: "blocked" as const,
      label: "等待医生下发训练安排",
    };
  }
  if (allComplete) {
    return {
      disabled: false,
      kind: "records" as const,
      label: "查看今日训练记录",
    };
  }
  if (!nextTask) {
    return {
      disabled: true,
      kind: "blocked" as const,
      label: "等待医生下发训练安排",
    };
  }
  return {
    disabled: false,
    kind: "prep" as const,
    label: "开始训练准备",
  };
}
