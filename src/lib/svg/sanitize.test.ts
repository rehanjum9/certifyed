import { describe, expect, it } from "vitest";
import { sanitizeSvg } from "./sanitize";

describe("sanitizeSvg", () => {
  it("removes script elements", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><script>alert(1)</script><rect width="10" height="10"/></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean.toLowerCase()).not.toContain("<script");
    expect(clean).toContain("<rect");
  });

  it("removes event handler attributes", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="10" height="10" onclick="alert(1)" onload="alert(2)"/></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/onload/i);
  });

  it("strips javascript: URLs", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><a href="javascript:alert(1)"><rect width="10" height="10"/></a></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toMatch(/javascript:/i);
  });

  it("removes foreignObject content entirely", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean.toLowerCase()).not.toContain("foreignobject");
    expect(clean.toLowerCase()).not.toContain("<script");
  });

  it("strips external href references but keeps same-document fragment references", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">
      <defs><linearGradient id="g1"><stop offset="0" stop-color="red"/></linearGradient></defs>
      <use xlink:href="#g1"/>
      <image xlink:href="http://evil.example/tracker.png" width="10" height="10"/>
    </svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).toContain('xlink:href="#g1"');
    expect(clean).not.toContain("evil.example");
  });

  it("keeps embedded base64 raster images", () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100"><image xlink:href="${dataUri}" width="10" height="10"/></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).toContain(dataUri);
  });

  it("preserves legitimate structural elements and attributes", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
      <defs>
        <linearGradient id="grad1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
        <clipPath id="clip1"><rect width="50" height="50"/></clipPath>
        <mask id="mask1"><rect width="200" height="100" fill="white"/></mask>
      </defs>
      <g transform="translate(10,10)" opacity="0.5">
        <rect width="50" height="50" fill="url(#grad1)" clip-path="url(#clip1)" mask="url(#mask1)"/>
      </g>
      <style>.title { font-family: Arial; }</style>
    </svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).toContain("<defs");
    expect(clean).toContain("linearGradient");
    expect(clean).toContain("clipPath");
    expect(clean).toContain("<mask");
    expect(clean).toContain('transform="translate(10,10)"');
    expect(clean).toContain('opacity="0.5"');
    expect(clean).toContain("<style");
  });
});
