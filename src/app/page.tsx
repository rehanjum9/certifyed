import Link from "next/link";
import { listTemplates } from "@/lib/templates";
import { listCampaignsWithOverview } from "@/lib/campaigns/overview";
import { getDashboardStats, getRecentActivity } from "@/lib/dashboard";
import { PageContainer } from "@/components/layout/PageContainer";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { QuickAction } from "@/components/ui/QuickAction";
import { ActivityItem } from "@/components/ui/ActivityItem";
import { DataTable, DataTableHead, DataTableTh, DataTableBody, DataTableRow, DataTableTd } from "@/components/ui/DataTable";
import {
  IconTemplates,
  IconCampaigns,
  IconMail,
  IconAlertTriangle,
  IconArrowRight,
  IconPlus,
  IconSettings,
  IconActivity,
  IconServer,
  IconFileText,
  IconCheckCircle,
} from "@/components/ui/icons";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { resolveEmailProvider, getEmailProviderConfigError } from "@/lib/email/provider";

const RECENT_CAMPAIGN_COUNT = 5;

// Always reflects the current DB/storage state; never statically cached.
export const dynamic = "force-dynamic";

function campaignStatusVariant(status: string): "neutral" | "success" | "warning" | "info" {
  if (status === "completed") return "success";
  if (status === "failed") return "warning";
  if (status === "draft") return "neutral";
  return "info";
}

function activityIcon(kind: string) {
  if (kind === "sent") return <IconMail className="h-3.5 w-3.5" />;
  if (kind === "campaign_completed") return <IconCheckCircle className="h-3.5 w-3.5" />;
  if (kind === "template_created") return <IconFileText className="h-3.5 w-3.5" />;
  return <IconCampaigns className="h-3.5 w-3.5" />;
}

function configuredBadge(isConfigured: boolean) {
  return (
    <Badge variant={isConfigured ? "success" : "neutral"}>{isConfigured ? "Configured" : "Not configured"}</Badge>
  );
}

