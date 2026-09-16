"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { computeFieldTextStyle } from "@/lib/editor/fieldTextStyle";
import {
  screenToSvgLength,
  clampAxisPosition,
  clampSize,
  applyResize,
  type ResizeHandle,
} from "@/lib/editor/coordinates";
import type { EditorField } from "@/lib/editor/types";
import { IconClose } from "@/components/ui/icons";

const HANDLES: ResizeHandle[] = ["nw", "ne", "sw", "se"];

const HANDLE_POSITION_CLASS: Record<ResizeHandle, string> = {
  nw: "-left-1.5 -top-1.5 cursor-nwse-resize",
  ne: "-right-1.5 -top-1.5 cursor-nesw-resize",
  sw: "-left-1.5 -bottom-1.5 cursor-nesw-resize",
  se: "-right-1.5 -bottom-1.5 cursor-nwse-resize",
};

interface FieldOverlayProps {
  field: EditorField;
  scale: number;
  selected: boolean;
  previewText: string;
  canvasWidth: number;
  canvasHeight: number;
  onSelect: () => void;
  onChange: (patch: Partial<EditorField>) => void;
  onDelete: () => void;
}

export function FieldOverlay({
  field,
  scale,
  selected,
  previewText,
  canvasWidth,
  canvasHeight,
  onSelect,
  onChange,
  onDelete,
}: FieldOverlayProps) {
  const { box, style: textStyle, overflowing } = useMemo(
    () => computeFieldTextStyle(field, previewText, scale, canvasWidth),
    [field, previewText, scale, canvasWidth],
  );

  function handleDragPointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    event.stopPropagation();
    onSelect();

    const startScreenX = event.clientX;
    const startScreenY = event.clientY;
    const startX = field.x;
    const startY = field.y;
    const { width, height } = field;

    function handleMove(ev: PointerEvent) {
      const deltaX = screenToSvgLength(ev.clientX - startScreenX, scale);
      const deltaY = screenToSvgLength(ev.clientY - startScreenY, scale);
      onChange({
        x: clampAxisPosition(startX + deltaX, width, canvasWidth),
        y: clampAxisPosition(startY + deltaY, height, canvasHeight),
      });
    }
    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function handleResizePointerDown(handle: ResizeHandle) {
    return (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      onSelect();

      const startScreenX = event.clientX;
      const startScreenY = event.clientY;
      const original = { x: field.x, y: field.y, width: field.width, height: field.height };

      function handleMove(ev: PointerEvent) {
        const deltaX = screenToSvgLength(ev.clientX - startScreenX, scale);
        const deltaY = screenToSvgLength(ev.clientY - startScreenY, scale);
        const next = applyResize(original, handle, deltaX, deltaY);
        onChange({
          x: clampAxisPosition(next.x, next.width, canvasWidth),
          y: clampAxisPosition(next.y, next.height, canvasHeight),
          width: clampSize(next.width),
          height: clampSize(next.height),
        });
      }
      function handleUp() {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      }
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    };
  }

  return (
    <div
      onPointerDown={handleDragPointerDown}
      style={{
        left: box.x * scale,
        top: box.y * scale,
        width: box.width * scale,
        height: box.height * scale,
      }}
      className={cn(
        "absolute flex cursor-move items-center overflow-hidden border-2 bg-indigo-500/10",
        selected ? "border-indigo-600" : "border-indigo-300/70 hover:border-indigo-500",
        overflowing && "border-red-500 bg-red-500/10",
      )}
    >
      <span
        style={textStyle}
        className="pointer-events-none select-none overflow-hidden whitespace-nowrap px-0.5"
      >
        {previewText}
      </span>

      {selected && (
        <>
          {HANDLES.map((handle) => (
            <div
              key={handle}
              onPointerDown={handleResizePointerDown(handle)}
              className={cn(
                "absolute h-3 w-3 rounded-full border-2 border-white bg-indigo-600 shadow",
                HANDLE_POSITION_CLASS[handle],
              )}
            />
          ))}
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
            aria-label={`Delete field ${field.label}`}
          >
            <IconClose className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );
}
