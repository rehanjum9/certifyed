"use client";

import { usePathname } from "next/navigation";
import { IconMenu } from "@/components/ui/icons";
import { AccountMenu } from "@/components/layout/AccountMenu";

interface HeaderProps {
  onMenuClick: () => void;
  /** The signed-in operator's email from the real Supabase Auth session. */
  userEmail: string | null;
}

const SEGMENT_LABELS: Record<string, string> = {
  templates: "Templates",
  campaigns: "Campaigns",
  settings: "Settings",
  new: "New",
  editor: "Editor",
};

function breadcrumbFromPathname(pathname: string): string[] {
  if (pathname === "/") return ["Dashboard"];
  const segments = pathname.split("/").filter(Boolean);
  return segments.map((segment) => {
    if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
    // Dynamic id segments (uuids) render as a short, technical placeholder
    // rather than the raw id -- this is purely a breadcrumb label, not data.
    return /^[0-9a-f-]{8,}$/i.test(segment) ? "Detail" : segment;
  });
}

export function Header({ onMenuClick, userEmail }: HeaderProps) {
  const pathname = usePathname();
  const crumbs = breadcrumbFromPathname(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/80 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
        aria-label="Open navigation"
      >
        <IconMenu className="h-5 w-5" />
      </button>

      <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 font-mono text-xs text-slate-400 sm:flex">
        {crumbs.map((crumb, index) => (
          <span key={index} className="flex items-center gap-1.5">
            {index > 0 && <span className="text-slate-300">/</span>}
            <span className={index === crumbs.length - 1 ? "font-medium text-slate-700" : undefined}>{crumb}</span>
          </span>
        ))}
      </nav>

      <span className="text-sm font-medium text-slate-900 sm:hidden">CERTIFYED_</span>

      <div className="ml-auto flex items-center gap-3">
        <AccountMenu email={userEmail} />
      </div>
    </header>
  );
}
