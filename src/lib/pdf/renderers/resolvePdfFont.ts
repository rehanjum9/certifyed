import { isBuiltInFontId } from "@/lib/fonts";

// PDFKit's standard-14 fonts each have a separate bold variant registered
// under its own name -- there is no "set bold" flag, so a TextOverlay's
// (fontFamily, fontWeight) pair must be resolved to the right font name
// before calling doc.font(). Unknown families fall back to themselves
// unchanged (better to draw in the wrong weight than to throw).
const BOLD_VARIANTS: Record<string, string> = {
  Helvetica: "Helvetica-Bold",
  "Times-Roman": "Times-Bold",
  Courier: "Courier-Bold",
};

export function resolvePdfFontName(fontFamily: string, fontWeight: "normal" | "bold" = "normal"): string {
  if (fontWeight !== "bold") return fontFamily;
  return BOLD_VARIANTS[fontFamily] ?? fontFamily;
}

export interface ResolvedOverlayFont {
  /** The exact name to pass to doc.font(). */
  fontName: string;
  /** True when the requested font couldn't be used and the default built-in was substituted instead. */
  usedFallback: boolean;
}

/**
 * Resolves one overlay's (fontFamily, fontWeight) to the exact name to pass
 * to doc.font(): a built-in's bold variant when requested, or -- for a
 * custom font -- its id verbatim, but only when that id was actually
 * registered with doc.registerFont() first (registeredCustomFontIds; see
 * pdfkitSvgRenderer.ts, which downloads and registers every custom font a
 * batch's fields reference before drawing any overlay).
 *
 * Anything else -- a stale/deleted custom font reference, or one whose file
 * failed to download -- falls back to the default built-in rather than
 * letting PDFKit throw "Unknown font" and fail that overlay outright.
 */
export function resolveOverlayFontName(
  fontFamily: string,
  fontWeight: "normal" | "bold",
  registeredCustomFontIds: ReadonlySet<string>,
  defaultFontName: string,
): ResolvedOverlayFont {
  if (isBuiltInFontId(fontFamily)) {
    return { fontName: resolvePdfFontName(fontFamily, fontWeight), usedFallback: false };
  }

  if (registeredCustomFontIds.has(fontFamily)) {
    return { fontName: fontFamily, usedFallback: false };
  }

  return { fontName: resolvePdfFontName(defaultFontName, fontWeight), usedFallback: true };
}
