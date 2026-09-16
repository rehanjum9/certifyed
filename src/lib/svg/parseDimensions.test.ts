import { describe, expect, it } from "vitest";
import { parseSvgRoot, parseSvgDimensions } from "./parseDimensions";

function dimsOf(svg: string) {
  const parsed = parseSvgRoot(svg);
  if (!parsed) return null;
  return parseSvgDimensions(parsed.root);
}

describe("parseSvgRoot", () => {
  it("returns null for empty input", () => {
    expect(parseSvgRoot("")).toBeNull();
  });

  it("returns null for non-SVG content", () => {
    expect(parseSvgRoot("<html><body>hi</body></html>")).toBeNull();
    expect(parseSvgRoot("just some text")).toBeNull();
  });

  it("finds the svg root element", () => {
    const parsed = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>`);
    expect(parsed?.root.tagName.toLowerCase()).toBe("svg");
  });
});

describe("parseSvgDimensions", () => {
  it("reads width/height from viewBox", () => {
    expect(dimsOf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 850 600"></svg>`)).toEqual({
      width: 850,
      height: 600,
      viewBox: "0 0 850 600",
    });
  });

  it("falls back to width/height attributes when there is no viewBox", () => {
    expect(dimsOf(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"></svg>`)).toEqual({
      width: 800,
      height: 450,
      viewBox: null,
    });
  });

  it("strips units like px from width/height", () => {
    expect(dimsOf(`<svg xmlns="http://www.w3.org/2000/svg" width="800px" height="450px"></svg>`)).toEqual({
      width: 800,
      height: 450,
      viewBox: null,
    });
  });

  it("returns null when width/height are percentages and there is no viewBox", () => {
    expect(dimsOf(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"></svg>`)).toBeNull();
  });

  it("returns null when there is no viewBox and no dimensions at all", () => {
    expect(dimsOf(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`)).toBeNull();
  });
});
