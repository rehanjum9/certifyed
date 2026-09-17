"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { PublicHeader } from "./PublicHeader";
import { PublicFooter } from "./PublicFooter";

/** The public marketing site -- open to everyone, gets the public header/footer, never the app sidebar. */
const PUBLIC_SITE_PATHS = new Set(["/", "/about", "/how-to-use"]);
/** Renders with no chrome at all (its own centered card) -- not the app shell, not the public header/footer. */
const CHROMELESS_PATHS = new Set(["/login"]);

interface AppShellProps {
  children: ReactNode;
  /** The signed-in operator's email from the real Supabase Auth session; null when signed out. */
  userEmail: string | null;
}

export function AppShell({ children, userEmail }: AppShellProps) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isAuthenticated = userEmail !== null;

  if (CHROMELESS_PATHS.has(pathname)) {
    return <div className="min-h-screen bg-slate-50">{children}</div>;
  }

  if (PUBLIC_SITE_PATHS.has(pathname)) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <PublicHeader isAuthenticated={isAuthenticated} />
        <main className="flex flex-1 flex-col">{children}</main>
        <PublicFooter isAuthenticated={isAuthenticated} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="flex min-h-screen flex-col lg:pl-64">
        <Header onMenuClick={() => setMobileNavOpen(true)} userEmail={userEmail} />
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
