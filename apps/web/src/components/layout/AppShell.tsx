import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  className?: string;
  title?: string;
};

export function AppShell({ children, className, title }: AppShellProps) {
  return (
    <main
      aria-label={title}
      className={cn(
        "min-h-dvh overflow-x-hidden overflow-y-auto text-[var(--ink-strong)]",
        className,
      )}
      data-testid="app-scroll-region"
    >
      {children}
    </main>
  );
}
