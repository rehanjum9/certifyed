"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconDotsVertical } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";

export interface WorkspacePendingInvite {
  email: string;
  acceptedAt: string | null;
}

interface WorkspaceActionsMenuProps {
  organizationId: string;
  organizationName: string;
  pendingInvite: WorkspacePendingInvite | null;
}

type Busy = null | "resend" | "cancel" | "delete";

/**
 * Compact per-workspace actions menu for /admin/organizations (platform
 * admin only -- the page itself already gates the whole route). A single
 * "..." trigger instead of a row of buttons, per the design goal of
 * cleaning up OLD orphan/failed-invite test workspaces without cluttering
 * the table. Every action re-validates on the server (requirePlatformAdmin
 * + the specific resource/invite-state checks) -- this menu only decides
 * what to SHOW, never what's actually allowed.
 */
export function WorkspaceActionsMenu({ organizationId, organizationName, pendingInvite }: WorkspaceActionsMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickAway(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [open]);

  const canManageInvite = pendingInvite && !pendingInvite.acceptedAt;

  async function resendInvite() {
    setBusy("resend");
    setMenuError(null);
    try {
      const response = await fetch(`/api/admin/organizations/${organizationId}/invite`, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMenuError(body.error ?? "Failed to resend the invitation.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function cancelInvite() {
    setBusy("cancel");
    setMenuError(null);
    try {
      const response = await fetch(`/api/admin/organizations/${organizationId}/invite`, { method: "DELETE" });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMenuError(body.error ?? "Failed to cancel the invitation.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function deleteWorkspace() {
    setBusy("delete");
    setDeleteError(null);
    try {
      const response = await fetch(`/api/admin/organizations/${organizationId}`, { method: "DELETE" });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setDeleteError(body.error ?? "Failed to delete the workspace.");
        return;
      }
      setConfirmingDelete(false);
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label={`Actions for ${organizationName}`}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <IconDotsVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-1 w-64 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {canManageInvite && (
            <>
              <button
                type="button"
                disabled={busy !== null}
                onClick={resendInvite}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "resend" && <Spinner className="h-3.5 w-3.5" />}
                Resend pending owner invite
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={cancelInvite}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "cancel" && <Spinner className="h-3.5 w-3.5" />}
                Cancel pending owner invite
              </button>
              <div className="my-1 border-t border-slate-100" />
            </>
          )}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              setDeleteError(null);
              setConfirmingDelete(true);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete workspace
          </button>
          {menuError && <p className="px-3 pt-1 text-xs text-red-600">{menuError}</p>}
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete workspace?"
          description={
            <>
              This removes the workspace and its pending membership/invitation records. User accounts are not deleted.
              <br />
              <span className="font-medium text-slate-700">{organizationName}</span> will be permanently deleted.
            </>
          }
          confirmLabel="Delete workspace"
          confirmVariant="danger"
          requireTypedConfirmation={organizationName}
          busy={busy === "delete"}
          error={deleteError}
          onConfirm={deleteWorkspace}
          onCancel={() => {
            if (busy === "delete") return;
            setConfirmingDelete(false);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}
