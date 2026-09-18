import type { SizingMode, TextAlign } from "./textLayout";

export interface TextOverlay {
  text: string;
  /** Saved/base field box (SVG viewBox units) -- the canonical box from Phase 3. Renderers resolve the actual drawn box/font from this via resolveFieldLayout, never from pre-derived values, so editor/preview/PDF can never drift apart. */
  x: number;
  y: number;
  width: number;
  height: number;
  align: TextAlign;
  sizingMode: SizingMode;
  /** Preferred/base font size (fixed and auto_width's ceiling; ignored by fit_text in favor of maxFontSize). */
  fontSize: number;
  minFontSize: number | null;
  maxFontSize: number | null;
  /** Growth ceiling for auto_width; ignored by other modes. */
  maxWidth: number | null;
  /** Defaults to a PDFKit standard-14 font -- see renderers/pdfkitSvgRenderer.ts. */
  fontFamily?: string;
  /** Defaults to "normal". Resolved to a concrete PDFKit font name (e.g. "Helvetica-Bold") by the renderer. */
  fontWeight?: "normal" | "bold";
  color?: string;
}

export interface PdfRenderInput {
  /** Already-sanitized SVG markup. Renderers must never receive raw uploads. */
  svg: string;
  width: number;
  height: number;
  overlays: TextOverlay[];
  /** Custom font bytes for every custom font id this batch's overlays may reference, pre-downloaded by the caller (see lib/fonts/customFonts.ts#loadCustomFontsForFields) -- renderers never fetch Storage themselves. */
  customFonts?: { id: string; buffer: Buffer }[];
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
