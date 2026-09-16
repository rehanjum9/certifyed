export interface FitFontSizeOptions {
  text: string;
  maxWidth: number;
  startFontSize: number;
  minFontSize: number;
  /** Measures the rendered width of `text` at a given font size. Renderer-specific (e.g. PDFKit's widthOfString), kept out of this module so it stays pure and testable without a real font engine. */
  measure: (text: string, fontSize: number) => number;
  /** Points to shrink by per iteration. */
  step?: number;
}

/**
 * Proof-of-concept auto-fit: step the font size down from `startFontSize`
 * until `measure(text, fontSize) <= maxWidth`, never going below
 * `minFontSize`. If it still doesn't fit at minFontSize, returns
 * minFontSize anyway (best effort) -- callers can compare the final
 * measured width against maxWidth themselves to detect overflow.
 */
export function fitFontSize({
  text,
  maxWidth,
  startFontSize,
  minFontSize,
  measure,
  step = 1,
}: FitFontSizeOptions): number {
  const floor = Math.min(startFontSize, minFontSize);
  let fontSize = Math.max(startFontSize, floor);

  while (fontSize > floor && measure(text, fontSize) > maxWidth) {
    fontSize = Math.max(floor, fontSize - step);
  }

  return fontSize;
}
