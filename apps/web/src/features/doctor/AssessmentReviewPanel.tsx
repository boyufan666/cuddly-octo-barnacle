"use client";

import { CheckCircle2, FileSearch, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

type AssessmentReviewScore = {
  label: "MMSE" | "CDR" | "AD-8";
  value?: string | number | null;
  helper?: string;
};

type ClinicalSummary = {
  title: "评估摘要" | "风险等级" | "医生结论";
  value: string;
  helper?: string;
  status: "ready" | "pending" | "blocked" | "complete" | "review";
};

type AssessmentReviewPanelProps = {
  scores: AssessmentReviewScore[];
  clinicalSummaries: ClinicalSummary[];
  reviewStatusLabel: string;
  onApprove?: () => void;
  onReturn?: () => void;
  isApproveDisabled?: boolean;
  isReturnDisabled?: boolean;
};

export function AssessmentReviewPanel({
  scores,
  clinicalSummaries,
  reviewStatusLabel,
  onApprove,
  onReturn,
  isApproveDisabled,
  isReturnDisabled,
}: AssessmentReviewPanelProps) {
  return (
    <Card tone="workbench" className="mt-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-black text-[var(--accent-strong)]">
            <FileSearch className="h-4 w-4" aria-hidden="true" />
            评估复核
          </div>
          <h3 className="mt-4 text-3xl font-black text-[var(--ink-strong)]">
            医师正式评估确认
          </h3>
          <p className="mt-3 max-w-4xl font-bold leading-7 text-[var(--ink-soft)]">
            复核 MMSE、CDR、AD-8 分数、评估摘要和风险证据后，由医师决定是否确认正式评估。
          </p>
        </div>
        <StatusBadge status="review">{reviewStatusLabel}</StatusBadge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {scores.map((score) => (
          <div
            key={score.label}
            className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] p-4"
          >
            <p className="text-sm font-black text-[var(--accent-strong)]">{score.label}</p>
            <p className="mt-2 text-3xl font-black text-[var(--ink-strong)]">
              {formatScoreValue(score.value)}
            </p>
            {score.helper ? (
              <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-subtle)]">
                {score.helper}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {clinicalSummaries.map((summary) => (
          <ClinicalSummaryCard key={summary.title} summary={summary} />
        ))}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 text-[var(--ink-strong)]">
        <ShieldCheck
          className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning)]"
          aria-hidden="true"
        />
        <p className="font-bold leading-7">
          AI 评估、语音材料和系统风险建议只作为医师复核依据，不会自动写成正式评估。只有医师确认后，才可进入康复方案生成。
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          className="bg-[var(--ink-strong)] hover:bg-[var(--ink-strong)]"
          disabled={isApproveDisabled}
          onClick={onApprove}
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            由医师确认正式评估
          </span>
        </Button>
        <Button
          disabled={isReturnDisabled}
          intent="secondary"
          onClick={onReturn}
        >
          <span className="inline-flex items-center gap-2">
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
            退回复核
          </span>
        </Button>
      </div>
    </Card>
  );
}

function ClinicalSummaryCard({ summary }: { summary: ClinicalSummary }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-lg font-black text-[var(--ink-strong)]">{summary.title}</h4>
        <StatusBadge status={summary.status}>
          {clinicalSummaryStatusLabel(summary.status)}
        </StatusBadge>
      </div>
      <p className="mt-4 break-words text-base font-black leading-7 text-[var(--ink-strong)]">
        {summary.value}
      </p>
      {summary.helper ? (
        <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-subtle)]">
          {summary.helper}
        </p>
      ) : null}
    </section>
  );
}

function clinicalSummaryStatusLabel(status: ClinicalSummary["status"]) {
  if (status === "complete") return "已确认";
  if (status === "ready") return "已整理";
  if (status === "pending") return "待确认";
  if (status === "blocked") return "未就绪";
  return "复核中";
}

function formatScoreValue(value: AssessmentReviewScore["value"]) {
  if (value === null || value === undefined || value === "") {
    return "待确认";
  }
  return String(value);
}
