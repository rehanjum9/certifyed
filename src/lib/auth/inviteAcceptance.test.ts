import { describe, expect, it, vi } from "vitest";
import { performInviteAcceptance, type InviteAcceptanceDeps } from "./inviteAcceptance";

const VALID_HASH = "#access_token=real-access-token&refresh_token=real-refresh-token&type=invite&expires_in=3600&token_type=bearer";

function buildDeps(overrides: Partial<InviteAcceptanceDeps> = {}) {
  return {
    setSession: vi.fn().mockResolvedValue({ error: null }),
    hasSession: vi.fn().mockResolvedValue(false),
    signOut: vi.fn().mockResolvedValue(undefined),
    acceptInvite: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    ...overrides,
  };
}

describe("performInviteAcceptance", () => {
  it("REGRESSION: a real session + successful acceptance must report success even if a later step is what a naive implementation might mislabel", async () => {
    // This is the exact incident: setSession succeeds, invite finalization
    // succeeds server-side (accepted_at is written), but the outcome must
    // never be downgraded to 'invalid' on account of anything happening
    // after that -- only a genuine 404 (no invite, no membership) may ever
    // produce 'invalid' once a session exists.
    const deps = buildDeps({ acceptInvite: vi.fn().mockResolvedValue({ ok: true, status: 200 }) });

    const outcome = await performInviteAcceptance(VALID_HASH, deps);

    expect(outcome).toEqual({ kind: "success" });
    expect(deps.signOut).not.toHaveBeenCalled();
  });

  it("a truly expired/rejected token (setSession itself errors) is reported invalid", async () => {
    const deps = buildDeps({ setSession: vi.fn().mockResolvedValue({ error: { message: "Token has expired or is invalid" } }) });

    const outcome = await performInviteAcceptance(VALID_HASH, deps);

    expect(outcome).toEqual({ kind: "invalid" });
    expect(deps.acceptInvite).not.toHaveBeenCalled();
  });

  it("a malformed hash (no tokens, no existing session) is reported invalid without ever calling Supabase", async () => {
    const deps = buildDeps({ hasSession: vi.fn().mockResolvedValue(false) });

    const outcome = await performInviteAcceptance("#type=invite&garbage=1", deps);

    expect(outcome).toEqual({ kind: "invalid" });
    expect(deps.setSession).not.toHaveBeenCalled();
    expect(deps.acceptInvite).not.toHaveBeenCalled();
  });

  it("an empty hash is reported invalid when no session already exists", async () => {
    const deps = buildDeps({ hasSession: vi.fn().mockResolvedValue(false) });

    const outcome = await performInviteAcceptance("", deps);

    expect(outcome).toEqual({ kind: "invalid" });
  });

  it("a missing/already-consumed hash with an existing session finishes acceptance instead of failing -- idempotent re-entry", async () => {
    const deps = buildDeps({ hasSession: vi.fn().mockResolvedValue(true), acceptInvite: vi.fn().mockResolvedValue({ ok: true, status: 200 }) });

    const outcome = await performInviteAcceptance("", deps);

    expect(outcome).toEqual({ kind: "success" });
    expect(deps.setSession).not.toHaveBeenCalled();
  });

  it("repeated acceptance of the same invite is idempotent -- calling it twice with the same deps both succeed", async () => {
    const deps = buildDeps();

    const first = await performInviteAcceptance(VALID_HASH, deps);
    const second = await performInviteAcceptance(VALID_HASH, { ...deps, hasSession: vi.fn().mockResolvedValue(true) });

    expect(first).toEqual({ kind: "success" });
    expect(second).toEqual({ kind: "success" });
  });

  it("the server confirming no pending invite AND no membership (404) is reported invalid and signs the browser out", async () => {
    const deps = buildDeps({ acceptInvite: vi.fn().mockResolvedValue({ ok: false, status: 404 }) });

    const outcome = await performInviteAcceptance(VALID_HASH, deps);

    expect(outcome).toEqual({ kind: "invalid" });
    expect(deps.signOut).toHaveBeenCalledTimes(1);
  });

  it("a network failure calling accept-invite after a real session exists is recoverable, not invalid, and never signs out", async () => {
    const deps = buildDeps({ acceptInvite: vi.fn().mockRejectedValue(new Error("network down")) });

    const outcome = await performInviteAcceptance(VALID_HASH, deps);

    expect(outcome).toEqual({ kind: "recoverable_error" });
    expect(deps.signOut).not.toHaveBeenCalled();
  });

  it("a server 5xx/rate-limit after a real session exists is recoverable, not invalid, and never signs out", async () => {
    const deps = buildDeps({ acceptInvite: vi.fn().mockResolvedValue({ ok: false, status: 429 }) });

    const outcome = await performInviteAcceptance(VALID_HASH, deps);

    expect(outcome).toEqual({ kind: "recoverable_error" });
    expect(deps.signOut).not.toHaveBeenCalled();
  });

  it("never logs or exposes the raw access/refresh tokens", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = buildDeps();

    const outcome = await performInviteAcceptance(VALID_HASH, deps);

    const allLoggedText = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls].flat().map(String).join(" ");
    expect(allLoggedText).not.toContain("real-access-token");
    expect(allLoggedText).not.toContain("real-refresh-token");
    expect(JSON.stringify(outcome)).not.toContain("real-access-token");

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
