// Row validation rules used in three places: the client wizard (live
// feedback during import), the campaign save API route (authoritative
// re-check of an import), and campaign generation/retry (authoritative
// re-check of already-stored rows, including campaign-wide rules like
// duplicate email/serial_number -- see lib/campaigns/eligibility.ts).
// All three share the same core (`validateExtractedRows`) so there is one
// rule set, not two: only the *extraction* of {recipientEmail, data} from
// the source shape (raw spreadsheet row+mapping vs. stored campaign_rows)
// differs.

export interface FieldMapping {
  field_key: string;
  label: string;
  is_required: boolean;
  /** Column index in the parsed spreadsheet, or null if left unmapped (only valid when not required). Unused by validateExtractedRows itself -- only by the spreadsheet extraction step. */
  columnIndex: number | null;
}

export interface RowValidationResult {
  /** 0-based position among data rows (matches campaign_rows.row_index). */
  rowIndex: number;
  recipientEmail: string | null;
  /** Dynamic certificate field values only -- field_key -> value. Never includes email. */
  data: Record<string, string>;
  status: "valid" | "invalid";
  errors: string[];
}

export interface ValidationSummary {
  total: number;
  valid: number;
  invalid: number;
  warnings: number;
}

export interface ValidationOutcome {
  summary: ValidationSummary;
  rows: RowValidationResult[];
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toRowNumbers(indices: number[]): string {
  // +2: spreadsheet row 1 is the header, so data row 0 is spreadsheet row 2.
  return indices.map((i) => i + 2).join(", ");
}

export interface ExtractedRow {
  /** Stable identity for cross-referencing duplicates in error messages -- callers pass the row's real position (campaign_rows.row_index), not an array index, so results are correct even over a non-contiguous subset of rows. */
  rowIndex: number;
  recipientEmail: string | null;
  data: Record<string, string>;
  /** True only for a spreadsheet row that was entirely blank on import. Stored campaign_rows are never "blank" in this sense. */
  isBlankRow?: boolean;
}

/**
 * The one authoritative rule set: missing/invalid email, duplicate email
 * across the whole row set, missing required field values, and duplicate
 * serial_number across the whole row set (when a field with that exact
 * key is present). Campaign-wide rules (the two duplicate checks) are
 * computed from every row passed in, not from any single row in
 * isolation -- callers must pass the *entire* relevant row set, not a
 * filtered subset, or a duplicate can be missed.
 */
export function validateExtractedRows(
  rows: ExtractedRow[],
  fieldMappings: Pick<FieldMapping, "field_key" | "label" | "is_required">[],
): ValidationOutcome {
  const serialField = fieldMappings.find((f) => f.field_key === "serial_number") ?? null;

  const emailIndexByValue = new Map<string, number[]>();
  for (const row of rows) {
    const email = (row.recipientEmail ?? "").trim().toLowerCase();
    if (!email) continue;
    const list = emailIndexByValue.get(email) ?? [];
    list.push(row.rowIndex);
    emailIndexByValue.set(email, list);
  }

  const serialIndexByValue = new Map<string, number[]>();
  if (serialField) {
    for (const row of rows) {
      const serial = (row.data[serialField.field_key] ?? "").trim().toLowerCase();
      if (!serial) continue;
      const list = serialIndexByValue.get(serial) ?? [];
      list.push(row.rowIndex);
      serialIndexByValue.set(serial, list);
    }
  }

  const results: RowValidationResult[] = rows.map((row) => {
    const errors: string[] = [];

    if (row.isBlankRow) {
      return { rowIndex: row.rowIndex, recipientEmail: null, data: {}, status: "invalid", errors: ["Blank row."] };
    }

    const rawEmail = row.recipientEmail;
    if (!rawEmail) {
      errors.push("Missing recipient email.");
    } else if (!EMAIL_PATTERN.test(rawEmail)) {
      errors.push("Invalid email format.");
    } else {
      const dupes = emailIndexByValue.get(rawEmail.toLowerCase()) ?? [];
      if (dupes.length > 1) {
        errors.push(`Duplicate email (also row ${toRowNumbers(dupes.filter((i) => i !== row.rowIndex))}).`);
      }
    }

    for (const field of fieldMappings) {
      const value = row.data[field.field_key] ?? "";
      if (field.is_required && !value.trim()) {
        errors.push(`Missing required value for "${field.label}".`);
      }
    }

    if (serialField) {
      const serialValue = (row.data[serialField.field_key] ?? "").trim();
      if (serialValue) {
        const dupes = serialIndexByValue.get(serialValue.toLowerCase()) ?? [];
        if (dupes.length > 1) {
          errors.push(`Duplicate serial number (also row ${toRowNumbers(dupes.filter((i) => i !== row.rowIndex))}).`);
        }
      }
    }

    return {
      rowIndex: row.rowIndex,
      recipientEmail: rawEmail,
      data: row.data,
      status: errors.length === 0 ? "valid" : "invalid",
      errors,
    };
  });

  return {
    summary: {
      total: results.length,
      valid: results.filter((r) => r.status === "valid").length,
      invalid: results.filter((r) => r.status === "invalid").length,
      warnings: 0,
    },
    rows: results,
  };
}

function cellValue(row: string[], columnIndex: number | null): string {
  if (columnIndex === null) return "";
  return (row[columnIndex] ?? "").trim();
}

/**
 * Spreadsheet-import adapter: extracts {recipientEmail, data} for each raw
 * row (using the chosen column mapping) and delegates to the shared core.
 * This is the only place spreadsheet-specific concepts (column indices,
 * blank-row detection across every cell) exist.
 */
export function validateRows(
  rows: string[][],
  emailColumnIndex: number,
  fieldMappings: FieldMapping[],
): ValidationOutcome {
  const extracted: ExtractedRow[] = rows.map((row, index) => {
    const isBlankRow = row.every((cell) => cell.trim().length === 0);
    const data: Record<string, string> = {};
    for (const field of fieldMappings) {
      data[field.field_key] = cellValue(row, field.columnIndex);
    }

    return {
      rowIndex: index,
      recipientEmail: cellValue(row, emailColumnIndex) || null,
      data,
      isBlankRow,
    };
  });

  return validateExtractedRows(extracted, fieldMappings);
}
