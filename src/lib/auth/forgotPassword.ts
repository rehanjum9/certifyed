export interface ForgotPasswordDeps {
  resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<{ error: { message: string } | null }>;
}

export type ForgotPasswordOutcome = { kind: "requested" };

/** Always /auth/confirm at the CURRENT origin -- the browser-derived origin passed in, never a hardcoded host, so this is correct in both local dev and whatever domain the app is actually deployed at. /auth/confirm already handles type=recovery (see that route) and redirects on to /set-password. */
export function buildRecoveryRedirectTo(origin: string): string {
  return new URL("/auth/confirm", origin).toString();
}

/**
 * Requests a password-reset email for `email`, then ALWAYS reports
 * "requested" -- regardless of whether Supabase found a matching account,
 * and regardless of whether the request itself failed (network error,
 * rate limit, etc). This is deliberate: the caller (ForgotPasswordForm)
 * must never be able to distinguish "no such account" from "email sent"
 * from "something went wrong" -- any distinction there is exactly what an
 * account-enumeration attack probes for. A blank/whitespace-only email
 * skips the call entirely (nothing to look up) but still reports the same
 * outcome, for the same reason.
 */
export async function requestPasswordReset(
  email: string,
  origin: string,
  deps: ForgotPasswordDeps,
): Promise<ForgotPasswordOutcome> {
  const trimmed = email.trim();

  if (trimmed) {
    try {
      await deps.resetPasswordForEmail(trimmed, { redirectTo: buildRecoveryRedirectTo(origin) });
    } catch {
      // Ignored -- see doc comment above.
    }
  }

  return { kind: "requested" };
}
