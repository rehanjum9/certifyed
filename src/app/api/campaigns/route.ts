import { NextResponse } from "next/server";
import { z } from "zod";
import { getTemplate } from "@/lib/templates";
import { listTemplateFields } from "@/lib/templateFields";
import { parseSpreadsheet } from "@/lib/spreadsheet/parse";
import { MAX_SPREADSHEET_UPLOAD_BYTES } from "@/lib/spreadsheet/constants";
import { validateRows, type FieldMapping } from "@/lib/spreadsheet/validateRows";
import { buildCampaignRowInserts, buildColumnMapping, resolveEmailColumnHeader } from "@/lib/campaigns/persistence";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage";
import { guardApiRoute } from "@/lib/auth/apiGuard";
import { RATE_LIMITS } from "@/lib/rateLimit";

const MAX_NAME_LENGTH = 200;

const metaSchema = z.object({
  templateId: z.string().uuid(),
  campaignName: z.string().min(1).max(MAX_NAME_LENGTH),
  emailColumnIndex: z.number().int().min(0),
  fieldMappings: z.array(
    z.object({
      field_key: z.string().min(1),
      columnIndex: z.number().int().min(0).nullable(),
    }),
  ),
});

/**
 * Authoritative campaign creation. Re-parses the uploaded file and re-loads
 * the template's real fields from the database itself -- the client's
 * reported headers/mappings are only ever used as "which index/key was
 * requested," never trusted as fact. Nothing the client sends is written
 * to the database until it's been checked against that real data.
 */
export async function POST(request: Request) {
  const guard = await guardApiRoute({ rateLimit: { key: "campaign-create", ...RATE_LIMITS.campaignCreate } });
  if ("response" in guard) return guard.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const file = formData.get("file");
  const metaRaw = formData.get("meta");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A spreadsheet file is required." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_SPREADSHEET_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${MAX_SPREADSHEET_UPLOAD_BYTES / (1024 * 1024)}MB upload limit.` },
      { status: 400 },
    );
  }

  let metaParsed: unknown;
  try {
    metaParsed = JSON.parse(String(metaRaw ?? ""));
  } catch {
    return NextResponse.json({ error: "Invalid campaign metadata." }, { status: 400 });
  }

  const meta = metaSchema.safeParse(metaParsed);
  if (!meta.success) {
    return NextResponse.json(
      { error: meta.error.issues[0]?.message ?? "Invalid campaign metadata." },
      { status: 400 },
    );
  }

  const template = await getTemplate(meta.data.templateId);
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const templateFields = await listTemplateFields(meta.data.templateId);

  const buffer = await file.arrayBuffer();
  const parsed = parseSpreadsheet({ buffer, filename: file.name });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { headers, rows } = parsed.result;

  if (meta.data.emailColumnIndex >= headers.length) {
    return NextResponse.json({ error: "The mapped email column no longer exists in this file." }, { status: 400 });
  }

  const fieldByKey = new Map(templateFields.map((f) => [f.field_key, f]));
  const requestedByKey = new Map(meta.data.fieldMappings.map((m) => [m.field_key, m.columnIndex]));

  const mappings: FieldMapping[] = [];
  for (const templateField of templateFields) {
    const columnIndex = requestedByKey.get(templateField.field_key) ?? null;

    if (columnIndex !== null && columnIndex >= headers.length) {
      return NextResponse.json(
        { error: `The mapped column for "${templateField.label}" no longer exists in this file.` },
        { status: 400 },
      );
    }
    if (templateField.is_required && columnIndex === null) {
      return NextResponse.json(
        { error: `"${templateField.label}" is required but has no mapped column.` },
        { status: 400 },
      );
    }

    mappings.push({
      field_key: templateField.field_key,
      label: templateField.label,
      is_required: templateField.is_required,
      columnIndex,
    });
  }

  // Reject any submitted mapping that doesn't correspond to a real field on this template.
  for (const key of requestedByKey.keys()) {
    if (!fieldByKey.has(key)) {
      return NextResponse.json({ error: `Unknown template field: "${key}".` }, { status: 400 });
    }
  }

  const outcome = validateRows(rows, meta.data.emailColumnIndex, mappings);

  const campaignId = crypto.randomUUID();
  const safeFileName = file.name.replace(/[^a-z0-9.\-_]+/gi, "-");
  const storagePath = `${campaignId}/${safeFileName}`;

  const supabase = createServiceRoleClient();

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKETS.uploads)
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { error: campaignError } = await supabase.from("campaigns").insert({
    id: campaignId,
    template_id: meta.data.templateId,
    name: meta.data.campaignName,
    status: "mapped",
    source_file_path: storagePath,
    source_row_count: rows.length,
    column_mapping: buildColumnMapping(headers, mappings),
    email_column: resolveEmailColumnHeader(headers, meta.data.emailColumnIndex),
  });

  if (campaignError) {
    await supabase.storage.from(STORAGE_BUCKETS.uploads).remove([storagePath]);
    return NextResponse.json({ error: `Failed to save campaign: ${campaignError.message}` }, { status: 500 });
  }

  const rowInserts = buildCampaignRowInserts(campaignId, outcome.rows);
  const { error: rowsError } = await supabase.from("campaign_rows").insert(rowInserts);

  if (rowsError) {
    await supabase.from("campaigns").delete().eq("id", campaignId);
    await supabase.storage.from(STORAGE_BUCKETS.uploads).remove([storagePath]);
    return NextResponse.json({ error: `Failed to save campaign rows: ${rowsError.message}` }, { status: 500 });
  }

  return NextResponse.json({ campaignId, summary: outcome.summary }, { status: 201 });
}
