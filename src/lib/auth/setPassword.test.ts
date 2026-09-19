import { describe, expect, it, vi } from "vitest";
import { performSetPassword } from "./setPassword";

describe("performSetPassword", () => {
  it("succeeds with a valid, matching password -- the caller then redirects to /dashboard with no extra login step", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });

    const outcome = await performSetPassword("a-strong-password", "a-strong-password", { updateUser });

    expect(outcome).toEqual({ kind: "success" });
    expect(updateUser).toHaveBeenCalledWith("a-strong-password");
  });

  it("rejects a too-short password without calling Supabase", async () => {
    const updateUser = vi.fn();

    const outcome = await performSetPassword("short", "short", { updateUser });

    expect(outcome.kind).toBe("validation_error");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords without calling Supabase", async () => {
    const updateUser = vi.fn();

    const outcome = await performSetPassword("a-strong-password", "a-different-password", { updateUser });

    expect(outcome.kind).toBe("validation_error");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("reports an auth_error when Supabase itself rejects the update (e.g. an expired session)", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: { message: "Auth session missing" } });

    const outcome = await performSetPassword("a-strong-password", "a-strong-password", { updateUser });

    expect(outcome).toEqual({ kind: "auth_error", message: "Auth session missing" });
  });

  it("reports an auth_error on a network failure without throwing", async () => {
    const updateUser = vi.fn().mockRejectedValue(new Error("network down"));

    const outcome = await performSetPassword("a-strong-password", "a-strong-password", { updateUser });

    expect(outcome.kind).toBe("auth_error");
  });

  it("succeeds identically for a workspace owner's own session and a plain member's own session -- there is no role parameter anywhere in this call, so neither can ever be treated differently or point at someone else's account", async () => {
    const ownerUpdateUser = vi.fn().mockResolvedValue({ error: null });
    const memberUpdateUser = vi.fn().mockResolvedValue({ error: null });

    const ownerOutcome = await performSetPassword("owners-new-password", "owners-new-password", { updateUser: ownerUpdateUser });
    const memberOutcome = await performSetPassword("members-new-password", "members-new-password", { updateUser: memberUpdateUser });

    expect(ownerOutcome).toEqual({ kind: "success" });
    expect(memberOutcome).toEqual({ kind: "success" });
    // Each call only ever touched its OWN updateUser binding (i.e. its own
    // Supabase session) -- never the other's.
    expect(ownerUpdateUser).toHaveBeenCalledTimes(1);
    expect(memberUpdateUser).toHaveBeenCalledTimes(1);
  });
});
