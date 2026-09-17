import { describe, expect, it } from "vitest";
import { validateFontUpload, MAX_FONT_UPLOAD_BYTES } from "./validateUpload";

const TTF_MAGIC = Uint8Array.from([0x00, 0x01, 0x00, 0x00]);
const OTF_MAGIC = Uint8Array.from([0x4f, 0x54, 0x54, 0x4f]); // "OTTO"
const NOT_A_FONT = Uint8Array.from([0x25, 0x50, 0x44, 0x46]); // "%PDF"

function input(overrides: Partial<Parameters<typeof validateFontUpload>[0]> = {}) {
  return {
    filename: "MyFont.ttf",
    mimeType: "font/ttf",
    size: 1024,
    headerBytes: TTF_MAGIC,
    ...overrides,
  };
}

describe("validateFontUpload", () => {
  it("accepts a well-formed .ttf upload", () => {
    const result = validateFontUpload(input());
    expect(result).toEqual({ ok: true, format: "ttf" });
  });

  it("accepts a well-formed .otf upload", () => {
    const result = validateFontUpload(input({ filename: "MyFont.otf", mimeType: "font/otf", headerBytes: OTF_MAGIC }));
    expect(result).toEqual({ ok: true, format: "otf" });
  });

  it("rejects an empty file", () => {
    const result = validateFontUpload(input({ size: 0 }));
    expect(result.ok).toBe(false);
  });

  it("rejects a file over the size cap", () => {
    const result = validateFontUpload(input({ size: MAX_FONT_UPLOAD_BYTES + 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("exceeds");
  });

  it("accepts a file exactly at the size cap", () => {
    const result = validateFontUpload(input({ size: MAX_FONT_UPLOAD_BYTES }));
    expect(result.ok).toBe(true);
  });

  it("rejects an unsupported extension", () => {
    const result = validateFontUpload(input({ filename: "MyFont.woff2", mimeType: "font/woff2" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(".ttf or .otf");
  });

  it("rejects a file with no extension", () => {
    const result = validateFontUpload(input({ filename: "MyFont" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a mismatched/suspicious MIME type", () => {
    const result = validateFontUpload(input({ mimeType: "application/javascript" }));
    expect(result.ok).toBe(false);
  });

  it("accepts a generic octet-stream MIME type (common for font uploads)", () => {
    const result = validateFontUpload(input({ mimeType: "application/octet-stream" }));
    expect(result.ok).toBe(true);
  });

  it("accepts a missing MIME type (not all upload paths supply one)", () => {
    const result = validateFontUpload(input({ mimeType: null }));
    expect(result.ok).toBe(true);
  });

  it("rejects a renamed non-font file even with a .ttf extension and font MIME type", () => {
    const result = validateFontUpload(input({ headerBytes: NOT_A_FONT }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/valid font/i);
  });

  it("rejects a truncated file with too few header bytes to check", () => {
    const result = validateFontUpload(input({ headerBytes: Uint8Array.from([0x00, 0x01]) }));
    expect(result.ok).toBe(false);
  });
});
