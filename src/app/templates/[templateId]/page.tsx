import Link from "next/link";
import { notFound } from "next/navigation";
import { getTemplate, downloadTemplateSvg } from "@/lib/templates";
import { listTemplateFields } from "@/lib/templateFields";
import { SvgPreview } from "@/components/templates/SvgPreview";
import { Badge } from "@/components/ui/Badge";
import { buttonClassName } from "@/components/ui/Button";
import { PageContainer } from "@/components/layout/PageContainer";
import { formatDate } from "@/lib/format";

// Always reflects the current DB/storage state; never statically cached.
export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({
  params,
}: PageProps<"/templates/[templateId]">) {
  const { templateId } = await params;
  const template = await getTemplate(templateId);

  if (!template) {
    notFound();
  }

  const [svg, fields] = await Promise.all([
    downloadTemplateSvg(template.svg_path),
    listTemplateFields(templateId),
  ]);

  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href="/templates"
              className="text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              &larr; Templates
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                {template.name}
              </h1>
              <Badge variant={template.status === "published" ? "success" : "neutral"}>
                {template.status}
              </Badge>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span className="font-mono text-xs">
                {template.svg_width} &times; {template.svg_height}
              </span>
              <span className="text-slate-300">&middot;</span>
              <span>created {formatDate(template.created_at)}</span>
              <span className="text-slate-300">&middot;</span>
              <span>{fields.length === 0 ? "no fields yet" : `${fields.length} field${fields.length === 1 ? "" : "s"}`}</span>
            </p>
          </div>
          <Link
            href={`/templates/${template.id}/editor`}
            className={buttonClassName("primary", "md", "shrink-0")}
          >
            Edit dynamic fields
          </Link>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-100 p-6 sm:p-10">
          <SvgPreview
            svg={svg}
            width={template.svg_width}
            height={template.svg_height}
            className="mx-auto max-w-2xl rounded-lg"
          />
        </div>
      </div>
    </PageContainer>
  );
}
