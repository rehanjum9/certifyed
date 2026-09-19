import { describe, expect, it, vi, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/organizationGuard", () => ({ requireOrganizationContext: vi.fn() }));
vi.mock("@/lib/campaigns", () => ({ getCampaign: vi.fn(), getCampaignRow: vi.fn() }));

import { requireOrganizationContext } from "@/lib/auth/organizationGuard";
import { getCampaign, getCampaignRow } from "@/lib/campaigns";
import { GET } from "./route";

afterEach(() => {
  vi.clearAllMocks();
});

function params(campaignId: string, rowId: string) {
  return { params: Promise.resolve({ campaignId, rowId }) };
}

const ORG_CONTEXT = { user: { id: "user-1", email: null }, organizationId: "org-a", organizationName: "Club A", role: "member" as const };

describe("GET /api/campaigns/[campaignId]/rows/[rowId]/pdf", () => {
  it("requires authentication/workspace membership -- returns 403 and never loads the campaign or row", async () => {
    vi.mocked(requireOrganizationContext).mockResolvedValue({
      response: NextResponse.json({ error: "You don't belong to any workspace yet." }, { status: 403 }),
    });

    const response = await GET(new Request("http://localhost/x"), params("c1", "r1"));

    expect(response.status).toBe(403);
    expect(getCampaign).not.toHaveBeenCalled();
    expect(getCampaignRow).not.toHaveBeenCalled();
  });

  it("returns 404 without ever querying campaign_rows when the campaign doesn't belong to the caller's organization", async () => {
    vi.mocked(requireOrganizationContext).mockResolvedValue(ORG_CONTEXT);
    vi.mocked(getCampaign).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/x"), params("c1", "r1"));

    expect(getCampaign).toHaveBeenCalledWith("c1", "org-a");
    expect(getCampaignRow).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
  });

  it("proceeds to look up the row once the campaign is verified to belong to the caller's organization", async () => {
    vi.mocked(requireOrganizationContext).mockResolvedValue(ORG_CONTEXT);
    vi.mocked(getCampaign).mockResolvedValue({ id: "c1", organization_id: "org-a" } as never);
    vi.mocked(getCampaignRow).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/x"), params("c1", "r1"));

    expect(getCampaignRow).toHaveBeenCalledWith("c1", "r1");
    expect(response.status).toBe(404); // row not found -- proves we got past the org check into real logic
  });
});
