import { describe, expect, it, vi, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/apiGuard", () => ({ guardApiRoute: vi.fn() }));
vi.mock("@/lib/campaigns", () => ({ getCampaignRow: vi.fn() }));

import { guardApiRoute } from "@/lib/auth/apiGuard";
import { getCampaignRow } from "@/lib/campaigns";
import { GET } from "./route";

afterEach(() => {
  vi.clearAllMocks();
});

function params(campaignId: string, rowId: string) {
  return { params: Promise.resolve({ campaignId, rowId }) };
}

describe("GET /api/campaigns/[campaignId]/rows/[rowId]/pdf", () => {
  it("requires authentication -- returns 401 and never loads the row or touches storage", async () => {
    vi.mocked(guardApiRoute).mockResolvedValue({
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    });

    const response = await GET(new Request("http://localhost/x"), params("c1", "r1"));

    expect(response.status).toBe(401);
    expect(getCampaignRow).not.toHaveBeenCalled();
  });

  it("proceeds to look up the row once authenticated", async () => {
    vi.mocked(guardApiRoute).mockResolvedValue({ user: { id: "operator-1", email: null } });
    vi.mocked(getCampaignRow).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/x"), params("c1", "r1"));

    expect(getCampaignRow).toHaveBeenCalledWith("c1", "r1");
    expect(response.status).toBe(404); // row not found -- proves we got past the auth check into real logic
  });
});
