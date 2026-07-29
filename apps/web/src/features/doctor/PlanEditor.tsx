"use client";

import { ClipboardCheck, ListChecks, PencilLine } from "lucide-react";
import type { ConfirmPlanRequest, RehabPlan, RehabPlanItem } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { doctorTrainingCategoryLabel } from "./doctor-workbench-model";

export type PlanEditorFormState = {
  dailyDuration: string;
  weekFrequency: string;
  adjustmentReason: string;
  itemAdjustments: Array<{
    gameContentId: string;
    durationMinutes: string;
    frequencyPerWeek: string;
    difficulty: string;
  }>;
};

type PlanEditorProps = {
  plan?: RehabPlan | null;
  form: PlanEditorFormState;
  onChange: <K extends keyof PlanEditorFormState>(
    field: K,
    value: PlanEditorFormState[K],
  ) => void;
  onSubmit: (payload: ConfirmPlanRequest) => void | Promise<void>;
  isBusy?: boolean;
};

export function PlanEditor({
  plan,
  form,
  onChange,
  onSubmit,
  isBusy,
}: PlanEditorProps) {
  const items = plan?.items ?? [];
  const canSubmit = Boolean(plan && isPlanFormComplete(form, items));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan || !canSubmit || isBusy) return;
    void onSubmit(buildPayload(form, items));
  }

  return (
    <Card tone="workbench">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-black text-[var(--accent-strong)]">
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            计划管理
          </div>
          <h3 className="mt-4 text-2xl font-black text-[var(--ink-strong)]">
            医师康复计划确认
          </h3>
          <p className="mt-2 max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
            医师可调整推荐方案的频次、时长、难度和调整原因；缺少计划或调整原因时不能提交确认。
          </p>
        </div>
        <StatusBadge status={plan ? "pending" : "review"}>
          {plan ? planStatusLabel(plan.status) : "未选择计划"}
        </StatusBadge>
      </div>

      <form onSubmit={submit}>
        <fieldset
          disabled={!plan || isBusy}
          className="mt-5 grid gap-x-4 disabled:opacity-60 md:grid-cols-3"
        >
          <NumberField
            label="每日总时长"
            value={form.dailyDuration}
            suffix="分钟"
            onChange={(value) => onChange("dailyDuration", value)}
          />
          <NumberField
            label="每周频次"
            value={form.weekFrequency}
            suffix="次"
            onChange={(value) => onChange("weekFrequency", value)}
          />
          <TextField
            label="调整原因"
            value={form.adjustmentReason}
            onChange={(value) => onChange("adjustmentReason", value)}
          />
        </fieldset>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <section className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4">
            <div className="flex items-center gap-2 text-[var(--accent-strong)]">
              <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
              <h4 className="font-black text-[var(--ink-strong)]">推荐依据</h4>
            </div>
            <p className="mt-3 font-bold leading-7 text-[var(--ink-soft)]">
              {plan?.recommendationReason || "未记录推荐依据"}
            </p>
          </section>

          <section className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4">
            <div className="flex items-center gap-2 text-[var(--accent-strong)]">
              <ListChecks className="h-5 w-5" aria-hidden="true" />
              <h4 className="font-black text-[var(--ink-strong)]">计划摘要</h4>
            </div>
            <dl className="mt-3 grid gap-3 md:grid-cols-3">
              <PlanField
                label="计划名称"
                value={plan?.planName ?? "未选择计划"}
              />
              <PlanField
                label="周频次"
                value={plan ? `${plan.weekFrequency} 次` : "未选择计划"}
              />
              <PlanField
                label="日时长"
                value={plan ? `${plan.dailyDuration} 分钟` : "未选择计划"}
              />
            </dl>
          </section>
        </div>

        <div className="mt-5 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--line-strong)]">
          <div className="min-w-[840px]">
            <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-[var(--line-subtle)] bg-[var(--surface-muted)] p-4 text-xs font-black text-[var(--accent-strong)]">
              <span>训练项目</span>
              <span>时长</span>
              <span>频次</span>
              <span>难度</span>
            </div>
            {items.length ? (
              items.map((item, index) => {
                const adjustment = form.itemAdjustments[index];
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr] items-center gap-3 border-b border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4 last:border-b-0"
                  >
                    <div>
                      <p className="font-black text-[var(--ink-strong)]">
                        {item.gameContent.name}
                      </p>
                      <p className="mt-1 text-xs font-bold text-[var(--ink-subtle)]">
                        {doctorTrainingCategoryLabel([
                          ...item.gameContent.trainingTargets,
                          ...item.gameContent.tags,
                        ])}
                      </p>
                    </div>
                    <NumberInput
                      value={adjustment?.durationMinutes ?? String(item.durationMinutes)}
                      onChange={(value) =>
                        onChange("itemAdjustments", updateItem(form, index, item, {
                          durationMinutes: value,
                        }))
                      }
                    />
                    <NumberInput
                      value={
                        adjustment?.frequencyPerWeek ?? String(item.frequencyPerWeek)
                      }
                      onChange={(value) =>
                        onChange("itemAdjustments", updateItem(form, index, item, {
                          frequencyPerWeek: value,
                        }))
                      }
                    />
                    <input
                      value={adjustment?.difficulty ?? item.difficulty}
                      onChange={(event) =>
                        onChange("itemAdjustments", updateItem(form, index, item, {
                          difficulty: event.target.value,
                        }))
                      }
                      className="min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-3 py-2 font-bold text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
                    />
                  </div>
                );
              })
            ) : (
              <div className="bg-[var(--surface-paper)] p-5 font-bold text-[var(--ink-subtle)]">
                当前计划没有训练项目。
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-muted)] p-5">
          <p className="max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
            提交会使用当前表单生成正式确认请求，不能在缺少调整原因或计划项目参数不完整时提交。
          </p>
          <Button disabled={!canSubmit || isBusy} isLoading={isBusy} type="submit">
            确认计划
          </Button>
        </div>
      </form>
    </Card>
  );
}

