import { pdfkitSvgRenderer } from "./renderers/pdfkitSvgRenderer";
import type { PdfRenderer } from "./types";

// Renderer-specific code lives entirely behind the PdfRenderer interface, so
// evaluating a different renderer later means adding a file here and
// registering it -- not touching the API route or the field/overlay model.
const RENDERERS: Record<string, PdfRenderer> = {
  [pdfkitSvgRenderer.name]: pdfkitSvgRenderer,
};

const DEFAULT_RENDERER = pdfkitSvgRenderer.name;

export function getPdfRenderer(name: string = DEFAULT_RENDERER): PdfRenderer {
  const renderer = RENDERERS[name];
  if (!renderer) {
    throw new Error(`Unknown PDF renderer: "${name}"`);
  }
  return renderer;
}

export type { PdfRenderer, PdfRenderInput, PdfRenderResult, TextOverlay } from "./types";
