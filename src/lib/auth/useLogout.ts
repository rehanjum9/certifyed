"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

/**
 * The one real sign-out action, shared by the header account menu and the
 * settings page so there is exactly one place that calls
 * supabase.auth.signOut() -- both call sites stay in sync by construction.
 */
export function useLogout() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }, [router]);

  return { logout, loggingOut };
}
