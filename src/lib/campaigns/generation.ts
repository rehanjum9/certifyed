import { createServiceRoleClient } from "@/lib/supabase/server";
import { getTemplate, downloadTemplateSvg } from "@/lib/templates";
import { listTemplateFields } from "@/lib/templateFields";
import { getPdfRenderer } from "@/lib/pdf";
import { buildProductionOverlays } from "@/lib/pdf/productionOverlays";
import { resolvePdfPageSize } from "@/lib/pdf/pageSize";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage";
import { computeCampaignEligibility, type CampaignRowForEligibility } from "./eligibility";
import type { Database } from "@/types/database";
import type { TemplateFieldRow } from "@/lib/templateFields";

type CampaignRowRow = Database["public"]["Tables"]["campaign_rows"]["Row"];
type CampaignStatus = Database["public"]["Tables"]["campaigns"]["Row"]["status"];

function toFieldMappings(fields: TemplateFieldRow[]) {
  return fields.map((f) => ({ field_key: f.field_key, label: f.label, is_required: f.is_required }));
}

/**
 * Every row in the campaign, regardless of status -- duplicate email/
 * serial_number checks are campaign-wide, so a partial fetch (e.g. only
 * "failed" rows) could miss a duplicate against a "generated" or
 * "pending" row and wrongly call a row eligible.
 */
async function fetchAllRowsForEligibility(campaignId: string): Promise<CampaignRowForEligibility[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("campaign_rows")
    .select("row_index, recipient_email, data")
    .eq("campaign_id", campaignId);

  if (error) throw new Error(`Failed to load campaign rows: ${error.message}`);

  return (data ?? []).map((row) => ({
    rowIndex: row.row_index,
    recipientEmail: row.recipient_email,
    data: (row.data ?? {}) as Record<string, string>,
  }));
}

export const DEFAULT_BATCH_SIZE = 10;
export const MIN_BATCH_SIZE = 1;
export const MAX_BATCH_SIZE = 20;

/** Clamps a caller-requested batch size into a safe, bounded range. Never processes an entire large campaign in one call. */
export function clampBatchSize(requested: number | undefined): number {
  if (!requested || !Number.isFinite(requested)) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, Math.round(requested)));
}

/** Once a batch finishes, the campaign is "processing" while pending rows remain, "completed" once none do -- regardless of how many failed, which the UI reports separately (row-level status breakdown), not by inventing a new campaign-level status. */
export function computeCampaignStatusAfterBatch(pendingRemaining: number): "processing" | "completed" {
  return pendingRemaining > 0 ? "processing" : "completed";
}

/**
 * Atomically-safe-enough claim: SELECT candidate ids, then UPDATE only the
 * ones still `status = 'pending'` at that moment. Postgres re-checks that
 * WHERE clause per-row inside the UPDATE itself, so two concurrent calls
 * can never both flip the same row to "generating" -- whichever UPDATE
 * commits first "wins" that row, and the second simply won't match it
 * (RETURNING/`.select()` only reflects what that call actually changed).
 *
 * This is not `SELECT ... FOR UPDATE SKIP LOCKED` (which would need a
 * Postgres function, since PostgREST doesn't expose raw locking clauses)
 * -- a documented, accepted simplification. Under concurrent calls, both
 * may redundantly read the same initial candidate list, and a batch may
 * come back smaller than requested if another call claimed some of it
 * first, but no row is ever double-claimed. See the Phase 5 report for
 * the remaining limitation this leaves.
 */
async function claimNextBatch(campaignId: string, batchSize: number): Promise<CampaignRowRow[]> {
  const supabase = createServiceRoleClient();

  const { data: candidates, error: selectError } = await supabase
    .from("campaign_rows")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("row_index", { ascending: true })
    .limit(batchSize);

  if (selectError) throw new Error(`Failed to find pending rows: ${selectError.message}`);
  if (!candidates || candidates.length === 0) return [];

  const { data: claimed, error: updateError } = await supabase
    .from("campaign_rows")
    .update({ status: "generating" })
    .in(
      "id",
      candidates.map((c) => c.id),
    )
    .eq("status", "pending")
    .select();

  if (updateError) throw new Error(`Failed to claim rows: ${updateError.message}`);
  return claimed ?? [];
}

export interface BatchGenerationResult {
  claimed: number;
  generated: number;
  failed: number;
  campaignStatus: CampaignStatus;
}

/**
 * Processes one bounded batch of pending rows for a campaign and returns.
 * Designed to be called repeatedly -- manually from the UI in this phase,
 * or by a Phase 6 scheduler later -- rather than looping internally over
 * an entire campaign in one request.
 */
