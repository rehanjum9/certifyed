import { cn } from "@/lib/cn";

export type ProgressTone = "emerald" | "sky";

const trackFillClasses: Record<ProgressTone, string> = {
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
};

interface ProgressBarProps {
  /** 0-100. Always a real, server-derived percentage -- never invented client-side. */
  percent: number;
  tone?: ProgressTone;
  className?: string;
  label?: string;
}

/**
 * The one reusable progress bar for this app -- used for both certificate
 * generation and email delivery (kept visually distinct only by `tone`,
 * never merged into a single combined bar).
 */
export function ProgressBar({ percent, tone = "emerald", className, label }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && <p className="font-mono text-xs text-slate-500">{label}</p>}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn("h-full rounded-full transition-all", trackFillClasses[tone])}
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
