import { validateExtractedRows, type FieldMapping } from "@/lib/spreadsheet/validateRows";

export interface CampaignRowForEligibility {
  rowIndex: number;
  recipientEmail: string | null;
  data: Record<string, string>;
}

export interface RowEligibility {
  eligible: boolean;
  errors: string[];
}

/**
 * Re-runs the exact same Phase 4 validation rules (lib/spreadsheet/
 * validateRows.ts's shared core) against every row of a campaign, and
 * returns eligibility keyed by rowIndex.
 *
 * This is deliberately campaign-*wide*, not per-row: some of the rules --
 * duplicate email, duplicate serial_number -- are relational and cannot
 * be decided by looking at a single row in isolation. A row is only
 * ineligible for exactly one of two reasons, both handled here: it never
 * passed Phase 4 validation (bad email, missing required value, or a
 * duplicate against another row *in this same call*), or a previous
 * generation attempt failed for an unrelated, transient reason (e.g. a
 * renderer error) -- in which case this re-check comes back eligible.
 *
 * Callers MUST pass every row in the campaign, not just the ones they're
 * deciding about -- otherwise a duplicate pair could look independently
 * eligible.
 */
export function computeCampaignEligibility(
  allRows: CampaignRowForEligibility[],
  fieldMappings: Pick<FieldMapping, "field_key" | "label" | "is_required">[],
): Map<number, RowEligibility> {
  const outcome = validateExtractedRows(
    allRows.map((row) => ({
      rowIndex: row.rowIndex,
      recipientEmail: row.recipientEmail,
      data: row.data,
    })),
    fieldMappings,
  );

  const result = new Map<number, RowEligibility>();
  for (const row of outcome.rows) {
    result.set(row.rowIndex, { eligible: row.status === "valid", errors: row.errors });
  }
  return result;
}
