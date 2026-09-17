import { BUILTIN_FONTS, DEFAULT_FONT_ID, getBuiltInFont, isBuiltInFontId } from "./builtins";
import type { CustomFontMeta, FontDescriptor } from "./types";

export { DEFAULT_FONT_ID, isBuiltInFontId };

/**
 * The exact CSS font-family name a custom font is registered under (both
 * when the browser adds its FontFace and when the editor/preview reference
 * it via getCssFontFamily/resolveFontDescriptor) -- one function, so the
 * registration side and the consumption side can never drift apart.
 */
export function customFontFaceFamily(fontId: string): string {
  return `certifyed-font-${fontId}`;
}

/** The server-mediated URL the browser fetches a custom font's bytes from -- never a direct Storage URL, never exposes the service-role key. */
export function customFontFileUrl(fontId: string): string {
  return `/api/fonts/${fontId}/file`;
}

/**
 * Resolves a stored font id (template_fields.font_family) to the one
 * shared FontDescriptor, used identically by the editor, recipient
 * preview, and PDF renderer. An id that matches neither a built-in nor a
 * known custom font (e.g. a custom font that was since deleted) falls back
 * to the default built-in -- the same "never throw, never blank-render"
 * fallback behavior pre-existing fields without a configured font already
 * relied on.
 */
export function resolveFontDescriptor(fontId: string, customFonts: CustomFontMeta[] = []): FontDescriptor {
  const builtin = getBuiltInFont(fontId);
  if (builtin) {
    return {
      id: builtin.id,
      displayName: builtin.label,
      source: "built-in",
      category: builtin.category,
      supportsBold: builtin.supportsBold,
      cssFontFamily: builtin.cssFontFamily,
      pdfStandardName: builtin.id,
    };
  }

  const custom = customFonts.find((font) => font.id === fontId);
  if (custom) {
    const fontFaceFamily = customFontFaceFamily(custom.id);
    return {
      id: custom.id,
      displayName: custom.displayName,
      source: "custom",
      supportsBold: custom.fontWeight === "bold",
      cssFontFamily: `'${fontFaceFamily}', sans-serif`,
      fontFaceFamily,
      browserFontUrl: customFontFileUrl(custom.id),
    };
  }

  // Unknown id (e.g. a since-deleted custom font) -- fall back rather than
  // fail an entire template/row over one stale reference.
  return resolveFontDescriptor(DEFAULT_FONT_ID, customFonts);
}

/** Just the CSS family string for a font id -- what fieldTextStyle.ts (browser measurement/rendering) actually needs. */
export function getCssFontFamily(fontId: string, customFonts: CustomFontMeta[] = []): string {
  return resolveFontDescriptor(fontId, customFonts).cssFontFamily;
}

export const BUILTIN_FONT_LIST = BUILTIN_FONTS;
