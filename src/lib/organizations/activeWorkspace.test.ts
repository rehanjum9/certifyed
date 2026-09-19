import { describe, expect, it } from "vitest";
import { pickActiveMembership } from "./activeWorkspace";
import type { Membership } from "./types";

const ORG_A: Membership = { organizationId: "org-a", organizationName: "Club A", role: "member" };
const ORG_B: Membership = { organizationId: "org-b", organizationName: "Club B", role: "owner" };

describe("pickActiveMembership", () => {
  it("returns null for zero memberships regardless of the cookie", () => {
    expect(pickActiveMembership([], "org-a")).toBeNull();
    expect(pickActiveMembership([], null)).toBeNull();
  });

  it("auto-selects the sole membership with no cookie", () => {
    expect(pickActiveMembership([ORG_A], null)).toEqual(ORG_A);
  });

  it("honors the cookie when it names a real membership", () => {
    expect(pickActiveMembership([ORG_A, ORG_B], "org-b")).toEqual(ORG_B);
  });

  it("falls back to the first membership when the cookie is missing", () => {
    expect(pickActiveMembership([ORG_A, ORG_B], null)).toEqual(ORG_A);
  });

  it("falls back to the first membership when the cookie names an organization the user does not belong to", () => {
    expect(pickActiveMembership([ORG_A, ORG_B], "some-other-org-entirely")).toEqual(ORG_A);
  });
});
