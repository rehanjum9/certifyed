"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { IconDashboard, IconTemplates, IconCampaigns, IconSettings } from "@/components/ui/icons";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: IconDashboard, exact: true },
  { href: "/templates", label: "Templates", icon: IconTemplates, exact: false },
  { href: "/campaigns", label: "Campaigns", icon: IconCampaigns, exact: false },
  { href: "/settings", label: "Settings", icon: IconSettings, exact: false },
];

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#0f1a17] transition-transform duration-200 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Link
          href="/dashboard"
          onClick={onClose}
          className="flex h-16 shrink-0 flex-col justify-center border-b border-white/10 px-6 transition-colors hover:bg-white/5"
        >
          <span className="font-mono text-[15px] font-semibold tracking-tight text-white">
            <span className="text-emerald-400">&gt;</span> CERTIFYED_
          </span>
          <span className="mt-0.5 truncate font-mono text-[10px] text-emerald-400/70">
            generate. personalize. deliver.
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-emerald-400/10 text-emerald-300" : "text-white/60 hover:bg-white/5 hover:text-white/90",
                )}
              >
                {isActive && (
                  <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-emerald-400" aria-hidden="true" />
                )}
                <Icon className="h-4.5 w-4.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-6 py-4 font-mono text-[11px] leading-relaxed text-white/30">
          <p>{"// generate"}</p>
          <p>{"// personalize"}</p>
          <p>{"// deliver"}</p>
        </div>
      </aside>
    </>
  );
}
