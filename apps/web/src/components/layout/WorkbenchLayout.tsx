import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type WorkbenchLayoutProps = {
  aside: ReactNode;
  children: ReactNode;
  className?: string;
  eyebrow: string;
  subtitle: string;
  title: string;
};

export function WorkbenchLayout({
  aside,
  children,
  className,
  eyebrow,
  subtitle,
  title,
}: WorkbenchLayoutProps) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-5",
        className,
      )}
      data-testid="screen-grid"
    >
      <div className="min-w-0" data-testid="screen-grid-main">
        <p className="text-xs font-black text-[var(--accent-strong)]">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-black md:text-3xl">{title}</h2>
        <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-[var(--ink-soft)] md:text-base md:leading-7">
          {subtitle}
        </p>
        <div className="mt-6">{children}</div>
      </div>
      <aside className="min-w-0" data-testid="screen-grid-aside">
        {aside}
      </aside>
    </div>
  );
}
