import { describe, expect, it } from "vitest";
import {
  resolveFontDescriptor,
  getCssFontFamily,
  customFontFaceFamily,
  customFontFileUrl,
  isBuiltInFontId,
  DEFAULT_FONT_ID,
} from "./registry";
import type { CustomFontMeta } from "./types";

const CUSTOM_FONT: CustomFontMeta = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  displayName: "My Uploaded Font",
  originalFilename: "MyFont.ttf",
  format: "ttf",
  fontWeight: "normal",
  fileSize: 12345,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("isBuiltInFontId", () => {
  it("recognizes all three built-in ids", () => {
    expect(isBuiltInFontId("Helvetica")).toBe(true);
    expect(isBuiltInFontId("Times-Roman")).toBe(true);
    expect(isBuiltInFontId("Courier")).toBe(true);
  });

  it("does not recognize a custom font uuid or unknown string", () => {
    expect(isBuiltInFontId(CUSTOM_FONT.id)).toBe(false);
    expect(isBuiltInFontId("nonsense")).toBe(false);
  });
});

describe("resolveFontDescriptor", () => {
  it("resolves a built-in id to a built-in descriptor with a PDFKit standard name", () => {
    const descriptor = resolveFontDescriptor("Helvetica");
    expect(descriptor.source).toBe("built-in");
    expect(descriptor.pdfStandardName).toBe("Helvetica");
    expect(descriptor.pdfStoragePath).toBeUndefined();
  });

  it("resolves a known custom font id to a custom descriptor with a storage-backed browser URL", () => {
    const descriptor = resolveFontDescriptor(CUSTOM_FONT.id, [CUSTOM_FONT]);
    expect(descriptor.source).toBe("custom");
    expect(descriptor.displayName).toBe("My Uploaded Font");
    expect(descriptor.browserFontUrl).toBe(`/api/fonts/${CUSTOM_FONT.id}/file`);
    expect(descriptor.fontFaceFamily).toBe(customFontFaceFamily(CUSTOM_FONT.id));
    expect(descriptor.cssFontFamily).toContain(customFontFaceFamily(CUSTOM_FONT.id));
    expect(descriptor.pdfStandardName).toBeUndefined();
  });

  it("falls back to the default built-in for an unknown/deleted font id, rather than throwing", () => {
    const descriptor = resolveFontDescriptor("some-deleted-font-id", [CUSTOM_FONT]);
    expect(descriptor.id).toBe(DEFAULT_FONT_ID);
    expect(descriptor.source).toBe("built-in");
  });

  it("falls back to the default built-in for an empty custom font list", () => {
    const descriptor = resolveFontDescriptor(CUSTOM_FONT.id, []);
    expect(descriptor.id).toBe(DEFAULT_FONT_ID);
  });
});

describe("getCssFontFamily", () => {
  it("returns the built-in CSS stack unchanged", () => {
    expect(getCssFontFamily("Courier")).toBe("'Courier New', Courier, monospace");
  });

  it("returns a quoted custom font-face family with a generic fallback", () => {
    const css = getCssFontFamily(CUSTOM_FONT.id, [CUSTOM_FONT]);
    expect(css).toBe(`'${customFontFaceFamily(CUSTOM_FONT.id)}', sans-serif`);
  });
});

describe("customFontFaceFamily / customFontFileUrl", () => {
  it("derives a stable, unique CSS family name from the font id", () => {
    expect(customFontFaceFamily("abc-123")).toBe("certifyed-font-abc-123");
  });

  it("derives the server-mediated file URL from the font id", () => {
    expect(customFontFileUrl("abc-123")).toBe("/api/fonts/abc-123/file");
  });
});
