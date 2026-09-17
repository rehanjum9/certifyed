import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
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
          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-emerald-600">&gt; operator_login</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">Sign in to CERTIFYED_</h1>
          <p className="mt-1 text-sm text-slate-500">
            Access your templates, campaigns, certificate generation, and delivery tools.
          </p>
        </div>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-center text-sm">
          <Link href="/" className="font-medium text-slate-500 hover:text-slate-700">
            &larr; Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
