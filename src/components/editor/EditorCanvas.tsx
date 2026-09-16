"use client";

import { forwardRef } from "react";
import { FieldOverlay } from "./FieldOverlay";
import type { EditorField } from "@/lib/editor/types";

interface EditorCanvasProps {
  svg: string;
  svgWidth: number;
  svgHeight: number;
  scale: number;
  fields: EditorField[];
  selectedFieldId: string | null;
  previewValues: Record<string, string>;
  onSelectField: (id: string | null) => void;
  onUpdateField: (id: string, patch: Partial<EditorField>) => void;
  onDeleteField: (id: string) => void;
}

/**
 * The Canva SVG is rendered exactly once, read-only, as the base layer --
 * it is never mutated. Fields live in a separate absolutely-positioned
 * overlay on top, positioned purely via `field.x/y/width/height * scale`.
 * `scale` (CSS px per SVG viewBox unit) is the only place screen pixels and
 * viewBox units meet; every value that gets saved stays in viewBox units.
 */
export const EditorCanvas = forwardRef<HTMLDivElement, EditorCanvasProps>(function EditorCanvas(
  {
    svg,
    svgWidth,
    svgHeight,
    scale,
    fields,
    selectedFieldId,
    previewValues,
    onSelectField,
    onUpdateField,
    onDeleteField,
  },
  wrapperRef,
) {
  return (
    <div
      ref={wrapperRef}
      className="flex h-full w-full items-center justify-center overflow-auto bg-slate-200 p-8"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onSelectField(null);
      }}
    >
      <div
        className="relative shrink-0 bg-slate-100 shadow-lg [&>div:first-child_svg]:block [&>div:first-child_svg]:h-full [&>div:first-child_svg]:w-full"
        style={{ width: svgWidth * scale, height: svgHeight * scale }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <div
          className="absolute inset-0"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) onSelectField(null);
          }}
        >
          {fields.map((field) => (
            <FieldOverlay
              key={field.id}
              field={field}
              scale={scale}
              selected={field.id === selectedFieldId}
              previewText={previewValues[field.field_key] ?? ""}
              canvasWidth={svgWidth}
              canvasHeight={svgHeight}
              onSelect={() => onSelectField(field.id)}
              onChange={(patch) => onUpdateField(field.id, patch)}
              onDelete={() => onDeleteField(field.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
});
