import { DEFAULT_FONT_NAME } from "@/lib/fonts";

export type TextAlign = "left" | "center" | "right";
export type FontWeight = "normal" | "bold";

/**
 * The editor's working model for one field. Structurally the same data
 * template_fields stores (see src/lib/validation/templateField.ts and
 * supabase/migrations/0001_init.sql) minus template_id/sort_order/
 * timestamps, which the editor doesn't need to reason about.
 */
export interface EditorField {
  id: string;
  field_key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font_family: string;
  font_size: number;
  font_weight: FontWeight;
  font_color: string;
  text_align: TextAlign;
  auto_fit_text: boolean;
  min_font_size: number | null;
  max_font_size: number | null;
  is_required: boolean;
}

const DEFAULT_FIELD_WIDTH = 220;
const DEFAULT_FIELD_HEIGHT = 40;

export function createDefaultField(
  existingKeys: string[],
  index: number,
  canvas: { svg_width: number; svg_height: number },
): EditorField {
  let n = index;
  let key = `field_${n}`;
  while (existingKeys.includes(key)) {
    n += 1;
    key = `field_${n}`;
  }

  return {
    id: crypto.randomUUID(),
    field_key: key,
    label: "New field",
    x: (canvas.svg_width - DEFAULT_FIELD_WIDTH) / 2,
    y: (canvas.svg_height - DEFAULT_FIELD_HEIGHT) / 2 + index * 12,
    width: DEFAULT_FIELD_WIDTH,
    height: DEFAULT_FIELD_HEIGHT,
    font_family: DEFAULT_FONT_NAME,
    font_size: 24,
    font_weight: "normal",
    font_color: "#111827",
    text_align: "left",
    auto_fit_text: false,
    min_font_size: null,
    max_font_size: null,
    is_required: true,
  };
}

const PREVIEW_DEFAULTS_BY_KEY: Record<string, string> = {
  name: "Muhammad Abdullah Khan",
  serial_number: "CERT-2026-001",
  date: "16 September 2026",
  course: "Advanced Web Development",
  grade: "A+",
};

/** Editor-only sample text so a field previews with something plausible before real data exists. */
export function defaultPreviewValueFor(fieldKey: string): string {
  return PREVIEW_DEFAULTS_BY_KEY[fieldKey] ?? "Sample text";
}
