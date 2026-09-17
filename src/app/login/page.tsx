import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-mono text-xl font-semibold tracking-tight text-slate-900">
            <span className="text-emerald-600">&gt;</span> CERTIFYED_
          </h1>
          <p className="mt-1 font-mono text-xs text-slate-500">generate. personalize. deliver.</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
