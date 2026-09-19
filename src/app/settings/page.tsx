import type { ReactNode } from "react";
import { resolvePageWorkspaceContext } from "@/lib/organizations/pageContext";
import { listOrganizationMembers } from "@/lib/organizations/organizations";
import { getEmailConnectionSummary } from "@/lib/email/connections";
import { resolveEmailProvider, getEmailProviderConfigError, type EmailProviderName } from "@/lib/email/provider";
import { listCustomFonts } from "@/lib/fonts/customFonts";
import { NoWorkspaceState } from "@/components/organizations/NoWorkspaceState";
import { InviteMemberForm } from "@/components/settings/InviteMemberForm";
import { MemberList } from "@/components/settings/MemberList";
import { TransferOwnershipForm } from "@/components/settings/TransferOwnershipForm";
import { GmailDisconnectButton } from "@/components/settings/GmailDisconnectButton";
import { FontsList } from "@/components/settings/FontsList";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { LinkButton } from "@/components/ui/Button";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { IconCheckCircle } from "@/components/ui/icons";

// Reflects the real session/workspace/env state on every load; never statically cached.
export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-slate-700">{label}</span>
      <span className="text-sm text-slate-900">{value}</span>
    </div>
  );
}

function CheckRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-700">
      <IconCheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
      {label}
    </div>
  );
}

export default async function SettingsPage() {
  const context = await resolvePageWorkspaceContext();
  if ("noWorkspace" in context) return <NoWorkspaceState />;

  const canManageWorkspace = context.role === "owner";

  const [members, emailConnection, fonts] = await Promise.all([
    listOrganizationMembers(context.organizationId),
    getEmailConnectionSummary(context.organizationId),
    listCustomFonts(context.organizationId),
  ]);

  let provider: EmailProviderName | null = null;
  let platformProviderError: string | null = null;
  try {
    provider = resolveEmailProvider();
    platformProviderError = getEmailProviderConfigError();
  } catch (error) {
    platformProviderError = error instanceof Error ? error.message : "Invalid EMAIL_PROVIDER configuration.";
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-slate-900">
            <span className="text-emerald-600">&gt;</span> settings_
          </h1>
          <p className="mt-1 text-sm text-slate-500">Account, workspace, and delivery preferences.</p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-sm font-semibold text-slate-900">account_</h2>
          <Card className="shadow-none">
            <div className="flex flex-col gap-4 p-5">
              <div className="flex items-center gap-3">
                <Avatar email={context.userEmail} className="h-10 w-10 text-sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{context.userEmail ?? "—"}</p>
                  <p className="text-xs text-slate-500">Signed in</p>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <Row label="Account status" value={<Badge variant="success">Authenticated</Badge>} />
              </div>
              <div className="border-t border-slate-100 pt-4">
                <LogoutButton />
              </div>
            </div>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-sm font-semibold text-slate-900">workspace_</h2>
          <Card className="shadow-none">
            <div className="flex flex-col gap-4 p-5">
              <Row label="Workspace" value={<span className="font-medium">{context.organizationName}</span>} />
              <Row label="Your role" value={<Badge variant={context.role === "owner" ? "success" : "neutral"}>{context.role}</Badge>} />

              <div className="border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Members ({members.length})
                </p>
                <MemberList members={members} canManage={canManageWorkspace} currentUserId={context.userId} />
              </div>

              {canManageWorkspace && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Invite member</p>
                  <InviteMemberForm />
                </div>
              )}

              {canManageWorkspace && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Transfer ownership</p>
                  <TransferOwnershipForm candidates={members.filter((member) => member.role !== "owner")} />
                </div>
              )}
            </div>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-sm font-semibold text-slate-900">email_delivery_</h2>
          <Card className="shadow-none">
            <div className="flex flex-col gap-3 p-5">
              <Row
                label="Active provider"
                value={provider === "gmail" ? "Gmail" : provider === "resend" ? "Resend" : "Not configured"}
              />

              {provider === "resend" && (
                <>
                  <Row
                    label="Sender"
                    value={
                      <span className="font-mono text-xs">
                        {process.env.RESEND_FROM_NAME?.trim() || "CERTIFYED_"} &lt;{process.env.RESEND_FROM_EMAIL ?? "—"}&gt;
                      </span>
                    }
                  />
                  <div className="border-t border-slate-100 pt-3">
                    <Row label="Status" value={<Badge variant={!platformProviderError ? "success" : "neutral"}>{!platformProviderError ? "Configured" : "Not configured"}</Badge>} />
                  </div>
                  <p className="text-xs text-slate-500">Resend is configured platform-wide for this deployment, not per workspace.</p>
                </>
              )}

              {provider === "gmail" && (
                <>
                  {platformProviderError ? (
                    <p className="text-xs text-amber-700">{platformProviderError}</p>
                  ) : emailConnection ? (
                    <>
                      <div className="border-t border-slate-100 pt-3">
                        <Row label="Connected account" value={<span className="font-mono text-xs">{emailConnection.senderEmail}</span>} />
                      </div>
                      <div className="flex items-center gap-2">
                        <LinkButton href="/api/email/gmail/connect" variant="secondary" size="sm">
                          Reconnect Gmail
                        </LinkButton>
                        {canManageWorkspace && <GmailDisconnectButton />}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-slate-500">No Gmail account connected.</p>
                      {canManageWorkspace ? (
                        <LinkButton href="/api/email/gmail/connect" variant="secondary" size="sm" className="self-start">
                          Connect Gmail
                        </LinkButton>
                      ) : (
                        <p className="text-xs text-slate-400">Ask the workspace owner to connect Gmail.</p>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-sm font-semibold text-slate-900">certificate_fonts_</h2>
          <Card className="shadow-none">
            <div className="flex flex-col gap-3 p-5">
              <FontsList fonts={fonts} />
            </div>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-sm font-semibold text-slate-900">security_</h2>
          <Card className="shadow-none">
            <div className="flex flex-col gap-2.5 p-5">
              <CheckRow label="Authenticated session" />
              <CheckRow label="Protected app access" />
              <CheckRow label="Protected API access" />
              <CheckRow label="Workspace-isolated data" />
            </div>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-sm font-semibold text-slate-900">application_</h2>
          <Card className="shadow-none">
            <div className="flex flex-col gap-1 p-5">
              <p className="font-mono text-sm font-semibold text-slate-900">
                <span className="text-emerald-600">&gt;</span> CERTIFYED_
              </p>
              <p className="font-mono text-xs text-slate-500">generate. personalize. deliver.</p>
              <div className="mt-3 border-t border-slate-100 pt-3">
                <Row label="Application type" value="Multi-workspace certificate automation platform" />
              </div>
            </div>
          </Card>
        </section>
      </div>
    </PageContainer>
  );
}
