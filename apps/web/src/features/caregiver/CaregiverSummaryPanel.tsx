import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

type CaregiverSummaryPanelProps = {
  dailyDurationLabel: string;
  hasSummary: boolean;
  patientDisplayName: string;
  recentTrainingLabel: string;
  reminderText: string;
  riskLabel: string;
  sectionTitle: string;
};

export function CaregiverSummaryPanel({
  dailyDurationLabel,
  hasSummary,
  patientDisplayName,
  recentTrainingLabel,
  reminderText,
  riskLabel,
  sectionTitle,
}: CaregiverSummaryPanelProps) {
  return (
    <div className="min-w-0">
      <Card tone="patient" className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <StatusBadge status={hasSummary ? "ready" : "pending"}>
              {hasSummary ? "已授权" : "等待授权"}
            </StatusBadge>
            <h3 className="mt-4 text-xl font-black text-[var(--ink-strong)] md:text-2xl">
              {sectionTitle}
            </h3>
            <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-[var(--ink-soft)]">
              {reminderText}
            </p>
          </div>
          <div className="min-w-[160px]">
            <span className="block text-xs font-black text-[var(--ink-subtle)]">
              照护对象
            </span>
            <strong className="mt-1 block break-words text-lg font-black text-[var(--ink-strong)]">
              {patientDisplayName}
            </strong>
          </div>
        </div>
      </Card>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <SummaryLine
          label="今日安排"
          value={dailyDurationLabel}
          helper="按医生确认安排展示"
        />
        <SummaryLine
          label="近期训练"
          value={recentTrainingLabel}
          helper="授权后同步记录"
        />
        <SummaryLine label="照护提醒" value={riskLabel} helper="以医生确认为准" />
      </div>
    </div>
  );
}

function SummaryLine({
  helper,
  label,
  value,
}: {
  helper: string;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-4 py-4">
      <span className="block text-xs font-black text-[var(--ink-subtle)]">
        {label}
      </span>
      <strong className="mt-2 block break-words text-lg font-black text-[var(--ink-strong)]">
        {value}
      </strong>
      <span className="mt-1 block break-words text-xs font-bold leading-5 text-[var(--ink-soft)]">
        {helper}
      </span>
    </div>
  );
}
