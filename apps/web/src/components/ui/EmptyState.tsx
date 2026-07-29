import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type EmptyStateProps = {
  action?: ReactNode;
  className?: string;
  description?: ReactNode;
  title: ReactNode;
};

export function EmptyState({
  action,
  className,
  description,
  title,
}: EmptyStateProps) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-paper)] p-6 text-center",
        className,
      )}
    >
      <h2 className="break-words text-lg font-bold text-[var(--ink-strong)]">{title}</h2>
      {description ? (
        <p className="mx-auto mt-2 max-w-xl break-words text-sm font-medium leading-6 text-[var(--ink-soft)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </section>
  );
}
