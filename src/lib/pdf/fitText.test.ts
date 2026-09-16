import { describe, expect, it } from "vitest";
import { fitFontSize } from "./fitText";

// Deterministic stand-in for a real font's widthOfString: proportional to
// character count and font size. Good enough to test the search behavior
// without depending on PDFKit/a real font engine.
const fakeMeasure = (text: string, fontSize: number) => text.length * fontSize * 0.5;

describe("fitFontSize", () => {
  it("keeps the starting size when the text already fits", () => {
    const size = fitFontSize({
      text: "Ali Khan",
      maxWidth: 1000,
      startFontSize: 32,
      minFontSize: 10,
      measure: fakeMeasure,
    });
    expect(size).toBe(32);
  });

  it("shrinks the font size until the text fits", () => {
    const text = "Muhammad Abdullah Khan";
    const maxWidth = 150;
    const size = fitFontSize({ text, maxWidth, startFontSize: 40, minFontSize: 8, measure: fakeMeasure });

    expect(size).toBeLessThan(40);
    expect(size).toBeGreaterThanOrEqual(8);
    expect(fakeMeasure(text, size)).toBeLessThanOrEqual(maxWidth);
  });

  it("clamps to minFontSize when nothing fits, without throwing", () => {
    const size = fitFontSize({
      text: "This is a very long name that will never fit",
      maxWidth: 10,
      startFontSize: 40,
      minFontSize: 12,
      measure: fakeMeasure,
    });
    expect(size).toBe(12);
  });

  it("returns startFontSize unchanged when minFontSize exceeds it (degenerate config)", () => {
    const size = fitFontSize({
      text: "Zoë Smith",
      maxWidth: 10,
      startFontSize: 12,
      minFontSize: 40,
      measure: fakeMeasure,
    });
    expect(size).toBe(12);
  });

  it("assigns shorter strings a font size at least as large as longer ones in the same box", () => {
    const common = { maxWidth: 180, startFontSize: 36, minFontSize: 10, measure: fakeMeasure };
    const shortSize = fitFontSize({ text: "Ali Khan", ...common });
    const longSize = fitFontSize({ text: "Muhammad Abdullah Khan", ...common });
    expect(shortSize).toBeGreaterThanOrEqual(longSize);
  });

  it("respects a custom step size", () => {
    const size = fitFontSize({
      text: "José García",
      maxWidth: 100,
      startFontSize: 30,
      minFontSize: 10,
      measure: fakeMeasure,
      step: 5,
    });
    // With step 5 from 30, only multiples of 5 (30,25,...,10) are reachable.
    expect([30, 25, 20, 15, 10]).toContain(size);
  });
});
