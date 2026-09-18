"use client";

import { useRef, useState } from "react";
import { BUILTIN_FONTS } from "@/lib/fonts";
import type { CustomFontMeta } from "@/lib/fonts";
import { inputClassName } from "@/components/ui/Input";

interface FontPickerProps {
  value: string;
  customFonts: CustomFontMeta[];
  loadingCustomFonts: boolean;
  onChange: (fontId: string) => void;
  /** Called after a successful upload or delete so the owning hook re-fetches/re-registers the font list. */
  onFontsChanged: () => Promise<void>;
}

/**
 * Font family picker for a template field: built-in fonts (always present)
 * plus every operator-uploaded custom font, with inline upload and delete.
 * Selecting an id here is exactly what's saved to template_fields.font_family
 * -- see lib/fonts/registry.ts for how both kinds resolve identically.
 */
export function FontPicker({ value, customFonts, loadingCustomFonts, onChange, onFontsChanged }: FontPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/fonts", { method: "POST", body: formData });
      const body = (await response.json().catch(() => ({}))) as { font?: CustomFontMeta; error?: string };

      if (!response.ok || !body.font) {
        setUploadError(body.error ?? "Failed to upload font.");
        return;
      }

      await onFontsChanged();
      onChange(body.font.id);
    } catch {
      setUploadError("Failed to upload font. Check your connection.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(fontId: string) {
    setDeletingId(fontId);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/fonts/${fontId}`, { method: "DELETE" });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        templates?: { id: string; name: string }[];
      };

      if (!response.ok) {
        const usedBy = body.templates?.map((t) => t.name).join(", ");
        setDeleteError(usedBy ? `${body.error ?? "Font is in use."} (${usedBy})` : body.error ?? "Failed to delete font.");
        return;
      }

      if (value === fontId) onChange(BUILTIN_FONTS[0].id);
      await onFontsChanged();
    } catch {
      setDeleteError("Failed to delete font. Check your connection.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        id="field-font-family"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClassName}
      >
        <optgroup label="Built-in">
          {BUILTIN_FONTS.map((font) => (
            <option key={font.id} value={font.id}>
              {font.label}
            </option>
          ))}
        </optgroup>
        {customFonts.length > 0 && (
          <optgroup label="Custom">
            {customFonts.map((font) => (
              <option key={font.id} value={font.id}>
                {font.displayName}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload custom font (.ttf/.otf)"}
        </button>
        {loadingCustomFonts && <span className="text-xs text-slate-400">Loading fonts…</span>}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".ttf,.otf,font/ttf,font/otf,font/sfnt"
        onChange={handleFileChange}
        className="hidden"
      />
      {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}

      {customFonts.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-slate-200 p-2">
          <p className="text-xs font-medium text-slate-500">Uploaded fonts</p>
          {customFonts.map((font) => (
            <div key={font.id} className="flex items-center justify-between gap-2 text-xs text-slate-600">
              <span className="truncate">{font.displayName}</span>
              <button
                type="button"
                onClick={() => handleDelete(font.id)}
                disabled={deletingId === font.id}
                className="shrink-0 text-red-500 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingId === font.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          ))}
          {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
        </div>
      )}
    </div>
  );
}
