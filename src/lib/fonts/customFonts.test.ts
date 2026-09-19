import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: vi.fn() }));

import { createServiceRoleClient } from "@/lib/supabase/server";
import { deleteCustomFont, listTemplatesUsingFont } from "./customFonts";

const ORG_ID = "org-1";

interface MockConfig {
  fontRow: { id: string; storage_path: string; organization_id?: string } | null;
  fieldRows: { template_id: string }[];
  templateRows: { id: string; name: string }[];
}

/** Chainable stub: every `.eq()` call just returns itself, so any number of `.eq(...)` filters before the terminal method (`.maybeSingle()`/`.in()`) work regardless of call order. */
function chainable(terminal: Record<string, () => unknown>) {
  const node: Record<string, unknown> = { ...terminal };
  node.eq = () => node;
  return node;
}

function buildMockClient(config: MockConfig) {
  const deleteFontMock = vi.fn().mockReturnValue({
    eq: () => Promise.resolve({ error: null }),
  });
  const removeMock = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn((table: string) => {
    if (table === "fonts") {
      return {
        select: () => chainable({ maybeSingle: async () => ({ data: config.fontRow, error: null }) }),
        delete: deleteFontMock,
      };
    }
    if (table === "template_fields") {
      return {
        select: () => ({
          eq: async () => ({ data: config.fieldRows, error: null }),
        }),
      };
    }
    if (table === "templates") {
      return {
        select: () => chainable({ in: async () => ({ data: config.templateRows, error: null }) }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  const storageFrom = vi.fn(() => ({ remove: removeMock }));

  return { from, storage: { from: storageFrom }, deleteFontMock, removeMock };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listTemplatesUsingFont", () => {
  it("returns an empty list when no field uses the font", async () => {
    const client = buildMockClient({ fontRow: null, fieldRows: [], templateRows: [] });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    expect(await listTemplatesUsingFont("font-1", ORG_ID)).toEqual([]);
  });

  it("returns the distinct templates referencing the font, scoped to the given organization", async () => {
    const client = buildMockClient({
      fontRow: null,
      fieldRows: [{ template_id: "t1" }, { template_id: "t1" }, { template_id: "t2" }],
      templateRows: [
        { id: "t1", name: "Graduation" },
        { id: "t2", name: "Workshop" },
      ],
    });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await listTemplatesUsingFont("font-1", ORG_ID);
    expect(result).toEqual([
      { id: "t1", name: "Graduation" },
      { id: "t2", name: "Workshop" },
    ]);
  });
});

describe("deleteCustomFont", () => {
  it("returns not_found when the font doesn't exist in this organization, without touching template_fields or storage", async () => {
    const client = buildMockClient({ fontRow: null, fieldRows: [], templateRows: [] });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await deleteCustomFont("missing-font", ORG_ID);

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(client.deleteFontMock).not.toHaveBeenCalled();
    expect(client.removeMock).not.toHaveBeenCalled();
  });

  it("blocks deletion and names the templates when the font is in use, without deleting anything", async () => {
    const client = buildMockClient({
      fontRow: { id: "font-1", storage_path: "font-1/source.ttf" },
      fieldRows: [{ template_id: "t1" }],
      templateRows: [{ id: "t1", name: "Graduation Ceremony" }],
    });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await deleteCustomFont("font-1", ORG_ID);

    expect(result).toEqual({
      ok: false,
      reason: "in_use",
      templates: [{ id: "t1", name: "Graduation Ceremony" }],
    });
    expect(client.deleteFontMock).not.toHaveBeenCalled();
    expect(client.removeMock).not.toHaveBeenCalled();
  });

  it("deletes the row and the storage object when the font is not in use", async () => {
    const client = buildMockClient({
      fontRow: { id: "font-1", storage_path: "font-1/source.ttf" },
      fieldRows: [],
      templateRows: [],
    });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await deleteCustomFont("font-1", ORG_ID);

    expect(result).toEqual({ ok: true });
    expect(client.deleteFontMock).toHaveBeenCalledTimes(1);
    expect(client.removeMock).toHaveBeenCalledWith(["font-1/source.ttf"]);
  });
});
