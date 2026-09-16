import { createServiceRoleClient } from "@/lib/supabase/server";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage";
import type { Database } from "@/types/database";

type TemplateRow = Database["public"]["Tables"]["templates"]["Row"];

export async function listTemplates(): Promise<TemplateRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load templates: ${error.message}`);
  return data ?? [];
}

export async function getTemplate(id: string): Promise<TemplateRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load template: ${error.message}`);
  return data;
}

/**
 * Downloads a template's sanitized SVG from private storage, server-side
 * only. The service-role key never leaves this function; callers get back
 * plain text they can safely inline (it was sanitized before it was ever
 * written to storage).
 */
export async function downloadTemplateSvg(svgPath: string): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKETS.templates)
    .download(svgPath);

  if (error || !data) {
    throw new Error(`Failed to load template SVG: ${error?.message ?? "not found"}`);
  }

  return data.text();
}
