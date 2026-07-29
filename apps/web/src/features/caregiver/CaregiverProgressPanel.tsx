import { TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

export type CaregiverProgressStat = {
  helper: string;
  label: string;
  value: string;
};

type CaregiverProgressPanelProps = {
  latestTrainingLabel: string;
  sectionTitle: string;
  stats: CaregiverProgressStat[];
  trendTitle: string;
};

export function CaregiverProgressPanel({
  latestTrainingLabel,
  sectionTitle,
  stats,
  trendTitle,
}: CaregiverProgressPanelProps) {
  return (
    <div className="min-w-0">
      <Card tone="patient" className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <StatusBadge status="review">{sectionTitle}</StatusBadge>
            <h3 className="mt-4 text-xl font-black text-[var(--ink-strong)]">
              {trendTitle}
            </h3>
            <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
              最近训练：{latestTrainingLabel}
            </p>
          </div>
          <TrendingUp
            aria-hidden="true"
            className="h-6 w-6 text-[var(--accent-strong)]"
          />
        </div>
      </Card>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {stats.map((item) => (
          <ProgressLine
            key={item.label}
            label={item.label}
            value={item.value}
            helper={item.helper}
          />
        ))}
      </div>
    </div>
  );
}

function ProgressLine({
  helper,
  label,
  value,
}: CaregiverProgressStat) {
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
