"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

/** Workspace-owner-only (see /api/email/gmail/disconnect). Removes only this workspace's Gmail connection -- generation/downloads are unaffected, only sending stops until reconnected. */
export function GmailDisconnectButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDisconnect() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/email/gmail/disconnect", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Failed to disconnect.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button variant="secondary" size="sm" onClick={handleDisconnect} disabled={loading}>
        {loading && <Spinner className="h-4 w-4" />}
        Disconnect
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
