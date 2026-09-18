import { NextResponse } from "next/server";
import { guardApiRoute } from "@/lib/auth/apiGuard";
import { RATE_LIMITS } from "@/lib/rateLimit";
import { deleteCustomFont } from "@/lib/fonts/customFonts";
import { safeApiErrorMessage } from "@/lib/apiError";

/**
 * Deletes a custom font, but never one still referenced by a template field
 * (see lib/fonts/customFonts.ts#deleteCustomFont) -- a template's fields
 * must never be silently left pointing at a font that no longer exists.
 */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/fonts/[fontId]">) {
  const guard = await guardApiRoute({ rateLimit: { key: "font-delete", ...RATE_LIMITS.fontDelete } });
  if ("response" in guard) return guard.response;

  const { fontId } = await params;

  try {
    const result = await deleteCustomFont(fontId);

    if (!result.ok && result.reason === "not_found") {
      return NextResponse.json({ error: "Font not found." }, { status: 404 });
    }

    if (!result.ok && result.reason === "in_use") {
      return NextResponse.json(
        {
          error: "This font is used by one or more templates and can't be deleted.",
          templates: result.templates,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Failed to delete the font. Please try again.") },
      { status: 500 },
    );
  }
}
