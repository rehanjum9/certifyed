import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Intentionally public (uptime monitors typically can't authenticate) and
 * intentionally minimal: no env var names, no row counts, no raw
 * error/provider details -- just whether the app can reach its database.
 * See the P0 security report (HEALTH-LEAK-01) for why the previous version
 * of this route was tightened.
 */
export async function GET() {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("templates").select("id", { head: true, count: "exact" }).limit(1);
    if (error) {
      return NextResponse.json({ ok: false }, { status: 503 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
