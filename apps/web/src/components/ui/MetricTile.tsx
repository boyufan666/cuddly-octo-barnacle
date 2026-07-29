import { cn } from "@/lib/utils";
import type { ComponentType, SVGProps } from "react";

type MetricTileProps = {
  className?: string;
  dark?: boolean;
  helper?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
};

export function MetricTile({
  className,
  dark = false,
  helper,
  icon: Icon,
  label,
  value,
}: MetricTileProps) {
  return (
    <div
      className={cn(
        "min-h-[148px] min-w-0 rounded-[var(--radius-card)] border p-4",
        dark
          ? "border-[var(--line-inverse)] bg-[var(--surface-inverse-muted)] text-[var(--ink-inverse)]"
          : "border-[var(--line-subtle)] bg-[var(--surface-paper)] text-[var(--ink-strong)]",
        className,
      )}
    >
      {Icon ? (
        <Icon
          aria-hidden="true"
          className={cn("h-5 w-5", dark ? "text-[var(--ink-inverse-soft)]" : "text-[var(--accent-strong)]")}
        />
      ) : null}
      <strong className="mt-3 block break-words font-mono text-3xl font-bold leading-tight">
        {value}
      </strong>
      <span className={cn("mt-2 block break-words text-sm font-bold", dark ? "text-[var(--ink-inverse-soft)]" : "text-[var(--ink-soft)]")}>
        {label}
      </span>
      {helper ? (
        <span className={cn("mt-2 block break-words text-xs font-bold", dark ? "text-[var(--ink-inverse-muted)]" : "text-[var(--ink-soft)]")}>
          {helper}
        </span>
      ) : null}
    </div>
  );
}
