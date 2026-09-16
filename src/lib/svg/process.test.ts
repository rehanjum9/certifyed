import { describe, expect, it } from "vitest";
import { processUploadedSvg } from "./process";

describe("processUploadedSvg", () => {
  it("rejects empty input", () => {
    const outcome = processUploadedSvg("");
    expect(outcome.ok).toBe(false);
  });

  it("rejects content with no svg root", () => {
    const outcome = processUploadedSvg("<html><body>not an svg</body></html>");
    expect(outcome.ok).toBe(false);
  });

  it("rejects an svg with no usable viewBox or dimensions", () => {
    const outcome = processUploadedSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>`,
    );
    expect(outcome.ok).toBe(false);
  });

  it("accepts a valid svg, sanitizes it, and reports its dimensions", () => {
    const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><script>alert(1)</script><rect width="10" height="10" onclick="x()"/></svg>`;
    const outcome = processUploadedSvg(raw);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.width).toBe(100);
    expect(outcome.result.height).toBe(50);
    expect(outcome.result.viewBox).toBe("0 0 100 50");
    expect(outcome.result.sanitizedSvg.toLowerCase()).not.toContain("<script");
    expect(outcome.result.sanitizedSvg).not.toMatch(/onclick/i);
  });

  it("synthesizes a viewBox when only width/height are present", () => {
    const raw = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="10" height="10"/></svg>`;
    const outcome = processUploadedSvg(raw);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.viewBox).toBe("0 0 400 300");
    expect(outcome.result.sanitizedSvg).toContain('viewBox="0 0 400 300"');
  });
});
