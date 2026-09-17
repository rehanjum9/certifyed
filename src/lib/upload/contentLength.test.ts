import { describe, expect, it } from "vitest";
import { exceedsDeclaredContentLength } from "./contentLength";

const MAX_BYTES = 1024 * 1024; // 1MB, for readable test numbers

function requestWithContentLength(value: string | null): Request {
  const headers = new Headers();
  if (value !== null) headers.set("content-length", value);
  return new Request("http://x", { method: "POST", headers });
}

describe("exceedsDeclaredContentLength", () => {
  it("does not flag a request within the limit", () => {
    expect(exceedsDeclaredContentLength(requestWithContentLength(String(MAX_BYTES)), MAX_BYTES)).toBe(false);
  });

  it("does not flag a request missing the header entirely -- falls through to the authoritative post-parse check", () => {
    expect(exceedsDeclaredContentLength(requestWithContentLength(null), MAX_BYTES)).toBe(false);
  });

  it("does not flag a request within the multipart overhead allowance just over the raw limit", () => {
    expect(exceedsDeclaredContentLength(requestWithContentLength(String(MAX_BYTES + 1000)), MAX_BYTES)).toBe(false);
  });

  it("flags a request declared far larger than the limit", () => {
    expect(exceedsDeclaredContentLength(requestWithContentLength(String(MAX_BYTES * 10)), MAX_BYTES)).toBe(true);
  });

  it("does not flag an unparseable or negative header value -- treated as untrusted/absent", () => {
    expect(exceedsDeclaredContentLength(requestWithContentLength("not-a-number"), MAX_BYTES)).toBe(false);
    expect(exceedsDeclaredContentLength(requestWithContentLength("-5"), MAX_BYTES)).toBe(false);
  });
});
