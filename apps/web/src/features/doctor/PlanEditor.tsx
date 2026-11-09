"use client";

import {
  AlertTriangle,
  ClipboardCheck,
  ListChecks,
  PencilLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ConfirmPlanRequest, RehabPlan, RehabPlanItem } from "@/types/api";
import {
  doctorTrainingCategoryLabel,
  type DoctorPlanRecommendationState,
} from "./doctor-workbench-model";

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
  recommendationState: DoctorPlanRecommendationState;
  recommendationError: string | null;
  onChange: <K extends keyof PlanEditorFormState>(
    field: K,
    value: PlanEditorFormState[K],
  ) => void;
  onRecommend: () => void | Promise<void>;
  onSubmit: (payload: ConfirmPlanRequest) => void | Promise<void>;
  isBusy: boolean;
  isRecommending: boolean;
};

export function PlanEditor({
  plan,
  form,
  recommendationState,
  recommendationError,
  onChange,
  onRecommend,
  onSubmit,
  isBusy,
  isRecommending,
}: PlanEditorProps) {
  const items = plan ? plan.items : [];
  const isPendingPlan = Boolean(
    plan && plan.status === "pending_confirm" && !plan.isCurrent,
  );
  const canSubmit = Boolean(
    plan &&
      isPendingPlan &&
      plan.recommendationReason.trim() &&
      isPlanEditorFormComplete(form, items),
  );

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan || !canSubmit || isBusy) return;
    void onSubmit(buildPlanEditorConfirmationPayload(form, items));
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
            医师生成、调整并下发康复方案
          </h3>
          <p className="mt-2 max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
            正式评估与风险均由医师确认后，才可生成待确认推荐方案；医师可继续调整每日时长、频次和每个游戏项目参数。
          </p>
        </div>
        <StatusBadge
          status={
            plan
              ? isPendingPlan
                ? "pending"
                : "blocked"
              : recommendationState.canRecommend
                ? "ready"
                : "blocked"
          }
        >
          {plan
            ? planStatusLabel(plan.status)
            : recommendationState.canRecommend
              ? "可生成推荐方案"
              : "生成条件未满足"}
        </StatusBadge>
      </div>

      <RecommendationReadiness state={recommendationState} />

      {recommendationError ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-4 text-[var(--danger)]"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="font-bold leading-7">{recommendationError}</p>
        </div>
      ) : null}

      {!plan ? (
        <PlanGenerationGate
          state={recommendationState}
          isRecommending={isRecommending}
          onRecommend={onRecommend}
        />
      ) : (
        <form onSubmit={submit}>
          {!isPendingPlan ? (
            <div className="mt-5 flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-4 text-[var(--danger)]">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="font-bold leading-7">
                当前方案不是待医师确认状态，已阻止编辑与下发。
              </p>
            </div>
          ) : null}

          <fieldset disabled={!isPendingPlan || isBusy} className="disabled:opacity-60">
            <div className="mt-5 grid gap-x-4 md:grid-cols-3">
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
                label="确认或调整依据"
                value={form.adjustmentReason}
                onChange={(value) => onChange("adjustmentReason", value)}
              />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <section className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4">
                <div className="flex items-center gap-2 text-[var(--accent-strong)]">
                  <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
                  <h4 className="font-black text-[var(--ink-strong)]">推荐依据</h4>
                </div>
                <p className="mt-3 font-bold leading-7 text-[var(--ink-soft)]">
                  {plan.recommendationReason.trim()
                    ? plan.recommendationReason
                    : "推荐方案缺少推荐依据，已阻止确认下发。"}
                </p>
              </section>

              <section className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4">
                <div className="flex items-center gap-2 text-[var(--accent-strong)]">
                  <ListChecks className="h-5 w-5" aria-hidden="true" />
                  <h4 className="font-black text-[var(--ink-strong)]">待确认方案摘要</h4>
                </div>
                <dl className="mt-3 grid gap-3 md:grid-cols-3">
                  <PlanField label="计划名称" value={plan.planName} />
                  <PlanField label="推荐周频次" value={`${plan.weekFrequency} 次`} />
                  <PlanField label="推荐日时长" value={`${plan.dailyDuration} 分钟`} />
                </dl>
              </section>
            </div>

            <div className="mt-5 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--line-strong)]">
              <div className="min-w-[840px]">
                <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-[var(--line-subtle)] bg-[var(--surface-muted)] p-4 text-xs font-black text-[var(--accent-strong)]">
                  <span>训练项目</span>
                  <span>单次时长（分钟）</span>
                  <span>每周频次（次）</span>
                  <span>难度参数</span>
                </div>
                {items.length ? (
                  items.map((item) => {
                    const adjustment = findItemAdjustment(form, item.gameContentId);
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
                          {!adjustment ? (
                            <p className="mt-2 text-xs font-black text-[var(--danger)]">
                              项目参数缺失，不能确认下发
                            </p>
                          ) : null}
                        </div>
                        <NumberInput
                          value={adjustment ? adjustment.durationMinutes : ""}
                          onChange={(value) =>
                            onChange(
                              "itemAdjustments",
                              updateItem(form, item.gameContentId, {
                                durationMinutes: value,
                              }),
                            )
                          }
                        />
                        <NumberInput
                          value={adjustment ? adjustment.frequencyPerWeek : ""}
                          onChange={(value) =>
                            onChange(
                              "itemAdjustments",
                              updateItem(form, item.gameContentId, {
                                frequencyPerWeek: value,
                              }),
                            )
                          }
                        />
                        <input
                          aria-label={`${item.gameContent.name}难度参数`}
                          value={adjustment ? adjustment.difficulty : ""}
                          onChange={(event) =>
                            onChange(
                              "itemAdjustments",
                              updateItem(form, item.gameContentId, {
                                difficulty: event.target.value,
                              }),
                            )
                          }
                          className="min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-3 py-2 font-bold text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
                        />
                      </div>
                    );
                  })
                ) : (
                  <div className="bg-[var(--surface-paper)] p-5 font-bold text-[var(--danger)]">
                    推荐方案没有训练项目，不能确认下发。
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-muted)] p-5">
              <p className="max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
                确认后，该待确认方案将成为患者端新的当前生效方案；每日时长、频次、游戏参数和临床依据必须完整填写。
              </p>
              <Button disabled={!canSubmit || isBusy} isLoading={isBusy} type="submit">
                确认并下发方案
              </Button>
            </div>
          </fieldset>
        </form>
      )}
    </Card>
  );
}

