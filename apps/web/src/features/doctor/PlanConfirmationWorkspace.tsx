"use client";

import { ClipboardCheck, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { GovernanceLayout } from "@/components/layout/GovernanceLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ConfirmPlanRequest, PatientProfile, RehabPlan } from "@/types/api";
import {
  buildPlanPrerequisiteState,
  planPrerequisiteLabels,
  resolveConfirmedCurrentPlan,
  resolveCurrentRisk,
  resolvePendingPlan,
  riskLabel,
  summarizeTrainingContentReadiness,
  type StatusTone,
} from "@/features/patient/plan-suggestion-model";

type PlanConfirmationWorkspaceProps = {
  isBusy: boolean;
  onConfirmPlan: (
    plan: RehabPlan,
    payload: ConfirmPlanRequest,
  ) => Promise<void>;
  patient?: PatientProfile;
};

export function PlanConfirmationWorkspace({
  isBusy,
  onConfirmPlan,
  patient,
}: PlanConfirmationWorkspaceProps) {
  const pending = resolvePendingPlan(patient);
  const activePlan = resolveConfirmedCurrentPlan(patient);
  const plan = pending ?? activePlan;
  const risk = resolveCurrentRisk(patient);
  const prerequisiteState = buildPlanPrerequisiteState(patient, pending);
  const trainingState = summarizeTrainingContentReadiness(plan);

  return (
    <GovernanceLayout title="康复计划确认与人工调整" role="医师工作台">
      <Card className="md:col-span-2">
        <h3 className="text-2xl font-black">系统推荐方案</h3>
        <StatusList
          items={[
            ["认知评级", riskLabel(risk?.riskLevel), "warning"],
            ["每日时长", plan ? `${plan.dailyDuration} 分钟` : "暂无方案", "info"],
            ["每周频次", plan ? `${plan.weekFrequency} 天` : "暂无方案", "info"],
            [
              "方案状态",
              pending ? "待医师确认" : plan ? statusLabel(plan.status) : "等待生成",
              pending ? "warning" : plan ? "success" : "info",
            ],
          ]}
        />
      </Card>
      <Card className="md:col-span-2">
        <InlineBadge label="确认闭环" icon={ShieldCheck} />
        <h3 className="mt-4 text-2xl font-black">方案确认前置状态</h3>
        <StatusList
          items={[
            ...prerequisiteState.items,
            [
              planPrerequisiteLabels.releasedTraining,
              trainingState.label,
              trainingState.tone,
            ],
          ]}
        />
        <p className="mt-4 font-bold leading-7 text-[var(--ink-soft)]">
          {trainingState.description}
        </p>
      </Card>
      {!plan && (
        <Card className="md:col-span-2">
          <InlineBadge label="待生成方案" icon={ClipboardCheck} />
          <h3 className="mt-4 text-2xl font-black">暂无可调整康复方案</h3>
          <p className="mt-3 font-bold leading-7 text-[var(--ink-soft)]">
            请先让患者完成结构化评估，并生成康复方案建议；系统返回待确认方案后，医师才能调整并下发。
          </p>
        </Card>
      )}
      <PlanConfirmationForm
        key={plan?.id ?? "empty-plan"}
        plan={plan}
        pending={pending}
        isBusy={isBusy}
        onConfirmPlan={onConfirmPlan}
      />
      <Card className="md:col-span-3">
        <h3 className="text-2xl font-black">训练项目安排</h3>
        <PlanRows plan={plan} />
      </Card>
    </GovernanceLayout>
  );
}

function PlanConfirmationForm({
  plan,
  pending,
  isBusy,
  onConfirmPlan,
}: {
  plan?: RehabPlan;
  pending?: RehabPlan;
  isBusy: boolean;
  onConfirmPlan: (
    plan: RehabPlan,
    payload: ConfirmPlanRequest,
  ) => Promise<void>;
}) {
  const [dailyDuration, setDailyDuration] = useState(
    plan ? String(plan.dailyDuration) : "",
  );
  const [weekFrequency, setWeekFrequency] = useState(
    plan ? String(plan.weekFrequency) : "",
  );
  const [adjustmentReason, setAdjustmentReason] = useState("");

  const parsedDailyDuration = readNumber(dailyDuration, 0);
  const parsedWeekFrequency = readNumber(weekFrequency, 0);
  const canConfirm =
    Boolean(pending) &&
    parsedDailyDuration > 0 &&
    parsedWeekFrequency > 0 &&
    adjustmentReason.trim().length >= 6;

  function submitConfirm() {
    if (!pending || !canConfirm) return;
    void onConfirmPlan(pending, {
      dailyDuration: parsedDailyDuration,
      weekFrequency: parsedWeekFrequency,
      adjustmentReason: adjustmentReason.trim(),
      itemAdjustments: pending.items.map((item) => ({
        gameContentId: item.gameContentId,
        durationMinutes: item.durationMinutes,
        frequencyPerWeek: item.frequencyPerWeek,
        difficulty: item.difficulty,
      })),
    });
  }

  return (
    <Card className="md:col-span-2">
      <h3 className="text-2xl font-black">医师调整</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <PlanNumberInput
          label="每日训练时长"
          value={dailyDuration}
          suffix="分钟"
          disabled={!pending}
          onChange={setDailyDuration}
        />
        <PlanNumberInput
          label="每周训练频次"
          value={weekFrequency}
          suffix="天"
          disabled={!pending}
          onChange={setWeekFrequency}
        />
        <ReadonlyFormBlock
          label="推荐来源"
          value={pending ? "系统候选方案待确认" : plan ? "当前生效方案" : "暂无方案"}
        />
        <ReadonlyFormBlock
          label="方案生成时间"
          value={formatDateTime(plan?.createdAt)}
        />
      </div>
      <div className="mt-4">
        <label
          htmlFor="plan-adjustment-reason"
          className="text-sm font-black text-[var(--ink-soft)]"
        >
          调整原因
        </label>
        <textarea
          id="plan-adjustment-reason"
          value={adjustmentReason}
          disabled={!pending}
          placeholder={
            pending
              ? "请填写确认或调整该方案的临床依据。"
              : "当前没有待确认方案。"
          }
          onChange={(event) => setAdjustmentReason(event.target.value)}
          className="mt-2 min-h-28 w-full rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-4 py-4 text-base font-bold leading-7 text-[var(--ink-strong)] outline-none transition disabled:bg-[var(--surface-muted)] disabled:text-[var(--ink-subtle)] focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
        />
        <p className="mt-2 text-sm font-bold text-[var(--ink-subtle)]">
          确认后会结束旧当前方案，并将该方案设为患者端新的当前生效方案。
        </p>
      </div>
      <Button
        className="mt-5 w-full"
        disabled={!canConfirm || isBusy}
        onClick={submitConfirm}
      >
        {isBusy
          ? "正在确认下发"
          : pending
            ? "确认并下发康复方案"
            : "暂无待确认方案"}
      </Button>
    </Card>
  );
}

function InlineBadge({
  label,
  icon: Icon,
}: {
  label: string;
  icon: typeof ShieldCheck;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-black text-[var(--accent-strong)]">
      <Icon className="h-4 w-4" />
      {label}
    </div>
  );
}

function ReadonlyFormBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] p-5">
      <p className="text-sm font-black text-[var(--ink-subtle)]">{label}</p>
      <p className="mt-3 text-2xl font-black">{value}</p>
    </div>
  );
}

