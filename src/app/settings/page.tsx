import type { ReactNode } from "react";
import { getSignedInUserEmail } from "@/lib/auth/session";
import { resolveEmailProvider, getEmailProviderConfigError, type EmailProviderName } from "@/lib/email/provider";
import { maskEmail } from "@/lib/email/mask";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { LinkButton } from "@/components/ui/Button";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { IconCheckCircle } from "@/components/ui/icons";

// Reflects the real session/env state on every load; never statically cached.
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
  const email = await getSignedInUserEmail();

  let provider: EmailProviderName | null = null;
  let providerConfigError: string | null = null;
  try {
    provider = resolveEmailProvider();
    providerConfigError = getEmailProviderConfigError();
  } catch (error) {
    providerConfigError = error instanceof Error ? error.message : "Invalid EMAIL_PROVIDER configuration.";
  }
  const providerConfigured = provider !== null && providerConfigError === null;

  // Gmail's sender IS the operator's personal inbox, so it's masked here;
  // Resend's sender is a verified sending domain address, safe to show in
  // full. Never GMAIL_REFRESH_TOKEN/GMAIL_CLIENT_SECRET/RESEND_API_KEY.
  let senderName: string | null = null;
  let senderDisplay: string | null = null;
  if (provider === "gmail") {
    senderName = process.env.GMAIL_FROM_NAME?.trim() || "CERTIFYED_";
    const rawSender = process.env.GMAIL_FROM_EMAIL;
    senderDisplay = rawSender ? maskEmail(rawSender) : null;
  } else if (provider === "resend") {
    senderName = process.env.RESEND_FROM_NAME?.trim() || "CERTIFYED_";
    senderDisplay = process.env.RESEND_FROM_EMAIL ?? null;
  }

  // Masked server-side, and only ever rendered into this page's HTML --
  // never returned from a public API response. Same fixed address used for
  // every campaign's "Send test email" action, regardless of provider.
  const rawTestEmail = process.env.RESEND_TEST_EMAIL;
  const maskedTestEmail = rawTestEmail ? maskEmail(rawTestEmail) : null;

  return (
    <PageContainer>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-slate-900">
            <span className="text-emerald-600">&gt;</span> settings_
          </h1>
          <p className="mt-1 text-sm text-slate-500">Account and application preferences.</p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-sm font-semibold text-slate-900">account_</h2>
          <Card className="shadow-none">
            <div className="flex flex-col gap-4 p-5">
              <div className="flex items-center gap-3">
                <Avatar email={email} className="h-10 w-10 text-sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{email ?? "—"}</p>
                  <p className="text-xs text-slate-500">Signed-in operator</p>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <Row label="Account status" value={<Badge variant={email ? "success" : "neutral"}>{email ? "Authenticated" : "Unknown"}</Badge>} />
              </div>
              <div className="border-t border-slate-100 pt-4">
                <LogoutButton />
              </div>
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
              {senderDisplay && senderName && (
                <Row label="Sender" value={<span className="font-mono text-xs">{senderName} &lt;{senderDisplay}&gt;</span>} />
              )}
              <div className="border-t border-slate-100 pt-3">
                <Row
                  label={provider === "gmail" ? "Connection" : "Status"}
                  value={
                    <Badge variant={providerConfigured ? "success" : "neutral"}>
                      {providerConfigured
                        ? provider === "gmail"
                          ? "Connected"
                          : "Configured"
                        : provider === "gmail"
                          ? "Not connected"
                          : "Not configured"}
                    </Badge>
                  }
                />
              </div>
              <Row label="Test recipient" value={<span className="font-mono text-xs">{maskedTestEmail ?? "Not configured"}</span>} />

              {provider === "gmail" && (
                <div className="border-t border-slate-100 pt-3">
                  <LinkButton href="/api/email/gmail/connect" variant="secondary" size="sm">
                    {providerConfigured ? "Reconnect Gmail" : "Connect Gmail"}
                  </LinkButton>
                </div>
              )}

              {providerConfigError && <p className="text-xs text-amber-700">{providerConfigError}</p>}
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
                <Row label="Application type" value="Certificate automation platform" />
              </div>
            </div>
          </Card>
        </section>
      </div>
    </PageContainer>
  );
}
