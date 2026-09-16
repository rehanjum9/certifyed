import { cn } from "@/lib/cn";

interface SvgPreviewProps {
  svg: string;
  width: number;
  height: number;
  className?: string;
}

/**
 * Renders an already-sanitized template SVG inline, scaled to fill its
 * container while preserving aspect ratio. `svg` must have gone through
 * lib/svg/process.ts first -- this component trusts its input completely.
 * The wrapper only overrides the injected <svg>'s own width/height so it
 * fills the box; its viewBox (the coordinate space Phase 3's field editor
 * will place fields in) is left untouched.
 *
 * Background is always a fixed neutral gray (bg-slate-100), never themeable
 * via className, so a certificate's own colors are never mixed with an
 * accent-tinted canvas.
 */
export function SvgPreview({ svg, width, height, className }: SvgPreviewProps) {
  return (
    <div
      className={cn(
        "overflow-hidden bg-slate-100 [&>svg]:block [&>svg]:h-full [&>svg]:w-full",
        className,
      )}
      style={{ aspectRatio: `${width} / ${height}` }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
