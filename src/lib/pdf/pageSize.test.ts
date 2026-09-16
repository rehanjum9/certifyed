import { describe, expect, it } from "vitest";
import { resolvePdfPageSize } from "./pageSize";

describe("resolvePdfPageSize", () => {
  it("keeps the real Canva A4-landscape template at exactly 842.25 x 595.5 pt", () => {
    const size = resolvePdfPageSize(842.25, 595.499986);
    expect(size.widthPt).toBe(842.25);
    expect(size.heightPt).toBe(595.499986);
  });

  it("applies the same 1-unit-equals-1-point rule to a different template size", () => {
    // An alternative, non-A4 certificate -- e.g. a square 1000x1000 design.
    const size = resolvePdfPageSize(1000, 1000);
    expect(size).toEqual({ widthPt: 1000, heightPt: 1000 });
  });

  it("does not apply any hidden scale factor regardless of aspect ratio", () => {
    const portrait = resolvePdfPageSize(595.5, 842.25);
    expect(portrait).toEqual({ widthPt: 595.5, heightPt: 842.25 });
  });
});
