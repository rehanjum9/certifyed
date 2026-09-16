"use client";

import { useEffect, useRef, useState } from "react";
import { computeFitToScreenScale } from "@/lib/editor/coordinates";
import { computeFieldTextStyle } from "@/lib/editor/fieldTextStyle";
import { cn } from "@/lib/cn";
import type { EditorField } from "@/lib/editor/types";

interface RecipientCanvasProps {
  svg: string;
  svgWidth: number;
  svgHeight: number;
  fields: EditorField[];
  /** field_key -> value for the currently previewed recipient. */
  values: Record<string, string>;
}

/**
 * Browser-only, read-only rendering of one recipient onto the certificate.
 * Reuses the exact same base-layer/overlay structure, `scale` model, and
 * `computeFieldTextStyle` (coordinate + font + auto-fit + alignment logic)
 * as the Phase 3 field editor -- deliberately not a second rendering model.
 */
export function RecipientCanvas({ svg, svgWidth, svgHeight, fields, values }: RecipientCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function recompute() {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      setScale(computeFitToScreenScale(wrapper.clientWidth, wrapper.clientHeight, svgWidth, svgHeight, 1));
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [svgWidth, svgHeight]);

  return (
    <div
      ref={wrapperRef}
      className="flex w-full items-center justify-center overflow-hidden bg-slate-200 p-4"
      style={{ aspectRatio: `${svgWidth} / ${svgHeight}` }}
    >
      <div
        className="relative shrink-0 bg-slate-100 shadow [&>div:first-child_svg]:block [&>div:first-child_svg]:h-full [&>div:first-child_svg]:w-full"
        style={{ width: svgWidth * scale, height: svgHeight * scale }}
      >
        <div className="pointer-events-none absolute inset-0" dangerouslySetInnerHTML={{ __html: svg }} />

        <div className="absolute inset-0">
          {fields.map((field) => {
            const text = values[field.field_key] ?? "";
            const { box, style, overflowing } = computeFieldTextStyle(field, text, scale, svgWidth);

            return (
              <div
                key={field.id}
                className={cn(
                  "absolute flex items-center overflow-hidden",
                  overflowing && "outline outline-2 outline-red-500",
                )}
                style={{
                  left: box.x * scale,
                  top: box.y * scale,
                  width: box.width * scale,
                  height: box.height * scale,
                }}
              >
                <span style={style} className="overflow-hidden whitespace-nowrap px-0.5">
                  {text}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
