"use client";

import { AlertTriangle, Brain, ShieldCheck, UserRound } from "lucide-react";
import type { AssessmentRecord, PatientProfile, RiskGrade } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MetricTile } from "@/components/ui/MetricTile";
import { StatusBadge } from "@/components/ui/StatusBadge";

type PatientClinicalSummaryProps = {
  patient?: PatientProfile | null;
  onConfirmRisk?: (risk: RiskGrade) => void | Promise<void>;
  isConfirmRiskDisabled?: boolean;
};

export function PatientClinicalSummary({
  patient,
  onConfirmRisk,
  isConfirmRiskDisabled,
}: PatientClinicalSummaryProps) {
  const assessment = patient?.assessments?.[0];
  const risk = assessment
    ? currentAssessmentRisk(assessment)
    : patient
      ? currentRisk(patient)
      : undefined;
  const canConfirmRisk =
    Boolean(assessment && risk && hasRiskEvidence(risk) && onConfirmRisk) &&
    !isConfirmRiskDisabled;

  return (
    <Card tone="workbench">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-black text-[var(--accent-strong)]">
            <UserRound className="h-4 w-4" aria-hidden="true" />
            患者摘要
          </div>
          <h3 className="mt-4 text-2xl font-black text-[var(--ink-strong)]">
            {patient ? `${patient.name} · 临床摘要` : "请选择患者"}
          </h3>
          <p className="mt-2 max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
            汇总最近评估、当前风险和医师确认状态，供计划调整与训练复核使用。
          </p>
        </div>
        <StatusBadge status={risk ? riskStatus(risk.riskLevel) : "review"}>
          {riskLabel(risk?.riskLevel)}
        </StatusBadge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <MetricTile
          label="年龄"
          value={patient ? `${patient.age}岁` : "未选择"}
          icon={UserRound}
        />
        <MetricTile
          label="MMSE"
          value={scoreValue(assessment, "mmse")}
          icon={Brain}
        />
        <MetricTile label="CDR" value={scoreValue(assessment, "cdr")} icon={Brain} />
        <MetricTile
          label="评估时间"
          value={formatDateTime(assessment?.completedAt ?? assessment?.createdAt)}
          icon={ShieldCheck}
        />
      </div>

      <section className="mt-5 rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--warning-soft)] px-3 py-2 text-sm font-black text-[var(--warning-strong)]">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              风险确认
            </div>
            <h4 className="mt-3 text-xl font-black text-[var(--ink-strong)]">
              医师风险确认
            </h4>
            <p className="mt-2 max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
              需要当前风险等级、系统评级和原因摘要齐全后，才允许确认风险结论。
            </p>
          </div>
          <StatusBadge status={risk && hasRiskEvidence(risk) ? "ready" : "pending"}>
            {risk && hasRiskEvidence(risk) ? "证据完整" : "待补充证据"}
          </StatusBadge>
        </div>

        <dl className="mt-4 grid gap-3 md:grid-cols-3">
          <SummaryField label="当前风险" value={riskLabel(risk?.riskLevel)} />
          <SummaryField
            label="系统评级"
            value={riskLabel(risk?.systemRiskLevel)}
          />
          <SummaryField
            label="人工调整"
            value={risk?.manualRiskLevel ? riskLabel(risk.manualRiskLevel) : "未调整"}
          />
          <SummaryField
            label="风险原因"
            value={risk?.reasonSummary?.trim() || "待补充证据"}
            wide
          />
        </dl>

        <Button
          className="mt-5"
          disabled={!canConfirmRisk}
          onClick={() => {
            if (risk && canConfirmRisk) void onConfirmRisk?.(risk);
          }}
        >
          确认风险结论
        </Button>
      </section>
    </Card>
  );
}

function SummaryField({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] px-3 py-2",
        wide ? "md:col-span-3" : "",
      ].join(" ")}
    >
      <dt className="text-xs font-black text-[var(--ink-subtle)]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-black text-[var(--ink-strong)]">
        {value}
      </dd>
    </div>
  );
}

function currentRisk(patient: PatientProfile): RiskGrade | undefined {
  return patient.riskGrades.find((risk) => risk.isCurrent) ?? patient.riskGrades[0];
}

function currentAssessmentRisk(assessment: AssessmentRecord): RiskGrade | undefined {
  return (
    assessment.riskGrades?.find((risk) => risk.isCurrent) ??
    assessment.riskGrades?.[0]
  );
}

function hasRiskEvidence(risk: RiskGrade) {
  return Boolean(risk.riskLevel && risk.systemRiskLevel && risk.reasonSummary.trim());
}

function scoreValue(
  assessment: AssessmentRecord | undefined,
  key: "mmse" | "cdr",
) {
  const value = assessment?.scoreSummary?.[key];
  if (value === null || value === undefined || value === "") return "未记录";
  return String(value);
}

function riskStatus(level?: RiskGrade["riskLevel"]) {
  if (level === "high") return "blocked";
  if (level === "moderate") return "pending";
  if (level === "low") return "complete";
  return "review";
}

function riskLabel(level?: RiskGrade["riskLevel"] | null) {
  if (level === "high") return "高风险";
  if (level === "moderate") return "中风险";
  if (level === "low") return "低风险";
  return "未评级";
}

function formatDateTime(value?: string | null) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
