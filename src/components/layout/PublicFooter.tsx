import Link from "next/link";
import { getPrimaryCta } from "@/lib/publicCta";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/how-to-use", label: "How to use" },
];

interface PublicFooterProps {
  isAuthenticated: boolean;
}

export function PublicFooter({ isAuthenticated }: PublicFooterProps) {
  const cta = getPrimaryCta(isAuthenticated, "Sign in");

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div>
          <p className="font-mono text-sm font-semibold text-slate-900">
            <span className="text-emerald-600">&gt;</span> CERTIFYED_
          </p>
          <p className="mt-1 font-mono text-xs text-slate-500">generate. personalize. deliver.</p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-slate-600 hover:text-slate-900">
              {link.label}
            </Link>
          ))}
          <Link href={cta.href} className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
            {cta.label}
          </Link>
        </nav>
      </div>
      <div className="border-t border-slate-100">
        <p className="mx-auto w-full max-w-6xl px-4 py-3 text-xs text-slate-400 sm:px-6 lg:px-8">
          Certificate automation, from template to delivery.
        </p>
      </div>
    </footer>
  );
}
