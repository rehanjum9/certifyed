import type { RowValidationResult, FieldMapping } from "@/lib/spreadsheet/validateRows";
import type { Database } from "@/types/database";

type CampaignRowInsert = Database["public"]["Tables"]["campaign_rows"]["Insert"];

/**
 * Transforms validated rows into campaign_rows insert payloads. This is the
 * one place `email -> recipient_email` and `template fields -> data JSON`
 * happen -- recipientEmail never ends up inside `data`, by construction
 * (RowValidationResult already keeps them separate; this function doesn't
 * merge them back together).
 */
export function buildCampaignRowInserts(
  campaignId: string,
  validated: RowValidationResult[],
): CampaignRowInsert[] {
  return validated.map((row) => ({
    campaign_id: campaignId,
    row_index: row.rowIndex,
    data: row.data,
    recipient_email: row.recipientEmail,
    status: row.status === "valid" ? "pending" : "failed",
    error_message: row.errors.length > 0 ? row.errors.join(" ") : null,
  }));
}

/**
 * Builds the human-readable column_mapping/email_column stored on the
 * campaign row: header text (for display/audit), not raw column indices.
 */
export function buildColumnMapping(
  headers: string[],
  fieldMappings: FieldMapping[],
): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const field of fieldMappings) {
    if (field.columnIndex !== null && headers[field.columnIndex] !== undefined) {
      mapping[field.field_key] = headers[field.columnIndex];
    }
  }
  return mapping;
}

export function resolveEmailColumnHeader(headers: string[], emailColumnIndex: number): string | null {
  return headers[emailColumnIndex] ?? null;
}
