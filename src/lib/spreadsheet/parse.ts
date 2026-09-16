import * as XLSX from "xlsx";
import { MAX_SPREADSHEET_ROWS } from "./constants";

export interface ParsedSpreadsheet {
  /** Raw header cell text, in column order. May contain blanks/duplicates -- mapping always references column index, never header text. */
  headers: string[];
  /** Data rows only (header excluded), each padded/truncated to headers.length. */
  rows: string[][];
}

export type ParseSpreadsheetOutcome =
  | { ok: true; result: ParsedSpreadsheet }
  | { ok: false; error: string };

/**
 * Parses an uploaded .xlsx or .csv file into a plain header + row-array
 * shape. SheetJS's `sheet_to_json` only ever reads the values already
 * stored in the file (for a formula cell, its last cached computed value)
 * -- it has no formula engine and never evaluates or executes anything,
 * and it doesn't follow external data-connection references either. That's
 * a property of the library, not something this function adds on top.
 */
export function parseSpreadsheet(input: { buffer: ArrayBuffer; filename: string }): ParseSpreadsheetOutcome {
  const isCsv = input.filename.toLowerCase().endsWith(".csv");

  let workbook: XLSX.WorkBook;
  try {
    workbook = isCsv
      ? XLSX.read(new TextDecoder("utf-8").decode(input.buffer), { type: "string" })
      : XLSX.read(input.buffer, { type: "array" });
  } catch {
    return { ok: false, error: "The file could not be read as a spreadsheet." };
  }

  // "For XLSX: parse the first worksheet only."
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { ok: false, error: "The spreadsheet has no worksheets." };
  }
  const sheet = workbook.Sheets[sheetName];

  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  });

  if (raw.length === 0) {
    return { ok: false, error: "The spreadsheet is empty." };
  }

  const headers = (raw[0] ?? []).map((cell) => String(cell ?? "").trim());
  const hasUsableHeader = headers.some((h) => h.length > 0);
  if (!hasUsableHeader) {
    return { ok: false, error: "The spreadsheet has no usable header row." };
  }

  let dataRows: string[][] = raw
    .slice(1)
    .map((row) => headers.map((_, columnIndex) => String(row[columnIndex] ?? "").trim()));

  // Trim fully-blank *trailing* rows (a common export artifact). Blank rows
  // that occur before the last real row are preserved so validation can
  // flag them explicitly rather than silently dropping data.
  let lastNonBlank = -1;
  dataRows.forEach((row, index) => {
    if (row.some((cell) => cell.length > 0)) lastNonBlank = index;
  });
  dataRows = dataRows.slice(0, lastNonBlank + 1);

  if (dataRows.length === 0) {
    return { ok: false, error: "The spreadsheet has a header row but no data rows." };
  }

  if (dataRows.length > MAX_SPREADSHEET_ROWS) {
    return {
      ok: false,
      error: `The spreadsheet has ${dataRows.length} rows, which exceeds the limit of ${MAX_SPREADSHEET_ROWS}.`,
    };
  }

  return { ok: true, result: { headers, rows: dataRows } };
}
