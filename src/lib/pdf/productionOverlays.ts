import type { TextOverlay } from "./types";
import type { SizingMode, TextAlign } from "./textLayout";

export interface OverlayFieldSource {
  field_key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font_family: string;
  font_size: number;
  font_weight: string;
  font_color: string;
  text_align: TextAlign;
  sizing_mode: SizingMode;
  min_font_size: number | null;
  max_font_size: number | null;
  max_width: number | null;
}

/**
 * Converts a template's saved fields (Phase 3) plus one campaign row's
 * mapped data (Phase 4) into the TextOverlay[] the PdfRenderer draws.
 * This just carries each field's raw sizing properties through unchanged
 * -- the actual sizing/positioning decision (fixed/auto_width/fit_text)
 * is made once, identically, inside resolveFieldLayout (see
 * ../textLayout.ts), not here and not twice.
 *
 * A field with no value (missing key, or blank after trim) produces no
 * overlay at all -- never "undefined"/"null"/placeholder text. This is
 * the correct behavior for a blank *optional* field; a blank *required*
 * field should never reach here because row eligibility (see
 * lib/campaigns/eligibility.ts) already excludes such rows from
 * generation, but skipping is still the safe fallback if it somehow did.
 */
export function buildProductionOverlays(
  fields: OverlayFieldSource[],
  data: Record<string, string>,
): TextOverlay[] {
  const overlays: TextOverlay[] = [];

  for (const field of fields) {
    const value = (data[field.field_key] ?? "").trim();
    if (!value) continue;

    overlays.push({
      text: value,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      align: field.text_align,
      sizingMode: field.sizing_mode,
      fontSize: field.font_size,
      minFontSize: field.min_font_size,
      maxFontSize: field.max_font_size,
      maxWidth: field.max_width,
      fontFamily: field.font_family,
      fontWeight: field.font_weight === "bold" ? "bold" : "normal",
      color: field.font_color,
    });
  }

  return overlays;
}
