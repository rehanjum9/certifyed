import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaign, listCampaignRows } from "@/lib/campaigns";
import { getTemplate } from "@/lib/templates";
import { PageContainer } from "@/components/layout/PageContainer";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { CampaignActions } from "@/components/campaigns/CampaignActions";
import { formatDate } from "@/lib/format";
import type { BadgeVariant } from "@/components/ui/Badge";

// Always reflects the current DB/storage state; never statically cached.
export const dynamic = "force-dynamic";

function rowStatusVariant(status: string): BadgeVariant {
  if (status === "generated" || status === "sent") return "success";
  if (status === "failed") return "warning";
  if (status === "generating" || status === "emailing") return "info";
  return "neutral";
}

export default async function CampaignDetailPage({
  params,
}: PageProps<"/campaigns/[campaignId]">) {
  const { campaignId } = await params;
  const campaign = await getCampaign(campaignId);

  if (!campaign) {
    notFound();
  }

  const [template, rows] = await Promise.all([
    getTemplate(campaign.template_id),
    listCampaignRows(campaignId),
  ]);

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const generatedCount = rows.filter((r) => r.status === "generated").length;
  const failedCount = rows.filter((r) => r.status === "failed").length;

  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <div>
          <Link href="/campaigns" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            &larr; Campaigns
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{campaign.name}</h1>
            <Badge variant={campaign.status === "completed" ? "success" : "info"}>{campaign.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Template: {template?.name ?? "(deleted)"} - created {formatDate(campaign.created_at)}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard label="Total rows" value={rows.length} />
          <StatCard label="Pending" value={pendingCount} />
          <StatCard label="Generated" value={generatedCount} />
          <StatCard label="Failed" value={failedCount} />
        </div>

        <CampaignActions campaignId={campaign.id} pendingCount={pendingCount} failedCount={failedCount} />

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-500">Row</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500">Recipient Email</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500">Status</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-slate-500">{row.row_index + 2}</td>
                  <td className="px-3 py-2 text-slate-700">{row.recipient_email ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge variant={rowStatusVariant(row.status)}>{row.status}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    {row.status === "generated" && row.pdf_path ? (
                      <a
                        href={`/api/campaigns/${campaign.id}/rows/${row.id}/pdf`}
                        className="font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        Download PDF
                      </a>
                    ) : row.error_message ? (
                      <span className="text-red-700">{row.error_message}</span>
                    ) : (
                      <span className="text-slate-400">&mdash;</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
}
