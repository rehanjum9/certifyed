export const MIN_PASSWORD_LENGTH = 8;

export type SetPasswordOutcome =
  | { kind: "validation_error"; message: string }
  | { kind: "auth_error"; message: string }
  | { kind: "success" };

export interface SetPasswordDeps {
  updateUser(password: string): Promise<{ error: { message: string } | null }>;
}

/**
 * The final step of accepting a workspace invite: by the time this runs,
 * an already-authenticated Supabase session must exist (established by
 * InviteLandingClient / lib/auth/inviteAcceptance.ts, or the legacy
 * /auth/confirm route) -- this only ever calls
 * supabase.auth.updateUser({ password }), never signUp/signIn, so it can
 * never itself create a new account. Pulled out of SetPasswordForm so it's
 * directly unit-testable (this codebase's established pattern -- see
 * lib/auth/inviteHash.ts / inviteAcceptance.ts).
 */
export async function performSetPassword(password: string, confirmPassword: string, deps: SetPasswordDeps): Promise<SetPasswordOutcome> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { kind: "validation_error", message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirmPassword) {
    return { kind: "validation_error", message: "Passwords do not match." };
  }

  let result: { error: { message: string } | null };
  try {
    result = await deps.updateUser(password);
  } catch {
    return { kind: "auth_error", message: "Failed to set your password. Check your connection and try again." };
  }

  if (result.error) {
    return { kind: "auth_error", message: result.error.message || "Failed to set your password. The invite link may have expired -- ask for a new one." };
  }

  return { kind: "success" };
}
