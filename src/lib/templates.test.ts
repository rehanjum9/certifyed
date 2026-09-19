import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: vi.fn() }));

import { createServiceRoleClient } from "@/lib/supabase/server";
import { getTemplate, listTemplates } from "./templates";

interface TemplateRow {
  id: string;
  organization_id: string;
  name: string;
}

/** Minimal fake of the subset of the Supabase query builder templates.ts actually calls: .select().eq()...(.maybeSingle()|.order()). Every .eq() call narrows an in-memory filter -- this exercises the REAL query-construction code path (which .eq() calls are made, and in what combination), the same level of rigor the rest of this codebase's mocked-Supabase tests use, without a live database. */
function buildMockClient(rows: TemplateRow[]) {
  const from = vi.fn(() => {
    let filtered = [...rows];
    const builder = {
      select: () => builder,
      eq: (column: keyof TemplateRow, value: string) => {
        filtered = filtered.filter((row) => row[column] === value);
        return builder;
      },
      order: () => builder,
      maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
      then: (resolve: (v: { data: TemplateRow[]; error: null }) => void) => {
        resolve({ data: filtered, error: null });
      },
    };
    return builder;
  });

  return { from };
}

const ORG_A_TEMPLATE: TemplateRow = { id: "template-1", organization_id: "org-a", name: "Org A Cert" };
const ORG_B_TEMPLATE: TemplateRow = { id: "template-2", organization_id: "org-b", name: "Org B Cert" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getTemplate -- cross-organization isolation", () => {
  it("returns the template when it belongs to the queried organization", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      buildMockClient([ORG_A_TEMPLATE, ORG_B_TEMPLATE]) as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    const result = await getTemplate("template-1", "org-a");
    expect(result?.id).toBe("template-1");
  });

  it("returns null -- not the row -- when a real template id belongs to a DIFFERENT organization", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      buildMockClient([ORG_A_TEMPLATE, ORG_B_TEMPLATE]) as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    // Org A's caller asks for Org B's real template id.
    const result = await getTemplate("template-2", "org-a");
    expect(result).toBeNull();
  });

  it("returns null for a template id that never existed at all -- identical response to the cross-org case", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      buildMockClient([ORG_A_TEMPLATE]) as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    const result = await getTemplate("does-not-exist", "org-a");
    expect(result).toBeNull();
  });
});

describe("listTemplates -- cross-organization isolation", () => {
  it("never includes another organization's templates in the list", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      buildMockClient([ORG_A_TEMPLATE, ORG_B_TEMPLATE]) as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    const result = await listTemplates("org-a");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("template-1");
    expect(result.some((t) => t.organization_id === "org-b")).toBe(false);
  });

  it("returns an empty list for an organization with no templates, never falling back to someone else's", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      buildMockClient([ORG_B_TEMPLATE]) as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    const result = await listTemplates("org-with-no-templates");
    expect(result).toEqual([]);
  });
});
