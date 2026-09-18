import { describe, expect, it } from "vitest";
import {
  requireOrganizationContext,
  requireOrganizationAdmin,
  requireOrganizationMember,
  requireOrganizationAdminOf,
  requirePlatformAdmin,
  assertResourceBelongsToOrganization,
} from "./organizationGuard";
import type { Membership } from "@/lib/organizations/types";

const USER_A = { id: "user-a", email: "a@clubA.example" };
const ORG_A: Membership = { organizationId: "org-a", organizationName: "Club A", role: "member" };
const ORG_A_ADMIN: Membership = { organizationId: "org-a", organizationName: "Club A", role: "admin" };
const ORG_B: Membership = { organizationId: "org-b", organizationName: "Club B", role: "owner" };

describe("requireOrganizationContext", () => {
  it("returns a 401 when there is no active session", async () => {
    const result = await requireOrganizationContext({}, { getUser: async () => null });
    expect("response" in result).toBe(true);
    if ("response" in result) expect(result.response.status).toBe(401);
  });

  it("returns a 403 when the authenticated user belongs to no organization", async () => {
    const result = await requireOrganizationContext(
      {},
      { getUser: async () => USER_A, listMemberships: async () => [], getActiveOrgCookie: async () => null },
    );
    expect("response" in result).toBe(true);
    if ("response" in result) expect(result.response.status).toBe(403);
  });

  it("auto-selects the sole membership when the user belongs to exactly one organization", async () => {
    const result = await requireOrganizationContext(
      {},
      { getUser: async () => USER_A, listMemberships: async () => [ORG_A], getActiveOrgCookie: async () => null },
    );
    expect("response" in result).toBe(false);
    if (!("response" in result)) {
      expect(result.organizationId).toBe("org-a");
      expect(result.role).toBe("member");
    }
  });

  it("honors a valid active-workspace cookie when the user belongs to multiple organizations", async () => {
    const result = await requireOrganizationContext(
      {},
      {
        getUser: async () => USER_A,
        listMemberships: async () => [ORG_A, ORG_B],
        getActiveOrgCookie: async () => "org-b",
      },
    );
    expect("response" in result).toBe(false);
    if (!("response" in result)) expect(result.organizationId).toBe("org-b");
  });

  it("never trusts a cookie naming an organization the user is not a member of -- falls back instead of granting it", async () => {
    const result = await requireOrganizationContext(
      {},
      {
        getUser: async () => USER_A,
        listMemberships: async () => [ORG_A],
        getActiveOrgCookie: async () => "org-not-a-member-of",
      },
    );
    expect("response" in result).toBe(false);
    if (!("response" in result)) expect(result.organizationId).toBe("org-a");
  });
});

describe("requireOrganizationAdmin", () => {
  it("rejects a plain member with a 403", async () => {
    const result = await requireOrganizationAdmin(
      {},
      { getUser: async () => USER_A, listMemberships: async () => [ORG_A], getActiveOrgCookie: async () => null },
    );
    expect("response" in result).toBe(true);
    if ("response" in result) expect(result.response.status).toBe(403);
  });

  it("allows an admin", async () => {
    const result = await requireOrganizationAdmin(
      {},
      { getUser: async () => USER_A, listMemberships: async () => [ORG_A_ADMIN], getActiveOrgCookie: async () => null },
    );
    expect("response" in result).toBe(false);
  });

  it("allows an owner", async () => {
    const result = await requireOrganizationAdmin(
      {},
      { getUser: async () => USER_A, listMemberships: async () => [ORG_B], getActiveOrgCookie: async () => null },
    );
    expect("response" in result).toBe(false);
  });
});

describe("requireOrganizationMember (specific organization id, independent of the active-workspace cookie)", () => {
  it("returns a 403 when the user has no membership row for that organization, regardless of their active workspace", async () => {
    const result = await requireOrganizationMember("org-b", {}, { getUser: async () => USER_A, getMembership: async () => null });
    expect("response" in result).toBe(true);
    if ("response" in result) expect(result.response.status).toBe(403);
  });

  it("succeeds when a membership row exists for that exact organization", async () => {
    const result = await requireOrganizationMember(
      "org-a",
      {},
      { getUser: async () => USER_A, getMembership: async (orgId) => (orgId === "org-a" ? { role: "member" } : null) },
    );
    expect("response" in result).toBe(false);
    if (!("response" in result)) expect(result.role).toBe("member");
  });
});

describe("requireOrganizationAdminOf", () => {
  it("rejects a plain member of that specific organization", async () => {
    const result = await requireOrganizationAdminOf("org-a", {}, { getUser: async () => USER_A, getMembership: async () => ({ role: "member" }) });
    expect("response" in result).toBe(true);
    if ("response" in result) expect(result.response.status).toBe(403);
  });

  it("allows an admin/owner of that specific organization", async () => {
    const result = await requireOrganizationAdminOf("org-a", {}, { getUser: async () => USER_A, getMembership: async () => ({ role: "owner" }) });
    expect("response" in result).toBe(false);
  });
});

describe("requirePlatformAdmin", () => {
  it("returns a 401 when unauthenticated", async () => {
    const result = await requirePlatformAdmin({}, { getUser: async () => null });
    expect("response" in result).toBe(true);
    if ("response" in result) expect(result.response.status).toBe(401);
  });

  it("returns a 403 for an authenticated non-platform-admin", async () => {
    const result = await requirePlatformAdmin({}, { getUser: async () => USER_A, checkPlatformAdmin: async () => false });
    expect("response" in result).toBe(true);
    if ("response" in result) expect(result.response.status).toBe(403);
  });

  it("succeeds for a real platform admin", async () => {
    const result = await requirePlatformAdmin({}, { getUser: async () => USER_A, checkPlatformAdmin: async () => true });
    expect("response" in result).toBe(false);
  });
});

describe("assertResourceBelongsToOrganization", () => {
  it("returns true only when the ids match exactly", () => {
    expect(assertResourceBelongsToOrganization("org-a", "org-a")).toBe(true);
  });

  it("returns false for a different organization", () => {
    expect(assertResourceBelongsToOrganization("org-b", "org-a")).toBe(false);
  });

  it("returns false for a null/undefined resource organization id", () => {
    expect(assertResourceBelongsToOrganization(null, "org-a")).toBe(false);
    expect(assertResourceBelongsToOrganization(undefined, "org-a")).toBe(false);
  });
});
