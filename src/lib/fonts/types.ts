import type { FontCategory } from "./builtins";

export type FontSource = "built-in" | "custom";

/**
 * The one shared font model (item 1 of the font-system spec): built-in and
 * custom fonts both resolve to this same shape, used identically by the
 * certificate editor, recipient preview, and the production PDF renderer.
 */
export interface FontDescriptor {
  /** Stable id -- a PDFKit standard-14 name for a built-in font, or a fonts.id UUID for a custom one. This is exactly what's stored in template_fields.font_family. */
  id: string;
  displayName: string;
  source: FontSource;
  category?: FontCategory;
  supportsBold: boolean;
  /** CSS `font-family` value to use in the browser (editor/preview). */
  cssFontFamily: string;
  /** Custom fonts only: the id under which the browser must register a FontFace before this descriptor's cssFontFamily will actually render/measure correctly. */
  fontFaceFamily?: string;
  /** Custom fonts only: server-mediated URL the browser fetches the font bytes from (never a direct Supabase Storage URL). */
  browserFontUrl?: string;
  /** Built-in fonts only: the PDFKit standard-14 name to call doc.font() with directly. */
  pdfStandardName?: string;
  /** Custom fonts only: private Storage path the PDF renderer downloads and registers via doc.registerFont(). */
  pdfStoragePath?: string;
}

/** What the fonts API/registry works with for one custom font row -- never includes the file bytes themselves. */
export interface CustomFontMeta {
  id: string;
  displayName: string;
  originalFilename: string;
  format: "ttf" | "otf";
  fontWeight: "normal" | "bold";
  fileSize: number;
  createdAt: string;
}
