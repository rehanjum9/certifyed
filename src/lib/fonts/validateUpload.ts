export const MAX_FONT_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB -- generously covers a real .ttf/.otf, far below anything suspicious
const ALLOWED_EXTENSIONS = new Set(["ttf", "otf"]);
const ALLOWED_MIME_TYPES = new Set([
  "font/ttf",
  "font/otf",
  "font/sfnt",
  "application/x-font-ttf",
  "application/x-font-otf",
  "application/font-sfnt",
  "application/octet-stream", // many browsers/OSes report this for font files -- not on its own disqualifying
]);

// SFNT magic numbers: 0x00010000 (TrueType), 'OTTO' (OpenType w/ CFF),
// 'true'/'typ1' (older Mac TrueType variants). A file that starts with none
// of these is not a real font file regardless of its extension/MIME.
const SFNT_MAGIC_HEX = new Set(["00010000", "4f54544f", "74727565", "74797031"]);

export interface FontUploadValidationInput {
  filename: string;
  mimeType: string | null;
  size: number;
  /** First bytes of the file -- only the first 4 are inspected. */
  headerBytes: Uint8Array;
}

export type FontUploadValidationResult = { ok: true; format: "ttf" | "otf" } | { ok: false; error: string };

function extensionOf(filename: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match ? match[1].toLowerCase() : null;
}

function looksLikeSfnt(headerBytes: Uint8Array): boolean {
  if (headerBytes.length < 4) return false;
  const hex = Array.from(headerBytes.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return SFNT_MAGIC_HEX.has(hex);
}

/**
 * Validates an uploaded font file before it's ever parsed for metadata or
 * written to storage: extension allowlist, size cap, and the file's actual
 * binary signature (so a renamed non-font file is rejected even if its
 * extension/MIME claim otherwise). Pure and synchronous -- no I/O, no
 * Supabase -- so it's fully unit-testable.
 */
export function validateFontUpload(input: FontUploadValidationInput): FontUploadValidationResult {
  if (input.size <= 0) {
    return { ok: false, error: "The uploaded file is empty." };
  }
  if (input.size > MAX_FONT_UPLOAD_BYTES) {
    return { ok: false, error: `Font file exceeds the ${MAX_FONT_UPLOAD_BYTES / (1024 * 1024)}MB upload limit.` };
  }

  const extension = extensionOf(input.filename);
  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
    return { ok: false, error: "Only .ttf or .otf font files are accepted." };
  }

  if (input.mimeType && !ALLOWED_MIME_TYPES.has(input.mimeType.toLowerCase())) {
    return { ok: false, error: "Only .ttf or .otf font files are accepted." };
  }

  if (!looksLikeSfnt(input.headerBytes)) {
    return { ok: false, error: "This file doesn't look like a valid font file and was rejected." };
  }

  return { ok: true, format: extension as "ttf" | "otf" };
}
