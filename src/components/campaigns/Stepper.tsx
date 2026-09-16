"use client";

import { cn } from "@/lib/cn";
import { WIZARD_STEPS, type WizardStep } from "./wizardTypes";

export function Stepper({ currentStep }: { currentStep: WizardStep }) {
  return (
    <ol className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-3">
      {WIZARD_STEPS.map(({ step, label }, index) => {
        const isCurrent = step === currentStep;
        const isComplete = step < currentStep;

        return (
          <li key={step} className="flex items-center gap-1">
            {index > 0 && <span className="mx-1 text-slate-300">/</span>}
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs font-medium",
                isCurrent && "bg-emerald-600 text-white",
                isComplete && !isCurrent && "bg-emerald-50 text-emerald-700",
                !isCurrent && !isComplete && "text-slate-400",
              )}
            >
              <span className="opacity-70">{String(step).padStart(2, "0")}</span>
              {isComplete && !isCurrent ? <span aria-hidden="true">✓</span> : null}
              <span className="font-sans">{label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
