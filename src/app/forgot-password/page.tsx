import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
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
          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-emerald-600">&gt; reset_password</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">Reset your password</h1>
          <p className="mt-1 text-sm text-slate-500">Enter your account email and we&apos;ll send you a reset link.</p>
        </div>

        <ForgotPasswordForm />

        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="font-medium text-slate-500 hover:text-slate-700">
            &larr; Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