export async function generateCertificatesBatch(
  campaignId: string,
  requestedBatchSize?: number,
): Promise<BatchGenerationResult> {
  const supabase = createServiceRoleClient();
  const batchSize = clampBatchSize(requestedBatchSize);

  const campaign = await requireCampaign(campaignId);
  const template = await getTemplate(campaign.template_id);
  if (!template) throw new Error("The template for this campaign no longer exists.");

  const [svg, fields] = await Promise.all([
    downloadTemplateSvg(template.svg_path),
    listTemplateFields(template.id),
  ]);

  const claimedRows = await claimNextBatch(campaignId, batchSize);

  if (claimedRows.length > 0 && campaign.status === "mapped") {
    await supabase.from("campaigns").update({ status: "processing" }).eq("id", campaignId);
  }

  const renderer = getPdfRenderer();
  const pageSize = resolvePdfPageSize(template.svg_width, template.svg_height);

  // Campaign-wide, not per-row: duplicate email/serial_number can only be
  // decided by looking at every row together (see lib/campaigns/eligibility.ts).
  const allRows = await fetchAllRowsForEligibility(campaignId);
  const eligibilityByRowIndex = computeCampaignEligibility(allRows, toFieldMappings(fields));

  let generated = 0;
  let failed = 0;

  for (const row of claimedRows) {
    const data = (row.data ?? {}) as Record<string, string>;
    const eligibility = eligibilityByRowIndex.get(row.row_index);

    if (!eligibility?.eligible) {
      failed += 1;
      await supabase
        .from("campaign_rows")
        .update({
          status: "failed",
          error_message: eligibility?.errors.join(" ") ?? "Row is no longer eligible for generation.",
        })
        .eq("id", row.id);
      continue;
    }

    try {
      const overlays = buildProductionOverlays(fields, data);
      const result = await renderer.render({
        svg,
        width: pageSize.widthPt,
        height: pageSize.heightPt,
        overlays,
      });

      const pdfPath = `campaigns/${campaignId}/${row.id}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKETS.outputs)
        .upload(pdfPath, result.buffer, { contentType: "application/pdf", upsert: true });

      if (uploadError) throw new Error(uploadError.message);

      await supabase
        .from("campaign_rows")
        .update({ status: "generated", pdf_path: pdfPath, error_message: null })
        .eq("id", row.id);
      generated += 1;
    } catch (error) {
      failed += 1;
      await supabase
        .from("campaign_rows")
        .update({
          status: "failed",
          error_message: `PDF generation failed: ${error instanceof Error ? error.message : String(error)}`,
        })
        .eq("id", row.id);
    }
  }

  const { count: pendingRemaining, error: countError } = await supabase
    .from("campaign_rows")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "pending");

  if (countError) throw new Error(`Failed to check remaining rows: ${countError.message}`);

  const campaignStatus = computeCampaignStatusAfterBatch(pendingRemaining ?? 0);
  await supabase.from("campaigns").update({ status: campaignStatus }).eq("id", campaignId);

  return { claimed: claimedRows.length, generated, failed, campaignStatus };
}

export interface RetryFailedResult {
  requeued: number;
  stillIneligible: number;
}

/**
 * Re-queues `failed` rows that would now pass eligibility back to
 * `pending`, clearing their error_message so the next generation batch
 * picks them up through the normal path. Rows that are `failed` because
 * they never passed Phase 4 validation -- bad email, missing required
 * field, OR a campaign-wide duplicate email/serial_number against
 * *another* row -- fail the same authoritative eligibility check
 * (lib/campaigns/eligibility.ts, run here against every row in the
 * campaign, not just the failed ones) and are left untouched, preserving
 * their original validation error_message rather than overwriting it.
 */
export async function retryFailedRows(campaignId: string): Promise<RetryFailedResult> {
  const supabase = createServiceRoleClient();
  const campaign = await requireCampaign(campaignId);
  const fields = await listTemplateFields(campaign.template_id);

  const { data: failedRows, error } = await supabase
    .from("campaign_rows")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "failed");

  if (error) throw new Error(`Failed to load failed rows: ${error.message}`);
  if (!failedRows || failedRows.length === 0) {
    return { requeued: 0, stillIneligible: 0 };
  }

  const allRows = await fetchAllRowsForEligibility(campaignId);
  const eligibilityByRowIndex = computeCampaignEligibility(allRows, toFieldMappings(fields));

  const eligibleIds = failedRows
    .filter((row) => eligibilityByRowIndex.get(row.row_index)?.eligible)
    .map((row) => row.id);

  if (eligibleIds.length > 0) {
    const { error: updateError } = await supabase
      .from("campaign_rows")
      .update({ status: "pending", error_message: null })
      .in("id", eligibleIds);
    if (updateError) throw new Error(`Failed to requeue rows: ${updateError.message}`);

    await supabase.from("campaigns").update({ status: "processing" }).eq("id", campaignId);
  }

  return {
    requeued: eligibleIds.length,
    stillIneligible: failedRows.length - eligibleIds.length,
  };
}

async function requireCampaign(campaignId: string) {
  const supabase = createServiceRoleClient();
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load campaign: ${error.message}`);
  if (!campaign) throw new Error("Campaign not found.");
  return campaign;
}
