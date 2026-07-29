import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

type CaregiverScopePanelProps = {
  hasSummary: boolean;
  patientDisplayName: string;
  scopeItems: string[];
  sectionTitle: string;
  visibleScopeTitle: string;
};

export function CaregiverScopePanel({
  hasSummary,
  patientDisplayName,
  scopeItems,
  sectionTitle,
  visibleScopeTitle,
}: CaregiverScopePanelProps) {
  return (
    <Card tone="patient" className="min-w-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <StatusBadge status={hasSummary ? "ready" : "pending"}>
            {sectionTitle}
          </StatusBadge>
          <h3 className="mt-4 text-xl font-black text-[var(--ink-strong)]">
            {visibleScopeTitle}
          </h3>
        </div>
        <ShieldCheck
          aria-hidden="true"
          className="h-6 w-6 text-[var(--accent-strong)]"
        />
      </div>

      <dl className="mt-5 border-y border-[var(--line-subtle)] py-4">
        <div>
          <dt className="text-xs font-black text-[var(--ink-subtle)]">照护对象</dt>
          <dd className="mt-1 break-words text-lg font-black text-[var(--ink-strong)]">
            {patientDisplayName}
          </dd>
        </div>
      </dl>

      <ul className="mt-5 grid gap-2">
        {scopeItems.map((item) => (
          <li
            key={item}
            className="border-b border-[var(--line-subtle)] pb-2 text-sm font-bold leading-6 text-[var(--ink-soft)] last:border-b-0"
          >
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}
