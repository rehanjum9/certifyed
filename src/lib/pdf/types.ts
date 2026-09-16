export interface TextOverlay {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  startFontSize: number;
  minFontSize: number;
  align: "left" | "center" | "right";
  /** Defaults to a PDFKit standard-14 font -- see renderers/pdfkitSvgRenderer.ts. */
  fontFamily?: string;
  color?: string;
}

export interface PdfRenderInput {
  /** Already-sanitized SVG markup. Renderers must never receive raw uploads. */
  svg: string;
  width: number;
  height: number;
  overlays: TextOverlay[];
}

export interface PdfRenderResult {
  buffer: Buffer;
  rendererName: string;
  /** Non-fatal issues (e.g. an overlay that couldn't fit or draw). Never used to silently mask a failed background render -- that throws instead. */
  warnings: string[];
}

export interface PdfRenderer {
  name: string;
  render(input: PdfRenderInput): Promise<PdfRenderResult>;
}
