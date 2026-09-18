import { notFound } from "next/navigation";
import { getTemplate, downloadTemplateSvg } from "@/lib/templates";
import { listTemplateFields } from "@/lib/templateFields";
import { resolvePageWorkspaceContext } from "@/lib/organizations/pageContext";
import { NoWorkspaceState } from "@/components/organizations/NoWorkspaceState";
import { FieldEditor } from "@/components/editor/FieldEditor";

// Always reflects the current DB/storage state; never statically cached.
export const dynamic = "force-dynamic";

export default async function TemplateEditorPage({
  params,
}: PageProps<"/templates/[templateId]/editor">) {
  const context = await resolvePageWorkspaceContext();
  if ("noWorkspace" in context) return <NoWorkspaceState />;

  const { templateId } = await params;
  const template = await getTemplate(templateId, context.organizationId);

  if (!template) {
    notFound();
  }

  const [svg, fields] = await Promise.all([
    downloadTemplateSvg(template.svg_path),
    listTemplateFields(templateId),
  ]);

  return (
    <FieldEditor
      template={{
        id: template.id,
        name: template.name,
        svg_width: template.svg_width,
        svg_height: template.svg_height,
      }}
      svg={svg}
      initialFields={fields}
    />
  );
}
