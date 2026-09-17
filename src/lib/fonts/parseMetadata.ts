// Minimal, dependency-free SFNT 'name' table reader. Enough to pull a
// real display name (item 10: "do not trust the uploaded filename") out of
// a .ttf/.otf without pulling in a full font-parsing library for one field.
// Deliberately best-effort: any parsing failure (truncated/unusual font,
// table layout this doesn't handle) falls back to a cleaned-up filename
// rather than rejecting the upload.

interface NameRecord {
  platformID: number;
  encodingID: number;
  nameID: number;
  length: number;
  offset: number;
}

const NAME_ID_FULL_FONT_NAME = 4;
const NAME_ID_FONT_FAMILY = 1;

function readUint16(buffer: Uint8Array, offset: number): number {
  return (buffer[offset] << 8) | buffer[offset + 1];
}

function readUint32(buffer: Uint8Array, offset: number): number {
  return buffer[offset] * 0x1000000 + (buffer[offset + 1] << 16) + (buffer[offset + 2] << 8) + buffer[offset + 3];
}

function decodeNameRecordBytes(bytes: Uint8Array, platformID: number, encodingID: number): string | null {
  try {
    if (platformID === 3 || platformID === 0) {
      // Windows or Unicode platform -- UTF-16BE.
      return new TextDecoder("utf-16be").decode(bytes);
    }
    if (platformID === 1 && encodingID === 0) {
      // Macintosh, Roman encoding -- close enough to Windows-1252 for
      // ordinary Latin font names.
      return new TextDecoder("windows-1252").decode(bytes);
    }
  } catch {
    return null;
  }
  return null;
}

function findNameTable(buffer: Uint8Array): { offset: number } | null {
  if (buffer.length < 12) return null;
  const numTables = readUint16(buffer, 4);

  for (let i = 0; i < numTables; i++) {
    const recordOffset = 12 + i * 16;
    if (recordOffset + 16 > buffer.length) break;
    const tag = String.fromCharCode(
      buffer[recordOffset],
      buffer[recordOffset + 1],
      buffer[recordOffset + 2],
      buffer[recordOffset + 3],
    );
    if (tag === "name") {
      return { offset: readUint32(buffer, recordOffset + 8) };
    }
  }
  return null;
}

/**
 * Reads the font's own "full font name" (falling back to "font family")
 * from its SFNT `name` table. Returns null (never throws) if the buffer
 * isn't a recognizable SFNT font or the table can't be read.
 */
export function parseFontDisplayName(buffer: Uint8Array): string | null {
  try {
    const nameTable = findNameTable(buffer);
    if (!nameTable) return null;

    const tableOffset = nameTable.offset;
    if (tableOffset + 6 > buffer.length) return null;

    const count = readUint16(buffer, tableOffset + 2);
    const stringAreaOffset = tableOffset + readUint16(buffer, tableOffset + 4);

    const records: NameRecord[] = [];
    for (let i = 0; i < count; i++) {
      const recordOffset = tableOffset + 6 + i * 12;
      if (recordOffset + 12 > buffer.length) break;
      records.push({
        platformID: readUint16(buffer, recordOffset),
        encodingID: readUint16(buffer, recordOffset + 2),
        nameID: readUint16(buffer, recordOffset + 6),
        length: readUint16(buffer, recordOffset + 8),
        offset: readUint16(buffer, recordOffset + 10),
      });
    }

    function findName(nameID: number): string | null {
      // Prefer Windows/Unicode platform records (most reliable UTF-16BE decode).
      const candidates = [
        ...records.filter((r) => r.nameID === nameID && (r.platformID === 3 || r.platformID === 0)),
        ...records.filter((r) => r.nameID === nameID),
      ];
      for (const record of candidates) {
        const start = stringAreaOffset + record.offset;
        const end = start + record.length;
        if (end > buffer.length) continue;
        const decoded = decodeNameRecordBytes(buffer.slice(start, end), record.platformID, record.encodingID);
        if (decoded && decoded.trim().length > 0) return decoded.trim();
      }
      return null;
    }

    return findName(NAME_ID_FULL_FONT_NAME) ?? findName(NAME_ID_FONT_FAMILY);
  } catch {
    return null;
  }
}

/** Fallback when the font's own metadata can't be read: a cleaned-up version of the filename, never the raw filename verbatim. */
export function deriveDisplayNameFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[^./\\]+$/, "");
  const cleaned = withoutExtension.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : "Custom font";
}

export function resolveFontDisplayName(buffer: Uint8Array, originalFilename: string): string {
  return parseFontDisplayName(buffer) ?? deriveDisplayNameFromFilename(originalFilename);
}
