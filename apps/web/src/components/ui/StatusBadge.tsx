import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type StatusBadgeStatus =
  | "ready"
  | "pending"
  | "blocked"
  | "complete"
  | "review";

type StatusBadgeProps = {
  children: ReactNode;
  className?: string;
  status?: StatusBadgeStatus;
};

const statusClassName: Record<StatusBadgeStatus, string> = {
  ready: "border-[var(--accent-strong)] bg-[var(--accent-soft)] text-[var(--accent-stronger)]",
  pending: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning)]",
  blocked: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger)]",
  complete: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success)]",
  review: "border-[var(--line-strong)] bg-[var(--surface-muted)] text-[var(--ink-soft)]",
};

export function StatusBadge({
  children,
  className,
  status = "ready",
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 max-w-full items-center rounded-[var(--radius-control)] border px-3 py-1 text-sm font-bold",
        statusClassName[status],
        className,
      )}
    >
      <span className="min-w-0 break-words text-center">{children}</span>
    </span>
  );
}
