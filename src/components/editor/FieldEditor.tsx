"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorToolbar, type SaveState } from "./EditorToolbar";
import { FieldList } from "./FieldList";
import { FieldPropertiesPanel } from "./FieldPropertiesPanel";
import { EditorCanvas } from "./EditorCanvas";
import { ZoomControls } from "./ZoomControls";
import { computeFitToScreenScale } from "@/lib/editor/coordinates";
import { computeFieldTextStyle } from "@/lib/editor/fieldTextStyle";
import { useLoadCustomFonts } from "@/lib/fonts/useLoadCustomFonts";
import {
  createDefaultField,
  defaultPreviewValueFor,
  templateFieldRowToEditorField,
  type EditorField,
} from "@/lib/editor/types";
import {
  templateFieldInputSchema,
  formatValidationIssue,
  type TemplateFieldInput,
} from "@/lib/validation/templateField";
import type { TemplateFieldRow } from "@/lib/templateFields";

const MIN_ZOOM = 25;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;

interface FieldEditorProps {
  template: { id: string; name: string; svg_width: number; svg_height: number };
  svg: string;
  initialFields: TemplateFieldRow[];
}

function editorFieldToInput(field: EditorField): TemplateFieldInput {
  return { ...field };
}

export function FieldEditor({ template, svg, initialFields }: FieldEditorProps) {
  const [fields, setFields] = useState<EditorField[]>(() =>
    initialFields.map(templateFieldRowToEditorField),
  );
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialFields.map((row) => [row.field_key, defaultPreviewValueFor(row.field_key)]),
    ),
  );
  const [zoomPercent, setZoomPercent] = useState(100);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const { customFonts, loading: loadingCustomFonts, refresh: refreshCustomFonts } = useLoadCustomFonts();

  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const scale = zoomPercent / 100;

  const fitToScreen = useCallback(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;
    const nextScale = computeFitToScreenScale(
      wrapper.clientWidth,
      wrapper.clientHeight,
      template.svg_width,
      template.svg_height,
    );
    setZoomPercent(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(nextScale * 100))));
  }, [template.svg_width, template.svg_height]);

  // Default to a fitted view instead of a possibly-awkward 100% on load.
  useEffect(() => {
    fitToScreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const updateField = useCallback((id: string, patch: Partial<EditorField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    setDirty(true);
    setSaveState("idle");
  }, []);

  const addField = useCallback(() => {
    const newField = createDefaultField(
      fields.map((f) => f.field_key),
      fields.length,
      template,
    );
    setFields((prev) => [...prev, newField]);
    setPreviewValues((prev) => ({
      ...prev,
      [newField.field_key]: defaultPreviewValueFor(newField.field_key),
    }));
    setSelectedFieldId(newField.id);
    setDirty(true);
    setSaveState("idle");
  }, [fields, template]);

  const deleteField = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    setSelectedFieldId((current) => (current === id ? null : current));
    setDirty(true);
    setSaveState("idle");
  }, []);

  const selectedField = useMemo(
    () => fields.find((f) => f.id === selectedFieldId) ?? null,
    [fields, selectedFieldId],
  );

  const selectedFieldOverflowing = useMemo(() => {
    if (!selectedField) return false;
    const preview = previewValues[selectedField.field_key] ?? "";
    return computeFieldTextStyle(selectedField, preview, 1, template.svg_width, customFonts).overflowing;
  }, [selectedField, previewValues, template.svg_width, customFonts]);

  async function handleSave() {
    const inputs = fields.map(editorFieldToInput);

    for (const input of inputs) {
      const result = templateFieldInputSchema.safeParse(input);
      if (!result.success) {
        setSaveState("error");
        setSaveError(`"${input.label}": ${formatValidationIssue(result.error)}`);
        return;
      }
    }

    const keys = inputs.map((f) => f.field_key);
    const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
    if (duplicate) {
      setSaveState("error");
      setSaveError(`Duplicate field key: "${duplicate}".`);
      return;
    }

    setSaveState("saving");
    setSaveError(null);

    try {
      const response = await fetch(`/api/templates/${template.id}/fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: inputs }),
      });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setSaveState("error");
        setSaveError(body.error ?? "Failed to save.");
        return;
      }

      setSaveState("saved");
      setDirty(false);
    } catch {
      setSaveState("error");
      setSaveError("Failed to save. Check your connection.");
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-slate-50">
      <EditorToolbar
        templateId={template.id}
        templateName={template.name}
        dirty={dirty}
        saveState={saveState}
        saveError={saveError}
        onSave={handleSave}
      />

      <div className="rounded-none border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
        <p className="text-xs text-slate-500">
          For the best editing experience, use a larger screen.
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white lg:block">
          <FieldList
            fields={fields}
            selectedFieldId={selectedFieldId}
            onSelect={setSelectedFieldId}
            onAdd={addField}
            onDelete={deleteField}
          />
        </div>

        <div className="relative flex-1 overflow-hidden">
          <div className="absolute right-4 top-4 z-10">
            <ZoomControls
              zoomPercent={zoomPercent}
              onZoomIn={() => setZoomPercent((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
              onZoomOut={() => setZoomPercent((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
              onFitToScreen={fitToScreen}
            />
          </div>
          <EditorCanvas
            ref={canvasWrapperRef}
            svg={svg}
            svgWidth={template.svg_width}
            svgHeight={template.svg_height}
            scale={scale}
            fields={fields}
            selectedFieldId={selectedFieldId}
            previewValues={previewValues}
            customFonts={customFonts}
            onSelectField={setSelectedFieldId}
            onUpdateField={updateField}
            onDeleteField={deleteField}
          />
        </div>

        <div className="hidden w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white lg:block">
          <FieldPropertiesPanel
            field={selectedField}
            previewValue={selectedField ? previewValues[selectedField.field_key] ?? "" : ""}
            otherFieldKeys={fields.filter((f) => f.id !== selectedFieldId).map((f) => f.field_key)}
            canvasWidth={template.svg_width}
            canvasHeight={template.svg_height}
            overflowing={selectedFieldOverflowing}
            customFonts={customFonts}
            loadingCustomFonts={loadingCustomFonts}
            onChangeField={(patch) => selectedField && updateField(selectedField.id, patch)}
            onChangePreviewValue={(value) =>
              selectedField &&
              setPreviewValues((prev) => ({ ...prev, [selectedField.field_key]: value }))
            }
            onCustomFontsChanged={refreshCustomFonts}
          />
        </div>
      </div>
    </div>
  );
}
