import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { TemplateFieldInput } from "@/lib/validation/templateField";

export type TemplateFieldRow = Database["public"]["Tables"]["template_fields"]["Row"];

export async function listTemplateFields(templateId: string): Promise<TemplateFieldRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("template_fields")
    .select("*")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load template fields: ${error.message}`);
  return data ?? [];
}

/**
 * Pure planning step for the full-replace save strategy: given the ids
 * already in the database and the ids being submitted, which existing rows
 * become stale and must be deleted. Upserting the submitted rows first and
 * deleting stale ones second (rather than delete-then-insert) means a
 * failed upsert never leaves the template with zero fields.
 */
export function planStaleFieldIds(existingIds: string[], nextIds: string[]): string[] {
  const keep = new Set(nextIds);
  return existingIds.filter((id) => !keep.has(id));
}

export async function saveTemplateFields(
  templateId: string,
  fields: TemplateFieldInput[],
): Promise<TemplateFieldRow[]> {
  const supabase = createServiceRoleClient();

  const { data: existing, error: existingError } = await supabase
    .from("template_fields")
    .select("id")
    .eq("template_id", templateId);

  if (existingError) {
    throw new Error(`Failed to read existing template fields: ${existingError.message}`);
  }

  const existingIds = (existing ?? []).map((row) => row.id);

  let saved: TemplateFieldRow[] = [];

  if (fields.length > 0) {
    const rows = fields.map((field, index) => ({ ...field, template_id: templateId, sort_order: index }));

    const { data, error } = await supabase.from("template_fields").upsert(rows, { onConflict: "id" }).select();

    if (error) throw new Error(`Failed to save template fields: ${error.message}`);
    saved = data ?? [];
  }

  const staleIds = planStaleFieldIds(existingIds, fields.map((f) => f.id));

  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase.from("template_fields").delete().in("id", staleIds);
    if (deleteError) throw new Error(`Failed to remove stale template fields: ${deleteError.message}`);
  }

  return saved;
}
