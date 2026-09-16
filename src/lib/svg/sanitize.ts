import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";

// SVG can carry references (`href`/`xlink:href`/`src`) to other resources.
// Legitimate Canva exports only ever reference the *same document* (e.g.
// `<use href="#icon">`, `fill="url(#gradient)"`) or embed raster logos as
// base64 data URIs. Anything else -- external URLs, javascript: URLs -- has
// no legitimate use here and is a data-exfiltration/tracking or script risk,
// so it's stripped regardless of what DOMPurify's own URL allowlist permits.
const URI_ATTRS = new Set(["href", "xlink:href", "src"]);
const SAFE_DATA_IMAGE_URI = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i;

function isSafeUriValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("#") || SAFE_DATA_IMAGE_URI.test(trimmed);
}

/**
 * Sanitizes an untrusted SVG document for safe storage and safe inline
 * rendering (dangerouslySetInnerHTML) later. Removes active content
 * (script, event handlers, foreignObject, external references) while
 * preserving the vector features real design-tool exports rely on: defs,
 * gradients, clipPath, masks, use, groups, transforms, opacity, and
 * embedded <style> blocks.
 */
export function sanitizeSvg(rawSvg: string): string {
  const { window } = new JSDOM("");
  const purify = createDOMPurify(window);

  purify.addHook("uponSanitizeAttribute", (_node, data) => {
    const attrName = data.attrName.toLowerCase();
    if (URI_ATTRS.has(attrName) && !isSafeUriValue(data.attrValue)) {
      data.keepAttr = false;
    }
  });

  const sanitized = purify.sanitize(rawSvg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    // DOMPurify's SVG profile doesn't reliably keep `use` and its href in
    // every version; both are explicitly required for gradients/clipPaths/
    // masks referenced by id, and for reusable symbol-based artwork.
    ADD_TAGS: ["style", "use"],
    ADD_ATTR: ["xlink:href", "href"],
    FORBID_TAGS: ["script", "foreignObject", "foreignobject", "iframe", "embed", "object"],
    WHOLE_DOCUMENT: false,
  });

  purify.removeAllHooks();
  return sanitized;
}
