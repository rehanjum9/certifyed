import { describe, expect, it } from "vitest";
import { parseFontDisplayName, deriveDisplayNameFromFilename, resolveFontDisplayName } from "./parseMetadata";

/**
 * Builds a minimal but structurally valid SFNT font buffer containing only
 * a `name` table with one NameRecord, so parseFontDisplayName can be
 * exercised without a real font file fixture.
 */
function buildSfntWithName(
  fullFontName: string,
  options: { nameID?: number; platformID?: number; encodingID?: number } = {},
): Buffer {
  const nameID = options.nameID ?? 4;
  const platformID = options.platformID ?? 3;
  const encodingID = options.encodingID ?? 1;

  const nameBytes =
    platformID === 3 || platformID === 0
      ? Buffer.from(fullFontName, "utf16le").swap16() // approximate UTF-16BE via swap of LE encoding
      : Buffer.from(fullFontName, "latin1");

  const recordCount = 1;
  const nameTableHeaderSize = 6;
  const recordSize = 12;
  const stringAreaOffset = nameTableHeaderSize + recordCount * recordSize;

  const nameTable = Buffer.alloc(stringAreaOffset + nameBytes.length);
  nameTable.writeUInt16BE(0, 0); // format
  nameTable.writeUInt16BE(recordCount, 2);
  nameTable.writeUInt16BE(stringAreaOffset, 4);
  nameTable.writeUInt16BE(platformID, 6);
  nameTable.writeUInt16BE(encodingID, 8);
  nameTable.writeUInt16BE(0x0409, 10); // languageID (irrelevant here)
  // NameRecord fields start at byte 6 within the record: nameID, length, offset
  nameTable.writeUInt16BE(nameID, 6 + 6);
  nameTable.writeUInt16BE(nameBytes.length, 6 + 8);
  nameTable.writeUInt16BE(0, 6 + 10);
  nameBytes.copy(nameTable, stringAreaOffset);

  const numTables = 1;
  const header = Buffer.alloc(12);
  header.writeUInt32BE(0x00010000, 0); // sfnt version
  header.writeUInt16BE(numTables, 4);

  const tableDirEntry = Buffer.alloc(16);
  tableDirEntry.write("name", 0, "ascii");
  tableDirEntry.writeUInt32BE(0, 4); // checksum, unused
  const nameTableOffset = header.length + tableDirEntry.length;
  tableDirEntry.writeUInt32BE(nameTableOffset, 8);
  tableDirEntry.writeUInt32BE(nameTable.length, 12);

  return Buffer.concat([header, tableDirEntry, nameTable]);
}

describe("parseFontDisplayName", () => {
  it("reads the full font name (nameID 4) from a Windows-platform UTF-16BE record", () => {
    const buffer = buildSfntWithName("My Custom Font");
    expect(parseFontDisplayName(buffer)).toBe("My Custom Font");
  });

  it("falls back to the font family name (nameID 1) when nameID 4 is absent", () => {
    const buffer = buildSfntWithName("Family Only", { nameID: 1 });
    expect(parseFontDisplayName(buffer)).toBe("Family Only");
  });

  it("reads a Macintosh-platform record", () => {
    const buffer = buildSfntWithName("Mac Font", { platformID: 1, encodingID: 0 });
    expect(parseFontDisplayName(buffer)).toBe("Mac Font");
  });

  it("returns null (never throws) for a buffer with no name table", () => {
    const header = Buffer.alloc(12);
    header.writeUInt32BE(0x00010000, 0);
    header.writeUInt16BE(0, 4);
    expect(parseFontDisplayName(header)).toBeNull();
  });

  it("returns null (never throws) for garbage/non-font input", () => {
    expect(parseFontDisplayName(Buffer.from("not a font file at all"))).toBeNull();
    expect(parseFontDisplayName(Buffer.alloc(0))).toBeNull();
  });
});

describe("deriveDisplayNameFromFilename", () => {
  it("strips the extension and replaces separators with spaces", () => {
    expect(deriveDisplayNameFromFilename("my-custom_font.ttf")).toBe("my custom font");
  });

  it("falls back to a generic name for an unusable filename", () => {
    expect(deriveDisplayNameFromFilename(".ttf")).toBe("Custom font");
  });
});

describe("resolveFontDisplayName", () => {
  it("prefers the font's own metadata over the filename", () => {
    const buffer = buildSfntWithName("Real Name");
    expect(resolveFontDisplayName(buffer, "unrelated-filename.ttf")).toBe("Real Name");
  });

  it("falls back to the filename when metadata can't be read", () => {
    expect(resolveFontDisplayName(Buffer.from("garbage"), "my-font.otf")).toBe("my font");
  });
});
