// Small, deliberately short list: fonts we can legally ship with zero
// licensing risk because nothing is bundled -- each `id` is exactly
// PDFKit's standard-14 font name, so the production PDF renderer calls
// doc.font(id) directly with no translation layer, and the browser side
// maps the same id to a web-safe CSS stack. One category each (sans
// serif/serif/monospace) is deliberately all this ships with; more can be
// added later by extending this array without touching anything else.
export type FontCategory = "sans-serif" | "serif" | "monospace";

export interface BuiltInFont {
  /** Stored in template_fields.font_family; also a valid PDFKit standard-14 font name. */
  id: string;
  label: string;
  category: FontCategory;
  /** Browser-only preview stack; never persisted. */
  cssFontFamily: string;
  supportsBold: boolean;
}

export const BUILTIN_FONTS: BuiltInFont[] = [
  {
    id: "Helvetica",
    label: "Helvetica (sans-serif)",
    category: "sans-serif",
    cssFontFamily: "Helvetica, Arial, sans-serif",
    supportsBold: true,
  },
  {
    id: "Times-Roman",
    label: "Times New Roman (serif)",
    category: "serif",
    cssFontFamily: "'Times New Roman', Times, serif",
    supportsBold: true,
  },
  {
    id: "Courier",
    label: "Courier (monospace)",
    category: "monospace",
    cssFontFamily: "'Courier New', Courier, monospace",
    supportsBold: true,
  },
];

export const DEFAULT_FONT_ID = BUILTIN_FONTS[0].id;

export function isBuiltInFontId(fontId: string): boolean {
  return BUILTIN_FONTS.some((font) => font.id === fontId);
}

export function getBuiltInFont(fontId: string): BuiltInFont | undefined {
  return BUILTIN_FONTS.find((font) => font.id === fontId);
}
