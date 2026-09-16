"use client";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { IconPlus, IconClose } from "@/components/ui/icons";
import type { EditorField } from "@/lib/editor/types";

interface FieldListProps {
  fields: EditorField[];
  selectedFieldId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}

export function FieldList({ fields, selectedFieldId, onSelect, onAdd, onDelete }: FieldListProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Fields</h2>
        <Button size="sm" onClick={onAdd}>
          <IconPlus className="h-4 w-4" />
          Add field
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {fields.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">
            No fields yet. Add one, then drag it onto the certificate.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {fields.map((field) => (
              <li key={field.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(field.id)}
                  className={cn(
                    "flex flex-1 flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left",
                    field.id === selectedFieldId
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  <span className="text-sm font-medium">{field.label || field.field_key}</span>
                  <span className="text-xs text-slate-400">{field.field_key}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(field.id)}
                  className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Delete field ${field.label || field.field_key}`}
                >
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
