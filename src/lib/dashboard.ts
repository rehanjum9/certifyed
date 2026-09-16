import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Read-only aggregates for the dashboard's stat cards. Every number here
 * is a real count derived from campaigns/campaign_rows -- nothing is
 * invented. Counting logic is display-only and does not affect any
 * generation/email business rule (see lib/campaigns/generation.ts and
 * lib/campaigns/emailDelivery.ts for the authoritative rules those use).
 */
export interface DashboardStats {
  totalTemplates: number;
  totalCampaigns: number;
  certificatesGenerated: number;
  emailsSent: number;
  failedItems: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = createServiceRoleClient();

  const [templatesCount, campaignsCount, generatedCount, sentCount, failedCount] = await Promise.all([
    supabase.from("templates").select("id", { count: "exact", head: true }),
    supabase.from("campaigns").select("id", { count: "exact", head: true }),
    supabase.from("campaign_rows").select("id", { count: "exact", head: true }).not("pdf_path", "is", null),
    supabase.from("campaign_rows").select("id", { count: "exact", head: true }).eq("status", "sent"),
    supabase.from("campaign_rows").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);

  for (const result of [templatesCount, campaignsCount, generatedCount, sentCount, failedCount]) {
    if (result.error) throw new Error(`Failed to load dashboard stats: ${result.error.message}`);
  }

  return {
    totalTemplates: templatesCount.count ?? 0,
    totalCampaigns: campaignsCount.count ?? 0,
    certificatesGenerated: generatedCount.count ?? 0,
    emailsSent: sentCount.count ?? 0,
    failedItems: failedCount.count ?? 0,
  };
}

export type DashboardActivityKind = "generated" | "sent" | "campaign_completed" | "template_created";

export interface DashboardActivityEntry {
  kind: DashboardActivityKind;
  text: string;
  timestamp: string;
}

const RECENT_LIMIT = 4;

/**
 * A best-effort recent-activity feed assembled from real row/campaign/
 * template timestamps that already exist -- never a fabricated timeline.
 * Each entry corresponds to one real, already-persisted change.
 */
export async function getRecentActivity(): Promise<DashboardActivityEntry[]> {
  const supabase = createServiceRoleClient();

  const [generatedRows, sentRows, completedCampaigns, newTemplates] = await Promise.all([
    supabase
      .from("campaign_rows")
      .select("data, recipient_email, updated_at")
      .eq("status", "generated")
      .order("updated_at", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from("campaign_rows")
      .select("recipient_email, emailed_at")
      .eq("status", "sent")
      .not("emailed_at", "is", null)
      .order("emailed_at", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from("campaigns")
      .select("name, updated_at")
      .eq("status", "completed")
      .order("updated_at", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase.from("templates").select("name, created_at").order("created_at", { ascending: false }).limit(RECENT_LIMIT),
  ]);

  for (const result of [generatedRows, sentRows, completedCampaigns, newTemplates]) {
    if (result.error) throw new Error(`Failed to load recent activity: ${result.error.message}`);
  }

  const entries: DashboardActivityEntry[] = [];

  for (const row of generatedRows.data ?? []) {
    const rowData = (row.data ?? {}) as Record<string, string>;
    const who = rowData.name || row.recipient_email || "a recipient";
    entries.push({ kind: "generated", text: `Generated certificate for ${who}`, timestamp: row.updated_at });
  }

  for (const row of sentRows.data ?? []) {
    if (!row.emailed_at) continue;
    entries.push({
      kind: "sent",
      text: `Sent certificate to ${row.recipient_email ?? "a recipient"}`,
      timestamp: row.emailed_at,
    });
  }

  for (const campaign of completedCampaigns.data ?? []) {
    entries.push({ kind: "campaign_completed", text: `Campaign completed: ${campaign.name}`, timestamp: campaign.updated_at });
  }

  for (const template of newTemplates.data ?? []) {
    entries.push({ kind: "template_created", text: `Template uploaded: ${template.name}`, timestamp: template.created_at });
  }

  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return entries.slice(0, RECENT_LIMIT + 2);
}
