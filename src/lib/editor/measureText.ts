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
