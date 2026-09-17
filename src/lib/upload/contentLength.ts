// P1 hardening: defense-in-depth only. Content-Length is client-supplied
// and can be absent, wrong, or spoofed, so this must never be treated as
// authoritative -- the real check is always the post-parse byte length of
// the actual extracted file (MAX_SVG_UPLOAD_BYTES / MAX_SPREADSHEET_UPLOAD_BYTES),
// applied after request.formData() has already parsed the body.
//
// The point of checking Content-Length first is narrower: it lets an
// obviously oversized request be rejected *before* calling
// request.formData(), which otherwise buffers/parses the entire multipart
// body into memory regardless of the eventual validated limit.
const MULTIPART_OVERHEAD_ALLOWANCE_BYTES = 64 * 1024; // form field names/boundaries/other fields (e.g. "meta"/"name")

export function exceedsDeclaredContentLength(request: Request, maxFileBytes: number): boolean {
  const raw = request.headers.get("content-length");
  if (!raw) return false; // absent/untrusted -- fall through to the authoritative post-parse check

  const declared = Number(raw);
  if (!Number.isFinite(declared) || declared < 0) return false;

  return declared > maxFileBytes + MULTIPART_OVERHEAD_ALLOWANCE_BYTES;
}
