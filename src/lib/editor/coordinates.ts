// Pure coordinate math for the field editor. Nothing here touches the DOM --
// screen pixels only ever enter as plain numbers (pointer deltas), and
// everything the editor persists is in the template's own SVG viewBox
// units. `scale` throughout means "CSS pixels per viewBox unit".

export const MIN_FIELD_SIZE = 10;
/** How far a field may hang off any canvas edge, as a fraction of its own size. */
const OVERHANG_RATIO = 0.5;

export function screenToSvgLength(px: number, scale: number): number {
  return px / scale;
}

export function svgToScreenLength(units: number, scale: number): number {
  return units * scale;
}

/**
 * Clamps a field's position on one axis so it can partially overhang the
 * canvas edge (common in design tools) but never drift arbitrarily far off.
 */
export function clampAxisPosition(value: number, size: number, canvasSize: number): number {
  const min = -size * OVERHANG_RATIO;
  const max = canvasSize - size * (1 - OVERHANG_RATIO);
  return Math.min(Math.max(value, min), max);
}

export function clampSize(size: number, min: number = MIN_FIELD_SIZE): number {
  return Math.max(size, min);
}

/** Scale (CSS px per viewBox unit) that fits the whole certificate inside a container. */
export function computeFitToScreenScale(
  containerWidth: number,
  containerHeight: number,
  svgWidth: number,
  svgHeight: number,
  padding = 0.92,
): number {
  if (svgWidth <= 0 || svgHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return 1;
  }
  return Math.min(containerWidth / svgWidth, containerHeight / svgHeight) * padding;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ResizeHandle = "nw" | "ne" | "sw" | "se";

/**
 * Applies a resize drag (deltas already converted to SVG units) from one
 * corner handle, keeping the opposite corner fixed. Width/height are
 * clamped to MIN_FIELD_SIZE; note the anchored x/y is not re-corrected
 * against that clamp, so at the minimum-size limit the box can lag slightly
 * behind the pointer -- acceptable for this editor, matches how most
 * lightweight resize implementations behave at their limits.
 */
export function applyResize(original: Rect, handle: ResizeHandle, deltaX: number, deltaY: number): Rect {
  let { x, y, width, height } = original;

  switch (handle) {
    case "se":
      width += deltaX;
      height += deltaY;
      break;
    case "sw":
      x += deltaX;
      width -= deltaX;
      height += deltaY;
      break;
    case "ne":
      y += deltaY;
      width += deltaX;
      height -= deltaY;
      break;
    case "nw":
      x += deltaX;
      y += deltaY;
      width -= deltaX;
      height -= deltaY;
      break;
  }

  return { x, y, width: clampSize(width), height: clampSize(height) };
}
