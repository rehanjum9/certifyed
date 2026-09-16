"use client";

import { FIELD_KEY_PATTERN, RESERVED_FIELD_KEYS } from "@/lib/validation/templateField";
import { FONT_OPTIONS } from "@/lib/fonts";
import { Label, Input, inputClassName } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { applySizingModeChange, type EditorField, type SizingMode, type TextAlign } from "@/lib/editor/types";

interface FieldPropertiesPanelProps {
  field: EditorField | null;
  previewValue: string;
  otherFieldKeys: string[];
  canvasWidth: number;
  canvasHeight: number;
  overflowing: boolean;
  onChangeField: (patch: Partial<EditorField>) => void;
  onChangePreviewValue: (value: string) => void;
}

function fieldKeyError(key: string, otherKeys: string[]): string | null {
  if (key.length === 0) return "Field key is required.";
  if (RESERVED_FIELD_KEYS.has(key)) return '"email" is reserved and cannot be used here.';
  if (!FIELD_KEY_PATTERN.test(key)) {
    return "Use lowercase letters, numbers, and underscores, starting with a letter.";
  }
  if (otherKeys.includes(key)) return "Another field already uses this key.";
  return null;
}

const ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

const SIZING_MODE_OPTIONS: { value: SizingMode; label: string }[] = [
  { value: "fixed", label: "Fixed Box" },
  { value: "auto_width", label: "Auto Width" },
  { value: "fit_text", label: "Fit Text" },
];

function numberInput(value: number, onChange: (value: number) => void) {
  return {
    type: "number" as const,
    value: Number.isFinite(value) ? Math.round(value * 100) / 100 : 0,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = Number.parseFloat(event.target.value);
      if (!Number.isNaN(parsed)) onChange(parsed);
    },
  };
}

export function FieldPropertiesPanel({
  field,
  previewValue,
  otherFieldKeys,
  canvasWidth,
  canvasHeight,
  overflowing,
  onChangeField,
  onChangePreviewValue,
}: FieldPropertiesPanelProps) {
  if (!field) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-mono text-sm font-semibold text-slate-900">
            <span className="text-emerald-600">&gt;</span> properties_
          </h2>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <p className="text-sm text-slate-500">Select a field to edit its properties.</p>
        </div>
      </div>
    );
  }

  const currentField = field;
  const keyError = fieldKeyError(currentField.field_key, otherFieldKeys);

  function handleSizingModeChange(mode: SizingMode) {
    onChangeField(applySizingModeChange(currentField, mode));
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-slate-200 p-4">
        <h2 className="font-mono text-sm font-semibold text-slate-900">
          <span className="text-emerald-600">&gt;</span> properties_
        </h2>
      </div>
      <div className="flex flex-col gap-5 p-4">
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Identity</h3>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="field-key">Field key</Label>
            <Input
              id="field-key"
              value={field.field_key}
              onChange={(e) => onChangeField({ field_key: e.target.value.trim() })}
              className={keyError ? "border-red-400 focus:border-red-500 focus:ring-red-500" : undefined}
            />
            {keyError && <p className="text-xs text-red-600">{keyError}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="field-label">Label</Label>
            <Input
              id="field-label"
              value={field.label}
              onChange={(e) => onChangeField({ label: e.target.value })}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={field.is_required}
              onChange={(e) => onChangeField({ is_required: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Required
          </label>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="field-preview">Preview value (editor-only)</Label>
            <Input
              id="field-preview"
              value={previewValue}
              onChange={(e) => onChangePreviewValue(e.target.value)}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Position &amp; size
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="field-x">X</Label>
              <Input id="field-x" {...numberInput(field.x, (x) => onChangeField({ x }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="field-y">Y</Label>
              <Input id="field-y" {...numberInput(field.y, (y) => onChangeField({ y }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="field-width">Width</Label>
              <Input
                id="field-width"
                {...numberInput(field.width, (width) => onChangeField({ width }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="field-height">Height</Label>
              <Input
                id="field-height"
                {...numberInput(field.height, (height) => onChangeField({ height }))}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onChangeField({ x: (canvasWidth - field.width) / 2 })}
            >
              Center horizontally
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onChangeField({ y: (canvasHeight - field.height) / 2 })}
            >
              Center vertically
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Typography</h3>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="field-font-family">Font family</Label>
            <select
              id="field-font-family"
              value={field.font_family}
              onChange={(e) => onChangeField({ font_family: e.target.value })}
              className={inputClassName}
            >
              {FONT_OPTIONS.map((font) => (
                <option key={font.name} value={font.name}>
                  {font.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="field-font-size">
                {field.sizing_mode === "auto_width" ? "Preferred font size" : "Font size"}
              </Label>
              <Input
                id="field-font-size"
                {...numberInput(field.font_size, (font_size) => onChangeField({ font_size }))}
                disabled={field.sizing_mode === "fit_text"}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="field-font-weight">Weight</Label>
              <select
                id="field-font-weight"
                value={field.font_weight}
                onChange={(e) => onChangeField({ font_weight: e.target.value as EditorField["font_weight"] })}
                className={inputClassName}
              >
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="field-color">Color</Label>
            <div className="flex items-center gap-2">
              <input
                id="field-color"
                type="color"
                value={field.font_color}
                onChange={(e) => onChangeField({ font_color: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded border border-slate-300"
              />
              <span className="text-sm text-slate-500">{field.font_color}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Text alignment</Label>
            <div className="flex gap-1">
              {ALIGN_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onChangeField({ text_align: option.value })}
                  className={cn(
                    "flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                    field.text_align === option.value
                      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sizing</h3>

          <div className="flex flex-col gap-1.5">
            <Label>Sizing mode</Label>
            <div className="flex gap-1">
              {SIZING_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSizingModeChange(option.value)}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                    field.sizing_mode === option.value
                      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {field.sizing_mode === "fixed" && "Box and font size never change."}
              {field.sizing_mode === "auto_width" &&
                "Box grows to fit the text at the preferred font size, up to Max Width."}
              {field.sizing_mode === "fit_text" && "Box stays fixed; font shrinks to fit."}
            </p>
          </div>

          {field.sizing_mode === "auto_width" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="field-max-width">Max width</Label>
                <Input
                  id="field-max-width"
                  {...numberInput(field.max_width ?? 0, (max_width) => onChangeField({ max_width }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="field-min-font-aw">Min font size</Label>
                <Input
                  id="field-min-font-aw"
                  {...numberInput(field.min_font_size ?? 0, (min_font_size) =>
                    onChangeField({ min_font_size }),
                  )}
                />
              </div>
            </>
          )}

          {field.sizing_mode === "fit_text" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="field-min-font">Min font size</Label>
                <Input
                  id="field-min-font"
                  {...numberInput(field.min_font_size ?? 0, (min_font_size) =>
                    onChangeField({ min_font_size }),
                  )}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="field-max-font">Max font size</Label>
                <Input
                  id="field-max-font"
                  {...numberInput(field.max_font_size ?? 0, (max_font_size) =>
                    onChangeField({ max_font_size }),
                  )}
                />
              </div>
            </div>
          )}

          {overflowing && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              The preview text still doesn&apos;t fit
              {field.sizing_mode === "auto_width" ? " within the max width" : ""} at the minimum font
              size.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
