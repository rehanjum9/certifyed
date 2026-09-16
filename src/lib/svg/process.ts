import { sanitizeSvg } from "./sanitize";
import { parseSvgRoot, parseSvgDimensions } from "./parseDimensions";

export interface ProcessedSvg {
  sanitizedSvg: string;
  width: number;
  height: number;
  viewBox: string;
}

export type ProcessSvgOutcome =
  | { ok: true; result: ProcessedSvg }
  | { ok: false; error: string };

/**
 * Full upload pipeline for an untrusted SVG: reject anything that isn't a
 * real SVG document, sanitize it, then resolve its coordinate space. The
 * returned `sanitizedSvg` always carries an explicit viewBox -- if the
 * source only had width/height, one is synthesized here -- so every
 * downstream consumer (editor, PDF renderer) can rely on viewBox always
 * being present and always matching svg_width/svg_height.
 */
export function processUploadedSvg(raw: string): ProcessSvgOutcome {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, error: "The uploaded file is empty." };
  }

  const initial = parseSvgRoot(raw);
  if (!initial) {
    return { ok: false, error: "The file is not a valid SVG (no <svg> root element found)." };
  }

  const sanitizedSvg = sanitizeSvg(raw);

  const sanitized = parseSvgRoot(sanitizedSvg);
  if (!sanitized) {
    return { ok: false, error: "The SVG could not be processed after sanitization." };
  }

  const dims = parseSvgDimensions(sanitized.root);
  if (!dims) {
    return {
      ok: false,
      error: "The SVG has no usable viewBox or width/height, so it can't be placed on a canvas.",
    };
  }

  let finalSvg = sanitizedSvg;
  let viewBox = dims.viewBox;

  if (!viewBox) {
    viewBox = `0 0 ${dims.width} ${dims.height}`;
    sanitized.root.setAttribute("viewBox", viewBox);
    finalSvg = sanitized.root.outerHTML;
  }

  return {
    ok: true,
    result: { sanitizedSvg: finalSvg, width: dims.width, height: dims.height, viewBox },
  };
}
