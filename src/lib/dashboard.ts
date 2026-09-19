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

/**
 * campaign_rows has no organization_id of its own (child of campaigns --
 * see the architecture report, item 4), so it's scoped in two steps: the
 * organization's own campaign ids first, then `.in("campaign_id", ...)`.
 * Deliberately not a Supabase embedded-resource filter
 * (`campaigns!inner(organization_id)`) -- this app's hand-written
 * Database type (src/types/database.ts) carries no Relationships metadata
 * for supabase-js to type-check an embedded filter against, and every
 * other multi-table read in this codebase already uses this same
 * two-query, in-memory-join shape (see lib/campaigns.ts#listCampaigns) for
 * that reason.
 */
async function listOrganizationCampaignIds(organizationId: string): Promise<string[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("campaigns").select("id").eq("organization_id", organizationId);
  if (error) throw new Error(`Failed to load campaigns: ${error.message}`);
  return (data ?? []).map((row) => row.id);
}

export async function getDashboardStats(organizationId: string): Promise<DashboardStats> {
  const supabase = createServiceRoleClient();
  const campaignIds = await listOrganizationCampaignIds(organizationId);

  const [templatesCount, campaignsCount, generatedCount, sentCount, failedCount] = await Promise.all([
    supabase.from("templates").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    campaignIds.length === 0
      ? { count: 0, error: null }
      : await supabase
          .from("campaign_rows")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", campaignIds)
          .not("pdf_path", "is", null),
    campaignIds.length === 0
      ? { count: 0, error: null }
      : await supabase
          .from("campaign_rows")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", campaignIds)
          .eq("status", "sent"),
    campaignIds.length === 0
      ? { count: 0, error: null }
      : await supabase
          .from("campaign_rows")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", campaignIds)
          .eq("status", "failed"),
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

export interface ActivitySourceRows {
  /** Only timestamps -- deliberately no recipient name/email/data (see buildActivityEntries doc comment). */
  generatedRows: { updated_at: string }[];
  sentRows: { emailed_at: string | null }[];
  completedCampaigns: { name: string; updated_at: string }[];
  newTemplates: { name: string; created_at: string }[];
}

/**
 * Pure activity-feed builder. Deliberately takes NO recipient-identifying
 * fields (no name, no email, no row data) -- this dashboard has no login
 * wall around *who* can see it beyond "is an authenticated operator," and
 * even for the operator, generic activity text is the safer default. See
 * the P0 security report (PRIV-DASHBOARD-01): the previous version of this
 * function interpolated recipient name/email directly into the feed text,
 * which is exactly the shape of bug this function's input type now makes
 * impossible to reintroduce by accident.
 */
export function buildActivityEntries(sources: ActivitySourceRows): DashboardActivityEntry[] {
  const entries: DashboardActivityEntry[] = [];

  for (const row of sources.generatedRows) {
    entries.push({ kind: "generated", text: "Certificate generated", timestamp: row.updated_at });
  }

  for (const row of sources.sentRows) {
    if (!row.emailed_at) continue;
    entries.push({ kind: "sent", text: "Certificate sent", timestamp: row.emailed_at });
  }

  for (const campaign of sources.completedCampaigns) {
    entries.push({ kind: "campaign_completed", text: `Campaign completed: ${campaign.name}`, timestamp: campaign.updated_at });
  }

  for (const template of sources.newTemplates) {
    entries.push({ kind: "template_created", text: `Template uploaded: ${template.name}`, timestamp: template.created_at });
  }

  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return entries.slice(0, RECENT_LIMIT + 2);
}

/**
 * A best-effort recent-activity feed assembled from real row/campaign/
 * template timestamps that already exist -- never a fabricated timeline.
 * Each entry corresponds to one real, already-persisted change. Only
 * timestamps (and, for campaigns/templates, their own non-recipient name)
 * are ever selected from campaign_rows -- no recipient email or row data
 * column is fetched here at all, so it cannot leak into the feed. Scoped
 * to `organizationId` throughout (see getDashboardStats's doc comment for
 * why campaign_rows is scoped via campaign ids rather than a join filter).
 */
export async function getRecentActivity(organizationId: string): Promise<DashboardActivityEntry[]> {
  const supabase = createServiceRoleClient();
  const campaignIds = await listOrganizationCampaignIds(organizationId);

  const [generatedRows, sentRows, completedCampaigns, newTemplates] = await Promise.all([
    campaignIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("campaign_rows")
          .select("updated_at")
          .in("campaign_id", campaignIds)
          .eq("status", "generated")
          .order("updated_at", { ascending: false })
          .limit(RECENT_LIMIT),
    campaignIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("campaign_rows")
          .select("emailed_at")
          .in("campaign_id", campaignIds)
          .eq("status", "sent")
          .not("emailed_at", "is", null)
          .order("emailed_at", { ascending: false })
          .limit(RECENT_LIMIT),
    supabase
      .from("campaigns")
      .select("name, updated_at")
      .eq("organization_id", organizationId)
      .eq("status", "completed")
      .order("updated_at", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from("templates")
      .select("name, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
  ]);

  for (const result of [generatedRows, sentRows, completedCampaigns, newTemplates]) {
    if (result.error) throw new Error(`Failed to load recent activity: ${result.error.message}`);
  }

  return buildActivityEntries({
    generatedRows: generatedRows.data ?? [],
    sentRows: sentRows.data ?? [],
    completedCampaigns: completedCampaigns.data ?? [],
    newTemplates: newTemplates.data ?? [],
  });
}
