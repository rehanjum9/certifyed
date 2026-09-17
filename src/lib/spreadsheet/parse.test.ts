import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseSpreadsheet } from "./parse";
import { MAX_SPREADSHEET_ROWS, MAX_SPREADSHEET_COLUMNS } from "./constants";

function csvBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function xlsxBuffer(aoa: unknown[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const out = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return out as ArrayBuffer;
}

describe("parseSpreadsheet (CSV)", () => {
  it("parses headers and rows, preserving row order", () => {
    const csv = "Name,Email\nAli Khan,ali@example.com\nZoe Smith,zoe@example.com\n";
    const outcome = parseSpreadsheet({ buffer: csvBuffer(csv), filename: "roster.csv" });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.headers).toEqual(["Name", "Email"]);
    expect(outcome.result.rows).toEqual([
      ["Ali Khan", "ali@example.com"],
      ["Zoe Smith", "zoe@example.com"],
    ]);
  });

  it("rejects a completely empty file", () => {
    const outcome = parseSpreadsheet({ buffer: csvBuffer(""), filename: "empty.csv" });
    expect(outcome.ok).toBe(false);
  });

  it("rejects a file with no usable header row", () => {
    const outcome = parseSpreadsheet({ buffer: csvBuffer(",,\n"), filename: "blank-header.csv" });
    expect(outcome.ok).toBe(false);
  });

  it("rejects a header-only file with no data rows", () => {
    const outcome = parseSpreadsheet({ buffer: csvBuffer("Name,Email\n"), filename: "header-only.csv" });
    expect(outcome.ok).toBe(false);
  });

  it("trims fully-blank trailing rows but keeps blank rows in the middle", () => {
    const csv = "Name,Email\nAli Khan,ali@example.com\n,\nZoe Smith,zoe@example.com\n,\n,\n";
    const outcome = parseSpreadsheet({ buffer: csvBuffer(csv), filename: "roster.csv" });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.rows).toHaveLength(3);
    expect(outcome.result.rows[1]).toEqual(["", ""]);
  });

  it("rejects a spreadsheet exceeding the row limit", () => {
    const rows = Array.from({ length: MAX_SPREADSHEET_ROWS + 1 }, (_, i) => `Person ${i},p${i}@example.com`);
    const csv = `Name,Email\n${rows.join("\n")}\n`;
    const outcome = parseSpreadsheet({ buffer: csvBuffer(csv), filename: "big.csv" });
    expect(outcome.ok).toBe(false);
  });

  it("rejects a spreadsheet exceeding the column limit", () => {
    const headerCells = Array.from({ length: MAX_SPREADSHEET_COLUMNS + 1 }, (_, i) => `Col${i}`);
    const dataCells = headerCells.map((_, i) => `v${i}`);
    const csv = `${headerCells.join(",")}\n${dataCells.join(",")}\n`;
    const outcome = parseSpreadsheet({ buffer: csvBuffer(csv), filename: "wide.csv" });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain(String(MAX_SPREADSHEET_COLUMNS));
  });

  it("accepts a spreadsheet exactly at the column limit", () => {
    const headerCells = Array.from({ length: MAX_SPREADSHEET_COLUMNS }, (_, i) => `Col${i}`);
    const dataCells = headerCells.map((_, i) => `v${i}`);
    const csv = `${headerCells.join(",")}\n${dataCells.join(",")}\n`;
    const outcome = parseSpreadsheet({ buffer: csvBuffer(csv), filename: "wide.csv" });
    expect(outcome.ok).toBe(true);
  });

  it("pads ragged rows to the header width", () => {
    const csv = "Name,Email,Course\nAli Khan,ali@example.com\n";
    const outcome = parseSpreadsheet({ buffer: csvBuffer(csv), filename: "ragged.csv" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.rows[0]).toEqual(["Ali Khan", "ali@example.com", ""]);
  });
});

describe("parseSpreadsheet (XLSX)", () => {
  it("parses the first worksheet of a real .xlsx file", () => {
    const buffer = xlsxBuffer([
      ["Name", "Email", "Serial Number"],
      ["Ali Khan", "ali@example.com", "CERT-001"],
      ["Zoe Smith", "zoe@example.com", "CERT-002"],
    ]);

    const outcome = parseSpreadsheet({ buffer, filename: "roster.xlsx" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.headers).toEqual(["Name", "Email", "Serial Number"]);
    expect(outcome.result.rows).toEqual([
      ["Ali Khan", "ali@example.com", "CERT-001"],
      ["Zoe Smith", "zoe@example.com", "CERT-002"],
    ]);
  });

  it("rejects an xlsx file with only a header row", () => {
    const buffer = xlsxBuffer([["Name", "Email"]]);
    const outcome = parseSpreadsheet({ buffer, filename: "header-only.xlsx" });
    expect(outcome.ok).toBe(false);
  });
});
