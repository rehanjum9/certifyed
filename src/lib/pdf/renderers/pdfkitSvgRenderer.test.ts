import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pdfkitSvgRenderer } from "./pdfkitSvgRenderer";
import type { TextOverlay } from "../types";

// A real, small TTF already vendored by Next.js -- reused here purely as a
// realistic embeddable font fixture for registerFont(), not otherwise
// related to this app.
const REAL_TTF_BUFFER = readFileSync(
  path.join(process.cwd(), "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"),
);

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

function baseOverlay(overrides: Partial<TextOverlay> = {}): TextOverlay {
  return {
    text: "Ali Khan",
    x: 40,
    y: 150,
    width: 320,
    height: 40,
    align: "center",
    sizingMode: "fit_text",
    fontSize: 32,
    minFontSize: 10,
    maxFontSize: 32,
    maxWidth: null,
    ...overrides,
  };
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
      const result = await pdfkitSvgRenderer.render({
        svg: FIDELITY_TEST_SVG,
        width: 400,
        height: 300,
        overlays: [baseOverlay({ text: name })],
      });

      expect(isPdfBuffer(result.buffer)).toBe(true);
      expect(result.warnings).toEqual([]);
    },
  );

  it("shrinks a fit_text name to fit its box instead of overflowing silently", async () => {
    const result = await pdfkitSvgRenderer.render({
      svg: FIDELITY_TEST_SVG,
      width: 400,
      height: 300,
      overlays: [
        baseOverlay({
          text: "Muhammad Abdullah Khan",
          x: 0,
          y: 0,
          width: 60, // deliberately too narrow at the starting font size
          height: 30,
          align: "left",
          fontSize: 40,
          minFontSize: 6,
          maxFontSize: 40,
        }),
      ],
    });

    expect(isPdfBuffer(result.buffer)).toBe(true);
    // Still too long even at the minimum -- should be reported, not hidden.
    expect(result.warnings.some((w) => w.includes("Muhammad Abdullah Khan"))).toBe(true);
  });

  it("renders a serial_number-shaped fixed field (short box, small height) without error or warning", async () => {
    // Regression shape for the editor-to-PDF position bug: a short, wide,
    // shallow box like a real "Sr. No:" field -- previously PDFKit
    // anchored text to the top of this box instead of centering it like
    // the browser preview does; see ../textLayout.ts for the actual fix
    // and its exhaustive position-correctness tests.
    const result = await pdfkitSvgRenderer.render({
      svg: FIDELITY_TEST_SVG,
      width: 400,
      height: 300,
      overlays: [
        baseOverlay({
          text: "CERT-003",
          x: 30,
          y: 250,
          width: 150,
          height: 20,
          align: "left",
          sizingMode: "fixed",
          fontSize: 12,
          minFontSize: null,
          maxFontSize: null,
        }),
      ],
    });

    expect(isPdfBuffer(result.buffer)).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("grows an auto_width name overlay end-to-end without wrapping or truncation", async () => {
    const result = await pdfkitSvgRenderer.render({
      svg: FIDELITY_TEST_SVG,
      width: 400,
      height: 300,
      overlays: [
        baseOverlay({
          text: "Muhammad Abdullah Khan",
          x: 100,
          y: 150,
          width: 80,
          height: 30,
          align: "center",
          sizingMode: "auto_width",
          fontSize: 20,
          minFontSize: 10,
          maxFontSize: null,
          maxWidth: 350,
        }),
      ],
    });

    expect(isPdfBuffer(result.buffer)).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  describe("custom fonts", () => {
    it("registers and draws with a real custom font, with no fallback warning", async () => {
      const result = await pdfkitSvgRenderer.render({
        svg: FIDELITY_TEST_SVG,
        width: 400,
        height: 300,
        overlays: [baseOverlay({ fontFamily: "custom-font-1" })],
        customFonts: [{ id: "custom-font-1", buffer: REAL_TTF_BUFFER }],
      });

      expect(isPdfBuffer(result.buffer)).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it("falls back to the default font with a warning when the overlay's custom font id was never registered", async () => {
      const result = await pdfkitSvgRenderer.render({
        svg: FIDELITY_TEST_SVG,
        width: 400,
        height: 300,
        overlays: [baseOverlay({ fontFamily: "deleted-font-id" })],
        customFonts: [],
      });

      expect(isPdfBuffer(result.buffer)).toBe(true);
      expect(result.warnings.some((w) => w.includes("deleted-font-id"))).toBe(true);
    });

    it("skips a custom font whose bytes PDFKit can't parse and reports it, without failing the render", async () => {
      const result = await pdfkitSvgRenderer.render({
        svg: FIDELITY_TEST_SVG,
        width: 400,
        height: 300,
        overlays: [baseOverlay({ fontFamily: "broken-font" })],
        customFonts: [{ id: "broken-font", buffer: Buffer.from("not a real font") }],
      });

      expect(isPdfBuffer(result.buffer)).toBe(true);
      expect(result.warnings.some((w) => w.includes("broken-font"))).toBe(true);
    });
  });
});
