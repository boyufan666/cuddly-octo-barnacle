import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type GovernanceLayoutProps = {
  children: ReactNode;
  className?: string;
  role: string;
  title: string;
};

export function GovernanceLayout({
  children,
  className,
  role,
  title,
}: GovernanceLayoutProps) {
  return (
    <section className={cn("min-w-0", className)}>
      <p className="text-xs font-black text-[var(--accent-strong)]">{role}</p>
      <h2 className="mt-2 text-2xl font-black md:text-3xl">{title}</h2>
      <div className="mt-6 grid gap-4">{children}</div>
    </section>
  );
}
