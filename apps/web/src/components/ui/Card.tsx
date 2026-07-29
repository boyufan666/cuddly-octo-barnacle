import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

export type CardTone = "patient" | "workbench" | "governance" | "plain";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  tone?: CardTone;
};

const toneClassName: Record<CardTone, string> = {
  patient:
    "border-[var(--line-subtle)] bg-[var(--surface-paper)]",
  workbench:
    "border-[var(--line-subtle)] bg-[var(--surface-paper)]",
  governance:
    "border-[var(--line-strong)] bg-[var(--surface-paper)]",
  plain: "border-[var(--line-subtle)] bg-[var(--surface-paper)]",
};

export function Card({
  children,
  className,
  tone = "workbench",
  ...props
}: CardProps) {
  return (
    <div
      {...props}
      className={cn(
        "min-w-0 rounded-[var(--radius-card)] border p-5",
        toneClassName[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}
