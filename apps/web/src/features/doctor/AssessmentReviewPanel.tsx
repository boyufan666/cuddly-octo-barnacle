"use client";

import { CheckCircle2, FileSearch, RotateCcw } from "lucide-react";
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
};

type AssessmentReviewPanelProps = {
  scores: AssessmentReviewScore[];
  clinicalSummaries?: ClinicalSummary[];
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
  const summaries = clinicalSummaries?.length
    ? clinicalSummaries
    : defaultClinicalSummaries;
  return (
    <Card tone="workbench" className="mt-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-black text-[var(--accent-strong)]">
            <FileSearch className="h-4 w-4" aria-hidden="true" />
            评估复核
          </div>
          <h3 className="mt-4 text-3xl font-black text-[var(--ink-strong)]">
            医生结构化评估确认
          </h3>
          <p className="mt-3 max-w-4xl font-bold leading-7 text-[var(--ink-soft)]">
            复核 MMSE、CDR、AD-8 分数、评估摘要和医生结论后，再批准正式评估写入。
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
        {summaries.map((summary) => (
          <ClinicalSummaryCard key={summary.title} summary={summary} />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          className="bg-[var(--ink-strong)] hover:bg-[var(--ink-strong)]"
          disabled={isApproveDisabled}
          onClick={onApprove}
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            批准正式评估
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

const defaultClinicalSummaries: ClinicalSummary[] = [
  {
    title: "评估摘要",
    value: "待补齐评估",
    helper: "患者完成结构化评估后可复核",
  },
  {
    title: "风险等级",
    value: "待医生确认",
    helper: "结合量表分数和临床观察确认",
  },
  {
    title: "医生结论",
    value: "待医生确认",
    helper: "批准后才会写入正式评估记录",
  },
];

function ClinicalSummaryCard({ summary }: { summary: ClinicalSummary }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-lg font-black text-[var(--ink-strong)]">{summary.title}</h4>
        <StatusBadge status={summary.value ? "ready" : "pending"}>
          {summary.value ? "已整理" : "待补充"}
        </StatusBadge>
      </div>
      <p className="mt-4 break-words text-base font-black leading-7 text-[var(--ink-strong)]">
        {summary.value || "待补充"}
      </p>
      {summary.helper ? (
        <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-subtle)]">
          {summary.helper}
        </p>
      ) : null}
    </section>
  );
}

function formatScoreValue(value: AssessmentReviewScore["value"]) {
  if (value === null || value === undefined || value === "") {
    return "待确认";
  }
  return String(value);
}
