import { describe, expect, it } from "vitest";
import { resolvePdfFontName, resolveOverlayFontName } from "./resolvePdfFont";

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

describe("resolveOverlayFontName", () => {
  it("resolves a built-in font's bold variant, ignoring the registered custom font set entirely", () => {
    const result = resolveOverlayFontName("Helvetica", "bold", new Set(), "Helvetica");
    expect(result).toEqual({ fontName: "Helvetica-Bold", usedFallback: false });
  });

  it("uses a custom font id verbatim when it was registered", () => {
    const result = resolveOverlayFontName("font-123", "normal", new Set(["font-123"]), "Helvetica");
    expect(result).toEqual({ fontName: "font-123", usedFallback: false });
  });

  it("falls back to the default built-in when the custom font id was never registered", () => {
    const result = resolveOverlayFontName("font-deleted", "normal", new Set(["font-123"]), "Helvetica");
    expect(result).toEqual({ fontName: "Helvetica", usedFallback: true });
  });

  it("applies bold to the fallback font when the overlay requested bold", () => {
    const result = resolveOverlayFontName("font-deleted", "bold", new Set(), "Helvetica");
    expect(result).toEqual({ fontName: "Helvetica-Bold", usedFallback: true });
  });
});
