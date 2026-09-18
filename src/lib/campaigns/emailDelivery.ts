import { createServiceRoleClient } from "@/lib/supabase/server";
import { buildCertificateFilename } from "@/lib/pdf/filename";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage";
import { renderCertificateEmail } from "@/lib/email/template";
import { sendCertificateEmail } from "@/lib/email/provider";
import { requireCampaign, claimJob, toJobInfo, ROW_STALE_GENERATING_MS, type JobInfo } from "./generation";
import type { Database } from "@/types/database";

type CampaignRowRow = Database["public"]["Tables"]["campaign_rows"]["Row"];
type CampaignRowStatus = CampaignRowRow["status"];

// ---------------------------------------------------------------------------
// Email eligibility
//
// A row's eligibility (valid email, unique email/serial_number, required
// fields present) was already decided once and for all at generation time --
// only rows that passed that check ever reach status "generated" with a
// non-null pdf_path (see lib/campaigns/generation.ts / eligibility.ts). Row
// data never changes after import, so that decision never goes stale and is
// deliberately NOT re-run here.
//
// The single `status` column has to carry both "PDF generation failed" and
// "email delivery failed" as the same "failed" value. They are distinguished
// by pdf_path: a generation failure never got a pdf_path (still null); an
// email failure only happens to a row that already has one. This is the
// documented, schema-preserving resolution to that ambiguity -- see the
// Phase 7 report for the one edge case it doesn't cover (a row manually
// nulled out some other way).
// ---------------------------------------------------------------------------

export interface EmailCandidateRow {
  status: CampaignRowStatus;
  pdfPath: string | null;
  recipientEmail: string | null;
  emailAttempts: number;
}

/**
 * P1 hardening: caps how many real send attempts one row gets before it's
 * excluded from retry entirely. Without this, a permanently-failing address
 * (hard bounce, provider always rejecting it) could be retried forever,
 * burning provider quota and repeatedly hitting the same recipient. Each
 * real send attempt (success or failure) increments campaign_rows.email_attempts
 * -- see sendCertificateEmailsBatch.
 */
export const MAX_EMAIL_ATTEMPTS = 5;

/** Ready for a first email attempt: generated, has a PDF, has a recipient address. */
export function isEligibleForEmailSend(row: EmailCandidateRow): boolean {
  return row.status === "generated" && row.pdfPath != null && !!row.recipientEmail;
}

/** Retriable after an email failure specifically (not a generation failure), and only while attempts remain -- see module doc comment above. */
export function isEligibleForEmailRetry(row: EmailCandidateRow): boolean {
  return row.status === "failed" && row.pdfPath != null && !!row.recipientEmail && row.emailAttempts < MAX_EMAIL_ATTEMPTS;
}

export const DEFAULT_EMAIL_BATCH_SIZE = 5;
export const MIN_EMAIL_BATCH_SIZE = 1;
export const MAX_EMAIL_BATCH_SIZE = 10;

/** Clamps a caller-requested email batch size into a safe, bounded range -- mirrors clampBatchSize for generation, smaller ceiling to stay rate-limit-friendly. */
export function clampEmailBatchSize(requested: number | undefined): number {
  if (!requested || !Number.isFinite(requested)) return DEFAULT_EMAIL_BATCH_SIZE;
  return Math.min(MAX_EMAIL_BATCH_SIZE, Math.max(MIN_EMAIL_BATCH_SIZE, Math.round(requested)));
}

// ---------------------------------------------------------------------------
// Progress -- authoritative, always recomputed from campaign_rows.
// ---------------------------------------------------------------------------

export interface EmailProgress {
  /** Rows that have ever had a certificate PDF generated -- the only rows that will ever be emailed. Rows still awaiting PDF generation are not part of this total yet. */
  eligibleTotal: number;
  sent: number;
  /** Generated, not yet attempted (or successfully retried back into this state). */
  pending: number;
  failed: number;
  emailing: number;
  progressPercent: number;
}

export function summarizeEmailProgress(rows: EmailCandidateRow[]): EmailProgress {
  let eligibleTotal = 0;
  let sent = 0;
  let pending = 0;
  let failed = 0;
  let emailing = 0;

  for (const row of rows) {
    if (row.pdfPath == null) continue; // never generated -- not part of the email universe yet

    if (row.status === "sent") {
      eligibleTotal += 1;
      sent += 1;
    } else if (row.status === "emailing") {
      eligibleTotal += 1;
      emailing += 1;
    } else if (row.status === "generated") {
      eligibleTotal += 1;
      pending += 1;
    } else if (row.status === "failed") {
      eligibleTotal += 1;
      failed += 1;
    }
    // Any other status with a pdf_path (pending/generating) cannot actually
    // occur given the state machine, but is safely excluded rather than counted.
  }

  const progressPercent = eligibleTotal > 0 ? Math.round((sent / eligibleTotal) * 100) : 0;
  return { eligibleTotal, sent, pending, failed, emailing, progressPercent };
}

