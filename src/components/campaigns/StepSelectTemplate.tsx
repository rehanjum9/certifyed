"use client";

import { SvgPreview } from "@/components/templates/SvgPreview";
import { cn } from "@/lib/cn";
import type { TemplateOption } from "./wizardTypes";

interface StepSelectTemplateProps {
  templateOptions: TemplateOption[];
  selectedTemplateId: string | null;
  onSelect: (templateId: string) => void;
}

export function StepSelectTemplate({ templateOptions, selectedTemplateId, onSelect }: StepSelectTemplateProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-mono text-sm font-semibold text-slate-900">select_template</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templateOptions.map(({ template, svg, fields }) => {
          const selected = template.id === selectedTemplateId;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(template.id)}
              className={cn(
                "flex flex-col overflow-hidden rounded-xl border-2 bg-white text-left transition-colors",
                selected ? "border-emerald-500" : "border-transparent hover:border-slate-300",
              )}
            >
              <SvgPreview svg={svg} width={template.svg_width} height={template.svg_height} />
              <div className="flex flex-col gap-1 p-4">
                <h3 className="truncate text-sm font-semibold text-slate-900">{template.name}</h3>
                <p className="text-xs text-slate-500">
                  {fields.length === 0 ? "No fields configured" : `${fields.length} field${fields.length === 1 ? "" : "s"}`}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
