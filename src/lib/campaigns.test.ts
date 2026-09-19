import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: vi.fn() }));

import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCampaign } from "./campaigns";

interface CampaignRow {
  id: string;
  organization_id: string;
  name: string;
}

/** Same minimal fake-query-builder approach as templates.test.ts -- proves the real .eq() filter chain getCampaign constructs, not just that "some" filtering happens. */
function buildMockClient(rows: CampaignRow[]) {
  const from = vi.fn(() => {
    let filtered = [...rows];
    const builder = {
      select: () => builder,
      eq: (column: keyof CampaignRow, value: string) => {
        filtered = filtered.filter((row) => row[column] === value);
        return builder;
      },
      maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
    };
    return builder;
  });

  return { from };
}

const ORG_A_CAMPAIGN: CampaignRow = { id: "campaign-1", organization_id: "org-a", name: "Org A Graduation" };
const ORG_B_CAMPAIGN: CampaignRow = { id: "campaign-2", organization_id: "org-b", name: "Org B Graduation" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCampaign -- cross-organization isolation", () => {
  it("returns the campaign when it belongs to the queried organization", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      buildMockClient([ORG_A_CAMPAIGN, ORG_B_CAMPAIGN]) as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    const result = await getCampaign("campaign-1", "org-a");
    expect(result?.id).toBe("campaign-1");
  });

  it("returns null -- never the row -- when a real campaign id belongs to a DIFFERENT organization", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      buildMockClient([ORG_A_CAMPAIGN, ORG_B_CAMPAIGN]) as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    // Org A's caller asks for Org B's real campaign id (e.g. by guessing/observing it).
    const result = await getCampaign("campaign-2", "org-a");
    expect(result).toBeNull();
  });

  it("returns null for a campaign id that never existed -- identical to the cross-org case, leaking no existence information", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      buildMockClient([ORG_A_CAMPAIGN]) as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    const result = await getCampaign("does-not-exist", "org-a");
    expect(result).toBeNull();
  });
});
