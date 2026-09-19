import { NextResponse } from "next/server";
import { requireOrganizationContext } from "@/lib/auth/organizationGuard";
import { getCustomFontForOrganization, downloadCustomFontFile } from "@/lib/fonts/customFonts";

/**
 * Server-mediated font file download -- the only way the browser (via
 * FontFace, see lib/fonts/useLoadCustomFonts.ts) ever gets a custom font's
 * bytes. Never a direct/signed Storage URL: this route requires the same
 * authenticated session as every other workspace-scoped route, is scoped
 * to the caller's active organization (a font id belonging to a different
 * club's workspace 404s, exactly like it doesn't exist), and the
 * service-role key used to read private Storage never leaves the server.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/fonts/[fontId]/file">) {
  const guard = await requireOrganizationContext();
  if ("response" in guard) return guard.response;

  const { fontId } = await params;
  const font = await getCustomFontForOrganization(fontId, guard.organizationId);

  if (!font) {
    return NextResponse.json({ error: "Font not found." }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await downloadCustomFontFile(font.storage_path);
  } catch {
    return NextResponse.json({ error: "Failed to load the font file." }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": font.format === "otf" ? "font/otf" : "font/ttf",
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": `inline; filename="${font.id}.${font.format}"`,
    },
  });
}