export async function computeEmailProgress(campaignId: string): Promise<EmailProgress> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("campaign_rows")
    .select("status, pdf_path, recipient_email, email_attempts")
    .eq("campaign_id", campaignId);

  if (error) throw new Error(`Failed to load campaign rows: ${error.message}`);

  return summarizeEmailProgress(
    (data ?? []).map((row) => ({
      status: row.status,
      pdfPath: row.pdf_path,
      recipientEmail: row.recipient_email,
      emailAttempts: row.email_attempts,
    })),
  );
}

// ---------------------------------------------------------------------------
// Claiming and stale recovery -- same conditional-UPDATE pattern as Phase 6's
// row/job claiming (lib/campaigns/generation.ts), reused rather than
// reimplemented for jobs, and mirrored for rows here.
// ---------------------------------------------------------------------------

async function recoverStaleEmailingRows(campaignId: string): Promise<number> {
  const supabase = createServiceRoleClient();
  const staleBefore = new Date(Date.now() - ROW_STALE_GENERATING_MS).toISOString();

  const { data, error } = await supabase
    .from("campaign_rows")
    .update({ status: "generated" })
    .eq("campaign_id", campaignId)
    .eq("status", "emailing")
    .lt("updated_at", staleBefore)
    .select("id");

  if (error) throw new Error(`Failed to recover stale emailing rows: ${error.message}`);
  return data?.length ?? 0;
}

async function claimNextEmailBatch(campaignId: string, batchSize: number): Promise<CampaignRowRow[]> {
  const supabase = createServiceRoleClient();

  const { data: candidates, error: selectError } = await supabase
    .from("campaign_rows")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "generated")
    .not("pdf_path", "is", null)
    .not("recipient_email", "is", null)
    .order("row_index", { ascending: true })
    .limit(batchSize);

  if (selectError) throw new Error(`Failed to find rows ready for email: ${selectError.message}`);
  if (!candidates || candidates.length === 0) return [];

  const { data: claimed, error: updateError } = await supabase
    .from("campaign_rows")
    .update({ status: "emailing" })
    .in(
      "id",
      candidates.map((c) => c.id),
    )
    .eq("status", "generated")
    .select();

  if (updateError) throw new Error(`Failed to claim rows for email: ${updateError.message}`);
  return claimed ?? [];
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export interface EmailBatchResult {
  claimed: number;
  sent: number;
  failed: number;
}

/**
 * Sends one bounded batch of already-generated certificates. Never
 * regenerates a PDF -- it only ever reads the existing pdf_path from
 * private storage. Emails are sent sequentially (not concurrently) to stay
 * rate-limit-friendly; one recipient's failure is caught and recorded
 * without aborting the rest of the batch.
 */
export async function sendCertificateEmailsBatch(campaignId: string, requestedBatchSize?: number): Promise<EmailBatchResult> {
  const supabase = createServiceRoleClient();
  const batchSize = clampEmailBatchSize(requestedBatchSize);
  const campaign = await requireCampaign(campaignId);

  const claimedRows = await claimNextEmailBatch(campaignId, batchSize);

  let sent = 0;
  let failed = 0;

  for (const row of claimedRows) {
    try {
      if (!row.recipient_email || !row.pdf_path) {
        throw new Error("Row is missing a recipient email or generated PDF.");
      }

      const { data: pdfBlob, error: downloadError } = await supabase.storage
        .from(STORAGE_BUCKETS.outputs)
        .download(row.pdf_path);
      if (downloadError || !pdfBlob) {
        throw new Error(`Failed to load certificate PDF: ${downloadError?.message ?? "not found"}`);
      }
      const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());

      const rowData = (row.data ?? {}) as Record<string, string>;
      const recipientName = rowData.name || null;
      const serialNumber = rowData.serial_number || null;

      const { subject, html, text } = renderCertificateEmail({
        recipientName,
        campaignName: campaign.name,
        serialNumber,
      });
      const filename = buildCertificateFilename({ recipientName, serialNumber, rowId: row.id });

      const result = await sendCertificateEmail(
        {
          to: row.recipient_email,
          subject,
          html,
          text,
          attachment: { filename, content: pdfBuffer },
        },
        { organizationId: campaign.organization_id },
      );

      await supabase
        .from("campaign_rows")
        .update({
          status: "sent",
          email_message_id: result.messageId,
          emailed_at: new Date().toISOString(),
          error_message: null,
          email_attempts: row.email_attempts + 1,
        })
        .eq("id", row.id);
      sent += 1;
    } catch (error) {
      failed += 1;
      // Counts toward MAX_EMAIL_ATTEMPTS regardless of which step failed
      // (provider rejection, PDF download hiccup, etc.) -- otherwise a row
      // could dodge the cap forever by always failing before the actual
      // provider call. See isEligibleForEmailRetry / retryFailedEmails.
      const attempts = row.email_attempts + 1;
      const exhausted = attempts >= MAX_EMAIL_ATTEMPTS;
      const reason = error instanceof Error ? error.message : String(error);
      await supabase
        .from("campaign_rows")
        .update({
          status: "failed",
          email_attempts: attempts,
          error_message: exhausted
            ? `Email delivery failed: ${reason} (attempt ${attempts}/${MAX_EMAIL_ATTEMPTS} -- maximum retries reached; this row will not be retried automatically).`
            : `Email delivery failed: ${reason} (attempt ${attempts}/${MAX_EMAIL_ATTEMPTS}).`,
        })
        .eq("id", row.id);
    }
  }

  return { claimed: claimedRows.length, sent, failed };
}

