import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { resolveFieldLayout } from "../textLayout";
import { resolvePdfFontName } from "./resolvePdfFont";
import { SVG_UNITS_ASSUMED_AS_POINTS } from "../pageSize";
import type { PdfRenderer, PdfRenderInput, PdfRenderResult, TextOverlay } from "../types";

// PDFKit's built-in standard-14 font: zero external files, no license risk,
// and its WinAnsi-derived encoding covers accented Latin characters (é, ë).
// It is NOT embedded in the PDF (viewers substitute their own copy) -- fine
// for this experimental overlay, but real typography needs an embedded
// .ttf/.otf before production.
const OVERLAY_FONT = "Helvetica";

function drawOverlay(doc: PDFKit.PDFDocument, overlay: TextOverlay, warnings: string[]): void {
  const font = resolvePdfFontName(overlay.fontFamily ?? OVERLAY_FONT, overlay.fontWeight ?? "normal");

  // Real font metrics, not a guess -- this is what makes the vertical
  // centering below match a browser's flexbox `align-items: center`
  // layout for the same box (see ../textLayout.ts).
  const measureWidth = (text: string, fontSize: number) => {
    doc.font(font).fontSize(fontSize);
    return doc.widthOfString(text);
  };
  const measureLineHeight = (fontSize: number) => {
    doc.font(font).fontSize(fontSize);
    return doc.currentLineHeight(false);
  };

  const layout = resolveFieldLayout(
    {
      x: overlay.x,
      y: overlay.y,
      width: overlay.width,
      height: overlay.height,
      text_align: overlay.align,
      sizing_mode: overlay.sizingMode,
      font_size: overlay.fontSize,
      min_font_size: overlay.minFontSize,
      max_font_size: overlay.maxFontSize,
      max_width: overlay.maxWidth,
    },
    overlay.text,
    { measureWidth, measureLineHeight },
  );

  if (layout.overflowing) {
    warnings.push(
      `Overlay "${overlay.text}" still exceeds its available box even at the most permissive size.`,
    );
  }

  // Horizontal position is computed manually (not PDFKit's `align` option,
  // which requires a wrapping-capable `width` and can wrap text onto a
  // second line) so a name is guaranteed to stay on one line and is never
  // truncated -- if it still doesn't fit, it overflows the box visibly
  // (flagged above) rather than being cut down to "Muhammad".
  const textWidth = measureWidth(overlay.text, layout.fontSize);
  let drawX = layout.x;
  if (overlay.align === "center") {
    drawX = layout.x + layout.width / 2 - textWidth / 2;
  } else if (overlay.align === "right") {
    drawX = layout.x + layout.width - textWidth;
  }

  const drawY = layout.y + layout.textOffsetY;

  doc
    .font(font)
    .fontSize(layout.fontSize)
    .fillColor(overlay.color ?? "#111827")
    .text(overlay.text, drawX, drawY);
}

export const pdfkitSvgRenderer: PdfRenderer = {
  name: "pdfkit+svg-to-pdfkit",

  async render({ svg, width, height, overlays }: PdfRenderInput): Promise<PdfRenderResult> {
    const warnings: string[] = [];

    const doc = new PDFDocument({ size: [width, height], margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    const finished = new Promise<void>((resolve, reject) => {
      doc.on("end", () => resolve());
      doc.on("error", (error: Error) => reject(error));
    });

    // Deliberately NOT wrapped in try/catch: a background SVG that fails to
    // draw is a real fidelity-test failure, not something to paper over by
    // producing a blank/partial "successful" PDF.
    // `width`/`height` here are expected to already be in PDF points, per
    // the documented policy in ../pageSize.ts -- callers pass template
    // dimensions through resolvePdfPageSize() before building this input.
    SVGtoPDF(doc, svg, 0, 0, {
      width,
      height,
      preserveAspectRatio: "xMidYMid meet",
      assumePt: SVG_UNITS_ASSUMED_AS_POINTS,
    });

    for (const overlay of overlays) {
      try {
        drawOverlay(doc, overlay, warnings);
      } catch (error) {
        warnings.push(
          `Overlay "${overlay.text}" failed to draw: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    doc.end();
    await finished;

    return {
      buffer: Buffer.concat(chunks),
      rendererName: pdfkitSvgRenderer.name,
      warnings,
    };
  },
};
