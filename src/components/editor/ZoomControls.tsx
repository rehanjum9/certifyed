"use client";

import { IconMinus, IconPlus } from "@/components/ui/icons";

interface ZoomControlsProps {
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
}

export function ZoomControls({ zoomPercent, onZoomIn, onZoomOut, onFitToScreen }: ZoomControlsProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={onZoomOut}
        className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
        aria-label="Zoom out"
      >
        <IconMinus className="h-4 w-4" />
      </button>
      <span className="w-12 text-center text-xs font-medium text-slate-600">
        {Math.round(zoomPercent)}%
      </span>
      <button
        type="button"
        onClick={onZoomIn}
        className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
        aria-label="Zoom in"
      >
        <IconPlus className="h-4 w-4" />
      </button>
      <div className="mx-1 h-4 w-px bg-slate-200" aria-hidden="true" />
      <button
        type="button"
        onClick={onFitToScreen}
        className="rounded px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
      >
        Fit to screen
      </button>
    </div>
  );
}
