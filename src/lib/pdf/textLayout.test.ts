import { describe, expect, it } from "vitest";
import { resolveFieldLayout, type FieldLayoutInput, type TextMeasurer } from "./textLayout";

// Deterministic stand-ins, not real font metrics -- these test the
// resolver's *rules*, not any particular font's exact numbers.
const measurer: TextMeasurer = {
  measureWidth: (text, fontSize) => text.length * fontSize * 0.5,
  measureLineHeight: (fontSize) => fontSize * 1.2,
};

function baseField(overrides: Partial<FieldLayoutInput> = {}): FieldLayoutInput {
  return {
    x: 100,
    y: 500,
    width: 200,
    height: 30,
    text_align: "center",
    sizing_mode: "fixed",
    font_size: 20,
    min_font_size: 10,
    max_font_size: 28,
    max_width: null,
    ...overrides,
  };
}

describe("resolveFieldLayout: vertical centering (serial_number placement fix)", () => {
  it("computes textOffsetY from real line height, not a hardcoded constant", () => {
    const field = baseField({ height: 30, font_size: 14 });
    const layout = resolveFieldLayout(field, "CERT-003", measurer);
    const expectedLineHeight = measurer.measureLineHeight(14); // 16.8
    expect(layout.textOffsetY).toBeCloseTo((30 - expectedLineHeight) / 2, 5);
  });

  it("keeps the saved box position and size unchanged for a fixed serial_number field", () => {
    const field = baseField({ x: 30, y: 550, width: 250, height: 30, sizing_mode: "fixed", font_size: 14 });
    const layout = resolveFieldLayout(field, "CERT-003", measurer);
    expect(layout.x).toBe(30);
    expect(layout.y).toBe(550);
    expect(layout.width).toBe(250);
    expect(layout.height).toBe(30);
  });

  it("centers a short line within a taller box rather than anchoring to the top", () => {
    const field = baseField({ height: 60, font_size: 14 });
    const layout = resolveFieldLayout(field, "CERT-003", measurer);
    expect(layout.textOffsetY).toBeGreaterThan(0);
    expect(layout.textOffsetY).toBeLessThan(field.height);
  });
});

describe("resolveFieldLayout: fixed mode", () => {
  it("never changes font size or box", () => {
    const field = baseField({ sizing_mode: "fixed", font_size: 18, width: 50 });
    const layout = resolveFieldLayout(field, "A very long piece of text indeed", measurer);
    expect(layout.fontSize).toBe(18);
    expect(layout.width).toBe(50);
  });

  it("flags overflow without truncating the text itself", () => {
    const field = baseField({ sizing_mode: "fixed", font_size: 18, width: 50 });
    const layout = resolveFieldLayout(field, "A very long piece of text indeed", measurer);
    expect(layout.overflowing).toBe(true);
  });
});

describe("resolveFieldLayout: fit_text mode", () => {
  it("shrinks font to fit within the fixed box, never below min_font_size", () => {
    const field = baseField({ sizing_mode: "fit_text", width: 80, min_font_size: 10, max_font_size: 28 });
    const layout = resolveFieldLayout(field, "Muhammad Abdullah Khan", measurer);
    expect(layout.fontSize).toBeGreaterThanOrEqual(10);
    expect(layout.fontSize).toBeLessThan(28);
    expect(layout.width).toBe(80); // box itself never changes in this mode
  });

  it("reports overflow when even the minimum size doesn't fit", () => {
    const field = baseField({ sizing_mode: "fit_text", width: 20, min_font_size: 10, max_font_size: 28 });
    const layout = resolveFieldLayout(field, "Muhammad Abdullah Khan", measurer);
    expect(layout.overflowing).toBe(true);
    expect(layout.fontSize).toBe(10);
  });
});

