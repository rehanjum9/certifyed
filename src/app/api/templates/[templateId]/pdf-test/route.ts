import { NextResponse } from "next/server";
import { getTemplate, downloadTemplateSvg } from "@/lib/templates";
import { getPdfRenderer } from "@/lib/pdf";
import { buildTestOverlays } from "@/lib/pdf/testOverlay";
import { resolvePdfPageSize } from "@/lib/pdf/pageSize";
import { guardApiRoute } from "@/lib/auth/apiGuard";

/**
 * Experimental Phase 2.5 fidelity spike. Renders the template's already
 * sanitized SVG (never a raw upload) through the current PDF renderer with
 * a temporary auto-fit text overlay, and returns it as a direct download.
 * Nothing is written to storage -- this is a one-off manual inspection tool,
 * not production certificate generation.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/templates/[templateId]/pdf-test">,
) {
  const guard = await guardApiRoute();
  if ("response" in guard) return guard.response;

  const { templateId } = await params;
  const template = await getTemplate(templateId);

  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const svg = await downloadTemplateSvg(template.svg_path);
  const overlays = buildTestOverlays(template.svg_width, template.svg_height);
  const renderer = getPdfRenderer();
  const pageSize = resolvePdfPageSize(template.svg_width, template.svg_height);

  let result;
  try {
    result = await renderer.render({
      svg,
      width: pageSize.widthPt,
      height: pageSize.heightPt,
      overlays,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `PDF fidelity test failed with renderer "${renderer.name}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 500 },
    );
  }

  const safeName = template.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "template";
  const filename = `${safeName}-fidelity-test.pdf`;

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Pdf-Renderer": renderer.name,
      "X-Pdf-Warnings": encodeURIComponent(JSON.stringify(result.warnings)),
    },
  });
}
