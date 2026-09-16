import { listTemplates, downloadTemplateSvg } from "@/lib/templates";
import { listTemplateFields } from "@/lib/templateFields";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/Button";
import { IconTemplates, IconPlus } from "@/components/ui/icons";
import { CampaignWizard } from "@/components/campaigns/CampaignWizard";

// Always reflects the current DB/storage state; never statically cached.
export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const templates = await listTemplates();

  const templateOptions = await Promise.all(
    templates.map(async (template) => ({
      template,
      svg: await downloadTemplateSvg(template.svg_path),
      fields: await listTemplateFields(template.id),
    })),
  );

  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-slate-900">
            <span className="text-emerald-600">&gt;</span> new_campaign_
          </h1>
          <p className="mt-1 text-sm text-slate-500">Map a spreadsheet roster onto a certificate template.</p>
        </div>

        {templateOptions.length === 0 ? (
          <EmptyState
            icon={<IconTemplates className="h-6 w-6" />}
            title="No templates yet"
            description="Upload a certificate template before creating a campaign."
            action={
              <LinkButton href="/templates/new">
                <IconPlus className="h-4 w-4" />
                Upload template
              </LinkButton>
            }
          />
        ) : (
          <CampaignWizard templateOptions={templateOptions} />
        )}
      </div>
    </PageContainer>
  );
}
