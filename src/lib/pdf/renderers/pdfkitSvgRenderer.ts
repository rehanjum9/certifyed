import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { fitFontSize } from "../fitText";
import type { PdfRenderer, PdfRenderInput, PdfRenderResult, TextOverlay } from "../types";

// PDFKit's built-in standard-14 font: zero external files, no license risk,
// and its WinAnsi-derived encoding covers accented Latin characters (é, ë).
// It is NOT embedded in the PDF (viewers substitute their own copy) -- fine
// for this experimental overlay, but real typography needs an embedded
// .ttf/.otf before production.
const OVERLAY_FONT = "Helvetica";

function drawOverlay(doc: PDFKit.PDFDocument, overlay: TextOverlay, warnings: string[]): void {
  const font = overlay.fontFamily ?? OVERLAY_FONT;
  doc.font(font);

  const measure = (text: string, fontSize: number) => {
    doc.fontSize(fontSize);
    return doc.widthOfString(text);
  };

  const fontSize = fitFontSize({
    text: overlay.text,
    maxWidth: overlay.width,
    startFontSize: overlay.startFontSize,
    minFontSize: overlay.minFontSize,
    measure,
  });

  if (measure(overlay.text, fontSize) > overlay.width) {
    warnings.push(
      `Overlay "${overlay.text}" still exceeds its ${overlay.width}pt-wide box at the ` +
        `minimum font size (${overlay.minFontSize}pt).`,
    );
  }

  doc
    .font(font)
    .fontSize(fontSize)
    .fillColor(overlay.color ?? "#111827")
    .text(overlay.text, overlay.x, overlay.y, {
      width: overlay.width,
      height: overlay.height,
      align: overlay.align,
    });
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
    SVGtoPDF(doc, svg, 0, 0, {
      width,
      height,
      preserveAspectRatio: "xMidYMid meet",
      assumePt: true,
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
