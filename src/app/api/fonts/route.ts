import { NextResponse } from "next/server";
import { requireOrganizationContext } from "@/lib/auth/organizationGuard";
import { RATE_LIMITS } from "@/lib/rateLimit";
import { exceedsDeclaredContentLength } from "@/lib/upload/contentLength";
import { listCustomFonts, createCustomFont } from "@/lib/fonts/customFonts";
import { validateFontUpload, MAX_FONT_UPLOAD_BYTES } from "@/lib/fonts/validateUpload";
import { resolveFontDisplayName } from "@/lib/fonts/parseMetadata";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { safeApiErrorMessage } from "@/lib/apiError";

const MAX_DISPLAY_NAME_LENGTH = 200;

/** Lists the active workspace's own custom fonts -- used by the editor's font picker and the browser FontFace loader (see lib/fonts/useLoadCustomFonts.ts). Club A never sees Club B's fonts here (architecture report, item 25). */
export async function GET() {
  const guard = await requireOrganizationContext();
  if ("response" in guard) return guard.response;

  try {
    const fonts = await listCustomFonts(guard.organizationId);
    return NextResponse.json({ fonts });
  } catch (error) {
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Failed to load fonts. Please try again.") },
      { status: 500 },
    );
  }
}

/**
 * Uploads a new custom .ttf/.otf font: validated by extension, MIME, size,
 * and actual SFNT binary signature (validateFontUpload -- never trusts the
 * client-declared type alone), stored under a UUID-derived path (never the
 * user-controlled filename), with its display name read from the font's
 * own metadata (see parseMetadata.ts) rather than the raw filename.
 */
export async function POST(request: Request) {
  const guard = await requireOrganizationContext({ rateLimit: { key: "font-upload", ...RATE_LIMITS.fontUpload } });
  if ("response" in guard) return guard.response;
  const { organizationId } = guard;

  if (exceedsDeclaredContentLength(request, MAX_FONT_UPLOAD_BYTES)) {
    return NextResponse.json(
      { error: `Font file exceeds the ${MAX_FONT_UPLOAD_BYTES / (1024 * 1024)}MB upload limit.` },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A .ttf or .otf font file is required." }, { status: 400 });
  }

  const displayNameOverride = formData.get("displayName");
  if (typeof displayNameOverride === "string" && displayNameOverride.trim().length > MAX_DISPLAY_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Font name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const validation = validateFontUpload({
    filename: file.name,
    mimeType: file.type || null,
    size: buffer.byteLength,
    headerBytes: buffer.subarray(0, 4),
  });

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const displayName =
    typeof displayNameOverride === "string" && displayNameOverride.trim().length > 0
      ? displayNameOverride.trim()
      : resolveFontDisplayName(buffer, file.name);

  const fontId = crypto.randomUUID();
  const storagePath = `${organizationId}/${fontId}/font.${validation.format}`;

  const supabase = createServiceRoleClient();
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKETS.fonts)
    .upload(storagePath, buffer, {
      contentType: validation.format === "otf" ? "font/otf" : "font/ttf",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: "Failed to upload the font file. Please try again." }, { status: 500 });
  }

  try {
    const font = await createCustomFont({
      organizationId,
      displayName,
      originalFilename: file.name,
      storagePath,
      format: validation.format,
      fontWeight: "normal",
      fileSize: buffer.byteLength,
      createdBy: guard.user.id,
    });

    return NextResponse.json({ font }, { status: 201 });
  } catch (error) {
    await supabase.storage.from(STORAGE_BUCKETS.fonts).remove([storagePath]);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Failed to save the font. Please try again.") },
      { status: 500 },
    );
  }
}
