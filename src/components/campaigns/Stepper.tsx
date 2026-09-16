"use client";

import { cn } from "@/lib/cn";
import { WIZARD_STEPS, type WizardStep } from "./wizardTypes";

export function Stepper({ currentStep }: { currentStep: WizardStep }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
      {WIZARD_STEPS.map(({ step, label }, index) => {
        const isCurrent = step === currentStep;
        const isComplete = step < currentStep;

        return (
          <li key={step} className="flex items-center gap-2">
            {index > 0 && <span className="text-slate-300">&rarr;</span>}
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                isCurrent && "bg-indigo-600 text-white",
                isComplete && !isCurrent && "bg-indigo-50 text-indigo-700",
                !isCurrent && !isComplete && "text-slate-400",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[10px]",
                  isCurrent && "bg-white/20",
                  isComplete && !isCurrent && "bg-indigo-100",
                  !isCurrent && !isComplete && "bg-slate-100",
                )}
              >
                {isComplete ? "✓" : step}
              </span>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
