import { describe, expect, it } from "vitest";
import { buildProductionOverlays, type OverlayFieldSource } from "./productionOverlays";

function field(overrides: Partial<OverlayFieldSource> = {}): OverlayFieldSource {
  return {
    field_key: "name",
    x: 10,
    y: 20,
    width: 300,
    height: 50,
    font_family: "Helvetica",
    font_size: 24,
    font_weight: "normal",
    font_color: "#111827",
    text_align: "center",
    sizing_mode: "fixed",
    min_font_size: null,
    max_font_size: null,
    max_width: null,
    ...overrides,
  };
}

describe("buildProductionOverlays", () => {
  it("produces one overlay per field with a value, carrying position/typography/sizing through unchanged", () => {
    const overlays = buildProductionOverlays([field()], { name: "Ali Khan" });
    expect(overlays).toEqual([
      {
        text: "Ali Khan",
        x: 10,
        y: 20,
        width: 300,
        height: 50,
        align: "center",
        sizingMode: "fixed",
        fontSize: 24,
        minFontSize: null,
        maxFontSize: null,
        maxWidth: null,
        fontFamily: "Helvetica",
        fontWeight: "normal",
        color: "#111827",
      },
    ]);
  });

  it("renders nothing for a blank optional field -- never 'undefined' or 'null'", () => {
    const overlays = buildProductionOverlays(
      [field({ field_key: "name" }), field({ field_key: "department" })],
      { name: "Ali Khan" },
    );
    expect(overlays).toHaveLength(1);
    expect(overlays[0].text).toBe("Ali Khan");
  });

  it("skips a field whose mapped value is an empty or whitespace-only string", () => {
    const overlays = buildProductionOverlays([field()], { name: "   " });
    expect(overlays).toHaveLength(0);
  });

  it("passes sizing_mode/min/max font size/max_width through unchanged for each mode", () => {
    const autoWidth = buildProductionOverlays(
      [field({ sizing_mode: "auto_width", min_font_size: 12, max_width: 400 })],
      { name: "Muhammad Abdullah Khan" },
    );
    expect(autoWidth[0].sizingMode).toBe("auto_width");
    expect(autoWidth[0].minFontSize).toBe(12);
    expect(autoWidth[0].maxWidth).toBe(400);

    const fitText = buildProductionOverlays(
      [field({ sizing_mode: "fit_text", min_font_size: 10, max_font_size: 32 })],
      { name: "Muhammad Abdullah Khan" },
    );
    expect(fitText[0].sizingMode).toBe("fit_text");
    expect(fitText[0].minFontSize).toBe(10);
    expect(fitText[0].maxFontSize).toBe(32);
  });

  it("passes bold weight through and normalizes anything else to normal", () => {
    const bold = buildProductionOverlays([field({ font_weight: "bold" })], { name: "Ali Khan" });
    expect(bold[0].fontWeight).toBe("bold");

    const other = buildProductionOverlays([field({ font_weight: "italic" })], { name: "Ali Khan" });
    expect(other[0].fontWeight).toBe("normal");
  });

  it("preserves accented Latin characters unchanged", () => {
    const overlays = buildProductionOverlays([field()], { name: "José García" });
    expect(overlays[0].text).toBe("José García");
  });

  it("renders multiple fields independently, e.g. name and serial number", () => {
    const overlays = buildProductionOverlays(
      [field({ field_key: "name" }), field({ field_key: "serial_number", text_align: "left" })],
      { name: "Zoë Smith", serial_number: "CERT-2026-001" },
    );
    expect(overlays).toHaveLength(2);
    expect(overlays.map((o) => o.text)).toEqual(["Zoë Smith", "CERT-2026-001"]);
  });
});