export interface RetryFailedEmailsResult {
  requeued: number;
  /** Failed at generation (no pdf_path), or missing a recipient email -- never a candidate for this retry path. */
  notRetriable: number;
  /** Failed at email delivery specifically, but already hit MAX_EMAIL_ATTEMPTS -- a clear, distinct reason from notRetriable. */
  attemptsExhausted: number;
}

/**
 * Re-queues rows whose *email* delivery failed (status "failed" with a
 * pdf_path already set -- see module doc comment) back to "generated" so
 * the next email batch picks them up. Rows that are "failed" because
 * generation itself never produced a PDF are left untouched here --
 * lib/campaigns/generation.ts's retryFailedRows is the correct retry path
 * for those. Rows that already hit MAX_EMAIL_ATTEMPTS are also left
 * untouched -- see isEligibleForEmailRetry.
 */
export async function retryFailedEmails(campaignId: string): Promise<RetryFailedEmailsResult> {
  const supabase = createServiceRoleClient();
  await requireCampaign(campaignId);

  const { data: failedRows, error } = await supabase
    .from("campaign_rows")
    .select("id, pdf_path, recipient_email, email_attempts")
    .eq("campaign_id", campaignId)
    .eq("status", "failed");

  if (error) throw new Error(`Failed to load failed rows: ${error.message}`);
  if (!failedRows || failedRows.length === 0) {
    return { requeued: 0, notRetriable: 0, attemptsExhausted: 0 };
  }

  const candidateRows = failedRows.map((row) => ({
    id: row.id,
    status: "failed" as const,
    pdfPath: row.pdf_path,
    recipientEmail: row.recipient_email,
    emailAttempts: row.email_attempts,
  }));

  const retriableIds = candidateRows.filter(isEligibleForEmailRetry).map((row) => row.id);

  const attemptsExhausted = candidateRows.filter(
    (row) => row.pdfPath != null && !!row.recipientEmail && row.emailAttempts >= MAX_EMAIL_ATTEMPTS,
  ).length;

  if (retriableIds.length > 0) {
    const { error: updateError } = await supabase
      .from("campaign_rows")
      .update({ status: "generated", error_message: null })
      .in("id", retriableIds);
    if (updateError) throw new Error(`Failed to requeue rows for email retry: ${updateError.message}`);
  }

  return {
    requeued: retriableIds.length,
    notRetriable: failedRows.length - retriableIds.length - attemptsExhausted,
    attemptsExhausted,
  };
}

// ---------------------------------------------------------------------------
// Job-based worker -- reuses Phase 6's claimJob (staleness/locking is
// identical for any job, regardless of job_type) and JobInfo shape.
// ---------------------------------------------------------------------------

function emailJobStatusAfterBatch(pendingRemaining: number): "pending" | "completed" {
  return pendingRemaining > 0 ? "pending" : "completed";
}

export interface ProcessEmailJobResult {
  claimed: boolean;
  job: JobInfo;
  campaignId: string;
  batch: { sent: number; failed: number } | null;
  progress: EmailProgress;
}

/**
 * Processes exactly one bounded batch of emails for whatever campaign this
 * job belongs to, then returns -- same trigger-independent, resumable
 * shape as processGenerationJob. The job id is the only client-supplied
 * input; campaign and rows are resolved server-side from it.
 */
