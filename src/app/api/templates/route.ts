import { NextResponse } from "next/server";
import { processUploadedSvg } from "@/lib/svg/process";
import { MAX_SVG_UPLOAD_BYTES } from "@/lib/svg/constants";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage";
import { guardApiRoute } from "@/lib/auth/apiGuard";
import { RATE_LIMITS } from "@/lib/rateLimit";
import { exceedsDeclaredContentLength } from "@/lib/upload/contentLength";

const MAX_NAME_LENGTH = 200;

export async function POST(request: Request) {
  const guard = await guardApiRoute({ rateLimit: { key: "template-create", ...RATE_LIMITS.templateCreate } });
  if ("response" in guard) return guard.response;

  // Defense-in-depth: reject an obviously oversized request before
  // buffering/parsing the whole multipart body. Not authoritative -- the
  // real check is file.size below, which this can never replace.
  if (exceedsDeclaredContentLength(request, MAX_SVG_UPLOAD_BYTES)) {
    return NextResponse.json(
      { error: `File exceeds the ${MAX_SVG_UPLOAD_BYTES / (1024 * 1024)}MB upload limit.` },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const name = formData.get("name");
  const file = formData.get("file");

  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Template name is required." }, { status: 400 });
  }
  if (name.trim().length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Template name must be ${MAX_NAME_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "An SVG file is required." }, { status: 400 });
  }

  const looksLikeSvg = file.name.toLowerCase().endsWith(".svg") || file.type === "image/svg+xml";
  if (!looksLikeSvg) {
    return NextResponse.json({ error: "Only SVG files are accepted." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_SVG_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${MAX_SVG_UPLOAD_BYTES / (1024 * 1024)}MB upload limit.` },
      { status: 400 },
    );
  }

  const rawSvg = await file.text();
  const outcome = processUploadedSvg(rawSvg);
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }

  const { sanitizedSvg, width, height } = outcome.result;
  const templateId = crypto.randomUUID();
  const storagePath = `${templateId}/source.svg`;

  const supabase = createServiceRoleClient();
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKETS.templates)
    .upload(storagePath, sanitizedSvg, { contentType: "image/svg+xml", upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: "Failed to upload the template file. Please try again." },
      { status: 500 },
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from("templates")
    .insert({
      id: templateId,
      name: name.trim(),
      svg_path: storagePath,
      svg_width: width,
      svg_height: height,
    })
    .select()
    .single();

  if (insertError) {
    await supabase.storage.from(STORAGE_BUCKETS.templates).remove([storagePath]);
    return NextResponse.json(
      { error: "Failed to save the template. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ template: inserted, sanitizedSvg }, { status: 201 });
}
