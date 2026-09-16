import Link from "next/link";
import { SvgPreview } from "./SvgPreview";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import type { Database } from "@/types/database";

type TemplateRow = Database["public"]["Tables"]["templates"]["Row"];

interface TemplateCardProps {
  template: TemplateRow;
  svg: string;
}

export function TemplateCard({ template, svg }: TemplateCardProps) {
  return (
    <Link
      href={`/templates/${template.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <SvgPreview svg={svg} width={template.svg_width} height={template.svg_height} />
      <div className="flex flex-col gap-1 p-4">
        <h3 className="truncate text-sm font-semibold text-slate-900 group-hover:text-indigo-600">
          {template.name}
        </h3>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{formatDate(template.created_at)}</span>
          <span aria-hidden="true">-</span>
          <Badge variant={template.status === "published" ? "success" : "neutral"}>
            {template.status}
          </Badge>
        </div>
      </div>
    </Link>
  );
}
