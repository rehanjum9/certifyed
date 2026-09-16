import { DEFAULT_FONT_NAME } from "@/lib/fonts";
import type { TemplateFieldRow } from "@/lib/templateFields";
import type { SizingMode } from "@/lib/pdf/textLayout";

export type TextAlign = "left" | "center" | "right";
export type FontWeight = "normal" | "bold";
export type { SizingMode };

/**
 * The editor's working model for one field. Structurally the same data
 * template_fields stores (see src/lib/validation/templateField.ts and
 * supabase/migrations/0002_field_sizing_modes.sql) minus template_id/
 * sort_order/timestamps, which the editor doesn't need to reason about.
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
  sizing_mode: SizingMode;
  min_font_size: number | null;
  max_font_size: number | null;
  max_width: number | null;
  is_required: boolean;
}

const VALID_SIZING_MODES: SizingMode[] = ["fixed", "auto_width", "fit_text"];

function isSizingMode(value: unknown): value is SizingMode {
  return typeof value === "string" && (VALID_SIZING_MODES as string[]).includes(value);
}

const DEFAULT_FIELD_WIDTH = 220;
const DEFAULT_FIELD_HEIGHT = 40;
export const DEFAULT_MAX_WIDTH_MULTIPLIER = 3;

/** Sensible starting max_width when a field is switched to Auto Width -- editable afterward. */
export function defaultMaxWidthFor(width: number): number {
  return Math.round(width * DEFAULT_MAX_WIDTH_MULTIPLIER);
}

/**
 * Converts a stored row into the editor's working shape, tolerating rows
 * saved before sizing_mode/max_width existed -- or read back through a
 * PostgREST schema cache that hadn't yet picked up those new columns,
 * which returns them as `undefined` (key missing) rather than `null`.
 * Coordinates (x/y/width/height) and every other existing value are
 * carried through completely unchanged; only the two new, genuinely
 * optional properties are normalized.
 */
export function templateFieldRowToEditorField(row: TemplateFieldRow): EditorField {
  // row.sizing_mode should always be a valid enum value once the Phase
  // "sizing modes" migration has run (it's NOT NULL with a default), but
  // fall back to the pre-migration auto_fit_text boolean defensively --
  // covers a row read while a fresh migration's schema cache is still
  // stale, or literally any row this project never anticipated.
  const sizing_mode: SizingMode = isSizingMode(row.sizing_mode)
    ? row.sizing_mode
    : row.auto_fit_text
      ? "fit_text"
      : "fixed";

  const min_font_size = row.min_font_size ?? null;
  const max_font_size = row.max_font_size ?? null;
  // auto_width cannot render meaningfully with no growth ceiling at all --
  // synthesize one rather than carrying an invalid null/undefined forward.
  const max_width = row.max_width ?? (sizing_mode === "auto_width" ? defaultMaxWidthFor(row.width) : null);

  return {
    id: row.id,
    field_key: row.field_key,
    label: row.label,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    font_family: row.font_family,
    font_size: row.font_size,
    font_weight: row.font_weight === "bold" ? "bold" : "normal",
    font_color: row.font_color,
    text_align: row.text_align,
    sizing_mode,
    min_font_size,
    max_font_size,
    max_width,
    is_required: row.is_required,
  };
}

/**
 * What changes when the user switches a field's sizing mode in the
 * properties panel. Pulled out as a pure function (rather than inlined in
 * FieldPropertiesPanel) so the "switching to Auto Width initializes a
 * usable max_width" behavior is unit-testable without React.
 */
export function applySizingModeChange(field: EditorField, mode: SizingMode): Partial<EditorField> {
  if (mode === "fit_text") {
    return {
      sizing_mode: mode,
      min_font_size: field.min_font_size ?? Math.max(8, Math.round(field.font_size * 0.5)),
      max_font_size: field.max_font_size ?? field.font_size,
    };
  }
  if (mode === "auto_width") {
    return {
      sizing_mode: mode,
      min_font_size: field.min_font_size ?? Math.max(8, Math.round(field.font_size * 0.5)),
      max_width: field.max_width ?? defaultMaxWidthFor(field.width),
    };
  }
  return { sizing_mode: mode };
}

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
    sizing_mode: "fixed",
    min_font_size: null,
    max_font_size: null,
    max_width: null,
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
