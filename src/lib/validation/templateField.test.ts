import { describe, expect, it } from "vitest";
import { templateFieldInputSchema, formatValidationIssue, saveFieldsBodySchema, MAX_TEMPLATE_FIELDS } from "./templateField";

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
    sizing_mode: "fixed",
    min_font_size: null,
    max_font_size: null,
    max_width: null,
    is_required: true,
    ...overrides,
  };
}

describe("templateFieldInputSchema", () => {
  it("accepts a well-formed fixed field", () => {
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

  it("rejects fit_text without min/max font sizes", () => {
    const result = templateFieldInputSchema.safeParse(
      validField({ sizing_mode: "fit_text", min_font_size: null, max_font_size: null }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects fit_text with min greater than max", () => {
    const result = templateFieldInputSchema.safeParse(
      validField({ sizing_mode: "fit_text", min_font_size: 40, max_font_size: 10 }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts fit_text with a valid min/max range", () => {
    const result = templateFieldInputSchema.safeParse(
      validField({ sizing_mode: "fit_text", min_font_size: 10, max_font_size: 40 }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects auto_width without a max_width", () => {
    const result = templateFieldInputSchema.safeParse(
      validField({ sizing_mode: "auto_width", min_font_size: 10, max_width: null }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects auto_width without a min_font_size", () => {
    const result = templateFieldInputSchema.safeParse(
      validField({ sizing_mode: "auto_width", min_font_size: null, max_width: 400 }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects auto_width whose max_width is narrower than the field itself", () => {
    const result = templateFieldInputSchema.safeParse(
      validField({ sizing_mode: "auto_width", width: 200, min_font_size: 10, max_width: 100 }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed auto_width field", () => {
    const result = templateFieldInputSchema.safeParse(
      validField({ sizing_mode: "auto_width", width: 200, min_font_size: 10, max_width: 500 }),
    );
    expect(result.success).toBe(true);
  });
});

describe("templateFieldInputSchema: backward compatibility (undefined vs. null)", () => {
  it("accepts a fixed field where max_width/min/max font size are undefined, not just null", () => {
    const legacy = validField({
      sizing_mode: "fixed",
      min_font_size: undefined,
      max_font_size: undefined,
      max_width: undefined,
    });
    const result = templateFieldInputSchema.safeParse(legacy);
    expect(result.success).toBe(true);
    if (result.success) {
      // Normalized to null, never left as undefined, for every downstream consumer.
      expect(result.data.min_font_size).toBeNull();
      expect(result.data.max_font_size).toBeNull();
      expect(result.data.max_width).toBeNull();
    }
  });

  it("accepts a fit_text field where max_width is undefined (it's irrelevant to this mode)", () => {
    const result = templateFieldInputSchema.safeParse(
      validField({ sizing_mode: "fit_text", min_font_size: 10, max_font_size: 32, max_width: undefined }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects auto_width when max_width is undefined, with a message naming the property", () => {
    const result = templateFieldInputSchema.safeParse(
      validField({ sizing_mode: "auto_width", min_font_size: 10, max_width: undefined }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationIssue(result.error)).toContain("Max width is required for Auto Width mode");
    }
  });
});

describe("saveFieldsBodySchema (MAX_TEMPLATE_FIELDS)", () => {
  it("accepts a fields array at exactly the maximum", () => {
    const fields = Array.from({ length: MAX_TEMPLATE_FIELDS }, (_, i) =>
      validField({ id: `123e4567-e89b-12d3-a456-4266141740${String(i).padStart(2, "0")}`, field_key: `field_${i}` }),
    );
    const result = saveFieldsBodySchema.safeParse({ fields });
    expect(result.success).toBe(true);
  });

  it("rejects a fields array exceeding the maximum, with a clear error", () => {
    const fields = Array.from({ length: MAX_TEMPLATE_FIELDS + 1 }, (_, i) =>
      validField({ id: `123e4567-e89b-12d3-a456-4266141740${String(i).padStart(2, "0")}`, field_key: `field_${i}` }),
    );
    const result = saveFieldsBodySchema.safeParse({ fields });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationIssue(result.error)).toContain(`at most ${MAX_TEMPLATE_FIELDS} fields`);
    }
  });
});

describe("formatValidationIssue", () => {
  it("names the failing property in the message", () => {
    const result = templateFieldInputSchema.safeParse(
      validField({ sizing_mode: "auto_width", min_font_size: 10, max_width: null }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = formatValidationIssue(result.error);
      expect(message).toContain("max_width");
      expect(message).not.toBe("Invalid input: expected number, received undefined");
    }
  });
});
