import { listTemplates, downloadTemplateSvg } from "@/lib/templates";
import { listTemplateFields } from "@/lib/templateFields";
import { TemplateCard } from "@/components/templates/TemplateCard";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/Button";
import { IconTemplates, IconPlus } from "@/components/ui/icons";

// Always reflects the current DB/storage state; never statically cached.
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await listTemplates();
  const cards = await Promise.all(
    templates.map(async (template) => ({
      template,
      svg: await downloadTemplateSvg(template.svg_path),
      fieldCount: (await listTemplateFields(template.id)).length,
    })),
  );

  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-mono text-2xl font-semibold tracking-tight text-slate-900">
              <span className="text-emerald-600">&gt;</span> templates_
            </h1>
            <p className="mt-1 text-sm text-slate-500">Manage your certificate designs and their dynamic fields.</p>
          </div>
          <LinkButton href="/templates/new" className="shrink-0">
            <IconPlus className="h-4 w-4" />
            New template
          </LinkButton>
        </div>

        {cards.length === 0 ? (
          <EmptyState
            icon={<IconTemplates className="h-6 w-6" />}
            title="No templates yet"
            description="Upload a Canva-exported SVG certificate to get started."
            action={
              <LinkButton href="/templates/new">
                <IconPlus className="h-4 w-4" />
                Upload template
              </LinkButton>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(({ template, svg, fieldCount }) => (
              <TemplateCard key={template.id} template={template} svg={svg} fieldCount={fieldCount} />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
