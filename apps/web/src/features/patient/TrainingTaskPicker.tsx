import { CheckCircle2, ChevronRight, Circle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import type { RehabPlan } from "@/types/api";
import {
  patientTrainingCategoryLabel,
  patientTrainingDifficultyLabel,
  patientTrainingPurposeLabel,
  patientTrainingTagsLabel,
} from "./patient-training-copy";

type TrainingTask = RehabPlan["items"][number];

type TrainingTaskPickerProps = {
  completedPlanItemIds: Set<string>;
  items: TrainingTask[];
  label?: string;
  nextTaskId?: string;
  onSelectPlanItem: (task: TrainingTask) => void;
  onViewRecords: () => void;
  selectedPlanItem?: TrainingTask;
};

export function TrainingTaskPicker({
  completedPlanItemIds,
  items,
  label = "选择训练",
  nextTaskId,
  onSelectPlanItem,
  onViewRecords,
  selectedPlanItem,
}: TrainingTaskPickerProps) {
  if (!items.length) {
    return (
      <Card tone="patient" className="border-dashed p-5">
        <StatusBadge status="pending">等待医生安排</StatusBadge>
        <h3 className="mt-3 text-xl font-black text-[var(--ink-strong)]">选择训练</h3>
        <p className="mt-2 font-bold leading-7 text-[var(--ink-soft)]">
          医生下发训练安排后，这里会显示今天可以选择的项目。
        </p>
      </Card>
    );
  }

  return (
    <section aria-label="选择训练" className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-black text-[var(--ink-strong)]">{label}</h3>
        <span className="text-sm font-black text-[var(--ink-soft)]">
          已完成 {completedPlanItemIds.size}/{items.length}
        </span>
      </div>
      <div className="grid gap-3">
        {items.map((task) => {
          const done = completedPlanItemIds.has(task.id);
          const selected = selectedPlanItem?.id === task.id;
          const next = task.id === nextTaskId;
          const businessCopyInputs = [
            ...task.gameContent.trainingTargets,
            ...task.gameContent.tags,
          ];
          const tags = patientTrainingTagsLabel(businessCopyInputs);
          const category = patientTrainingCategoryLabel(businessCopyInputs);
          const purposes = patientTrainingPurposeLabel(businessCopyInputs);
          const difficulty = patientTrainingDifficultyLabel(task.difficulty);

          return (
            <button
              key={task.id}
              type="button"
              aria-label={
                done ? `查看训练记录：${task.gameContent.name}` : `选择训练：${task.gameContent.name}`
              }
              onClick={() => {
                if (done) {
                  onViewRecords();
                  return;
                }
                onSelectPlanItem(task);
              }}
              className={cn(
                "min-h-20 rounded-[var(--radius-card)] border bg-[var(--surface-panel)] px-4 py-3 text-left shadow-[var(--shadow-panel)] transition hover:border-[var(--accent-strong)] hover:bg-[var(--surface-muted)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-strong)]/20",
                selected
                  ? "border-[var(--accent-strong)] bg-[var(--accent-soft)]"
                  : next
                    ? "border-[var(--line-strong)]"
                    : "border-[var(--line-subtle)]",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 text-[var(--success-strong)]" />
                    ) : (
                      <Circle className="h-5 w-5 text-[var(--accent-strong)]" />
                    )}
                    <span className="min-w-0 break-words text-base font-black text-[var(--ink-strong)]">
                      {task.gameContent.name}
                    </span>
                    <StatusBadge
                      status={done ? "complete" : selected || next ? "ready" : "pending"}
                    >
                      {done ? "查看今日训练记录" : selected ? "本次选择" : next ? "建议先做" : "待选择"}
                    </StatusBadge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
                    <span>{category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{task.durationMinutes} 分钟</span>
                    {difficulty ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{difficulty}</span>
                      </>
                    ) : null}
                  </div>
                  {purposes.length || tags.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {purposes.map((purpose) => (
                        <span
                          key={purpose}
                          className="rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] px-3 py-1 text-xs font-black text-[var(--accent-strong)]"
                        >
                          {purpose}
                        </span>
                      ))}
                      {tags.map((tag) => (
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
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-[var(--accent-strong)]" />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
