import { createServiceRoleClient } from "@/lib/supabase/server";
import { processGenerationJob } from "@/lib/campaigns/generation";
import { processEmailJob } from "@/lib/campaigns/emailDelivery";

/**
 * The one worker entry point: looks up which pipeline a job id belongs to
 * (generate_pdfs vs. send_emails) and dispatches to the matching
 * processor. Still a single jobs table and a single worker endpoint --
 * this is a type-based dispatch over the existing queue, not a second
 * queue system.
 */
export async function processJob(jobId: string) {
  const supabase = createServiceRoleClient();
  const { data: job, error } = await supabase.from("jobs").select("job_type").eq("id", jobId).maybeSingle();

  if (error) throw new Error(`Failed to load job: ${error.message}`);
  if (!job) throw new Error("Job not found.");

  if (job.job_type === "send_emails") return processEmailJob(jobId);
  return processGenerationJob(jobId);
}

/**
 * The organization a job belongs to -- jobs has no organization_id of its
 * own (child of campaigns, see the architecture report, item 4/28), so
 * this resolves it via the job's campaign_id. Used by the job-process API
 * route to verify the caller may act on this job BEFORE processJob ever
 * touches it (job processing itself must stay trigger-independent and
 * never assume a request-scoped active workspace -- item 28: a resumable
 * job always derives its organization from the persisted campaign, not
 * from whoever happens to poll the process endpoint).
 */
export async function getJobOrganizationId(jobId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();

  const { data: job, error: jobError } = await supabase.from("jobs").select("campaign_id").eq("id", jobId).maybeSingle();
  if (jobError) throw new Error(`Failed to load job: ${jobError.message}`);
  if (!job) return null;

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("organization_id")
    .eq("id", job.campaign_id)
    .maybeSingle();
  if (campaignError) throw new Error(`Failed to load campaign: ${campaignError.message}`);

  return campaign?.organization_id ?? null;
}
