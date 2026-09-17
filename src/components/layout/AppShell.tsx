"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

/** Pages that render outside the authenticated app shell (no sidebar/header chrome). */
const CHROMELESS_PATHS = new Set(["/login"]);

interface AppShellProps {
  children: ReactNode;
  /** The signed-in operator's email from the real Supabase Auth session; null on chromeless pages. */
  userEmail: string | null;
}

export function AppShell({ children, userEmail }: AppShellProps) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (CHROMELESS_PATHS.has(pathname)) {
    return <div className="min-h-screen bg-slate-50">{children}</div>;
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