function PlanNumberInput({
  label,
  value,
  suffix,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  suffix: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] p-5">
      <label
        htmlFor={`${label}-value`}
        className="text-sm font-black text-[var(--ink-subtle)]"
      >
        {label}
      </label>
      <div className="mt-3 flex items-center gap-3">
        <input
          id={`${label}-value`}
          type="number"
          min="1"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-12 w-full rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-4 text-2xl font-black text-[var(--ink-strong)] outline-none transition disabled:bg-[var(--surface-muted)] disabled:text-[var(--ink-subtle)] focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
        />
        <span className="font-black text-[var(--ink-soft)]">{suffix}</span>
      </div>
    </div>
  );
}

function StatusList({
  items,
}: {
  items: Array<[string, string, StatusTone]>;
}) {
  return (
    <div className="mt-4 grid gap-3">
      {items.map(([label, value, tone], index) => (
        <div
          key={`${label}-${value}-${index}`}
          className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] p-4"
        >
          <span className="font-black">{label}</span>
          <StatusBadge status={toneToStatus(tone)}>{value}</StatusBadge>
        </div>
      ))}
    </div>
  );
}

function PlanRows({ plan }: { plan?: RehabPlan }) {
  const rows = plan?.items?.length
    ? plan.items.map((item) => [
        item.gameContent.name,
        `每周 ${item.frequencyPerWeek} 次 · ${item.durationMinutes} 分钟 · ${item.difficulty}`,
      ])
    : [];

  if (!rows.length) {
    return (
      <div className="mt-4 rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-paper)] p-5 font-bold text-[var(--ink-subtle)]">
        暂无康复计划数据，生成并确认方案后展示训练项目。
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-strong)]">
      {rows.map(([name, value]) => (
        <div
          key={name}
          className="flex items-center justify-between gap-4 border-b border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4 last:border-b-0"
        >
          <span className="min-w-0 break-words font-black text-[var(--accent-strong)]">{name}</span>
          <span className="min-w-0 break-words text-right font-bold text-[var(--ink-soft)]">{value}</span>
        </div>
      ))}
    </div>
  );
}

function toneToStatus(tone: StatusTone) {
  if (tone === "success") return "complete";
  if (tone === "warning") return "pending";
  if (tone === "danger") return "blocked";
  return "ready";
}

function readNumber(value: unknown, defaultValue: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : defaultValue;
}

function statusLabel(value?: string) {
  if (value === "active") return "当前生效";
  if (value === "pending_confirm") return "待医师确认";
  if (value === "ended") return "已结束";
  if (value === "paused") return "已暂停";
  if (value === "draft") return "草稿";
  if (value === "started") return "已创建";
  if (value === "in_progress") return "训练中";
  if (value === "completed") return "已完成";
  if (value === "interrupted") return "已中断";
  if (value === "upload_failed") return "上传失败";
  return value ?? "等待生成";
}

function formatDateTime(value?: string) {
  if (!value) return "待生成";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
