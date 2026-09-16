import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];

export interface CampaignListItem extends CampaignRow {
  templateName: string | null;
  rowCount: number;
}

export async function listCampaigns(): Promise<CampaignListItem[]> {
  const supabase = createServiceRoleClient();

  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select("*")
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
