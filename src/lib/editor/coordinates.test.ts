import { describe, expect, it } from "vitest";
import {
  screenToSvgLength,
  svgToScreenLength,
  clampAxisPosition,
  clampSize,
  computeFitToScreenScale,
  applyResize,
} from "./coordinates";

describe("screen <-> SVG unit conversion", () => {
  it("converts screen px to SVG units by dividing by scale", () => {
    expect(screenToSvgLength(100, 2)).toBe(50);
    expect(screenToSvgLength(50, 0.5)).toBe(100);
  });

  it("converts SVG units to screen px by multiplying by scale", () => {
    expect(svgToScreenLength(50, 2)).toBe(100);
    expect(svgToScreenLength(100, 0.5)).toBe(50);
  });

  it("round-trips a value through both conversions", () => {
    const scale = 1.37;
    const original = 123.4;
    expect(screenToSvgLength(svgToScreenLength(original, scale), scale)).toBeCloseTo(original, 10);
  });
});

describe("clampAxisPosition", () => {
  const canvasSize = 800;
  const fieldSize = 100;

  it("leaves an in-bounds position unchanged", () => {
    expect(clampAxisPosition(300, fieldSize, canvasSize)).toBe(300);
  });

  it("allows partial overhang off the left edge but not full disappearance", () => {
    const min = clampAxisPosition(-1000, fieldSize, canvasSize);
    expect(min).toBeGreaterThan(-1000);
    expect(min).toBe(-fieldSize * 0.5);
  });

  it("allows partial overhang off the right edge but not full disappearance", () => {
    const max = clampAxisPosition(10000, fieldSize, canvasSize);
    expect(max).toBeLessThan(10000);
    expect(max).toBe(canvasSize - fieldSize * 0.5);
  });
});

describe("clampSize", () => {
  it("keeps sizes at or above the minimum unchanged", () => {
    expect(clampSize(50)).toBe(50);
  });

  it("raises undersized values to the minimum", () => {
    expect(clampSize(1)).toBe(10);
    expect(clampSize(-20)).toBe(10);
  });
});

describe("computeFitToScreenScale", () => {
  it("picks the more constraining dimension", () => {
    // Container is relatively wider than the certificate -> height constrains.
    const scale = computeFitToScreenScale(2000, 500, 800, 600, 1);
    expect(scale).toBeCloseTo(500 / 600, 5);
  });

  it("applies the padding factor", () => {
    const scale = computeFitToScreenScale(800, 600, 800, 600, 0.9);
    expect(scale).toBeCloseTo(0.9, 5);
  });

  it("falls back to 1 for degenerate inputs", () => {
    expect(computeFitToScreenScale(0, 500, 800, 600)).toBe(1);
    expect(computeFitToScreenScale(500, 500, 0, 600)).toBe(1);
  });
});

describe("applyResize", () => {
  const base = { x: 100, y: 100, width: 200, height: 80 };

  it("se handle grows width/height without moving the origin", () => {
    const result = applyResize(base, "se", 20, 10);
    expect(result).toEqual({ x: 100, y: 100, width: 220, height: 90 });
  });

  it("nw handle moves the origin and shrinks/grows in the opposite direction", () => {
    const result = applyResize(base, "nw", 20, -10);
    expect(result).toEqual({ x: 120, y: 90, width: 180, height: 90 });
  });

  it("ne handle adjusts y/height and x-independent width", () => {
    const result = applyResize(base, "ne", 20, 10);
    expect(result).toEqual({ x: 100, y: 110, width: 220, height: 70 });
  });

  it("sw handle adjusts x/width and y-independent height", () => {
    const result = applyResize(base, "sw", -20, 10);
    expect(result).toEqual({ x: 80, y: 100, width: 220, height: 90 });
  });

  it("never shrinks below the minimum field size", () => {
    const result = applyResize(base, "se", -1000, -1000);
    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
  });
});
