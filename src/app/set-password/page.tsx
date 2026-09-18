import { SetPasswordForm } from "@/components/auth/SetPasswordForm";

export const dynamic = "force-dynamic";

export default function SetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="font-mono text-sm font-semibold tracking-tight text-slate-900">
            <span className="text-emerald-600">&gt;</span> CERTIFYED_
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-500">generate. personalize. deliver.</p>
        </div>

        <div className="mb-6">
          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-emerald-600">&gt; welcome_</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">Set your password</h1>
          <p className="mt-1 text-sm text-slate-500">
            Choose a password for your CERTIFYED_ account to finish joining your workspace.
          </p>
        </div>

        <SetPasswordForm />
      </div>
    </div>
  );
}