function NumberField({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string;
  value: string;
  suffix: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-5 block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <div className="mt-2 flex min-h-14 items-center rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] focus-within:border-[var(--accent-strong)] focus-within:ring-4 focus-within:ring-[var(--accent-strong)]/15">
        <input
          type="number"
          min="1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent px-4 py-4 font-mono text-lg font-bold outline-none"
        />
        <span className="px-4 text-sm font-black text-[var(--ink-subtle)]">{suffix}</span>
      </div>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-5 block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-14 w-full rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-4 py-4 text-lg font-bold outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
      />
    </label>
  );
}

function NumberInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="number"
      min="1"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-3 py-2 font-mono font-bold text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
    />
  );
}

function PlanField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] px-3 py-2">
      <dt className="text-xs font-black text-[var(--ink-subtle)]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-black text-[var(--ink-strong)]">
        {value}
      </dd>
    </div>
  );
}

function updateItem(
  form: PlanEditorFormState,
  index: number,
  item: RehabPlanItem,
  patch: Partial<PlanEditorFormState["itemAdjustments"][number]>,
) {
  const next = [...form.itemAdjustments];
  const existing = next[index];
  next[index] = {
    gameContentId: item.gameContentId,
    durationMinutes:
      patch.durationMinutes ??
      existing?.durationMinutes ??
      String(item.durationMinutes),
    frequencyPerWeek:
      patch.frequencyPerWeek ??
      existing?.frequencyPerWeek ??
      String(item.frequencyPerWeek),
    difficulty: patch.difficulty ?? existing?.difficulty ?? item.difficulty,
  };
  return next;
}

function isPlanFormComplete(form: PlanEditorFormState, items: RehabPlanItem[]) {
  return Boolean(
    positiveInteger(form.dailyDuration) &&
      positiveInteger(form.weekFrequency) &&
      form.adjustmentReason.trim() &&
      items.every((item, index) => {
        const adjustment = form.itemAdjustments[index];
        return (
          positiveInteger(
            adjustment?.durationMinutes ?? String(item.durationMinutes),
          ) &&
          positiveInteger(
            adjustment?.frequencyPerWeek ?? String(item.frequencyPerWeek),
          ) &&
          Boolean((adjustment?.difficulty ?? item.difficulty).trim())
        );
      }),
  );
}

function buildPayload(
  form: PlanEditorFormState,
  items: RehabPlanItem[],
): ConfirmPlanRequest {
  return {
    dailyDuration: Number(form.dailyDuration),
    weekFrequency: Number(form.weekFrequency),
    adjustmentReason: form.adjustmentReason.trim(),
    itemAdjustments: items.map((item, index) => {
      const adjustment = form.itemAdjustments[index];
      return {
        gameContentId: item.gameContentId,
        durationMinutes: Number(
          adjustment?.durationMinutes ?? String(item.durationMinutes),
        ),
        frequencyPerWeek: Number(
          adjustment?.frequencyPerWeek ?? String(item.frequencyPerWeek),
        ),
        difficulty: adjustment?.difficulty ?? item.difficulty,
      };
    }),
  };
}

function positiveInteger(value: string) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0;
}

function planStatusLabel(status: string) {
  if (status === "active") return "当前生效";
  if (status === "pending_confirm") return "待确认";
  if (status === "ended") return "已结束";
  if (status === "paused") return "已暂停";
  if (status === "draft") return "草稿";
  return status;
}
