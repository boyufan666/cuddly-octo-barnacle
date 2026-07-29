"use client";

import { Brain, ClipboardCheck, FileText, Radar, Sparkles, WandSparkles } from "lucide-react";
import { WorkbenchLayout } from "@/components/layout/WorkbenchLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MetricTile } from "@/components/ui/MetricTile";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { PatientProfile, RehabPlan } from "@/types/api";
import {
  buildPlanPrerequisiteState,
  clinicalScoreLabel,
  planPrerequisiteLabels,
  resolveConfirmedCurrentPlan,
  resolveCurrentRisk,
  riskLabel,
  summarizeTrainingContentReadiness,
  type PlanPrerequisiteState,
  type StatusTone,
} from "./plan-suggestion-model";

type PlanSuggestionPageProps = {
  patient?: PatientProfile;
  pendingPlan?: RehabPlan | null;
  onRecommendPlan: () => Promise<void>;
  isBusy: boolean;
};

export function PlanSuggestionPage({
  patient,
  pendingPlan,
  onRecommendPlan,
  isBusy,
}: PlanSuggestionPageProps) {
  const risk = resolveCurrentRisk(patient);
  const assessment = patient?.assessments?.[0];
  const scoreSummary = assessment?.scoreSummary ?? {};
  const aiAnalysis = assessment?.aiAnalyses?.[0];
  const displayPlan = pendingPlan ?? resolveConfirmedCurrentPlan(patient);
  const readiness = buildPlanPrerequisiteState(patient, pendingPlan);
  const currentTrainingState = summarizeTrainingContentReadiness(displayPlan);

  return (
    <WorkbenchLayout
      aside={
        <PlanRecommendation
          plan={displayPlan}
          pendingPlan={pendingPlan}
          onRecommendPlan={onRecommendPlan}
          isBusy={isBusy}
          readiness={readiness}
        />
      }
      eyebrow="康复计划"
      subtitle="系统根据评估结果、训练目标和内容标签形成待确认方案，医师确认后下发给患者。"
      title="康复方案建议"
    >
      <Card>
        <SectionLabel
          label={aiAnalysis ? "评估摘要已生成" : "评估摘要待生成"}
          icon={Sparkles}
        />
        <h3 className="mt-4 text-3xl font-black text-[var(--danger-strong)]">
          当前认知评级：{riskLabel(risk?.riskLevel)}
        </h3>
        <p className="mt-3 text-base font-bold leading-7 text-[var(--ink-soft)]">
          {risk?.reasonSummary ?? "等待评估记录生成风险说明。"}
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <MetricTile
            value={clinicalScoreLabel(scoreSummary.mmse)}
            label="MMSE"
            icon={Brain}
          />
          <MetricTile
            value={clinicalScoreLabel(scoreSummary.cdr)}
            label="CDR"
            icon={FileText}
          />
          <MetricTile
            value={aiAnalysis ? "已生成" : "待生成"}
            label="评估建议"
            icon={Radar}
          />
        </div>
        <CapabilityBars scoreSummary={scoreSummary} />
      </Card>

      <Card className="mt-5">
        <SectionLabel label="生成前置条件" icon={ClipboardCheck} />
        <h3 className="mt-4 text-2xl font-black text-[var(--ink-strong)]">
          方案生成条件
        </h3>
        <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
          系统只在关键条件齐备后触发推荐方案生成；缺失项会指向下一步处理，不使用空值或默认值替代。
        </p>
        <StatusList items={readiness.items} />
        <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-black text-[var(--ink-strong)]">
              {planPrerequisiteLabels.releasedTraining}
            </span>
            <ToneBadge tone={currentTrainingState.tone}>
              {currentTrainingState.label}
            </ToneBadge>
          </div>
          <p className="mt-3 text-sm font-bold leading-6 text-[var(--ink-soft)]">
            {currentTrainingState.description}
          </p>
        </div>
      </Card>
    </WorkbenchLayout>
  );
}

