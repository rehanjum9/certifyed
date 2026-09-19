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
});
