import { listTemplates, downloadTemplateSvg } from "@/lib/templates";
import { TemplateCard } from "@/components/templates/TemplateCard";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
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
    })),
  );

  return (
    <PageContainer>
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Templates"
        description="Manage your certificate designs and their dynamic fields."
        actions={
          <LinkButton href="/templates/new">
            <IconPlus className="h-4 w-4" />
            Upload template
          </LinkButton>
        }
      />

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
          {cards.map(({ template, svg }) => (
            <TemplateCard key={template.id} template={template} svg={svg} />
          ))}
        </div>
      )}
    </div>
    </PageContainer>
  );
}
