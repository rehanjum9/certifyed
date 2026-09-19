import { createServiceRoleClient } from "@/lib/supabase/server";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage";
import type { Database } from "@/types/database";
import type { CustomFontMeta } from "./types";

type FontRow = Database["public"]["Tables"]["fonts"]["Row"];

function toCustomFontMeta(row: FontRow): CustomFontMeta {
  return {
    id: row.id,
    displayName: row.display_name,
    originalFilename: row.original_filename,
    format: row.format,
    fontWeight: row.font_weight === "bold" ? "bold" : "normal",
    fileSize: row.file_size,
    createdAt: row.created_at,
  };
}

/**
 * Custom fonts are workspace-specific (architecture report, item 25): Club
 * A never sees Club B's uploaded fonts in its picker. The service-role
 * client bypasses RLS, so this `.eq("organization_id", ...)` is the real
 * isolation boundary here, not RLS.
 */
export async function listCustomFonts(organizationId: string): Promise<CustomFontMeta[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("fonts")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load custom fonts: ${error.message}`);
  return (data ?? []).map(toCustomFontMeta);
}

/**
 * Unscoped by organization -- internal use only (the PDF generation
 * pipeline, see loadCustomFontsForFields below), where the font id being
 * looked up already came from a template_fields row belonging to a
 * template whose organization was verified earlier in the same request,
 * never from unverified client input. Any route that resolves a font id
 * supplied directly by a request (the file-download route, delete) MUST
 * use getCustomFontForOrganization instead.
 */
export async function getCustomFont(fontId: string): Promise<FontRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("fonts").select("*").eq("id", fontId).maybeSingle();

  if (error) throw new Error(`Failed to load font: ${error.message}`);
  return data;
}

/** Org-scoped lookup for any route resolving a font id supplied by the caller (file download, delete). Returns null -- identical to "doesn't exist" -- for a font that exists but belongs to a different organization. */
export async function getCustomFontForOrganization(fontId: string, organizationId: string): Promise<FontRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("fonts")
    .select("*")
    .eq("id", fontId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load font: ${error.message}`);
  return data;
}

/**
 * Downloads a custom font's raw file bytes from private storage,
 * server-side only -- used by both the browser-mediated font route and the
 * PDF renderer's font-registration step. The service-role key never
 * leaves this function.
 */
export async function downloadCustomFontFile(storagePath: string): Promise<Buffer> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage.from(STORAGE_BUCKETS.fonts).download(storagePath);

  if (error || !data) {
    throw new Error(`Failed to load font file: ${error?.message ?? "not found"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

export interface LoadedCustomFont {
  id: string;
  buffer: Buffer;
}

/**
 * Downloads the font bytes for a set of distinct custom font ids (deduped
 * here), for the PDF renderer's doc.registerFont() step -- see
 * pdf/renderers/pdfkitSvgRenderer.ts. A referenced font that no longer
 * exists, or whose file fails to download, is silently skipped: the
 * renderer falls back to the default built-in font and reports a warning
 * for that overlay rather than failing the whole generation batch over one
 * broken font reference. Callers pass font ids sourced from an
 * already-organization-verified template's fields (see
 * lib/campaigns/generation.ts) -- not scoped by organization again here,
 * see getCustomFont's doc comment.
 */
export async function loadCustomFontsForFields(fontIds: string[]): Promise<LoadedCustomFont[]> {
  const uniqueIds = Array.from(new Set(fontIds));

  const loaded = await Promise.all(
    uniqueIds.map(async (id): Promise<LoadedCustomFont | null> => {
      try {
        const font = await getCustomFont(id);
        if (!font) return null;
        const buffer = await downloadCustomFontFile(font.storage_path);
        return { id, buffer };
      } catch {
        return null;
      }
    }),
  );

  return loaded.filter((font): font is LoadedCustomFont => font !== null);
}

export interface CreateCustomFontInput {
  organizationId: string;
  displayName: string;
  originalFilename: string;
  storagePath: string;
  format: "ttf" | "otf";
  fontWeight: "normal" | "bold";
  fileSize: number;
  createdBy: string | null;
}

export async function createCustomFont(input: CreateCustomFontInput): Promise<CustomFontMeta> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("fonts")
    .insert({
      organization_id: input.organizationId,
      display_name: input.displayName,
      original_filename: input.originalFilename,
      storage_path: input.storagePath,
      format: input.format,
      font_weight: input.fontWeight,
      file_size: input.fileSize,
      created_by: input.createdBy,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save font: ${error.message}`);
  return toCustomFontMeta(data);
}

export interface FontInUseTemplate {
  id: string;
  name: string;
}

/**
 * Which templates currently have a field using this font -- template_fields
 * doesn't have a foreign key to fonts (font_family is a plain string id
 * shared with built-ins, see 0006_custom_fonts.sql), so this is a plain
 * lookup rather than a join. Used to block deletion (item 9) with a useful,
 * specific message instead of silently breaking those templates.
 *
 * Scoped to `organizationId`'s own templates (item 25: "in use" detection
 * must only consider the correct organization) -- a font can only ever be
 * selected by a template in its own organization via this app's UI/API, so
 * this is defense in depth against ever reporting (or being blocked by) a
 * different organization's template.
 */
export async function listTemplatesUsingFont(fontId: string, organizationId: string): Promise<FontInUseTemplate[]> {
  const supabase = createServiceRoleClient();

  const { data: fieldRows, error: fieldsError } = await supabase
    .from("template_fields")
    .select("template_id")
    .eq("font_family", fontId);

  if (fieldsError) throw new Error(`Failed to check font usage: ${fieldsError.message}`);

  const templateIds = Array.from(new Set((fieldRows ?? []).map((row) => row.template_id)));
  if (templateIds.length === 0) return [];

  const { data: templateRows, error: templatesError } = await supabase
    .from("templates")
    .select("id, name")
    .eq("organization_id", organizationId)
    .in("id", templateIds);

  if (templatesError) throw new Error(`Failed to check font usage: ${templatesError.message}`);
  return templateRows ?? [];
}

export type DeleteCustomFontResult =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "in_use"; templates: FontInUseTemplate[] };

/**
 * Deletes a custom font only if it belongs to `organizationId` and no
 * template field currently references it (item 9: never silently break an
 * existing template). Storage removal happens after the DB row is gone,
 * matching the rest of this app's delete-then-clean-up-storage ordering.
 */
export async function deleteCustomFont(fontId: string, organizationId: string): Promise<DeleteCustomFontResult> {
  const font = await getCustomFontForOrganization(fontId, organizationId);
  if (!font) return { ok: false, reason: "not_found" };

  const templatesInUse = await listTemplatesUsingFont(fontId, organizationId);
  if (templatesInUse.length > 0) {
    return { ok: false, reason: "in_use", templates: templatesInUse };
  }

  const supabase = createServiceRoleClient();
  const { error: deleteError } = await supabase.from("fonts").delete().eq("id", fontId);
  if (deleteError) throw new Error(`Failed to delete font: ${deleteError.message}`);

  await supabase.storage.from(STORAGE_BUCKETS.fonts).remove([font.storage_path]);

  return { ok: true };
}
