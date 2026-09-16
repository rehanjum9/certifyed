import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant = "neutral" | "success" | "warning" | "info" | "danger";

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "bg-slate-100 text-slate-600",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  info: "bg-sky-50 text-sky-700",
  danger: "bg-red-50 text-red-600",
};

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
  /** Renders as `[ LABEL ]` in monospace -- the terminal-flavored status/ID style. Defaults on; pass false for prose-style badges (e.g. "Required"/"Optional" labels). */
  bracket?: boolean;
}

/**
 * The one status badge component (StatusBadge from the design brief) --
 * bracketed monospace by default for real statuses like [ COMPLETED ], with
 * an opt-out for plain descriptive badges used outside status contexts.
 */
export function Badge({ variant = "neutral", className, children, bracket = true }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
        bracket && "font-mono tracking-tight uppercase",
        variantClasses[variant],
        className,
      )}
    >
      {bracket ? (
        <>
          <span className="opacity-60">[</span>
          <span className="px-1">{children}</span>
          <span className="opacity-60">]</span>
        </>
      ) : (
        children
      )}
    </span>
  );
}
