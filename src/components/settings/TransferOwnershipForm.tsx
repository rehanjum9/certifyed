"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { inputClassName } from "@/components/ui/Input";
import type { OrganizationMemberSummary } from "@/lib/organizations/types";

interface TransferOwnershipFormProps {
  /** Existing members eligible to become the new owner -- i.e. every member of this workspace EXCEPT the current owner (there is always exactly one, so it's simply excluded by the caller). */
  candidates: OrganizationMemberSummary[];
}

/**
 * Owner-only (see Settings -> Workspace and /api/workspace/transfer-ownership).
 * The only supported way to change who owns a workspace -- deliberately a
 * dedicated action, not a casual per-row role dropdown. Requires picking an
 * existing member and confirming before anything happens; the actual swap
 * is atomic server-side (transferOrganizationOwnership).
 */
export function TransferOwnershipForm({ candidates }: TransferOwnershipFormProps) {
  const router = useRouter();
  const [selectedUserId, setSelectedUserId] = useState(candidates[0]?.userId ?? "");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (candidates.length === 0) {
    return <p className="text-xs text-slate-400">Invite another member before you can transfer ownership.</p>;
  }

  const selected = candidates.find((candidate) => candidate.userId === selectedUserId) ?? candidates[0];

  async function confirmTransfer() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/workspace/transfer-ownership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newOwnerUserId: selected.userId }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Failed to transfer ownership.");
        return;
      }
      setConfirming(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <label className="text-xs font-medium text-slate-600" htmlFor="transfer-ownership-select">
          New owner
        </label>
        <select
          id="transfer-ownership-select"
          value={selected.userId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className={`${inputClassName} py-1.5 text-xs`}
        >
          {candidates.map((candidate) => (
            <option key={candidate.userId} value={candidate.userId}>
              {candidate.email ?? candidate.userId}
            </option>
          ))}
        </select>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="shrink-0"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
      >
        Transfer ownership
      </Button>

      {confirming && (
        <ConfirmDialog
          title="Transfer ownership?"
          description={
            <>
              You will become a regular member of this workspace.{" "}
              <span className="font-medium text-slate-700">{selected.email ?? selected.userId}</span> will become the new owner.
            </>
          }
          confirmLabel="Transfer ownership"
          confirmVariant="danger"
          busy={busy}
          error={error}
          onConfirm={confirmTransfer}
          onCancel={() => {
            if (busy) return;
            setConfirming(false);
            setError(null);
          }}
        />
      )}
    </div>
  );
}