export default async function DashboardPage() {
  const [stats, recentCampaigns, activity, templates] = await Promise.all([
    getDashboardStats(),
    listCampaignsWithOverview(RECENT_CAMPAIGN_COUNT),
    getRecentActivity(),
    listTemplates(),
  ]);

  const hasSupabaseConfig = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

  // Reflects whichever provider EMAIL_PROVIDER actually selects (defaults to
  // Resend) -- never hardcodes Resend, so this stays correct when
  // EMAIL_PROVIDER=gmail. An invalid EMAIL_PROVIDER value is itself a
  // "not configured" state here rather than crashing the dashboard.
  let emailProviderLabel = "Email";
  let hasEmailProviderConfig = false;
  try {
    emailProviderLabel = resolveEmailProvider() === "gmail" ? "Gmail" : "Resend";
    hasEmailProviderConfig = getEmailProviderConfigError() === null;
  } catch {
    // Invalid EMAIL_PROVIDER -- leave the generic label and "not configured".
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-mono text-2xl font-semibold tracking-tight text-slate-900">
              <span className="text-emerald-600">&gt;</span> dashboard_
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage certificate generation, delivery and campaign activity.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <LinkButton href="/templates/new" variant="secondary">
              <IconPlus className="h-4 w-4" />
              Upload template
            </LinkButton>
            <LinkButton href="/campaigns/new">
              <IconPlus className="h-4 w-4" />
              New campaign
            </LinkButton>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Total templates" value={stats.totalTemplates} icon={<IconTemplates className="h-5 w-5" />} />
          <StatCard label="Total campaigns" value={stats.totalCampaigns} icon={<IconCampaigns className="h-5 w-5" />} />
          <StatCard
            label="Certificates generated"
            value={stats.certificatesGenerated}
            icon={<IconFileText className="h-5 w-5" />}
          />
          <StatCard label="Emails sent" value={stats.emailsSent} icon={<IconMail className="h-5 w-5" />} />
          <StatCard label="Failed items" value={stats.failedItems} icon={<IconAlertTriangle className="h-5 w-5" />} />
        </div>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold text-slate-900">recent_campaigns</h2>
            {recentCampaigns.length > 0 && (
              <Link
                href="/campaigns"
                className="flex items-center gap-1 text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                View all
                <IconArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>

          {recentCampaigns.length === 0 ? (
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
                <DataTableTh>Emails sent</DataTableTh>
                <DataTableTh>Progress</DataTableTh>
                <DataTableTh>Status</DataTableTh>
                <DataTableTh>Created</DataTableTh>
              </DataTableHead>
              <DataTableBody>
                {recentCampaigns.map((campaign) => (
                  <DataTableRow key={campaign.id} className="cursor-pointer">
                    <DataTableTd className="font-medium text-slate-900">
                      <Link href={`/campaigns/${campaign.id}`} className="hover:text-emerald-600">
                        {campaign.name}
                      </Link>
                    </DataTableTd>
                    <DataTableTd>{campaign.templateName ?? "(deleted)"}</DataTableTd>
                    <DataTableTd className="font-mono text-xs">{campaign.rowCount}</DataTableTd>
                    <DataTableTd className="font-mono text-xs">{campaign.generated}</DataTableTd>
                    <DataTableTd className="font-mono text-xs">{campaign.emailsSent}</DataTableTd>
                    <DataTableTd className="min-w-[120px]">
                      <ProgressBar percent={campaign.generationProgressPercent} />
                    </DataTableTd>
                    <DataTableTd>
                      <Badge variant={campaignStatusVariant(campaign.status)}>{campaign.status}</Badge>
                    </DataTableTd>
                    <DataTableTd className="whitespace-nowrap text-xs text-slate-500">
                      {formatDate(campaign.created_at)}
                    </DataTableTd>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          )}
        </section>

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="flex flex-col gap-4">
            <h2 className="font-mono text-sm font-semibold text-slate-900">quick_actions</h2>
            <div className="flex flex-col gap-2">
              <QuickAction
                href="/templates/new"
                icon={<IconTemplates className="h-4.5 w-4.5" />}
                title="Create Template"
                description="Upload an SVG certificate design"
              />
              <QuickAction
                href="/campaigns/new"
                icon={<IconPlus className="h-4.5 w-4.5" />}
                title="Start Campaign"
                description="Map a roster onto a template and generate"
              />
              <QuickAction
                href="/campaigns"
                icon={<IconCampaigns className="h-4.5 w-4.5" />}
                title="View Campaigns"
                description="Track generation and delivery progress"
              />
              <QuickAction
                href="/settings"
                icon={<IconSettings className="h-4.5 w-4.5" />}
                title="Settings"
                description="Application preferences"
              />
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="font-mono text-sm font-semibold text-slate-900">recent_activity</h2>
            <div className="rounded-lg border border-slate-200 bg-white px-4">
              {activity.length === 0 ? (
                <div className="py-6">
                  <EmptyState
                    icon={<IconActivity className="h-6 w-6" />}
                    title="No activity yet"
                    description="Generated certificates and sent emails will show up here."
                  />
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activity.map((entry, index) => (
                    <ActivityItem
                      key={index}
                      icon={activityIcon(entry.kind)}
                      text={entry.text}
                      timestamp={formatRelativeTime(entry.timestamp)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="font-mono text-sm font-semibold text-slate-900">system_status</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
              <span className="flex items-center gap-2 text-sm text-slate-700">
                <IconServer className="h-4 w-4 text-slate-400" />
                Database
              </span>
              {configuredBadge(hasSupabaseConfig)}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
              <span className="flex items-center gap-2 text-sm text-slate-700">
                <IconServer className="h-4 w-4 text-slate-400" />
                Storage
              </span>
              {configuredBadge(hasSupabaseConfig)}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
              <span className="flex items-center gap-2 text-sm text-slate-700">
                <IconServer className="h-4 w-4 text-slate-400" />
                PDF renderer
              </span>
              {configuredBadge(true)}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
              <span className="flex items-center gap-2 text-sm text-slate-700">
                <IconMail className="h-4 w-4 text-slate-400" />
                {emailProviderLabel}
              </span>
              {configuredBadge(hasEmailProviderConfig)}
            </div>
          </div>
        </section>

        {templates.length === 0 && (
          <EmptyState
            icon={<IconTemplates className="h-6 w-6" />}
            title="No templates yet"
            description="Upload a Canva-exported SVG certificate to create your first template."
            action={
              <LinkButton href="/templates/new">
                <IconPlus className="h-4 w-4" />
                Upload your first template
              </LinkButton>
            }
          />
        )}
      </div>
    </PageContainer>
  );
}
