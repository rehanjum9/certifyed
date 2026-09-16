import { createServiceRoleClient } from "@/lib/supabase/server";
import { DEFAULT_EMAIL_BATCH_SIZE, clampEmailBatchSize } from "./emailDelivery";
import type { Database } from "@/types/database";

export type EmailJobRow = Database["public"]["Tables"]["jobs"]["Row"];

const SEND_EMAILS: EmailJobRow["job_type"] = "send_emails";

/** The one job (if any) currently pending or running for this campaign -- mirrors getActiveGenerationJob. */
export async function getActiveEmailJob(campaignId: string): Promise<EmailJobRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("job_type", SEND_EMAILS)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to load active email job: ${error.message}`);
  return data;
}

/** Most recent email job of any status, for display when nothing is currently active. */
export async function getLatestEmailJob(campaignId: string): Promise<EmailJobRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("job_type", SEND_EMAILS)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to load latest email job: ${error.message}`);
  return data;
}

/**
 * Creates a new email-delivery job, unless one is already active -- in
 * which case that existing job is returned instead (avoids duplicate active
 * send_emails jobs for the same campaign). Same accepted read-then-insert
 * simplification as startGenerationJob.
 */
export async function startEmailJob(
  campaignId: string,
  requestedBatchSize?: number,
): Promise<{ job: EmailJobRow; created: boolean }> {
  const existing = await getActiveEmailJob(campaignId);
  if (existing) return { job: existing, created: false };

  const supabase = createServiceRoleClient();
  const batchSize = clampEmailBatchSize(requestedBatchSize ?? DEFAULT_EMAIL_BATCH_SIZE);

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      campaign_id: campaignId,
      job_type: SEND_EMAILS,
      status: "pending",
      // Same repurposing as startGenerationJob: batch_end carries the
      // configured per-invocation batch size; batch_start is unused.
      batch_start: 0,
      batch_end: batchSize,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create email job: ${error.message}`);
  return { job: data, created: true };
}
