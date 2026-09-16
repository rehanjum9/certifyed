import { describe, expect, it } from "vitest";
import { computeFittedFontSize } from "./autoFit";

const fakeMeasure = (text: string, fontSize: number) => text.length * fontSize * 0.5;

const baseField = {
  auto_fit_text: true,
  font_size: 24,
  min_font_size: 10,
  max_font_size: 36,
  width: 150,
  font_family: "Helvetica",
  font_weight: "normal" as const,
};

describe("computeFittedFontSize", () => {
  it("returns the plain font_size unchanged when auto-fit is disabled", () => {
    const result = computeFittedFontSize({ ...baseField, auto_fit_text: false }, "Ali Khan", fakeMeasure);
    expect(result).toEqual({ fontSize: 24, overflowing: false });
  });

  it("starts from max_font_size and shrinks to fit when auto-fit is enabled", () => {
    const result = computeFittedFontSize(baseField, "Muhammad Abdullah Khan", fakeMeasure);
    expect(result.fontSize).toBeLessThan(baseField.max_font_size);
    expect(result.fontSize).toBeGreaterThanOrEqual(baseField.min_font_size);
    expect(result.overflowing).toBe(false);
  });

  it("keeps max_font_size when the text already fits at that size", () => {
    const result = computeFittedFontSize(baseField, "Ali", fakeMeasure);
    expect(result.fontSize).toBe(baseField.max_font_size);
    expect(result.overflowing).toBe(false);
  });

  it("flags overflowing when even min_font_size doesn't fit", () => {
    const result = computeFittedFontSize(
      { ...baseField, width: 20 },
      "This name is far too long for this box",
      fakeMeasure,
    );
    expect(result.fontSize).toBe(baseField.min_font_size);
    expect(result.overflowing).toBe(true);
  });

  it("falls back to font_size as both bounds when min/max are unset", () => {
    const result = computeFittedFontSize(
      { ...baseField, min_font_size: null, max_font_size: null },
      "Zoë Smith",
      fakeMeasure,
    );
    expect(result.fontSize).toBe(baseField.font_size);
  });
});
