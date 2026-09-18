"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { PublicHeader } from "./PublicHeader";
import { PublicFooter } from "./PublicFooter";
import type { LayoutWorkspaceInfo } from "@/lib/organizations/pageContext";

/** The public marketing site -- open to everyone, gets the public header/footer, never the app sidebar. */
const PUBLIC_SITE_PATHS = new Set(["/", "/about", "/how-to-use"]);
/** Renders with no chrome at all (its own centered card) -- not the app shell, not the public header/footer. */
const CHROMELESS_PATHS = new Set(["/login", "/set-password", "/auth/invite"]);

interface AppShellProps {
  children: ReactNode;
  /** The signed-in operator's email from the real Supabase Auth session; null when signed out. */
  userEmail: string | null;
  workspace: LayoutWorkspaceInfo;
}

export function AppShell({ children, userEmail, workspace }: AppShellProps) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isAuthenticated = userEmail !== null;

  if (CHROMELESS_PATHS.has(pathname)) {
    return <div className="min-h-screen bg-slate-50">{children}</div>;
  }

  if (PUBLIC_SITE_PATHS.has(pathname)) {
    return (
      // No flex-grow on <main> here on purpose: stretching it to fill the
      // viewport is exactly what pushes the footer down and leaves a large
      // empty gap on shorter pages. The footer should just follow the
      // content -- see the P1 UI-polish report for the full rationale.
      <div className="flex min-h-screen flex-col bg-white">
        <PublicHeader isAuthenticated={isAuthenticated} />
        <main>{children}</main>
        <PublicFooter isAuthenticated={isAuthenticated} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} workspace={workspace} />

      <div className="flex min-h-screen flex-col lg:pl-64">
        <Header onMenuClick={() => setMobileNavOpen(true)} userEmail={userEmail} />
        {/* min-w-0: without it, a flex item defaults to min-width:auto, which
            can let a wide child (e.g. the campaigns DataTable) force this
            column -- and the page -- wider than the viewport instead of
            scrolling locally inside the table's own overflow-x-auto box. */}
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
