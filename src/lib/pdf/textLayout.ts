import { fitFontSize } from "./fitText";

export type SizingMode = "fixed" | "auto_width" | "fit_text";
export type TextAlign = "left" | "center" | "right";

export interface FieldLayoutInput {
  x: number;
  y: number;
  width: number;
  height: number;
  text_align: TextAlign;
  sizing_mode: SizingMode;
  /** The preferred/base font size for every mode -- the ceiling for fixed and auto_width, ignored in favor of max_font_size for fit_text. */
  font_size: number;
  min_font_size: number | null;
  max_font_size: number | null;
  /** Growth ceiling for auto_width. Ignored by other modes. */
  max_width: number | null;
}

export interface TextMeasurer {
  measureWidth: (text: string, fontSize: number) => number;
  /** Height of one line of text at the given size, from real font metrics (e.g. PDFKit's ascender/descender, or a canvas font-metrics equivalent) -- never a hardcoded ratio. */
  measureLineHeight: (fontSize: number) => number;
}

export interface ResolvedTextLayout {
  /** The box to actually draw the text within. Identical to the input box for fixed/fit_text; can be wider (auto_width) or, at the edges, clamped, than the saved field box. */
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  /**
   * Offset from the top of `height` to where a top-anchored renderer
   * (PDFKit) should start the line so it lands vertically centered --
   * exactly what a CSS `align-items: center` flexbox gives a browser for
   * free. Unused by CSS-based renderers (they can ignore it), but it is
   * the same formula either way: (height - lineHeight) / 2, derived from
   * real font metrics, never an arbitrary constant.
   */
  textOffsetY: number;
  /** True if the text still doesn't fit at the most permissive size/width this mode allows. Callers must surface this, never truncate silently. */
  overflowing: boolean;
}

const AUTO_WIDTH_FALLBACK_MULTIPLIER = 3;

/**
 * The one deterministic text-layout model for a template field, used
 * identically by the Phase 3 editor, the Phase 4 recipient preview, and
 * the Phase 5 PDF renderer. Each environment supplies its own
 * `TextMeasurer` (canvas in the browser, PDFKit's real font metrics on
 * the server) but the sizing/positioning *rules* below are one piece of
 * code, not reimplemented three times.
 */
export function resolveFieldLayout(
  field: FieldLayoutInput,
  text: string,
  measurer: TextMeasurer,
  canvasWidth?: number,
): ResolvedTextLayout {
  let x = field.x;
  let width = field.width;
  let fontSize = field.font_size;
  let overflowing = false;

  if (field.sizing_mode === "fit_text") {
    const min = field.min_font_size ?? field.font_size;
    const max = field.max_font_size ?? field.font_size;
    fontSize = fitFontSize({
      text,
      maxWidth: field.width,
      startFontSize: max,
      minFontSize: min,
      measure: measurer.measureWidth,
    });
    overflowing = measurer.measureWidth(text, fontSize) > field.width;
  } else if (field.sizing_mode === "auto_width") {
    const maxWidth = field.max_width ?? field.width * AUTO_WIDTH_FALLBACK_MULTIPLIER;
    const naturalWidth = measurer.measureWidth(text, field.font_size);

    if (naturalWidth > maxWidth) {
      const min = field.min_font_size ?? field.font_size;
      fontSize = fitFontSize({
        text,
        maxWidth,
        startFontSize: field.font_size,
        minFontSize: min,
        measure: measurer.measureWidth,
      });
      width = maxWidth;
      overflowing = measurer.measureWidth(text, fontSize) > maxWidth;
    } else {
      // Preferred size fits -- grow the box, never shrink font, never
      // shrink the box below its configured/saved width.
      fontSize = field.font_size;
      width = Math.max(field.width, naturalWidth);
    }

    if (field.text_align === "right") {
      x = field.x + field.width - width; // right edge fixed, grows left
    } else if (field.text_align === "center") {
      x = field.x + field.width / 2 - width / 2; // center fixed, grows both ways
    } else {
      x = field.x; // left edge fixed, grows right
    }

    if (canvasWidth !== undefined) {
      if (x < 0) {
        width += x;
        x = 0;
      }
      if (x + width > canvasWidth) {
        width = Math.max(field.width, canvasWidth - x);
      }
    }
  } else {
    // fixed: box and font are both static by design.
    overflowing = measurer.measureWidth(text, fontSize) > width;
  }

  const lineHeight = measurer.measureLineHeight(fontSize);
  const textOffsetY = Math.max(0, (field.height - lineHeight) / 2);

  return { x, y: field.y, width, height: field.height, fontSize, textOffsetY, overflowing };
}
