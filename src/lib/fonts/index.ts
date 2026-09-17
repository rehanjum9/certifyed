export type { FontCategory, BuiltInFont } from "./builtins";
export { BUILTIN_FONTS, DEFAULT_FONT_ID, isBuiltInFontId, getBuiltInFont } from "./builtins";

export type { FontSource, FontDescriptor, CustomFontMeta } from "./types";

export {
  resolveFontDescriptor,
  getCssFontFamily,
  customFontFaceFamily,
  customFontFileUrl,
} from "./registry";
