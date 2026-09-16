"use client";

import { type ChangeEvent, useRef } from "react";
import { Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { MAX_SPREADSHEET_UPLOAD_BYTES } from "@/lib/spreadsheet/constants";
import type { ParsedSpreadsheetState } from "./wizardTypes";

const MAX_UPLOAD_MB = MAX_SPREADSHEET_UPLOAD_BYTES / (1024 * 1024);

interface StepUploadSpreadsheetProps {
  file: File | null;
  status: "idle" | "parsing" | "error" | "success";
  error: string | null;
  parsed: ParsedSpreadsheetState | null;
  onFileSelected: (file: File) => void;
}

export function StepUploadSpreadsheet({ file, status, error, parsed, onFileSelected }: StepUploadSpreadsheetProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (selected) onFileSelected(selected);
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h2 className="font-mono text-sm font-semibold text-slate-900">upload_roster</h2>
      <p className="text-sm text-slate-500">
        Upload an .xlsx or .csv file with one row per recipient. Max {MAX_UPLOAD_MB}MB.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="roster-file">Spreadsheet file</Label>
        <input
          id="roster-file"
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx"
          onChange={handleChange}
          className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-emerald-700 hover:file:bg-emerald-100"
        />
      </div>

      {status === "parsing" && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner className="h-4 w-4" />
          Parsing spreadsheet...
        </div>
      )}

      {status === "error" && error && <Alert variant="error">{error}</Alert>}

      {status === "success" && file && parsed && (
        <Alert variant="success">
          Parsed &quot;{file.name}&quot;: {parsed.headers.length} columns, {parsed.rows.length} data row
          {parsed.rows.length === 1 ? "" : "s"}.
        </Alert>
      )}
    </div>
  );
}
