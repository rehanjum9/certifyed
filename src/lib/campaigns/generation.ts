import { createServiceRoleClient } from "@/lib/supabase/server";
import { getTemplate, downloadTemplateSvg } from "@/lib/templates";
import { listTemplateFields } from "@/lib/templateFields";
import { getPdfRenderer } from "@/lib/pdf";
import { buildProductionOverlays } from "@/lib/pdf/productionOverlays";
import { resolvePdfPageSize } from "@/lib/pdf/pageSize";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage";
import { isBuiltInFontId } from "@/lib/fonts";
import { loadCustomFontsForFields } from "@/lib/fonts/customFonts";
import { computeCampaignEligibility, type CampaignRowForEligibility } from "./eligibility";
import type { Database } from "@/types/database";
import type { TemplateFieldRow } from "@/lib/templateFields";

type CampaignRowRow = Database["public"]["Tables"]["campaign_rows"]["Row"];
type CampaignRowStatus = CampaignRowRow["status"];
type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];
type CampaignStatus = CampaignRow["status"];
type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type JobStatus = JobRow["status"];

export function toFieldMappings(fields: TemplateFieldRow[]) {
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

  // Downloaded once per batch (not per row): every field's custom font
  // (if any) is the same across every row in the campaign, so this is
  // shared across the whole loop below rather than re-fetched per PDF.
  const customFontIds = fields.map((f) => f.font_family).filter((id) => !isBuiltInFontId(id));
  const customFonts = customFontIds.length > 0 ? await loadCustomFontsForFields(customFontIds) : [];

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
        customFonts,
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

export async function requireCampaign(campaignId: string) {
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

// ---------------------------------------------------------------------------
// Progress -- authoritative, always recomputed from campaign_rows. The
// client is never trusted to report how many rows are done; every status
// display is derived fresh from the database on every request.
// ---------------------------------------------------------------------------

export interface CampaignProgress {
  /** Rows that pass Phase 4 validation (campaign-wide: unique email, unique serial_number, required fields present) -- the only rows that ever will be generated. */
  eligibleTotal: number;
  /** Rows that failed Phase 4 import validation and can never become eligible without a corrected re-import -- shown separately, never folded into eligibleTotal. */
  invalidImportedTotal: number;
  generated: number;
  /** Eligible rows currently in a failed *generation* attempt (renderer/storage/transient) -- distinct from invalidImportedTotal, and retriable. */
  failed: number;
  pending: number;
  generating: number;
  progressPercent: number;
}

export interface RowStatusForProgress {
  eligible: boolean;
  status: CampaignRowStatus;
}

/**
 * Pure aggregation core, split out from computeCampaignProgress so the
 * counting logic itself (eligible vs. invalid-imported, and the
 * generated/failed/pending/generating breakdown within the eligible set)
 * is unit-testable without a database.
 */
export function summarizeCampaignProgress(rows: RowStatusForProgress[]): CampaignProgress {
  let eligibleTotal = 0;
  let invalidImportedTotal = 0;
  let generated = 0;
  let failed = 0;
  let pending = 0;
  let generating = 0;

  for (const row of rows) {
    if (!row.eligible) {
      invalidImportedTotal += 1;
      continue;
    }
    eligibleTotal += 1;
    if (row.status === "generated" || row.status === "sent") generated += 1;
    else if (row.status === "failed") failed += 1;
    else if (row.status === "generating" || row.status === "emailing") generating += 1;
    else pending += 1;
  }

  const progressPercent = eligibleTotal > 0 ? Math.round((generated / eligibleTotal) * 100) : 0;

  return { eligibleTotal, invalidImportedTotal, generated, failed, pending, generating, progressPercent };
}

export async function computeCampaignProgress(campaignId: string): Promise<CampaignProgress> {
  const supabase = createServiceRoleClient();
  const campaign = await requireCampaign(campaignId);
  const fields = await listTemplateFields(campaign.template_id);

  const { data, error } = await supabase
    .from("campaign_rows")
    .select("row_index, recipient_email, data, status")
    .eq("campaign_id", campaignId);

  if (error) throw new Error(`Failed to load campaign rows: ${error.message}`);

  const rows = data ?? [];
  const eligibility = computeCampaignEligibility(
    rows.map((row) => ({
      rowIndex: row.row_index,
      recipientEmail: row.recipient_email,
      data: (row.data ?? {}) as Record<string, string>,
    })),
    toFieldMappings(fields),
  );

  return summarizeCampaignProgress(
    rows.map((row) => ({
      eligible: eligibility.get(row.row_index)?.eligible ?? false,
      status: row.status,
    })),
  );
}

// ---------------------------------------------------------------------------
// Job-based worker (Phase 6). Wraps generateCertificatesBatch -- the exact
// same Phase 5 generation pipeline -- with a persistent, resumable,
// lock-protected job record so it can be triggered repeatedly by anything
// (a browser polling loop today, Vercel Cron or another scheduler later)
// without ever processing the same row twice.
// ---------------------------------------------------------------------------

export const JOB_STALE_LOCK_MS = 2 * 60 * 1000; // 2 minutes
export const ROW_STALE_GENERATING_MS = 90 * 1000; // 90 seconds

/** Shared staleness rule for both a job's lock and a row stuck in "generating" -- one formula, two call sites. */
export function isLockStale(lockedAt: string | null, staleMs: number, now: number = Date.now()): boolean {
  if (!lockedAt) return false;
  return now - new Date(lockedAt).getTime() > staleMs;
}

/** What a job's status becomes after one batch, given the campaign's resulting status. */
export function jobStatusAfterBatch(campaignStatus: CampaignStatus): JobStatus {
  return campaignStatus === "completed" ? "completed" : "pending";
}

/**
 * Rows can be left stuck in "generating" if a process crashed mid-batch
 * (server restart, function timeout) after claiming them but before
 * writing a final status. Anything stuck past ROW_STALE_GENERATING_MS is
 * released back to "pending" so it becomes claimable again -- recovering
 * the row, not duplicating it (it was never actually finished).
 */
async function recoverStaleGeneratingRows(campaignId: string): Promise<number> {
  const supabase = createServiceRoleClient();
  const staleBefore = new Date(Date.now() - ROW_STALE_GENERATING_MS).toISOString();

  const { data, error } = await supabase
    .from("campaign_rows")
    .update({ status: "pending" })
    .eq("campaign_id", campaignId)
    .eq("status", "generating")
    .lt("updated_at", staleBefore)
    .select("id");

  if (error) throw new Error(`Failed to recover stale rows: ${error.message}`);
  return data?.length ?? 0;
}

export interface JobClaimResult {
  /** False when another worker already holds a fresh lock -- `job` is still the row this call read, just not claimed by it. */
  claimed: boolean;
  job: JobRow;
}

/**
 * Claims a job for processing: succeeds only if the job is "pending", or
 * is "running" with a lock older than JOB_STALE_LOCK_MS (a previous worker
 * that crashed without releasing it). The WHERE clause is re-checked by
 * Postgres atomically inside the UPDATE itself, so two concurrent calls
 * can never both claim the same job -- whichever UPDATE commits first
 * "wins"; the second matches zero rows. Same documented simplification as
 * Phase 5's row-claiming: not `FOR UPDATE SKIP LOCKED`, but correct against
 * double-claiming.
 *
 * Returns the job row either way (claimed or not) instead of just `null` on
 * a lost claim, so callers never need a second, identical SELECT purely to
 * report status back to a poller that didn't win this tick -- this read
 * already has it. `null` is reserved for "no such job at all". On a lost
 * claim, `job` is the pre-update snapshot this call read (a few
 * milliseconds old at most); the next poll tick reads fresh state again, so
 * this never affects claiming correctness, only how current a
 * losing-tick's *display* status is.
 */
export async function claimJob(jobId: string): Promise<JobClaimResult | null> {
  const supabase = createServiceRoleClient();

  const { data: existing, error: readError } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (readError) throw new Error(`Failed to load job: ${readError.message}`);
  if (!existing) return null;

  const staleBefore = new Date(Date.now() - JOB_STALE_LOCK_MS).toISOString();

  const { data: claimed, error: updateError } = await supabase
    .from("jobs")
    .update({ status: "running", locked_at: new Date().toISOString(), attempts: existing.attempts + 1 })
    .eq("id", jobId)
    .or(`status.eq.pending,and(status.eq.running,locked_at.lt.${staleBefore})`)
    .select()
    .maybeSingle();

  if (updateError) throw new Error(`Failed to claim job: ${updateError.message}`);
  return claimed ? { claimed: true, job: claimed } : { claimed: false, job: existing };
}

export interface JobInfo {
  id: string;
  status: JobStatus;
  attempts: number;
  lastError: string | null;
}

export function toJobInfo(job: JobRow): JobInfo {
  return { id: job.id, status: job.status, attempts: job.attempts, lastError: job.last_error };
}

export interface ProcessJobResult {
  /** False when another worker already holds a fresh lock on this job -- not an error, just "try again shortly." */
  claimed: boolean;
  job: JobInfo;
  campaignId: string;
  batch: { generated: number; failed: number } | null;
  progress: CampaignProgress;
}

/**
 * Processes exactly one bounded batch for whatever campaign this job
 * belongs to, then returns -- the reusable worker function requirement 4
 * asks for. The job id is the only client-supplied input; campaign,
 * template, and rows are all resolved server-side from it, never trusted
 * from the caller (see the route handler).
 */
export async function processGenerationJob(jobId: string, requestedBatchSize?: number): Promise<ProcessJobResult> {
  const supabase = createServiceRoleClient();

  const claimResult = await claimJob(jobId);
  if (!claimResult) throw new Error("Job not found.");

  if (!claimResult.claimed) {
    // Someone else holds the lock -- report status from the row claimJob
    // already read rather than issuing a second, identical SELECT.
    const progress = await computeCampaignProgress(claimResult.job.campaign_id);
    return {
      claimed: false,
      job: toJobInfo(claimResult.job),
      campaignId: claimResult.job.campaign_id,
      batch: null,
      progress,
    };
  }

  const claimedJob = claimResult.job;

  try {
    await recoverStaleGeneratingRows(claimedJob.campaign_id);

    const batchSize = clampBatchSize(requestedBatchSize ?? claimedJob.batch_end);
    const result = await generateCertificatesBatch(claimedJob.campaign_id, batchSize);
    const nextStatus = jobStatusAfterBatch(result.campaignStatus);

    const { data: updatedJob, error: updateError } = await supabase
      .from("jobs")
      .update({ status: nextStatus, locked_at: null, last_error: null })
      .eq("id", jobId)
      .select()
      .single();

    if (updateError) throw new Error(`Failed to update job: ${updateError.message}`);

    const progress = await computeCampaignProgress(claimedJob.campaign_id);

    return {
      claimed: true,
      job: toJobInfo(updatedJob),
      campaignId: claimedJob.campaign_id,
      batch: { generated: result.generated, failed: result.failed },
      progress,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("jobs").update({ status: "failed", locked_at: null, last_error: message }).eq("id", jobId);
    throw new Error(message);
  }
}
