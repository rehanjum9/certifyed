import { createServiceRoleClient } from "@/lib/supabase/server";
import { DEFAULT_BATCH_SIZE, clampBatchSize } from "./generation";
import type { Database } from "@/types/database";

export type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

const GENERATE_PDFS: JobRow["job_type"] = "generate_pdfs";

/** The one job (if any) currently pending or running for this campaign -- the "is generation already in progress" check. */
export async function getActiveGenerationJob(campaignId: string): Promise<JobRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("job_type", GENERATE_PDFS)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to load active job: ${error.message}`);
  return data;
}

/** Most recent generation job of any status, for display when nothing is currently active (e.g. "completed" or "failed"). */
export async function getLatestGenerationJob(campaignId: string): Promise<JobRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("job_type", GENERATE_PDFS)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to load latest job: ${error.message}`);
  return data;
}

/**
 * Creates a new generation job, unless one is already active -- in which
 * case that existing job is returned instead. This is the "do not create
 * duplicate active jobs for the same campaign" guarantee: it's a normal
 * read-then-insert (not claim-safe against a simultaneous call the way
 * claimJob is), which is an accepted simplification for a user clicking a
 * single button -- see the Phase 6 report for the exact, narrow scenario
 * this could still double up under, and why it doesn't cause double
 * generation in practice.
 */
export async function startGenerationJob(
  campaignId: string,
  requestedBatchSize?: number,
): Promise<{ job: JobRow; created: boolean }> {
  const existing = await getActiveGenerationJob(campaignId);
  if (existing) return { job: existing, created: false };

  const supabase = createServiceRoleClient();
  const batchSize = clampBatchSize(requestedBatchSize ?? DEFAULT_BATCH_SIZE);

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      campaign_id: campaignId,
      job_type: GENERATE_PDFS,
      status: "pending",
      // batch_start/batch_end don't represent a fixed row range in this
      // job model (eligible rows are claimed dynamically, not by index
      // range) -- batch_end is repurposed to record the configured
      // per-invocation batch size; batch_start is unused, kept at 0.
      batch_start: 0,
      batch_end: batchSize,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create generation job: ${error.message}`);
  return { job: data, created: true };
}
