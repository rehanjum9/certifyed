import { describe, expect, it } from "vitest";
import { templateFieldInputSchema } from "./templateField";

function validField(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    field_key: "serial_number",
    label: "Serial Number",
    x: 10,
    y: 20,
    width: 200,
    height: 40,
    font_family: "Helvetica",
    font_size: 24,
    font_weight: "normal",
    font_color: "#112233",
    text_align: "left",
    auto_fit_text: false,
    min_font_size: null,
    max_font_size: null,
    is_required: true,
    ...overrides,
  };
}

describe("templateFieldInputSchema", () => {
  it("accepts a well-formed field", () => {
    const result = templateFieldInputSchema.safeParse(validField());
    expect(result.success).toBe(true);
  });

  it("rejects 'email' as a field key", () => {
    const result = templateFieldInputSchema.safeParse(validField({ field_key: "email" }));
    expect(result.success).toBe(false);
  });

  it.each(["Name", "serial-number", "1name", "has space", ""])(
    "rejects a machine-unfriendly field key: %s",
    (key) => {
      const result = templateFieldInputSchema.safeParse(validField({ field_key: key }));
      expect(result.success).toBe(false);
    },
  );

  it.each(["name", "serial_number", "date", "course", "grade", "department", "event_name", "award_title"])(
    "accepts a valid machine-friendly field key: %s",
    (key) => {
      const result = templateFieldInputSchema.safeParse(validField({ field_key: key }));
      expect(result.success).toBe(true);
    },
  );

  it("rejects a width below the minimum field size", () => {
    const result = templateFieldInputSchema.safeParse(validField({ width: 2 }));
    expect(result.success).toBe(false);
  });

  it("rejects an invalid hex color", () => {
    const result = templateFieldInputSchema.safeParse(validField({ font_color: "red" }));
    expect(result.success).toBe(false);
  });

  it("rejects auto_fit_text enabled without min/max font sizes", () => {
    const result = templateFieldInputSchema.safeParse(
      validField({ auto_fit_text: true, min_font_size: null, max_font_size: null }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects auto_fit_text with min greater than max", () => {
    const result = templateFieldInputSchema.safeParse(
      validField({ auto_fit_text: true, min_font_size: 40, max_font_size: 10 }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts auto_fit_text with a valid min/max range", () => {
    const result = templateFieldInputSchema.safeParse(
      validField({ auto_fit_text: true, min_font_size: 10, max_font_size: 40 }),
    );
    expect(result.success).toBe(true);
  });
});
