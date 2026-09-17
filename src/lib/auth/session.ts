import { createServerSupabaseClient } from "@/lib/supabase/server";

/** The signed-in operator's email from the real Supabase Auth session, or null when signed out. The one place every server component/page reads this, so layout, settings, and the public pages' auth-aware CTAs never duplicate the Supabase call. */
export async function getSignedInUserEmail(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}
