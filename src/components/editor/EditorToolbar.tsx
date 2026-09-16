"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface EditorToolbarProps {
  templateId: string;
  templateName: string;
  dirty: boolean;
  saveState: SaveState;
  saveError: string | null;
  onSave: () => void;
}

export function EditorToolbar({
  templateId,
  templateName,
  dirty,
  saveState,
  saveError,
  onSave,
}: EditorToolbarProps) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href={`/templates/${templateId}`}
          onClick={(event) => {
            if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) {
              event.preventDefault();
            }
          }}
          className="shrink-0 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          &larr; Back
        </Link>
        <div className="h-4 w-px shrink-0 bg-slate-200" aria-hidden="true" />
        <h1 className="truncate text-sm font-semibold text-slate-900">{templateName}</h1>
        <span className="shrink-0 text-xs text-slate-400">Field editor</span>
      </div>

      <div className="flex items-center gap-3">
        {saveError && <span className="max-w-xs truncate text-xs text-red-600">{saveError}</span>}
        <span className="text-xs text-slate-500">
          {saveState === "saving" ? "Saving..." : dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <Button size="sm" onClick={onSave} disabled={saveState === "saving" || !dirty}>
          {saveState === "saving" && <Spinner className="h-4 w-4" />}
          Save
        </Button>
      </div>
    </div>
  );
}
