import type { CSSProperties } from "react";
import { getCssFontFamily } from "@/lib/fonts";
import { computeFittedFontSize } from "./autoFit";
import type { EditorField } from "./types";

export interface FittedFieldStyle {
  style: CSSProperties;
  overflowing: boolean;
}

/**
 * The one place a field's text style (font, size after auto-fit, color,
 * alignment) is computed for on-screen rendering. Used by both the Phase 3
 * field editor (FieldOverlay) and the Phase 4 recipient preview
 * (RecipientCanvas), so they can never drift into two different rendering
 * models for the same field data.
 */
export function computeFieldTextStyle(field: EditorField, text: string, scale: number): FittedFieldStyle {
  const { fontSize, overflowing } = computeFittedFontSize(field, text);

  return {
    style: {
      width: "100%",
      textAlign: field.text_align,
      fontFamily: getCssFontFamily(field.font_family),
      fontWeight: field.font_weight,
      fontSize: Math.max(fontSize * scale, 1),
      color: field.font_color,
    },
    overflowing,
  };
}
