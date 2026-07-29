import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type PageHeaderProps = {
  action?: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
};

export function PageHeader({
  action,
  className,
  description,
  eyebrow,
  title,
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-xs font-bold uppercase text-[var(--accent-strong)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="break-words text-2xl font-bold text-[var(--ink-strong)] sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl break-words text-sm font-medium leading-6 text-[var(--ink-soft)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
          {action}
        </div>
      ) : null}
    </header>
  );
}
