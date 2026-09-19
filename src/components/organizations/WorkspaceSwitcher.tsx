"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { IconChevronRight } from "@/components/ui/icons";
import type { Membership } from "@/lib/organizations/types";

interface WorkspaceSwitcherProps {
  activeOrganizationId: string;
  activeOrganizationName: string;
  memberships: Membership[];
}

/**
 * Sidebar workspace display/switcher (architecture report, item 8). A user
 * in exactly one workspace sees its name only, no dropdown -- nothing to
 * switch between. A user in several gets a small menu; picking one POSTs
 * the choice to /api/workspace/active (which re-validates it against the
 * caller's real memberships before ever setting the cookie -- this
 * component itself never grants access to anything, it only asks the
 * server to change which already-authorized workspace is active) and then
 * does a full navigation to /dashboard, since whatever page is currently
 * open may not even exist in the newly-selected workspace.
 */
export function WorkspaceSwitcher({ activeOrganizationId, activeOrganizationName, memberships }: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  async function switchTo(organizationId: string) {
    if (organizationId === activeOrganizationId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      const response = await fetch("/api/workspace/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (response.ok) {
        router.push("/dashboard");
        router.refresh();
      }
    } finally {
      setSwitching(false);
      setOpen(false);
    }
  }

  if (memberships.length <= 1) {
    return (
      <div className="truncate px-6 py-2 font-mono text-[11px] text-white/40" title={activeOrganizationName}>
        {activeOrganizationName}
      </div>
    );
  }

  return (
    <div className="relative px-3 py-1.5" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={switching}
        className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-xs text-white/70 hover:bg-white/5 disabled:opacity-50"
      >
        <span className="truncate font-mono">{activeOrganizationName}</span>
        <IconChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div role="menu" className="absolute left-3 right-3 z-50 mt-1 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {memberships.map((membership) => (
            <button
              key={membership.organizationId}
              type="button"
              role="menuitem"
              onClick={() => switchTo(membership.organizationId)}
              className={cn(
                "block w-full truncate px-3 py-2 text-left text-sm hover:bg-slate-50",
                membership.organizationId === activeOrganizationId ? "font-medium text-emerald-700" : "text-slate-700",
              )}
            >
              {membership.organizationName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
