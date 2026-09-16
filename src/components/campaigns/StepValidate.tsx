"use client";

import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { DataTable, DataTableHead, DataTableTh, DataTableBody, DataTableRow, DataTableTd } from "@/components/ui/DataTable";
import type { ValidationOutcome } from "@/lib/spreadsheet/validateRows";

interface StepValidateProps {
  outcome: ValidationOutcome;
}

export function StepValidate({ outcome }: StepValidateProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-mono text-sm font-semibold text-slate-900">validation_results</h2>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total" value={outcome.summary.total} />
        <StatCard label="Valid" value={outcome.summary.valid} />
        <StatCard label="Invalid" value={outcome.summary.invalid} />
        <StatCard label="Warnings" value={outcome.summary.warnings} />
      </div>

      <DataTable>
        <DataTableHead>
          <DataTableTh>Row</DataTableTh>
          <DataTableTh>Recipient email</DataTableTh>
          <DataTableTh>Mapped values</DataTableTh>
          <DataTableTh>Status</DataTableTh>
          <DataTableTh>Validation errors</DataTableTh>
        </DataTableHead>
        <DataTableBody>
          {outcome.rows.map((row) => (
            <DataTableRow key={row.rowIndex} className={row.status === "invalid" ? "bg-red-50/40" : undefined}>
              <DataTableTd className="font-mono text-xs text-slate-400">{row.rowIndex + 2}</DataTableTd>
              <DataTableTd>{row.recipientEmail ?? "—"}</DataTableTd>
              <DataTableTd>
                {Object.entries(row.data)
                  .map(([key, value]) => `${key}: ${value || "—"}`)
                  .join(", ") || "—"}
              </DataTableTd>
              <DataTableTd>
                <Badge variant={row.status === "valid" ? "success" : "danger"}>{row.status}</Badge>
              </DataTableTd>
              <DataTableTd className="text-red-600">{row.errors.join(" ") || "—"}</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </div>
  );
}
