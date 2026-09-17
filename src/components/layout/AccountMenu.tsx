"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLogout } from "@/lib/auth/useLogout";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/Spinner";
import { IconChevronRight, IconLogOut } from "@/components/ui/icons";

interface AccountMenuProps {
  /** The signed-in operator's email from the real Supabase Auth session -- null only if that session is somehow unavailable. */
  email: string | null;
}

export function AccountMenu({ email }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { logout, loggingOut } = useLogout();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
      >
        <Avatar email={email} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-400">Signed in as</p>
            <p className="truncate text-sm font-medium text-slate-900">{email ?? "—"}</p>
          </div>

          <div className="p-1">
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Settings
              <IconChevronRight className="h-4 w-4 text-slate-300" />
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={logout}
              disabled={loggingOut}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {loggingOut ? <Spinner className="h-4 w-4" /> : <IconLogOut className="h-4 w-4" />}
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
