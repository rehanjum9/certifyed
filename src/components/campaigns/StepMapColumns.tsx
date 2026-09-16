"use client";

import { inputClassName, Label } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import type { TemplateFieldRow } from "@/lib/templateFields";
import type { FieldColumnMap } from "./wizardTypes";

interface ColumnSelectProps {
  headers: string[];
  value: number | null;
  onChange: (index: number | null) => void;
  placeholder: string;
}

function ColumnSelect({ headers, value, onChange, placeholder }: ColumnSelectProps) {
  return (
    <select
      value={value === null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={inputClassName}
    >
      <option value="">{placeholder}</option>
      {headers.map((header, index) => (
        <option key={index} value={index}>
          {header || `Column ${index + 1}`}
        </option>
      ))}
    </select>
  );
}

interface StepMapColumnsProps {
  headers: string[];
  emailColumnIndex: number | null;
  onEmailColumnChange: (index: number | null) => void;
  fields: TemplateFieldRow[];
  fieldColumnMap: FieldColumnMap;
  onFieldColumnChange: (fieldKey: string, index: number | null) => void;
}

export function StepMapColumns({
  headers,
  emailColumnIndex,
  onEmailColumnChange,
  fields,
  fieldColumnMap,
  onFieldColumnChange,
}: StepMapColumnsProps) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="flex flex-col gap-2 rounded-lg border-2 border-indigo-200 bg-indigo-50/50 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Recipient Email</h2>
          <Badge variant="info">Mandatory - never shown on the certificate</Badge>
        </div>
        <p className="text-xs text-slate-500">
          Every roster row needs an email so its certificate can be delivered later. This column is
          stored separately and is never available as a certificate field.
        </p>
        <ColumnSelect
          headers={headers}
          value={emailColumnIndex}
          onChange={onEmailColumnChange}
          placeholder="Select the email column..."
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Certificate Fields</h2>
        {fields.length === 0 ? (
          <p className="text-sm text-slate-500">This template has no dynamic fields configured.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {fields.map((field) => (
              <div key={field.id} className="flex flex-col gap-1.5 rounded-lg border border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <Label>{field.label}</Label>
                  <Badge variant={field.is_required ? "warning" : "neutral"}>
                    {field.is_required ? "Required" : "Optional"}
                  </Badge>
                </div>
                <ColumnSelect
                  headers={headers}
                  value={fieldColumnMap[field.field_key] ?? null}
                  onChange={(index) => onFieldColumnChange(field.field_key, index)}
                  placeholder={field.is_required ? "Select a column..." : "Not mapped (leave blank)"}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
