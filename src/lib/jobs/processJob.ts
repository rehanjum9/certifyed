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
