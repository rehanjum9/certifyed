import type { TextOverlay } from "./types";

// Fixed set requested for the Phase 2.5 fidelity spike: one "realistic"
// primary name, plus three strings chosen to exercise length variance and
// accented Latin characters (é, í, ë) through the same auto-fit + font path.
export const PRIMARY_TEST_NAME = "Muhammad Abdullah Khan";
export const AUTO_FIT_TEST_STRINGS = ["Ali Khan", "José García", "Zoë Smith"];

/**
 * Placeholder box positions only -- not calibrated to any specific
 * certificate layout. Real placement is the field editor's job (a later
 * phase); this spike exists to prove the render + auto-fit mechanism works
 * against a real Canva export, not to find the "correct" spot for a name.
 */
export function buildTestOverlays(width: number, height: number): TextOverlay[] {
  const primary: TextOverlay = {
    text: PRIMARY_TEST_NAME,
    x: width * 0.15,
    y: height * 0.52,
    width: width * 0.7,
    height: 60,
    align: "center",
    sizingMode: "fit_text",
    fontSize: 36,
    minFontSize: 14,
    maxFontSize: 36,
    maxWidth: null,
    color: "#111827",
  };

  const stripLineHeight = 22;
  const stripY = height - 16 - AUTO_FIT_TEST_STRINGS.length * stripLineHeight;

  const strip: TextOverlay[] = AUTO_FIT_TEST_STRINGS.map((text, index) => ({
    text,
    x: 20,
    y: stripY + index * stripLineHeight,
    width: width - 40,
    height: stripLineHeight,
    align: "left",
    sizingMode: "fit_text",
    fontSize: 16,
    minFontSize: 8,
    maxFontSize: 16,
    maxWidth: null,
    color: "#4338ca",
  }));

  return [primary, ...strip];
}
