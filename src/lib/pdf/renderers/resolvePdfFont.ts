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
