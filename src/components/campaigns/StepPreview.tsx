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
        <h2 className="text-sm font-semibold text-slate-900">Recipient preview</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onIndexChange(currentIndex - 1)}
            disabled={currentIndex === 0}
          >
            Previous
          </Button>
          <span className="text-xs text-slate-500">
            Row {current.rowIndex + 2} of {rows.length + 1}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onIndexChange(currentIndex + 1)}
            disabled={currentIndex >= rows.length - 1}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant={current.status === "valid" ? "success" : "warning"}>{current.status}</Badge>
        <span className="text-sm text-slate-600">{current.recipientEmail ?? "No email"}</span>
      </div>

      {current.errors.length > 0 && <Alert variant="error">{current.errors.join(" ")}</Alert>}

      <RecipientCanvas svg={svg} svgWidth={svgWidth} svgHeight={svgHeight} fields={fields} values={current.data} />
    </div>
  );
}
