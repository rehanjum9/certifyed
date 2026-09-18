import { createServiceRoleClient } from "@/lib/supabase/server";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage";
import type { Database } from "@/types/database";

type TemplateRow = Database["public"]["Tables"]["templates"]["Row"];

/**
 * Every template query in this file is scoped by organizationId -- the
 * workspace-isolation boundary described in the architecture report, item
 * 22. This is the primary enforcement layer: the service-role client
 * bypasses RLS entirely (see lib/supabase/server.ts), so a query that
 * forgets `.eq("organization_id", organizationId)` would otherwise return
 * every organization's templates. getTemplate deliberately returns null
 * (not a distinguishable "exists but forbidden" error) for a template that
 * exists but belongs to a different organization -- identical to "doesn't
 * exist" from the caller's perspective, so a foreign template id can never
 * be confirmed to exist by probing this function (see lib/apiError.ts).
 */
export async function listTemplates(organizationId: string): Promise<TemplateRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load templates: ${error.message}`);
  return data ?? [];
}

export async function getTemplate(id: string, organizationId: string): Promise<TemplateRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
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
