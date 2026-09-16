import { fitFontSize } from "@/lib/pdf/fitText";
import { getCssFontFamily } from "@/lib/fonts";
import { measureTextWidth } from "./measureText";
import type { EditorField } from "./types";

export interface FittedText {
  fontSize: number;
  overflowing: boolean;
}

type MeasureFn = (text: string, fontSize: number) => number;

/**
 * Editor-side use of the exact same Phase 2.5 `fitFontSize` helper the PDF
 * renderer uses -- only the `measure` function differs (canvas text metrics
 * here, PDFKit's widthOfString there). This is intentional: one typography
 * model, two measurement backends, so what the editor previews and what a
 * future renderer produces can't silently diverge.
 *
 * `measure` is injectable for testing; defaults to the real canvas-based
 * measurer, which only works in a browser (see measureText.ts).
 */
export function computeFittedFontSize(
  field: Pick<EditorField, "auto_fit_text" | "font_size" | "min_font_size" | "max_font_size" | "width" | "font_family" | "font_weight">,
  text: string,
  measure: MeasureFn = (t, size) =>
    measureTextWidth(t, size, getCssFontFamily(field.font_family), field.font_weight),
): FittedText {
  if (!field.auto_fit_text) {
    return { fontSize: field.font_size, overflowing: false };
  }

  const minFontSize = field.min_font_size ?? field.font_size;
  const maxFontSize = field.max_font_size ?? field.font_size;

  const fontSize = fitFontSize({
    text,
    maxWidth: field.width,
    startFontSize: maxFontSize,
    minFontSize,
    measure,
  });

  return { fontSize, overflowing: measure(text, fontSize) > field.width };
}
