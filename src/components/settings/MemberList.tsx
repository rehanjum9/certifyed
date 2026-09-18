"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClassName } from "@/components/ui/Input";
import { formatDate } from "@/lib/format";
import type { OrganizationMemberSummary, OrganizationRole } from "@/lib/organizations/types";

const ROLE_OPTIONS: OrganizationRole[] = ["member", "admin", "owner"];

interface MemberListProps {
  members: OrganizationMemberSummary[];
  /** True for owner/admin -- controls whether role/remove controls render at all. A normal member sees a read-only list (architecture report, item 10: normal members cannot manage membership). */
  canManage: boolean;
  currentUserId: string;
}

/** Workspace member list + management (owner/admin only). Safeguards -- a workspace can't end up with zero owners, and a member can't manage anything at all -- are enforced server-side (PATCH/DELETE /api/workspace/members/[userId]); this component just surfaces whatever error that returns. */
export function MemberList({ members, canManage, currentUserId }: MemberListProps) {
  const router = useRouter();
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(userId: string, role: OrganizationRole) {
    setBusyUserId(userId);
    setError(null);
    try {
      const response = await fetch(`/api/workspace/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Failed to change role.");
        return;
      }
      router.refresh();
    } finally {
      setBusyUserId(null);
    }
  }

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

            {canManage ? (
              <div className="flex shrink-0 items-center gap-2">
                <select
                  value={member.role}
                  disabled={busyUserId === member.userId}
                  onChange={(e) => changeRole(member.userId, e.target.value as OrganizationRole)}
                  className={`${inputClassName} w-auto py-1 text-xs`}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busyUserId === member.userId}
                  onClick={() => removeMember(member.userId)}
                  className="text-xs font-medium text-red-500 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ) : (
              <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">{member.role}</span>
            )}
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
