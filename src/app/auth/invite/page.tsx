import { InviteLandingClient } from "@/components/auth/InviteLandingClient";

export const dynamic = "force-dynamic";

/**
 * Landing target for Supabase's default "Invite user" email (implicit
 * `#access_token=...&type=invite` flow -- see components/auth/InviteLandingClient.tsx
 * for why this must be a client page rather than a Route Handler like
 * /auth/confirm). No server-side data fetching here: everything happens
 * client-side, since only the browser can read the URL fragment at all.
 */
export default function InviteLandingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="font-mono text-sm font-semibold tracking-tight text-slate-900">
            <span className="text-emerald-600">&gt;</span> CERTIFYED_
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-500">generate. personalize. deliver.</p>
        </div>

        <div className="mb-6 text-center">
          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-emerald-600">&gt; welcome_</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">Joining your workspace</h1>
        </div>

        <InviteLandingClient />
      </div>
    </div>
  );
}
