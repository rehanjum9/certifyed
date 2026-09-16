"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";

interface CampaignActionsProps {
  campaignId: string;
  pendingCount: number;
  failedCount: number;
}

interface GenerateResponse {
  generated?: number;
  failed?: number;
  error?: string;
}

interface RetryResponse {
  requeued?: number;
  stillIneligible?: number;
  error?: string;
}

export function CampaignActions({ campaignId, pendingCount, failedCount }: CampaignActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"generate" | "retry" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setBusy("generate");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/generate`, { method: "POST" });
      const body = (await response.json()) as GenerateResponse;
      if (!response.ok) {
        setError(body.error ?? "Failed to generate certificates.");
        return;
      }
      setMessage(`Batch complete: ${body.generated ?? 0} generated, ${body.failed ?? 0} failed.`);
      router.refresh();
    } catch {
      setError("Failed to generate certificates. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRetry() {
    setBusy("retry");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/retry-failed`, { method: "POST" });
      const body = (await response.json()) as RetryResponse;
      if (!response.ok) {
        setError(body.error ?? "Failed to retry failed rows.");
        return;
      }
      setMessage(
        `${body.requeued ?? 0} row(s) requeued for generation. ${body.stillIneligible ?? 0} remain ineligible.`,
      );
      router.refresh();
    } catch {
      setError("Failed to retry failed rows. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleGenerate} disabled={busy !== null || pendingCount === 0}>
          {busy === "generate" && <Spinner className="h-4 w-4" />}
          Generate next batch {pendingCount > 0 ? `(${pendingCount} pending)` : ""}
        </Button>
        <Button
          variant="secondary"
          onClick={handleRetry}
          disabled={busy !== null || failedCount === 0}
        >
          {busy === "retry" && <Spinner className="h-4 w-4" />}
          Retry failed rows {failedCount > 0 ? `(${failedCount})` : ""}
        </Button>
      </div>
      {message && <Alert variant="success">{message}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}
    </div>
  );
}
