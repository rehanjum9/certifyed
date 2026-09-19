import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaign, listCampaignRows } from "@/lib/campaigns";
import { getTemplate } from "@/lib/templates";
import { computeCampaignProgress } from "@/lib/campaigns/generation";
import { getLatestGenerationJob } from "@/lib/campaigns/jobs";
import { computeEmailProgress } from "@/lib/campaigns/emailDelivery";
import { getLatestEmailJob } from "@/lib/campaigns/emailJobs";
import { getOrganizationEmailSendError } from "@/lib/email/provider";
import { resolvePageWorkspaceContext } from "@/lib/organizations/pageContext";
import { NoWorkspaceState } from "@/components/organizations/NoWorkspaceState";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable, DataTableHead, DataTableTh, DataTableBody, DataTableRow, DataTableTd } from "@/components/ui/DataTable";
import { GenerationPanel } from "@/components/campaigns/GenerationPanel";
import { EmailDeliveryPanel } from "@/components/campaigns/EmailDeliveryPanel";
import { formatDate } from "@/lib/format";
import type { BadgeVariant } from "@/components/ui/Badge";

// Always reflects the current DB/storage state; never statically cached.
export const dynamic = "force-dynamic";

function rowStatusVariant(status: string): BadgeVariant {
  if (status === "generated" || status === "sent") return "success";
  if (status === "failed") return "danger";
  if (status === "generating" || status === "emailing") return "info";
  return "neutral";
}

function campaignStatusVariant(status: string): BadgeVariant {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "draft") return "neutral";
  return "info";
}

export default async function CampaignDetailPage({
  params,
}: PageProps<"/campaigns/[campaignId]">) {
  const context = await resolvePageWorkspaceContext();
  if ("noWorkspace" in context) return <NoWorkspaceState />;

  const { campaignId } = await params;
  const campaign = await getCampaign(campaignId, context.organizationId);

  if (!campaign) {
    notFound();
  }

  const [template, rows, progress, job, emailProgress, emailJob, emailSendBlockedReason] = await Promise.all([
    getTemplate(campaign.template_id, context.organizationId),
    listCampaignRows(campaignId),
    computeCampaignProgress(campaignId),
    getLatestGenerationJob(campaignId),
    computeEmailProgress(campaignId),
    getLatestEmailJob(campaignId),
    getOrganizationEmailSendError(context.organizationId),
  ]);

  return (
    <PageContainer>
      <div className="flex flex-col gap-8">
        {/* 1. Campaign overview */}
        <div>
          <Link href="/campaigns" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            &larr; Campaigns
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{campaign.name}</h1>
            <Badge variant={campaignStatusVariant(campaign.status)}>{campaign.status}</Badge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>Template: {template?.name ?? "(deleted)"}</span>
            <span className="text-slate-300">&middot;</span>
            <span>created {formatDate(campaign.created_at)}</span>
            <span className="text-slate-300">&middot;</span>
            <span className="font-mono text-xs">{rows.length} recipient{rows.length === 1 ? "" : "s"}</span>
          </p>
        </div>

        {/* 2. Certificate generation */}
        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-sm font-semibold text-slate-900">generation_status</h2>
          <Card className="shadow-none">
            <div className="p-5">
              <GenerationPanel
                campaignId={campaign.id}
                initialJob={
                  job ? { id: job.id, status: job.status, attempts: job.attempts, lastError: job.last_error } : null
                }
                initialProgress={progress}
              />
            </div>
          </Card>
        </section>

        {/* 3. Email delivery */}
        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-sm font-semibold text-slate-900">email_delivery</h2>
          <Card className="shadow-none">
            <div className="p-5">
              <EmailDeliveryPanel
                campaignId={campaign.id}
                initialJob={
                  emailJob
                    ? { id: emailJob.id, status: emailJob.status, attempts: emailJob.attempts, lastError: emailJob.last_error }
                    : null
                }
                initialProgress={emailProgress}
                emailSendBlockedReason={emailSendBlockedReason}
              />
            </div>
          </Card>
        </section>

        {/* 4. Recipient rows / statuses */}
        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-sm font-semibold text-slate-900">recipients_</h2>
          <DataTable>
            <DataTableHead>
              <DataTableTh>Row</DataTableTh>
              <DataTableTh>Recipient email</DataTableTh>
              <DataTableTh>Status</DataTableTh>
              <DataTableTh>Details</DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {rows.map((row) => (
                <DataTableRow key={row.id}>
                  <DataTableTd className="font-mono text-xs text-slate-400">{row.row_index + 2}</DataTableTd>
                  <DataTableTd>{row.recipient_email ?? "—"}</DataTableTd>
                  <DataTableTd>
                    <Badge variant={rowStatusVariant(row.status)}>{row.status}</Badge>
                  </DataTableTd>
                  <DataTableTd>
                    {row.status === "generated" && row.pdf_path ? (
                      <a
                        href={`/api/campaigns/${campaign.id}/rows/${row.id}/pdf`}
                        className="font-medium text-emerald-600 hover:text-emerald-700"
                      >
                        Download PDF
                      </a>
                    ) : row.error_message ? (
                      <span className="text-red-600">{row.error_message}</span>
                    ) : (
                      <span className="text-slate-400">&mdash;</span>
                    )}
                  </DataTableTd>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        </section>
      </div>
    </PageContainer>
  );
}
