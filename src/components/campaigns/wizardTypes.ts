import type { Database } from "@/types/database";
import type { TemplateFieldRow } from "@/lib/templateFields";

export type TemplateRow = Database["public"]["Tables"]["templates"]["Row"];

export interface TemplateOption {
  template: TemplateRow;
  svg: string;
  fields: TemplateFieldRow[];
}

export const WIZARD_STEPS = [
  { step: 1, label: "Template" },
  { step: 2, label: "Upload" },
  { step: 3, label: "Map columns" },
  { step: 4, label: "Validate" },
  { step: 5, label: "Preview" },
  { step: 6, label: "Save" },
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number]["step"];

export interface ParsedSpreadsheetState {
  headers: string[];
  rows: string[][];
}

/** field_key -> spreadsheet column index, or null while unmapped. */
export type FieldColumnMap = Record<string, number | null>;
