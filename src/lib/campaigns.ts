import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];
export type CampaignRowRecord = Database["public"]["Tables"]["campaign_rows"]["Row"];

export interface CampaignListItem extends CampaignRow {
  templateName: string | null;
  rowCount: number;
}

export async function listCampaigns(organizationId: string): Promise<CampaignListItem[]> {
  const supabase = createServiceRoleClient();

  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load campaigns: ${error.message}`);
  if (!campaigns || campaigns.length === 0) return [];

  const templateIds = [...new Set(campaigns.map((c) => c.template_id))];
  const { data: templates, error: templatesError } = await supabase
    .from("templates")
    .select("id, name")
    .in("id", templateIds);

  if (templatesError) throw new Error(`Failed to load templates: ${templatesError.message}`);
  const templateNameById = new Map((templates ?? []).map((t) => [t.id, t.name]));

  const { data: rowCounts, error: rowCountsError } = await supabase
    .from("campaign_rows")
    .select("campaign_id")
    .in(
      "campaign_id",
      campaigns.map((c) => c.id),
    );

  if (rowCountsError) throw new Error(`Failed to load campaign rows: ${rowCountsError.message}`);
  const countByCampaignId = new Map<string, number>();
  for (const row of rowCounts ?? []) {
    countByCampaignId.set(row.campaign_id, (countByCampaignId.get(row.campaign_id) ?? 0) + 1);
  }

  return campaigns.map((campaign) => ({
    ...campaign,
    templateName: templateNameById.get(campaign.template_id) ?? null,
    rowCount: countByCampaignId.get(campaign.id) ?? 0,
  }));
}

/**
 * Scoped by organizationId, same rationale as lib/templates.ts#getTemplate:
 * the service-role client bypasses RLS, so this `.eq("organization_id", ...)`
 * is the actual isolation boundary, not a formality. A campaign belonging
 * to a different organization returns null here -- indistinguishable from
 * one that never existed (see the architecture report, item 30).
 */
export async function getCampaign(campaignId: string, organizationId: string): Promise<CampaignRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load campaign: ${error.message}`);
  return data;
}

/**
 * campaign_rows has no organization_id of its own (child of campaigns --
 * see the architecture report, item 4); callers MUST have already
 * authorized `campaignId` against the caller's organization (e.g. via a
 * prior getCampaign(campaignId, organizationId) call) before calling this,
 * exactly like every other campaign_rows/template_fields accessor in this
 * codebase.
 */
export async function listCampaignRows(campaignId: string): Promise<CampaignRowRecord[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("campaign_rows")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("row_index", { ascending: true });

  if (error) throw new Error(`Failed to load campaign rows: ${error.message}`);
  return data ?? [];
}

/** Same "caller must already have authorized campaignId" contract as listCampaignRows. */
export async function getCampaignRow(campaignId: string, rowId: string): Promise<CampaignRowRecord | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("campaign_rows")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("id", rowId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load campaign row: ${error.message}`);
  return data;
}
