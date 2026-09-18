import Link from "next/link";
import { listCampaignsWithOverview } from "@/lib/campaigns/overview";
import { resolvePageWorkspaceContext } from "@/lib/organizations/pageContext";
import { NoWorkspaceState } from "@/components/organizations/NoWorkspaceState";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { DataTable, DataTableHead, DataTableTh, DataTableBody, DataTableRow, DataTableTd } from "@/components/ui/DataTable";
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
  const context = await resolvePageWorkspaceContext();
  if ("noWorkspace" in context) return <NoWorkspaceState />;

  const campaigns = await listCampaignsWithOverview(context.organizationId);

  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-mono text-2xl font-semibold tracking-tight text-slate-900">
              <span className="text-emerald-600">&gt;</span> campaigns_
            </h1>
            <p className="mt-1 text-sm text-slate-500">Upload a roster and run a bulk certificate generation.</p>
          </div>
          <LinkButton href="/campaigns/new" className="shrink-0">
            <IconPlus className="h-4 w-4" />
            New campaign
          </LinkButton>
        </div>

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
          <DataTable>
            <DataTableHead>
              <DataTableTh>Name</DataTableTh>
              <DataTableTh>Template</DataTableTh>
              <DataTableTh>Recipients</DataTableTh>
              <DataTableTh>Generated</DataTableTh>
              <DataTableTh>Invalid</DataTableTh>
              <DataTableTh>Emails sent</DataTableTh>
              <DataTableTh>Progress</DataTableTh>
              <DataTableTh>Status</DataTableTh>
              <DataTableTh>Created</DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {campaigns.map((campaign) => (
                <DataTableRow key={campaign.id}>
                  <DataTableTd className="max-w-[220px] font-medium break-words text-slate-900">
                    <Link href={`/campaigns/${campaign.id}`} className="hover:text-emerald-600">
                      {campaign.name}
                    </Link>
                  </DataTableTd>
                  <DataTableTd className="max-w-[140px] truncate">{campaign.templateName ?? "(deleted)"}</DataTableTd>
                  <DataTableTd className="font-mono text-xs">{campaign.rowCount}</DataTableTd>
                  <DataTableTd className="font-mono text-xs">{campaign.generated}</DataTableTd>
                  <DataTableTd className="font-mono text-xs text-slate-400">{campaign.invalidImportedTotal}</DataTableTd>
                  <DataTableTd className="font-mono text-xs">{campaign.emailsSent}</DataTableTd>
                  <DataTableTd className="min-w-[100px]">
                    <ProgressBar percent={campaign.generationProgressPercent} />
                  </DataTableTd>
                  <DataTableTd>
                    <Badge variant={statusVariant(campaign.status)}>{campaign.status}</Badge>
                  </DataTableTd>
                  <DataTableTd className="whitespace-nowrap text-xs text-slate-500">
                    {formatDate(campaign.created_at)}
                  </DataTableTd>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </div>
    </PageContainer>
  );
}
