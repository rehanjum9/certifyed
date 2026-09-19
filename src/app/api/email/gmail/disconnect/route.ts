import { NextResponse } from "next/server";
import { requireOrganizationOwner } from "@/lib/auth/organizationGuard";
import { deleteEmailConnection } from "@/lib/email/connections";
import { RATE_LIMITS } from "@/lib/rateLimit";

/** Workspace-owner-only: removes the active workspace's Gmail connection. Certificate generation and PDF downloads are unaffected -- only email sending for this workspace stops until reconnected (architecture report, item 19). */
export async function POST() {
  const guard = await requireOrganizationOwner({ rateLimit: { key: "gmail-disconnect", ...RATE_LIMITS.gmailDisconnect } });
  if ("response" in guard) return guard.response;

  await deleteEmailConnection(guard.organizationId);
  return NextResponse.json({ ok: true });
}
