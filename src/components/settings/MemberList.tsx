"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import type { OrganizationMemberSummary } from "@/lib/organizations/types";

interface MemberListProps {
  members: OrganizationMemberSummary[];
  /** True for the workspace owner only -- controls whether the Remove control renders at all. A plain member sees a read-only list (two-role model: only the owner manages membership -- see 0011_simplify_workspace_roles.sql). */
  canManage: boolean;
  currentUserId: string;
}

/**
 * Workspace member list (owner-only management). No role dropdown --
 * "owner"/"member" is shown as a plain badge; the only supported role
 * change is ownership transfer (see TransferOwnershipForm), never a casual
 * per-row switch. The owner row never gets a Remove button, for anyone,
 * including the owner themselves -- see removeOrganizationMember's own
 * doc comment for why (leadership change must go through an explicit
 * transfer first). Safeguards are enforced server-side
 * (DELETE /api/workspace/members/[userId]); this component just surfaces
 * whatever error that returns.
 */
export function MemberList({ members, canManage, currentUserId }: MemberListProps) {
  const router = useRouter();
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function removeMember(userId: string) {
    setBusyUserId(userId);
    setError(null);
    try {
      const response = await fetch(`/api/workspace/members/${userId}`, { method: "DELETE" });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Failed to remove member.");
        return;
      }
      router.refresh();
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col divide-y divide-slate-100 rounded-md border border-slate-200">
        {members.map((member) => (
          <div key={member.userId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {member.email ?? "—"}
                {member.userId === currentUserId && <span className="ml-1.5 text-xs text-slate-400">(you)</span>}
              </p>
              <p className="text-xs text-slate-400">joined {formatDate(member.createdAt)}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Badge variant={member.role === "owner" ? "success" : "neutral"}>{member.role === "owner" ? "Owner" : "Member"}</Badge>
              {canManage && member.role !== "owner" && (
                <button
                  type="button"
                  disabled={busyUserId === member.userId}
                  onClick={() => removeMember(member.userId)}
                  className="text-xs font-medium text-red-500 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
