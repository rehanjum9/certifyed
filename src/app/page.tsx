import Link from "next/link";
import { listTemplates, downloadTemplateSvg } from "@/lib/templates";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/Button";
import { TemplateCard } from "@/components/templates/TemplateCard";
import {
  IconTemplates,
  IconCampaigns,
  IconArrowRight,
  IconPlus,
} from "@/components/ui/icons";

const RECENT_TEMPLATE_COUNT = 4;

// Always reflects the current DB/storage state; never statically cached.
export const dynamic = "force-dynamic";

export default async function Home() {
  const templates = await listTemplates();
  const recentTemplates = await Promise.all(
    templates.slice(0, RECENT_TEMPLATE_COUNT).map(async (template) => ({
      template,
      svg: await downloadTemplateSvg(template.svg_path),
    })),
  );

  return (
    <PageContainer>
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description="Overview of your certificate templates and campaigns."
        actions={
          <LinkButton href="/templates/new">
            <IconPlus className="h-4 w-4" />
            Upload template
          </LinkButton>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Templates"
          value={templates.length}
          icon={<IconTemplates className="h-5 w-5" />}
        />
        <StatCard label="Campaigns" value={0} hint="Coming in a later phase" />
        <StatCard label="Certificates generated" value={0} hint="Coming in a later phase" />
        <StatCard label="Emails sent" value={0} hint="Coming in a later phase" />
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Recent templates</h2>
          {templates.length > 0 && (
            <Link
              href="/templates"
              className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              View all
              <IconArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        {recentTemplates.length === 0 ? (
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
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recentTemplates.map(({ template, svg }) => (
              <TemplateCard key={template.id} template={template} svg={svg} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-slate-900">Recent campaigns</h2>
        <EmptyState
          icon={<IconCampaigns className="h-6 w-6" />}
          title="No campaigns yet"
          description="Bulk generation from an Excel/CSV roster is coming in a later phase."
        />
      </section>
    </div>
    </PageContainer>
  );
}
