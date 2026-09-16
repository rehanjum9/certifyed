"use client";

import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import type { ValidationOutcome } from "@/lib/spreadsheet/validateRows";

interface StepValidateProps {
  outcome: ValidationOutcome;
}

export function StepValidate({ outcome }: StepValidateProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-slate-900">Validation results</h2>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total rows" value={outcome.summary.total} />
        <StatCard label="Valid" value={outcome.summary.valid} />
        <StatCard label="Invalid" value={outcome.summary.invalid} />
        <StatCard label="Warnings" value={outcome.summary.warnings} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Row</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Recipient Email</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Mapped values</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Status</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Validation errors</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {outcome.rows.map((row) => (
              <tr key={row.rowIndex} className={row.status === "invalid" ? "bg-red-50/40" : undefined}>
                <td className="px-3 py-2 text-slate-500">{row.rowIndex + 2}</td>
                <td className="px-3 py-2 text-slate-700">{row.recipientEmail ?? "—"}</td>
                <td className="px-3 py-2 text-slate-700">
                  {Object.entries(row.data)
                    .map(([key, value]) => `${key}: ${value || "—"}`)
                    .join(", ") || "—"}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={row.status === "valid" ? "success" : "warning"}>{row.status}</Badge>
                </td>
                <td className="px-3 py-2 text-red-700">{row.errors.join(" ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