export async function processEmailJob(jobId: string, requestedBatchSize?: number): Promise<ProcessEmailJobResult> {
  const supabase = createServiceRoleClient();

  const claimResult = await claimJob(jobId);
  if (!claimResult) throw new Error("Job not found.");

  if (!claimResult.claimed) {
    // Someone else holds the lock -- report status from the row claimJob
    // already read rather than issuing a second, identical SELECT.
    const progress = await computeEmailProgress(claimResult.job.campaign_id);
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
    await recoverStaleEmailingRows(claimedJob.campaign_id);

    const batchSize = clampEmailBatchSize(requestedBatchSize ?? claimedJob.batch_end);
    const result = await sendCertificateEmailsBatch(claimedJob.campaign_id, batchSize);

    const { count: pendingRemaining, error: countError } = await supabase
      .from("campaign_rows")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", claimedJob.campaign_id)
      .eq("status", "generated");

    if (countError) throw new Error(`Failed to check remaining rows: ${countError.message}`);

    const nextStatus = emailJobStatusAfterBatch(pendingRemaining ?? 0);

    const { data: updatedJob, error: updateError } = await supabase
      .from("jobs")
      .update({ status: nextStatus, locked_at: null, last_error: null })
      .eq("id", jobId)
      .select()
      .single();

    if (updateError) throw new Error(`Failed to update job: ${updateError.message}`);

    const progress = await computeEmailProgress(claimedJob.campaign_id);

    return {
      claimed: true,
      job: toJobInfo(updatedJob),
      campaignId: claimedJob.campaign_id,
      batch: { sent: result.sent, failed: result.failed },
      progress,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("jobs").update({ status: "failed", locked_at: null, last_error: message }).eq("id", jobId);
    throw new Error(message);
  }
}

// ---------------------------------------------------------------------------
// Safe test send -- does NOT mutate the row's real status/email_message_id,
// so it can be used repeatedly to verify sender/domain/attachment formatting
// before a real bulk send.
// ---------------------------------------------------------------------------

export interface SendTestEmailInput {
  campaignId: string;
  /** Defaults to the first row in the campaign that already has a generated PDF. */
  rowId?: string;
  testEmail: string;
}

export async function sendTestCertificateEmail({ campaignId, rowId, testEmail }: SendTestEmailInput): Promise<{ messageId: string }> {
  const supabase = createServiceRoleClient();
  const campaign = await requireCampaign(campaignId);

  const rowQuery = supabase.from("campaign_rows").select("*").eq("campaign_id", campaignId);
  const { data: row, error } = rowId
    ? await rowQuery.eq("id", rowId).maybeSingle()
    : await rowQuery.not("pdf_path", "is", null).order("row_index", { ascending: true }).limit(1).maybeSingle();

  if (error) throw new Error(`Failed to load row: ${error.message}`);
  if (!row) throw new Error("No generated certificate is available to send as a test yet.");
  if (!row.pdf_path) throw new Error("This row has not been generated yet -- generate its certificate first.");

  const { data: pdfBlob, error: downloadError } = await supabase.storage
    .from(STORAGE_BUCKETS.outputs)
    .download(row.pdf_path);
  if (downloadError || !pdfBlob) {
    throw new Error(`Failed to load certificate PDF: ${downloadError?.message ?? "not found"}`);
  }
  const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());

  const rowData = (row.data ?? {}) as Record<string, string>;
  const recipientName = rowData.name || null;
  const serialNumber = rowData.serial_number || null;
  const { subject, html, text } = renderCertificateEmail({ recipientName, campaignName: campaign.name, serialNumber });
  const filename = buildCertificateFilename({ recipientName, serialNumber, rowId: row.id });

  const result = await sendCertificateEmail(
    {
      to: testEmail,
      // Reuses the same sanitized subject as a real send (renderCertificateEmail
      // already strips header-injection characters from campaign.name) --
      // never builds a second, unsanitized subject string from raw campaign data.
      subject: `[TEST] ${subject}`,
      html: `<p style="color:#b45309;font-weight:600;">This is a TEST email -- not sent to the real recipient.</p>${html}`,
      text: `THIS IS A TEST EMAIL -- not sent to the real recipient.\n\n${text}`,
      attachment: { filename, content: pdfBuffer },
    },
    { organizationId: campaign.organization_id },
  );

  // Deliberately does not touch row.status/email_message_id/emailed_at --
  // a test send must never mark a real recipient row as sent.
  return { messageId: result.messageId };
}
