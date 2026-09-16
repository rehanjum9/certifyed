let sharedCanvas: HTMLCanvasElement | null = null;

/**
 * Browser-side text width measurement via an offscreen canvas 2D context.
 * The font size passed in is in the field's own unit space (SVG viewBox
 * units), not CSS pixels -- that's fine, since only the *ratio* between
 * measured width and box width matters for auto-fit, and canvas text
 * metrics scale linearly with the font size given to `ctx.font`.
 */
export function measureTextWidth(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: string,
): number {
  if (typeof document === "undefined") return 0;

  if (!sharedCanvas) {
    sharedCanvas = document.createElement("canvas");
  }
  const ctx = sharedCanvas.getContext("2d");
  if (!ctx) return 0;

  ctx.font = `${fontWeight === "bold" ? "bold " : ""}${fontSize}px ${fontFamily}`;
  return ctx.measureText(text).width;
}

/**
 * Real line height from canvas font metrics (ascent + descent), not a
 * guessed ratio. Modern browsers expose these directly on TextMetrics;
 * older ones fall back to a conservative single-line estimate. The CSS
 * rendering path doesn't actually need this (a flexbox `align-items:
 * center` box centers text natively), but resolveFieldLayout's interface
 * is shared with the PDF renderer, which does.
 */
export function measureLineHeight(fontSize: number, fontFamily: string, fontWeight: string): number {
  if (typeof document === "undefined") return fontSize * 1.2;

  if (!sharedCanvas) {
    sharedCanvas = document.createElement("canvas");
  }
  const ctx = sharedCanvas.getContext("2d");
  if (!ctx) return fontSize * 1.2;

  ctx.font = `${fontWeight === "bold" ? "bold " : ""}${fontSize}px ${fontFamily}`;
  const metrics = ctx.measureText("Mg");

  if (
    typeof metrics.fontBoundingBoxAscent === "number" &&
    typeof metrics.fontBoundingBoxDescent === "number"
  ) {
    return metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
  }

  return fontSize * 1.2;
}
