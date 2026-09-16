import { describe, expect, it } from "vitest";
import { resolvePdfFontName } from "./resolvePdfFont";

describe("resolvePdfFontName", () => {
  it("returns the base name unchanged for normal weight", () => {
    expect(resolvePdfFontName("Helvetica", "normal")).toBe("Helvetica");
    expect(resolvePdfFontName("Helvetica")).toBe("Helvetica");
  });

  it("returns the bold variant for each known standard font", () => {
    expect(resolvePdfFontName("Helvetica", "bold")).toBe("Helvetica-Bold");
    expect(resolvePdfFontName("Times-Roman", "bold")).toBe("Times-Bold");
    expect(resolvePdfFontName("Courier", "bold")).toBe("Courier-Bold");
  });

  it("falls back to the unmodified name for an unknown family rather than throwing", () => {
    expect(resolvePdfFontName("SomeUnknownFont", "bold")).toBe("SomeUnknownFont");
  });
});
