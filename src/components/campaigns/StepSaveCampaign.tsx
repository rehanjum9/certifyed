"use client";

import Link from "next/link";
import { Label, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import type { ValidationSummary } from "@/lib/spreadsheet/validateRows";

interface StepSaveCampaignProps {
  campaignName: string;
  onCampaignNameChange: (value: string) => void;
  summary: ValidationSummary;
  saveState: "idle" | "saving" | "success" | "error";
  saveError: string | null;
  savedCampaignId: string | null;
  onSave: () => void;
}

export function StepSaveCampaign({
  campaignName,
  onCampaignNameChange,
  summary,
  saveState,
  saveError,
  savedCampaignId,
  onSave,
}: StepSaveCampaignProps) {
  if (saveState === "success" && savedCampaignId) {
    return (
      <Alert variant="success">
        <p className="font-medium">Campaign saved.</p>
        <p className="mt-1">{summary.valid} of {summary.total} rows are ready for generation.</p>
        <Link href={`/campaigns/${savedCampaignId}`} className="mt-2 inline-block font-medium underline">
          View campaign
        </Link>
      </Alert>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h2 className="text-sm font-semibold text-slate-900">Save campaign</h2>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campaign-name">Campaign name</Label>
        <Input
          id="campaign-name"
          value={campaignName}
          onChange={(e) => onCampaignNameChange(e.target.value)}
          placeholder="e.g. Spring 2026 Graduation Certificates"
        />
      </div>

      <p className="text-sm text-slate-500">
        {summary.valid} of {summary.total} rows are valid and will be marked ready for generation.
        {summary.invalid > 0 && ` ${summary.invalid} invalid row${summary.invalid === 1 ? "" : "s"} will be saved but excluded from generation.`}
      </p>

      {saveError && <Alert variant="error">{saveError}</Alert>}

      <Button onClick={onSave} disabled={saveState === "saving"} className="self-start">
        {saveState === "saving" && <Spinner className="h-4 w-4" />}
        {saveState === "saving" ? "Saving..." : "Save campaign"}
      </Button>
    </div>
  );
}
