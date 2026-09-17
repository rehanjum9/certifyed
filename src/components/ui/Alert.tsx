import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type AlertVariant = "error" | "success" | "info" | "warning";

const variantClasses: Record<AlertVariant, string> = {
  error: "border-red-200 bg-red-50 text-red-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
};

interface AlertProps {
  variant?: AlertVariant;
  className?: string;
  children: ReactNode;
}

export function Alert({ variant = "info", className, children }: AlertProps) {
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", variantClasses[variant], className)}>
      {children}
    </div>
  );
}
