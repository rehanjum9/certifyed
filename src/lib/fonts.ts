// Small, deliberately short list: fonts we can legally ship with zero
// licensing risk because nothing is bundled -- these are browser web-safe
// fonts for editor preview, and their `name` values are exactly PDFKit's
// standard-14 font names so the same string is reusable by the Phase 2.5
// PdfRenderer/TextOverlay without a translation layer. Add more (including
// real embedded open fonts) later by extending this array; nothing else
// needs to change.
export interface FontOption {
  /** Stored in template_fields.font_family; also a valid PDFKit standard font name. */
  name: string;
  label: string;
  /** Browser-only preview stack; never persisted. */
  cssFontFamily: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { name: "Helvetica", label: "Helvetica (sans-serif)", cssFontFamily: "Helvetica, Arial, sans-serif" },
  { name: "Times-Roman", label: "Times New Roman (serif)", cssFontFamily: "'Times New Roman', Times, serif" },
  { name: "Courier", label: "Courier (monospace)", cssFontFamily: "'Courier New', Courier, monospace" },
];

export const DEFAULT_FONT_NAME = FONT_OPTIONS[0].name;

export function getCssFontFamily(fontName: string): string {
  return FONT_OPTIONS.find((f) => f.name === fontName)?.cssFontFamily ?? FONT_OPTIONS[0].cssFontFamily;
}
