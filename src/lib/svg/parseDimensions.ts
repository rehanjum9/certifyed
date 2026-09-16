import { JSDOM } from "jsdom";

export interface ParsedSvgRoot {
  root: Element;
}

/**
 * Parses arbitrary text and returns its `<svg>` root element, or null if the
 * content isn't a valid SVG document. Uses HTML foreign-content parsing
 * (not a real XML parser), which means malformed markup degrades gracefully
 * instead of throwing, and DOCTYPE/external-entity declarations are never
 * resolved -- there is no XXE surface here.
 */
export function parseSvgRoot(svgMarkup: string): ParsedSvgRoot | null {
  if (!svgMarkup || svgMarkup.trim().length === 0) {
    return null;
  }

  const dom = new JSDOM(svgMarkup);
  const root = dom.window.document.querySelector("svg");

  if (!root || root.tagName.toLowerCase() !== "svg") {
    return null;
  }

  return { root };
}

export interface SvgDimensions {
  width: number;
  height: number;
  viewBox: string | null;
}

function parseLength(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.endsWith("%")) return null;

  const match = /^-?[0-9]*\.?[0-9]+/.exec(trimmed);
  if (!match) return null;

  const value = parseFloat(match[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Determines the SVG's canonical coordinate space. `viewBox` wins when
 * present since it's the actual coordinate system every future field
 * position must be stored in; width/height attributes are a fallback for
 * exports that omit it. Returns null when neither yields a usable size.
 */
export function parseSvgDimensions(root: Element): SvgDimensions | null {
  const viewBoxAttr = root.getAttribute("viewBox");

  if (viewBoxAttr) {
    const parts = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
    if (
      parts.length === 4 &&
      parts.every((part) => Number.isFinite(part)) &&
      parts[2] > 0 &&
      parts[3] > 0
    ) {
      return { width: parts[2], height: parts[3], viewBox: viewBoxAttr.trim() };
    }
  }

  const width = parseLength(root.getAttribute("width"));
  const height = parseLength(root.getAttribute("height"));

  if (width !== null && height !== null) {
    return { width, height, viewBox: null };
  }

  return null;
}
