import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonIntent = "primary" | "secondary" | "danger" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  intent?: ButtonIntent;
  isLoading?: boolean;
  size?: ButtonSize;
};

const intentClassName: Record<ButtonIntent, string> = {
  primary:
    "border-transparent bg-[var(--accent-strong)] text-[var(--ink-inverse)] hover:bg-[var(--accent-stronger)]",
  secondary:
    "border-[var(--line-strong)] bg-[var(--surface-paper)] text-[var(--ink-strong)] hover:border-[var(--accent-strong)] hover:bg-[var(--surface-muted)]",
  danger:
    "border-transparent bg-[var(--danger)] text-[var(--ink-inverse)] hover:bg-[var(--danger-strong)]",
  quiet:
    "border-transparent bg-transparent text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]",
};

const sizeClassName: Record<ButtonSize, string> = {
  sm: "min-h-11 px-4 text-sm",
  md: "min-h-12 px-5 text-base",
  lg: "min-h-13 px-6 text-base",
};

export function Button({
  children,
  className,
  disabled,
  intent = "primary",
  isLoading = false,
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      aria-busy={isLoading || undefined}
      className={cn(
        "inline-flex min-w-[6.75rem] items-center justify-center gap-2 rounded-[var(--radius-control)] border font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-strong)]/20 disabled:cursor-not-allowed disabled:opacity-55",
        props["aria-disabled"] === true || props["aria-disabled"] === "true"
          ? "cursor-not-allowed opacity-60"
          : undefined,
        sizeClassName[size],
        intentClassName[intent],
        className,
      )}
      disabled={disabled || isLoading}
      type={type}
    >
      <span className="min-w-0 break-words text-center">
        {isLoading ? "处理中..." : children}
      </span>
    </button>
  );
}
