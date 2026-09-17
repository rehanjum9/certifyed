export const MAX_SPREADSHEET_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_SPREADSHEET_ROWS = 500;
// P1 hardening: an unbounded column count lets a hostile/malformed upload
// force very wide per-row processing (validation, column-mapping UI,
// campaign_rows.data payloads) with no cap. 100 is far beyond any
// legitimate certificate roster's real field count.
export const MAX_SPREADSHEET_COLUMNS = 100;
