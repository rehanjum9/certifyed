import { describe, expect, it } from "vitest";
import { templateFieldRowToEditorField, applySizingModeChange, defaultMaxWidthFor } from "./types";
import type { TemplateFieldRow } from "@/lib/templateFields";

function row(overrides: Partial<TemplateFieldRow> = {}): TemplateFieldRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    template_id: "22222222-2222-2222-2222-222222222222",
    field_key: "serial_number",
    label: "Serial Number",
    x: 30,
    y: 550,
    width: 250,
    height: 30,
    font_family: "Courier",
    font_size: 14,
    font_weight: "normal",
    font_color: "#374151",
    text_align: "left",
    auto_fit_text: false,
    min_font_size: null,
    max_font_size: null,
    sizing_mode: "fixed",
    max_width: null,
    is_required: true,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as TemplateFieldRow;
}

describe("templateFieldRowToEditorField: backward compatibility", () => {
  it("loads an old fixed field (auto_fit_text=false) whose sizing_mode/max_width are undefined", () => {
    const legacyRow = row({ sizing_mode: undefined, max_width: undefined, auto_fit_text: false }) as TemplateFieldRow;
    const field = templateFieldRowToEditorField(legacyRow);

    expect(field.sizing_mode).toBe("fixed");
    expect(field.max_width).toBeNull();
  });

  it("loads an old fit_text-equivalent field (auto_fit_text=true) whose sizing_mode/max_width are undefined", () => {
    const legacyRow = row({
      sizing_mode: undefined,
      max_width: undefined,
      auto_fit_text: true,
      min_font_size: 10,
      max_font_size: 32,
    }) as TemplateFieldRow;
    const field = templateFieldRowToEditorField(legacyRow);

    expect(field.sizing_mode).toBe("fit_text");
    expect(field.max_width).toBeNull();
    expect(field.min_font_size).toBe(10);
    expect(field.max_font_size).toBe(32);
  });

  it("passes a correctly-migrated row through unchanged", () => {
    const migratedRow = row({ sizing_mode: "fit_text", min_font_size: 8, max_font_size: 20 });
    const field = templateFieldRowToEditorField(migratedRow);

    expect(field.sizing_mode).toBe("fit_text");
    expect(field.min_font_size).toBe(8);
    expect(field.max_font_size).toBe(20);
  });

  it("synthesizes a usable max_width for a row that is somehow auto_width with none set", () => {
    const oddRow = row({ sizing_mode: "auto_width", width: 200, max_width: undefined }) as TemplateFieldRow;
    const field = templateFieldRowToEditorField(oddRow);

    expect(field.sizing_mode).toBe("auto_width");
    expect(field.max_width).toBe(defaultMaxWidthFor(200));
  });

  it("never mutates coordinates or other saved values", () => {
    const original = row({ x: 97.189, y: 55.475, width: 220, height: 40, font_size: 12 });
    const field = templateFieldRowToEditorField(original);

    expect(field.x).toBe(97.189);
    expect(field.y).toBe(55.475);
    expect(field.width).toBe(220);
    expect(field.height).toBe(40);
    expect(field.font_size).toBe(12);
  });

  it("normalizes undefined min/max font size to null rather than passing undefined through", () => {
    const legacyRow = row({ min_font_size: undefined, max_font_size: undefined }) as TemplateFieldRow;
    const field = templateFieldRowToEditorField(legacyRow);

    expect(field.min_font_size).toBeNull();
    expect(field.max_font_size).toBeNull();
  });
});

describe("applySizingModeChange", () => {
  const baseField = {
    id: "1",
    field_key: "name",
    label: "Name",
    x: 0,
    y: 0,
    width: 200,
    height: 40,
    font_family: "Helvetica",
    font_size: 24,
    font_weight: "normal" as const,
    font_color: "#111827",
    text_align: "left" as const,
    sizing_mode: "fixed" as const,
    min_font_size: null,
    max_font_size: null,
    max_width: null,
    is_required: true,
  };

  it("initializes a usable max_width when switching fixed -> auto_width", () => {
    const patch = applySizingModeChange(baseField, "auto_width");
    expect(patch.sizing_mode).toBe("auto_width");
    expect(patch.max_width).toBe(defaultMaxWidthFor(baseField.width));
    expect(patch.min_font_size).not.toBeNull();
  });

  it("does not override an already-set max_width when switching to auto_width", () => {
    const patch = applySizingModeChange({ ...baseField, max_width: 999 }, "auto_width");
    expect(patch.max_width).toBe(999);
  });

  it("initializes min/max font size when switching fixed -> fit_text", () => {
    const patch = applySizingModeChange(baseField, "fit_text");
    expect(patch.sizing_mode).toBe("fit_text");
    expect(patch.min_font_size).not.toBeNull();
    expect(patch.max_font_size).toBe(baseField.font_size);
  });

  it("switching to fixed only changes sizing_mode", () => {
    const patch = applySizingModeChange({ ...baseField, sizing_mode: "auto_width", max_width: 500 }, "fixed");
    expect(patch).toEqual({ sizing_mode: "fixed" });
  });
});
