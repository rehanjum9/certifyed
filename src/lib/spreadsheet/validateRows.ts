// Row validation shared verbatim between the client wizard (live feedback)
// and the campaign save API route (authoritative re-check). Pure and
// synchronous: no DB/network access, so it can be unit tested directly and
// re-run server-side without trusting whatever the client already computed.

export interface FieldMapping {
  field_key: string;
  label: string;
  is_required: boolean;
  /** Column index in the parsed spreadsheet, or null if left unmapped (only valid when not required). */
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cellValue(row: string[], columnIndex: number | null): string {
  if (columnIndex === null) return "";
  return (row[columnIndex] ?? "").trim();
}

function toRowNumbers(indices: number[]): string {
  // +2: spreadsheet row 1 is the header, so data row 0 is spreadsheet row 2.
  return indices.map((i) => i + 2).join(", ");
}

export function validateRows(
  rows: string[][],
  emailColumnIndex: number,
  fieldMappings: FieldMapping[],
): ValidationOutcome {
  const serialField = fieldMappings.find((f) => f.field_key === "serial_number") ?? null;

  const emailIndexByValue = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const email = cellValue(row, emailColumnIndex).toLowerCase();
    if (!email) return;
    const list = emailIndexByValue.get(email) ?? [];
    list.push(index);
    emailIndexByValue.set(email, list);
  });

  const serialIndexByValue = new Map<string, number[]>();
  if (serialField) {
    rows.forEach((row, index) => {
      const serial = cellValue(row, serialField.columnIndex).toLowerCase();
      if (!serial) return;
      const list = serialIndexByValue.get(serial) ?? [];
      list.push(index);
      serialIndexByValue.set(serial, list);
    });
  }

  const results: RowValidationResult[] = rows.map((row, index) => {
    const errors: string[] = [];
    const isBlankRow = row.every((cell) => cell.trim().length === 0);
    const rawEmail = cellValue(row, emailColumnIndex);
    const recipientEmail = rawEmail || null;
    const data: Record<string, string> = {};

    if (isBlankRow) {
      errors.push("Blank row.");
    } else {
      if (!rawEmail) {
        errors.push("Missing recipient email.");
      } else if (!EMAIL_PATTERN.test(rawEmail)) {
        errors.push("Invalid email format.");
      } else {
        const dupes = emailIndexByValue.get(rawEmail.toLowerCase()) ?? [];
        if (dupes.length > 1) {
          errors.push(`Duplicate email (also row ${toRowNumbers(dupes.filter((i) => i !== index))}).`);
        }
      }

      for (const field of fieldMappings) {
        const value = cellValue(row, field.columnIndex);
        data[field.field_key] = value;
        if (field.is_required && !value) {
          errors.push(`Missing required value for "${field.label}".`);
        }
      }

      if (serialField) {
        const serialValue = cellValue(row, serialField.columnIndex);
        if (serialValue) {
          const dupes = serialIndexByValue.get(serialValue.toLowerCase()) ?? [];
          if (dupes.length > 1) {
            errors.push(`Duplicate serial number (also row ${toRowNumbers(dupes.filter((i) => i !== index))}).`);
          }
        }
      }
    }

    return {
      rowIndex: index,
      recipientEmail,
      data,
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
