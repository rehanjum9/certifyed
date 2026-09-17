import type { CSSProperties } from "react";
import { getCssFontFamily } from "@/lib/fonts";
import type { CustomFontMeta } from "@/lib/fonts";
import { measureTextWidth, measureLineHeight } from "./measureText";
import { resolveFieldLayout } from "@/lib/pdf/textLayout";
import type { EditorField } from "./types";

export interface FieldBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FittedFieldLayout {
  /** The resolved box to actually render, in the field's own SVG-unit space (unscaled) -- identical to the saved field box for fixed/fit_text, wider for auto_width. Callers position the on-screen element from this, not from `field` directly, so the box visibly grows in the editor. */
  box: FieldBox;
  style: CSSProperties;
  overflowing: boolean;
}

/**
 * The one place a field's on-screen box and text style are computed --
 * used by both the Phase 3 field editor (FieldOverlay) and the Phase 4
 * recipient preview (RecipientCanvas), calling the exact same
 * resolveFieldLayout the PDF renderer uses, so all three can never drift
 * into different rendering models for the same field data.
 *
 * `canvasWidth` (SVG units, optional) lets auto_width growth clamp itself
 * to the certificate bounds; omit it to allow unclamped growth (e.g. a
 * quick preview where the canvas size isn't at hand).
 *
 * `customFonts` (optional) resolves a field's font_family to a registered
 * custom font's CSS family when it isn't one of the built-ins -- see
 * lib/fonts/useLoadCustomFonts.ts, which is what actually registers that
 * family with the browser before this can render/measure correctly.
 */
export function computeFieldTextStyle(
  field: EditorField,
  text: string,
  scale: number,
  canvasWidth?: number,
  customFonts: CustomFontMeta[] = [],
): FittedFieldLayout {
  const cssFontFamily = getCssFontFamily(field.font_family, customFonts);
  const measurer = {
    measureWidth: (t: string, size: number) => measureTextWidth(t, size, cssFontFamily, field.font_weight),
    measureLineHeight: (size: number) => measureLineHeight(size, cssFontFamily, field.font_weight),
  };

  const layout = resolveFieldLayout(field, text, measurer, canvasWidth);

  return {
    box: { x: layout.x, y: layout.y, width: layout.width, height: layout.height },
    style: {
      width: "100%",
      textAlign: field.text_align,
      fontFamily: cssFontFamily,
      fontWeight: field.font_weight,
      fontSize: Math.max(layout.fontSize * scale, 1),
      color: field.font_color,
    },
    overflowing: layout.overflowing,
  };
}
