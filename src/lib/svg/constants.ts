export const MAX_SVG_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB, safely under Vercel's default request body ceiling

/** Upper bound on a template's viewBox/width/height (in SVG user units). Comfortably covers any realistic certificate design while preventing a template from making every future PDF-generation batch attempt an absurdly large page. */
export const MAX_SVG_DIMENSION = 20000;
