import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: vi.fn() }));

import { createServiceRoleClient } from "@/lib/supabase/server";
import { createOAuthState, consumeOAuthState } from "./gmailOAuth";

interface StateRow {
  id: string;
  state_token_hash: string;
  organization_id: string;
  user_id: string;
  expires_at: string;
  consumed_at: string | null;
}

function buildMockClient(rows: StateRow[]) {
  const insertMock = vi.fn((row: Partial<StateRow>) => {
    rows.push({
      id: `row-${rows.length + 1}`,
      state_token_hash: row.state_token_hash!,
      organization_id: row.organization_id!,
      user_id: row.user_id!,
      expires_at: row.expires_at!,
      consumed_at: null,
    });
    return Promise.resolve({ error: null });
  });

  const from = vi.fn(() => ({
    insert: insertMock,
    select: () => ({
      eq: (_col: string, hash: string) => ({
        maybeSingle: async () => ({ data: rows.find((r) => r.state_token_hash === hash) ?? null, error: null }),
      }),
    }),
    update: (patch: Partial<StateRow>) => ({
      eq: (_col: string, id: string) => ({
        is: () => ({
          select: async () => {
            const row = rows.find((r) => r.id === id && r.consumed_at === null);
            if (!row) return { data: [], error: null };
            row.consumed_at = patch.consumed_at ?? new Date().toISOString();
            return { data: [{ id: row.id }], error: null };
          },
        }),
      }),
    }),
  }));

  return { from };
}

describe("createOAuthState / consumeOAuthState", () => {
  let rows: StateRow[];

  beforeEach(() => {
    rows = [];
    vi.mocked(createServiceRoleClient).mockReturnValue(
      buildMockClient(rows) as unknown as ReturnType<typeof createServiceRoleClient>,
    );
  });

  it("round-trips: a freshly created state is consumable by its owning user", async () => {
    const token = await createOAuthState("org-a", "user-a");
    const result = await consumeOAuthState(token, "user-a");
    expect(result).toEqual({ ok: true, organizationId: "org-a" });
  });

  it("rejects an unknown token", async () => {
    const result = await consumeOAuthState("not-a-real-token", "user-a");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("rejects reuse of an already-consumed token", async () => {
    const token = await createOAuthState("org-a", "user-a");
    const first = await consumeOAuthState(token, "user-a");
    expect(first.ok).toBe(true);

    const second = await consumeOAuthState(token, "user-a");
    expect(second).toEqual({ ok: false, reason: "already_consumed" });
  });

  it("rejects an expired token", async () => {
    const token = await createOAuthState("org-a", "user-a");
    rows[0].expires_at = new Date(Date.now() - 1000).toISOString();

    const result = await consumeOAuthState(token, "user-a");
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a token being completed by a different user than the one who started the flow", async () => {
    const token = await createOAuthState("org-a", "user-a");
    const result = await consumeOAuthState(token, "user-b");
    expect(result).toEqual({ ok: false, reason: "wrong_user" });
  });

  it("never stores the raw token -- only its hash is persisted", async () => {
    const token = await createOAuthState("org-a", "user-a");
    expect(rows[0].state_token_hash).not.toBe(token);
    expect(rows[0].state_token_hash).toHaveLength(64); // sha256 hex
  });

  it("a state created for org A can never be consumed as belonging to org B", async () => {
    const token = await createOAuthState("org-a", "user-a");
    const result = await consumeOAuthState(token, "user-a");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.organizationId).toBe("org-a");
    expect(result).not.toMatchObject({ organizationId: "org-b" });
  });
});
