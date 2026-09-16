"use client";

import { IconMenu } from "@/components/ui/icons";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
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
      <span className="text-sm font-medium text-slate-900 lg:hidden">CertGen</span>
    </header>
  );
}
