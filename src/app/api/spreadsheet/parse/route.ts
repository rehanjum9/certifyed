import { NextResponse } from "next/server";
import { parseSpreadsheet } from "@/lib/spreadsheet/parse";
import { MAX_SPREADSHEET_UPLOAD_BYTES } from "@/lib/spreadsheet/constants";

/**
 * Stateless parse-and-return: drives the upload/mapping/validate/preview
 * steps of the campaign wizard. Nothing is written to storage or the
 * database here -- that only happens once at POST /api/campaigns, which
 * re-parses the file itself rather than trusting this response.
 */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A spreadsheet file is required." }, { status: 400 });
  }

  const looksLikeSpreadsheet = /\.(csv|xlsx)$/i.test(file.name);
  if (!looksLikeSpreadsheet) {
    return NextResponse.json({ error: "Only .csv or .xlsx files are accepted." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_SPREADSHEET_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${MAX_SPREADSHEET_UPLOAD_BYTES / (1024 * 1024)}MB upload limit.` },
      { status: 400 },
    );
  }

  const buffer = await file.arrayBuffer();
  const outcome = parseSpreadsheet({ buffer, filename: file.name });

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }

  return NextResponse.json({
    headers: outcome.result.headers,
    rows: outcome.result.rows,
    rowCount: outcome.result.rows.length,
  });
}