function RecommendationReadiness({ state }: { state: DoctorPlanRecommendationState }) {
  return (
    <div className="mt-5 grid gap-3 md:grid-cols-2">
      <PrerequisiteStatus
        icon={ClipboardCheck}
        label="正式评估"
        value={state.assessmentStatusLabel}
        confirmed={state.assessmentConfirmed}
      />
      <PrerequisiteStatus
        icon={ShieldCheck}
        label="风险确认"
        value={state.riskStatusLabel}
        confirmed={state.riskConfirmed}
      />
    </div>
  );
}

function PrerequisiteStatus({
  icon: Icon,
  label,
  value,
  confirmed,
}: {
  icon: typeof ClipboardCheck;
  label: string;
  value: string;
  confirmed: boolean;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[var(--accent-strong)]">
          <Icon className="h-5 w-5" aria-hidden="true" />
          <h4 className="font-black text-[var(--ink-strong)]">{label}</h4>
        </div>
        <StatusBadge status={confirmed ? "complete" : "blocked"}>
          {confirmed ? "已确认" : "未满足"}
        </StatusBadge>
      </div>
      <p className="mt-3 font-bold leading-7 text-[var(--ink-soft)]">{value}</p>
    </section>
  );
}

function PlanGenerationGate({
  state,
  isRecommending,
  onRecommend,
}: {
  state: DoctorPlanRecommendationState;
  isRecommending: boolean;
  onRecommend: () => void | Promise<void>;
}) {
  return (
    <section className="mt-5 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-muted)] p-5">
      <div className="flex items-start gap-3">
        <Sparkles
          className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-strong)]"
          aria-hidden="true"
        />
        <div>
          <h4 className="text-lg font-black text-[var(--ink-strong)]">
            生成待医师确认推荐方案
          </h4>
          <p className="mt-2 font-bold leading-7 text-[var(--ink-soft)]">
            系统只生成候选方案，不会自动下发；生成后仍需医师逐项调整并确认。
          </p>
        </div>
      </div>

      {state.blockers.length ? (
        <ul className="mt-4 grid gap-2 text-sm font-bold text-[var(--danger)]">
          {state.blockers.map((blocker) => (
            <li key={blocker} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{blocker}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 font-bold text-[var(--success)]">
          正式评估与风险确认均已满足，可以生成推荐方案。
        </p>
      )}

      <Button
        className="mt-5"
        disabled={!state.canRecommend || isRecommending}
        isLoading={isRecommending}
        onClick={() => void onRecommend()}
      >
        生成待确认推荐方案
      </Button>
    </section>
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
          step="1"
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
        placeholder="填写确认或调整该方案的临床依据"
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
      step="1"
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

function findItemAdjustment(
  form: PlanEditorFormState,
  gameContentId: string,
) {
  return form.itemAdjustments.find(
    (adjustment) => adjustment.gameContentId === gameContentId,
  );
}

function updateItem(
  form: PlanEditorFormState,
  gameContentId: string,
  patch: Partial<PlanEditorFormState["itemAdjustments"][number]>,
) {
  return form.itemAdjustments.map((adjustment) =>
    adjustment.gameContentId === gameContentId
      ? { ...adjustment, ...patch, gameContentId }
      : adjustment,
  );
}

export function isPlanEditorFormComplete(
  form: PlanEditorFormState,
  items: RehabPlanItem[],
) {
  if (
    !positiveInteger(form.dailyDuration) ||
    !positiveInteger(form.weekFrequency) ||
    !form.adjustmentReason.trim() ||
    !items.length ||
    form.itemAdjustments.length !== items.length
  ) {
    return false;
  }

  return items.every((item) => {
    const adjustment = findItemAdjustment(form, item.gameContentId);
    return Boolean(
      adjustment &&
        positiveInteger(adjustment.durationMinutes) &&
        positiveInteger(adjustment.frequencyPerWeek) &&
        adjustment.difficulty.trim(),
    );
  });
}

export function buildPlanEditorConfirmationPayload(
  form: PlanEditorFormState,
  items: RehabPlanItem[],
): ConfirmPlanRequest {
  if (!isPlanEditorFormComplete(form, items)) {
    throw new Error("康复方案参数不完整，不能确认下发。");
  }

  return {
    dailyDuration: Number(form.dailyDuration),
    weekFrequency: Number(form.weekFrequency),
    adjustmentReason: form.adjustmentReason.trim(),
    itemAdjustments: items.map((item) => {
      const adjustment = findItemAdjustment(form, item.gameContentId);
      if (!adjustment) {
        throw new Error(`${item.gameContent.name}项目参数缺失，不能确认下发。`);
      }
      return {
        gameContentId: adjustment.gameContentId,
        durationMinutes: Number(adjustment.durationMinutes),
        frequencyPerWeek: Number(adjustment.frequencyPerWeek),
        difficulty: adjustment.difficulty.trim(),
      };
    }),
  };
}

function positiveInteger(value: string) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0;
}

function planStatusLabel(status: string) {
  if (status === "active") return "当前生效，不可编辑";
  if (status === "pending_confirm") return "待医师确认";
  if (status === "ended") return "已结束";
  if (status === "paused") return "已暂停";
  if (status === "draft") return "草稿，不可下发";
  return status;
}