function PlanRecommendation({
  plan,
  pendingPlan,
  onRecommendPlan,
  isBusy,
  readiness,
}: {
  plan?: RehabPlan | null;
  pendingPlan?: RehabPlan | null;
  onRecommendPlan: () => Promise<void>;
  isBusy: boolean;
  readiness: PlanPrerequisiteState;
}) {
  const blockingMessages = readiness.items
    .filter(([, , tone]) => tone === "warning" || tone === "danger")
    .map(([label, value]) => `${label}：${value}`);

  return (
    <Card>
      <SectionLabel label="训练项目建议" icon={WandSparkles} />
      <div className="mt-4 flex flex-wrap gap-2">
        <ToneBadge tone={pendingPlan ? "warning" : plan ? "success" : "muted"}>
          {pendingPlan
            ? "待医师确认"
            : plan
              ? plan.status === "active"
                ? "当前生效方案"
                : plan.status
              : "等待生成"}
        </ToneBadge>
        {plan?.recommendationReason ? (
          <ToneBadge tone="info">推荐依据已生成</ToneBadge>
        ) : null}
      </div>
      <div className="mt-5 grid gap-3">
        {plan?.items?.length ? (
          plan.items.map((item, index) => (
            <div
              key={item.id}
              className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] p-5"
            >
              <ToneBadge tone="info">项目 {index + 1}</ToneBadge>
              <h4 className="mt-3 text-xl font-black text-[var(--ink-strong)]">
                {item.gameContent.name}
              </h4>
              <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
                每次 {item.durationMinutes} 分钟，每周 {item.frequencyPerWeek} 次，
                难度 {item.difficulty}
              </p>
            </div>
          ))
        ) : (
          <p className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] p-5 text-sm font-bold leading-6 text-[var(--ink-soft)]">
            暂无待确认方案，请先完成结构化评估并生成康复方案建议。
          </p>
        )}
      </div>
      <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-muted)] p-5">
        <h4 className="font-black text-[var(--ink-strong)]">方案建议前置状态</h4>
        <StatusList items={readiness.items} />
        {!readiness.canRecommend ? (
          <p className="mt-4 text-sm font-bold leading-6 text-[var(--danger-strong)]">
            暂不能生成方案建议：{blockingMessages.join("；")}。
          </p>
        ) : null}
      </div>
      {plan?.recommendationReason ? (
        <p className="mt-4 rounded-[var(--radius-card)] bg-[var(--surface-muted)] p-4 text-sm font-bold leading-6 text-[var(--ink-soft)]">
          {plan.recommendationReason}
        </p>
      ) : null}
      <Button
        className="mt-5 w-full"
        disabled={!readiness.canRecommend || isBusy}
        onClick={() => void onRecommendPlan()}
      >
        {isBusy
          ? "正在生成方案"
          : readiness.canRecommend
            ? "生成待确认方案"
            : "前置条件未满足"}
      </Button>
    </Card>
  );
}

function CapabilityBars({ scoreSummary }: { scoreSummary: Record<string, unknown> }) {
  const rows = [
    ["记忆力", readOptionalPercent(scoreSummary.memory)],
    ["定向力", readOptionalPercent(scoreSummary.orientation)],
    ["执行力", readOptionalPercent(scoreSummary.executive)],
    ["语言表达", readOptionalPercent(scoreSummary.language)],
  ] as const;

  return (
    <div className="mt-6 grid gap-4">
      {rows.map(([label, value]) => (
        <div key={label}>
          <div className="mb-2 flex justify-between text-sm font-black text-[var(--ink-strong)]">
            <span>{label}</span>
            <span>{typeof value === "number" ? `${value}%` : "待评估"}</span>
          </div>
          {typeof value === "number" ? (
            <ProgressBar value={value} />
          ) : (
            <div className="h-4 rounded-[var(--radius-control)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-paper)]" />
          )}
        </div>
      ))}
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
          <ToneBadge tone={tone}>{value}</ToneBadge>
        </div>
      ))}
    </div>
  );
}

function ToneBadge({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: StatusTone;
}) {
  return (
    <StatusBadge
      status={
        tone === "success"
          ? "complete"
          : tone === "warning"
            ? "pending"
            : tone === "danger"
              ? "blocked"
              : tone === "muted"
                ? "review"
                : "ready"
      }
    >
      {children}
    </StatusBadge>
  );
}

function SectionLabel({
  icon: Icon,
  label,
}: {
  icon: typeof Sparkles;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-black text-[var(--accent-strong)]">
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-4 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-paper)] p-1">
      <div
        className="h-full rounded-[var(--radius-control)] bg-[var(--surface-muted)]"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function readOptionalPercent(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.min(100, Math.max(0, Math.round(numberValue)));
}
