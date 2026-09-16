import Link from "next/link";
import { SvgPreview } from "./SvgPreview";
import { Badge } from "@/components/ui/Badge";
import { IconArrowRight } from "@/components/ui/icons";
import { formatDate } from "@/lib/format";
import type { Database } from "@/types/database";

type TemplateRow = Database["public"]["Tables"]["templates"]["Row"];

interface TemplateCardProps {
  template: TemplateRow;
  svg: string;
  fieldCount?: number;
}

export function TemplateCard({ template, svg, fieldCount }: TemplateCardProps) {
  return (
    <Link
      href={`/templates/${template.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-colors hover:border-emerald-300"
    >
      <SvgPreview svg={svg} width={template.svg_width} height={template.svg_height} />
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-slate-900 group-hover:text-emerald-700">
            {template.name}
          </h3>
          <IconArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-emerald-500" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Badge variant={template.status === "published" ? "success" : "neutral"}>{template.status}</Badge>
          {typeof fieldCount === "number" && (
            <span className="font-mono">
              {fieldCount} field{fieldCount === 1 ? "" : "s"}
            </span>
          )}
          <span className="font-mono text-slate-400">{formatDate(template.created_at)}</span>
        </div>
      </div>
    </Link>
  );
}