describe("resolveFieldLayout: auto_width mode -- anchoring", () => {
  it("centered field grows symmetrically, keeping the visual center fixed", () => {
    const field = baseField({
      sizing_mode: "auto_width",
      text_align: "center",
      x: 100,
      width: 100,
      font_size: 20,
      max_width: 1000,
    });
    const originalCenter = field.x + field.width / 2;

    const layout = resolveFieldLayout(field, "Muhammad Abdullah Khan", measurer);
    const newCenter = layout.x + layout.width / 2;

    expect(layout.width).toBeGreaterThan(field.width);
    expect(newCenter).toBeCloseTo(originalCenter, 5);
  });

  it("left-aligned field grows rightward, keeping the left edge fixed", () => {
    const field = baseField({
      sizing_mode: "auto_width",
      text_align: "left",
      x: 100,
      width: 100,
      font_size: 20,
      max_width: 1000,
    });
    const layout = resolveFieldLayout(field, "Muhammad Abdullah Khan", measurer);

    expect(layout.width).toBeGreaterThan(field.width);
    expect(layout.x).toBe(field.x);
  });

  it("right-aligned field grows leftward, keeping the right edge fixed", () => {
    const field = baseField({
      sizing_mode: "auto_width",
      text_align: "right",
      x: 100,
      width: 100,
      font_size: 20,
      max_width: 1000,
    });
    const originalRightEdge = field.x + field.width;

    const layout = resolveFieldLayout(field, "Muhammad Abdullah Khan", measurer);
    const newRightEdge = layout.x + layout.width;

    expect(layout.width).toBeGreaterThan(field.width);
    expect(newRightEdge).toBeCloseTo(originalRightEdge, 5);
  });
});

describe("resolveFieldLayout: auto_width mode -- font size behavior", () => {
  it("keeps the full text on one line and never truncates it (name is preserved in full)", () => {
    const field = baseField({ sizing_mode: "auto_width", width: 100, font_size: 20, max_width: 1000 });
    const text = "Muhammad Abdullah Khan";
    const layout = resolveFieldLayout(field, text, measurer);

    // The resolved box must be wide enough for the *entire* string at the
    // resolved font size -- proof nothing was cut down to "Muhammad".
    expect(measurer.measureWidth(text, layout.fontSize)).toBeLessThanOrEqual(layout.width + 1e-6);
    expect(layout.overflowing).toBe(false);
  });

  it("does not reduce font size when the box can safely grow within max_width", () => {
    const field = baseField({ sizing_mode: "auto_width", width: 100, font_size: 20, max_width: 1000 });
    const layout = resolveFieldLayout(field, "Muhammad Abdullah Khan", measurer);
    expect(layout.fontSize).toBe(20); // preferred size preserved
  });

  it("only shrinks the font after max_width is actually reached", () => {
    const text = "Muhammad Abdullah Khan"; // natural width at 20 = 23*20*0.5 = 230
    const field = baseField({ sizing_mode: "auto_width", width: 100, font_size: 20, min_font_size: 8, max_width: 150 });
    const layout = resolveFieldLayout(field, text, measurer);

    expect(layout.width).toBe(150); // capped at max_width
    expect(layout.fontSize).toBeLessThan(20); // had to shrink to fit within max_width
    expect(layout.fontSize).toBeGreaterThanOrEqual(8);
  });

  it("short names keep the preferred font size and only grow modestly", () => {
    const short = resolveFieldLayout(
      baseField({ sizing_mode: "auto_width", width: 100, font_size: 20, max_width: 1000 }),
      "Ali Khan",
      measurer,
    );
    expect(short.fontSize).toBe(20);
  });

  it("never shrinks the box below its originally configured width for a short string", () => {
    const field = baseField({ sizing_mode: "auto_width", width: 200, font_size: 20, max_width: 1000 });
    const layout = resolveFieldLayout(field, "Al", measurer); // tiny natural width
    expect(layout.width).toBe(200);
  });

  it("clamps growth within an optional canvas width where practical", () => {
    const field = baseField({
      sizing_mode: "auto_width",
      text_align: "left",
      x: 950,
      width: 40,
      font_size: 20,
      max_width: 1000,
    });
    const layout = resolveFieldLayout(field, "Muhammad Abdullah Khan", measurer, 1000);
    expect(layout.x + layout.width).toBeLessThanOrEqual(1000 + 1e-6);
  });
});

describe("resolveFieldLayout: accented characters and varied name lengths behave the same as plain ASCII", () => {
  it.each(["Ali Khan", "Zoe Smith", "Muhammad Abdullah Khan", "José García", "Zoë Smith"])(
    "resolves a layout for '%s' without throwing, fully preserving the text",
    (name) => {
      const field = baseField({ sizing_mode: "auto_width", width: 100, font_size: 20, max_width: 1000 });
      const layout = resolveFieldLayout(field, name, measurer);
      expect(layout.overflowing).toBe(false);
      expect(measurer.measureWidth(name, layout.fontSize)).toBeLessThanOrEqual(layout.width + 1e-6);
    },
  );
});
