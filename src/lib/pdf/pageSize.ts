export interface PdfPageSize {
  widthPt: number;
  heightPt: number;
}

/**
 * How a template's SVG viewBox size maps to real PDF points (1/72 inch).
 *
 * SVG viewBox units are abstract "user units" with no inherent physical
 * meaning. Nothing in a sanitized SVG reliably tells us whether the
 * exporting tool intended 96dpi CSS pixels, points, millimeters, or
 * something else -- and Phase 2's upload pipeline (lib/svg/parseDimensions.ts)
 * deliberately keeps only the numeric value of any width/height attribute,
 * discarding a physical unit suffix like "210mm" if one was present. By the
 * time a template reaches this phase, that information is already gone.
 * There is therefore no way to reliably *infer* the correct physical scale
 * from the SVG alone -- exactly the situation Phase 5 was told not to
 * guess through with fragile heuristics.
 *
 * This project instead adopts one explicit, uniform, documented rule,
 * applied to every template with no per-file exception:
 *
 *     1 SVG viewBox unit = 1 PDF point.
 *
 * This is exactly what the Phase 2.5 fidelity spike verified against the
 * real Canva template (viewBox "0 0 842.25 595.499986", numerically the
 * same as A4 landscape in points) using svg-to-pdfkit's `assumePt: true`.
 * Applying it unconditionally, rather than only for that one template,
 * keeps the mapping predictable and testable: the resulting PDF page is
 * always numerically identical in points to the template's svg_width/
 * svg_height, for any template, not just this one.
 *
 * Known, deliberate limitation: a template exported with a viewBox in
 * 96dpi CSS pixels (e.g. 1123 x 794 for A4 landscape) would produce a PDF
 * about 33% too large physically. Detecting that case reliably would
 * require either (a) re-introducing physical units at upload time in
 * Phase 2 and threading them through storage, or (b) an explicit
 * per-template "page unit" setting the uploader confirms -- both real
 * fixes, deferred rather than guessed at here. See the Phase 5 report for
 * the recommendation.
 */
export const SVG_UNITS_ASSUMED_AS_POINTS = true;

export function resolvePdfPageSize(svgWidth: number, svgHeight: number): PdfPageSize {
  return { widthPt: svgWidth, heightPt: svgHeight };
}
