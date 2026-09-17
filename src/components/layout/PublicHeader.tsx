"use client";

import { useState } from "react";
import Link from "next/link";
import { getPrimaryCta } from "@/lib/publicCta";
import { buttonClassName } from "@/components/ui/Button";
import { IconMenu, IconClose } from "@/components/ui/icons";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/how-to-use", label: "How to use" },
];

interface PublicHeaderProps {
  isAuthenticated: boolean;
}

export function PublicHeader({ isAuthenticated }: PublicHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const cta = getPrimaryCta(isAuthenticated, "Sign in");

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="font-mono text-base font-semibold tracking-tight text-slate-900">
          <span className="text-emerald-600">&gt;</span> CERTIFYED_
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-6 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm font-medium text-slate-600 hover:text-slate-900">
              {link.label}
            </Link>
          ))}
          <Link href={cta.href} className={buttonClassName("primary", "sm")}>
            {cta.label}
          </Link>
        </nav>

        <button
          type="button"
          onClick={() => setMobileOpen((value) => !value)}
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100 sm:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <IconClose className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <nav aria-label="Primary" className="border-t border-slate-200 bg-white sm:hidden">
          <div className="flex flex-col gap-1 px-4 py-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-2 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={cta.href}
              onClick={() => setMobileOpen(false)}
              className={buttonClassName("primary", "md", "mt-1 justify-center")}
            >
              {cta.label}
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
