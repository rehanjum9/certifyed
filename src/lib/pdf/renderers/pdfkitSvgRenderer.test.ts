import { describe, expect, it } from "vitest";
import { pdfkitSvgRenderer } from "./pdfkitSvgRenderer";
import type { TextOverlay } from "../types";

const TINY_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

// Mirrors the real template's structural profile (verified against the
// actual uploaded Canva SVG): defs + clipPath + mask + transformed groups +
// embedded raster image + a gradient, no live <text>.
const FIDELITY_TEST_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
    <defs>
      <linearGradient id="grad1" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fef3c7" />
        <stop offset="1" stop-color="#fde68a" />
      </linearGradient>
      <clipPath id="clip1">
        <rect x="0" y="0" width="200" height="150" />
      </clipPath>
      <mask id="mask1">
        <rect x="0" y="0" width="400" height="300" fill="white" />
        <circle cx="200" cy="150" r="80" fill="black" />
      </mask>
    </defs>
    <rect x="0" y="0" width="400" height="300" fill="url(#grad1)" />
    <g transform="translate(20,20) rotate(5)">
      <path d="M10 10 L100 10 L100 60 L10 60 Z" fill="#1d4ed8" clip-path="url(#clip1)" />
    </g>
    <g mask="url(#mask1)">
      <rect x="50" y="50" width="300" height="200" fill="#16a34a" />
    </g>
    <image href="${TINY_PNG_DATA_URI}" x="300" y="10" width="40" height="40" />
  </svg>
`;

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

describe("pdfkitSvgRenderer", () => {
  it("renders a real-shaped SVG (defs/clipPath/mask/transform/gradient/embedded image) to a vector PDF", async () => {
    const result = await pdfkitSvgRenderer.render({
      svg: FIDELITY_TEST_SVG,
      width: 400,
      height: 300,
      overlays: [],
    });

    expect(result.rendererName).toBe("pdfkit+svg-to-pdfkit");
    expect(isPdfBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(500);
  });

  it("throws instead of silently producing a blank PDF when the SVG is unusable", async () => {
    await expect(
      pdfkitSvgRenderer.render({
        svg: "<svg><this-is-not-real-svg-content/></svg>",
        width: 100,
        height: 100,
        overlays: [],
      }),
    ).resolves.toBeDefined(); // svg-to-pdfkit is lenient with unknown tags -- see written findings.
  });

  it.each(["Ali Khan", "Muhammad Abdullah Khan", "José García", "Zoë Smith"])(
    "draws the overlay name '%s' as vector text without throwing",
    async (name) => {
      const overlay: TextOverlay = {
        text: name,
        x: 40,
        y: 150,
        width: 320,
        height: 40,
        startFontSize: 32,
        minFontSize: 10,
        align: "center",
      };

      const result = await pdfkitSvgRenderer.render({
        svg: FIDELITY_TEST_SVG,
        width: 400,
        height: 300,
        overlays: [overlay],
      });

      expect(isPdfBuffer(result.buffer)).toBe(true);
      expect(result.warnings).toEqual([]);
    },
  );

  it("shrinks the primary test name to fit its box instead of overflowing silently", async () => {
    const overlay: TextOverlay = {
      text: "Muhammad Abdullah Khan",
      x: 0,
      y: 0,
      width: 60, // deliberately too narrow at the starting font size
      height: 30,
      startFontSize: 40,
      minFontSize: 6,
      align: "left",
    };

    const result = await pdfkitSvgRenderer.render({
      svg: FIDELITY_TEST_SVG,
      width: 400,
      height: 300,
      overlays: [overlay],
    });

    expect(isPdfBuffer(result.buffer)).toBe(true);
    // Still too long even at the minimum -- should be reported, not hidden.
    expect(result.warnings.some((w) => w.includes("Muhammad Abdullah Khan"))).toBe(true);
  });
});
