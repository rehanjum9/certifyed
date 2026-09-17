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

// CSS text (a `style` attribute's value, or a `<style>` element's content)
// can also carry `url(...)`/`@import` -- a vector DOMPurify's SVG profile
// does not scan, since it only inspects attribute/tag names, not CSS text.
// A same-document fragment (`url(#gradientId)`) or an embedded raster image
// is safe and left alone; anything else that would make the browser fetch a
// network resource when this SVG is inlined is neutralized.
const CSS_URL_PATTERN = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;
const CSS_IMPORT_PATTERN = /@import[^;]*;?/gi;

function isSafeCssUrlValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("#") || SAFE_DATA_IMAGE_URI.test(trimmed);
}

/**
 * Strips `@import` rules and neutralizes any `url(...)` reference that
 * isn't a local fragment or a safe embedded data image -- used for both
 * `style` attribute values and `<style>` element text content.
 */
export function sanitizeCssText(cssText: string): string {
  return cssText.replace(CSS_IMPORT_PATTERN, "").replace(CSS_URL_PATTERN, (match, _quote, value) => {
    return isSafeCssUrlValue(value) ? match : "url()";
  });
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
      return;
    }
    if (attrName === "style") {
      data.attrValue = sanitizeCssText(data.attrValue);
    }
  });

  purify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName === "style" && node.textContent) {
      node.textContent = sanitizeCssText(node.textContent);
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
