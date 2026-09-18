"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomFontMeta } from "@/lib/fonts";

interface FontsListProps {
  fonts: CustomFontMeta[];
}

/** Read-only-plus-delete view of this workspace's custom fonts. Uploading happens in the template editor's font picker (see components/editor/FontPicker.tsx), where a font is actually being applied to a field -- this is just workspace-wide visibility/cleanup. */
export function FontsList({ fonts }: FontsListProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(fontId: string) {
    setDeletingId(fontId);
    setError(null);
    try {
      const response = await fetch(`/api/fonts/${fontId}`, { method: "DELETE" });
      const body = (await response.json().catch(() => ({}))) as { error?: string; templates?: { name: string }[] };
      if (!response.ok) {
        const usedBy = body.templates?.map((t) => t.name).join(", ");
        setError(usedBy ? `${body.error ?? "Font is in use."} (${usedBy})` : body.error ?? "Failed to delete font.");
        return;
      }
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  if (fonts.length === 0) {
    return <p className="text-sm text-slate-500">No custom fonts uploaded yet. Upload one from a template&apos;s field editor.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col divide-y divide-slate-100 rounded-md border border-slate-200">
        {fonts.map((font) => (
          <div key={font.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{font.displayName}</p>
              <p className="text-xs text-slate-400">
                {font.format.toUpperCase()} &middot; {(font.fileSize / 1024).toFixed(0)} KB
              </p>
            </div>
            <button
              type="button"
              disabled={deletingId === font.id}
              onClick={() => handleDelete(font.id)}
              className="shrink-0 text-xs font-medium text-red-500 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deletingId === font.id ? "Deleting…" : "Delete"}
            </button>
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
