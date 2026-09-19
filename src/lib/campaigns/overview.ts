import { listCampaigns, type CampaignListItem } from "@/lib/campaigns";
import { computeCampaignProgress } from "./generation";
import { computeEmailProgress } from "./emailDelivery";

/**
 * Read-only display aggregation: merges each campaign with its generation
 * and email progress for list/table views. Purely additive on top of the
 * existing listCampaigns/computeCampaignProgress/computeEmailProgress --
 * no business rule here, just composing already-authoritative numbers for
 * presentation.
 */
export interface CampaignOverview extends CampaignListItem {
  generated: number;
  generationFailed: number;
  invalidImportedTotal: number;
  emailsSent: number;
  emailsFailed: number;
  generationProgressPercent: number;
  emailProgressPercent: number;
}

export async function listCampaignsWithOverview(organizationId: string, limit?: number): Promise<CampaignOverview[]> {
  const campaigns = await listCampaigns(organizationId);
  const slice = typeof limit === "number" ? campaigns.slice(0, limit) : campaigns;

  return Promise.all(
    slice.map(async (campaign) => {
      const [generation, email] = await Promise.all([
        computeCampaignProgress(campaign.id),
        computeEmailProgress(campaign.id),
      ]);

      return {
        ...campaign,
        generated: generation.generated,
        generationFailed: generation.failed,
        invalidImportedTotal: generation.invalidImportedTotal,
        emailsSent: email.sent,
        emailsFailed: email.failed,
        generationProgressPercent: generation.progressPercent,
        emailProgressPercent: email.progressPercent,
      };
    }),
  );
}
