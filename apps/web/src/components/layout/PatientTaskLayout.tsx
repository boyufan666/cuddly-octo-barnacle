import { cn } from "@/lib/utils";
import type { CSSProperties, ReactNode } from "react";

type PatientTaskLayoutProps = {
  children: ReactNode;
  className?: string;
  navigation?: ReactNode;
};

export function PatientTaskLayout({
  children,
  className,
  navigation,
}: PatientTaskLayoutProps) {
  const hasNavigation = Boolean(navigation);

  return (
    <section
      style={
        hasNavigation
          ? ({
              "--bottom-nav-height": "88px",
            } as CSSProperties)
          : undefined
      }
      className={cn(
        hasNavigation
          ? "patient-task-layout flex min-h-0 flex-1 flex-col gap-3 pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))]"
          : "patient-task-layout pb-0",
        className,
      )}
    >
      <div
        data-testid={hasNavigation ? "patient-task-scroll-region" : undefined}
        className={cn(
          hasNavigation
            ? "min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
            : undefined,
        )}
      >
        {children}
      </div>
      {hasNavigation ? (
        <div
          className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-3xl"
          data-testid="patient-task-nav-shell"
        >
          {/* data-testid="patient-task-nav" stays on the provided navigation element. */}
          {navigation}
        </div>
      ) : null}
    </section>
  );
}
