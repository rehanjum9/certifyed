import { describe, expect, it } from "vitest";
import { sanitizeSvg, sanitizeCssText } from "./sanitize";

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

  it("strips an external url() from a <style> block but keeps the rule and local fragment refs", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <style>
        .tracked { background: url(https://evil.example/track.png); }
        .grad { fill: url(#grad1); }
      </style>
      <rect class="tracked" width="10" height="10"/>
    </svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain("evil.example");
    expect(clean).toContain("url(#grad1)");
    expect(clean).toContain(".tracked");
  });

  it("strips @import from a <style> block", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>@import url(https://evil.example/x.css); .a { fill: red; }</style></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toMatch(/@import/i);
    expect(clean).not.toContain("evil.example");
    expect(clean).toContain(".a");
  });

  it("strips an external url() from an inline style attribute but keeps other declarations and local refs", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="10" height="10" style="fill: url(#grad1); background: url('http://evil.example/x.png'); opacity: 0.5;"/></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain("evil.example");
    expect(clean).toContain("url(#grad1)");
    expect(clean).toMatch(/opacity:\s*0\.5/);
  });

  it("strips a protocol-relative url() (still an external request)", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>.a { background: url(//evil.example/x.png); }</style></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain("evil.example");
  });

  it("keeps a safe embedded base64 image referenced via url() in a style attribute", () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="10" height="10" style="background-image: url(${dataUri});"/></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).toContain(dataUri);
  });

  it("does not choke on SMIL-style animation elements referencing local targets", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="10" height="10"><animate attributeName="x" from="0" to="10" dur="1s"/></rect></svg>`;
    const clean = sanitizeSvg(dirty);
    // SMIL is a known event/script-adjacent surface -- either DOMPurify strips
    // it or leaves an inert local-only animation; either way nothing external
    // or executable survives.
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).not.toContain("evil.example");
  });

  it("strips a javascript: reference used as an external image href", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100"><image xlink:href="javascript:alert(1)" width="10" height="10"/></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toMatch(/javascript:/i);
  });

  it("removes foreignObject even when it wraps an external image reference", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><foreignObject width="10" height="10"><img xmlns="http://www.w3.org/1999/xhtml" src="https://evil.example/x.png"/></foreignObject></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean.toLowerCase()).not.toContain("foreignobject");
    expect(clean).not.toContain("evil.example");
  });
});

describe("sanitizeCssText", () => {
  it("neutralizes an absolute http(s) url() while preserving the rest of the declaration", () => {
    expect(sanitizeCssText("background: url(https://evil.example/x.png) no-repeat;")).toBe(
      "background: url() no-repeat;",
    );
  });

  it("neutralizes a protocol-relative url()", () => {
    expect(sanitizeCssText("background: url(//evil.example/x.png);")).toBe("background: url();");
  });

  it("keeps a local fragment url() untouched", () => {
    expect(sanitizeCssText("fill: url(#grad1);")).toBe("fill: url(#grad1);");
  });

  it("keeps a safe base64 data image url() untouched", () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgo=";
    expect(sanitizeCssText(`background: url(${dataUri});`)).toBe(`background: url(${dataUri});`);
  });

  it("strips a bare @import statement", () => {
    expect(sanitizeCssText("@import 'https://evil.example/x.css'; .a { color: red; }")).toBe(" .a { color: red; }");
  });

  it("strips an @import url() statement", () => {
    expect(sanitizeCssText("@import url(https://evil.example/x.css);")).toBe("");
  });

  it("handles multiple url()s in the same declaration independently", () => {
    expect(sanitizeCssText("background: url(#a), url(https://evil.example/b.png);")).toBe(
      "background: url(#a), url();",
    );
  });

  it("handles unquoted url() values", () => {
    expect(sanitizeCssText("background: url(https://evil.example/x.png);")).toBe("background: url();");
  });
});
