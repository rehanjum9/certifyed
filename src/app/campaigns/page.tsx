import Link from "next/link";
import { listCampaigns } from "@/lib/campaigns";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { IconCampaigns, IconPlus } from "@/components/ui/icons";
import { formatDate } from "@/lib/format";

// Always reflects the current DB/storage state; never statically cached.
export const dynamic = "force-dynamic";

function statusVariant(status: string): "neutral" | "success" | "warning" | "info" {
  if (status === "completed") return "success";
  if (status === "failed") return "warning";
  if (status === "draft") return "neutral";
  return "info";
}

export default async function CampaignsPage() {
  const campaigns = await listCampaigns();

  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Campaigns"
          description="Upload a roster and run a bulk certificate generation."
          actions={
            <LinkButton href="/campaigns/new">
              <IconPlus className="h-4 w-4" />
              New campaign
            </LinkButton>
          }
        />

        {campaigns.length === 0 ? (
          <EmptyState
            icon={<IconCampaigns className="h-6 w-6" />}
            title="No campaigns yet"
            description="Upload a roster and map it to a certificate template to create your first campaign."
            action={
              <LinkButton href="/campaigns/new">
                <IconPlus className="h-4 w-4" />
                New campaign
              </LinkButton>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {campaigns.map((campaign) => (
              <Link key={campaign.id} href={`/campaigns/${campaign.id}`}>
                <Card className="flex flex-col gap-2 p-4 transition-colors hover:border-slate-300 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">{campaign.name}</h3>
                      <Badge variant={statusVariant(campaign.status)}>{campaign.status}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      Template: {campaign.templateName ?? "(deleted)"} - {campaign.rowCount} row
                      {campaign.rowCount === 1 ? "" : "s"} - created {formatDate(campaign.created_at)}
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
