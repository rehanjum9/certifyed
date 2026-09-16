"use client";

import { RecipientCanvas } from "./RecipientCanvas";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import type { EditorField } from "@/lib/editor/types";
import type { RowValidationResult } from "@/lib/spreadsheet/validateRows";

interface StepPreviewProps {
  svg: string;
  svgWidth: number;
  svgHeight: number;
  fields: EditorField[];
  rows: RowValidationResult[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
}

export function StepPreview({
  svg,
  svgWidth,
  svgHeight,
  fields,
  rows,
  currentIndex,
  onIndexChange,
}: StepPreviewProps) {
  const current = rows[currentIndex];

  if (!current) {
    return <p className="text-sm text-slate-500">No rows to preview.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-sm font-semibold text-slate-900">recipient_preview</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onIndexChange(currentIndex - 1)}
            disabled={currentIndex === 0}
          >
            &larr;
          </Button>
          <span className="font-mono text-xs text-slate-500">
            {currentIndex + 1} / {rows.length}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onIndexChange(currentIndex + 1)}
            disabled={currentIndex >= rows.length - 1}
          >
            &rarr;
          </Button>
        </div>
      </div>

      {current.errors.length > 0 && <Alert variant="error">{current.errors.join(" ")}</Alert>}

      <RecipientCanvas svg={svg} svgWidth={svgWidth} svgHeight={svgHeight} fields={fields} values={current.data} />

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-slate-400">Name</p>
          <p className="text-sm text-slate-900">{current.data.name || "—"}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-slate-400">Email</p>
          <p className="text-sm text-slate-900">{current.recipientEmail ?? "No email"}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-slate-400">Serial</p>
          <p className="font-mono text-sm text-slate-900">{current.data.serial_number || current.data.serial_no || "—"}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-slate-400">Validation status</p>
          <Badge variant={current.status === "valid" ? "success" : "danger"}>{current.status}</Badge>
        </div>
      </div>
    </div>
  );
}
