import { describe, expect, it, vi } from "vitest";
import { requestPasswordReset, buildRecoveryRedirectTo } from "./forgotPassword";

describe("buildRecoveryRedirectTo", () => {
  it("builds /auth/confirm at the given origin", () => {
    expect(buildRecoveryRedirectTo("https://certifyed.example")).toBe("https://certifyed.example/auth/confirm");
  });

  it("works for a local dev origin just as well -- never a hardcoded host", () => {
    expect(buildRecoveryRedirectTo("http://localhost:3000")).toBe("http://localhost:3000/auth/confirm");
  });
});

describe("requestPasswordReset", () => {
  it("calls resetPasswordForEmail with the trimmed email and the /auth/confirm redirect built from the given origin", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });

    const outcome = await requestPasswordReset("  person@club.example  ", "https://certifyed.example", { resetPasswordForEmail });

    expect(resetPasswordForEmail).toHaveBeenCalledWith("person@club.example", { redirectTo: "https://certifyed.example/auth/confirm" });
    expect(outcome).toEqual({ kind: "requested" });
  });

  it("reports 'requested' even when Supabase returns an error -- e.g. no account exists for that email -- so the caller can never distinguish the two", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: { message: "User not found" } });

    const outcome = await requestPasswordReset("nobody@club.example", "https://certifyed.example", { resetPasswordForEmail });

    expect(outcome).toEqual({ kind: "requested" });
  });

  it("reports 'requested' even when the request itself throws (network failure, rate limit, etc.)", async () => {
    const resetPasswordForEmail = vi.fn().mockRejectedValue(new Error("network down"));

    const outcome = await requestPasswordReset("person@club.example", "https://certifyed.example", { resetPasswordForEmail });

    expect(outcome).toEqual({ kind: "requested" });
  });

  it("never calls resetPasswordForEmail for a blank/whitespace-only email, but still reports 'requested'", async () => {
    const resetPasswordForEmail = vi.fn();

    const outcome = await requestPasswordReset("   ", "https://certifyed.example", { resetPasswordForEmail });

    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "requested" });
  });
});
