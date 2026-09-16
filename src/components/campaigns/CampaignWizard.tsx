"use client";

import { useMemo, useState } from "react";
import { Stepper } from "./Stepper";
import { StepSelectTemplate } from "./StepSelectTemplate";
import { StepUploadSpreadsheet } from "./StepUploadSpreadsheet";
import { StepMapColumns } from "./StepMapColumns";
import { StepValidate } from "./StepValidate";
import { StepPreview } from "./StepPreview";
import { StepSaveCampaign } from "./StepSaveCampaign";
import { Button } from "@/components/ui/Button";
import { autoMatchEmailColumn, autoMatchFieldColumn } from "@/lib/spreadsheet/headerMatch";
import { validateRows, type FieldMapping } from "@/lib/spreadsheet/validateRows";
import { templateFieldRowToEditorField } from "@/lib/editor/types";
import type { TemplateOption, ParsedSpreadsheetState, FieldColumnMap, WizardStep } from "./wizardTypes";

interface CampaignWizardProps {
  templateOptions: TemplateOption[];
}

interface SpreadsheetParseResponse {
  headers?: string[];
  rows?: string[][];
  error?: string;
}

interface SaveCampaignResponse {
  campaignId?: string;
  error?: string;
}

export function CampaignWizard({ templateOptions }: CampaignWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parseStatus, setParseStatus] = useState<"idle" | "parsing" | "error" | "success">("idle");
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedSpreadsheetState | null>(null);

  const [emailColumnIndex, setEmailColumnIndex] = useState<number | null>(null);
  const [fieldColumnMap, setFieldColumnMap] = useState<FieldColumnMap>({});

  const [previewIndex, setPreviewIndex] = useState(0);

  const [campaignName, setCampaignName] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCampaignId, setSavedCampaignId] = useState<string | null>(null);

  const selectedOption = useMemo(
    () => templateOptions.find((option) => option.template.id === selectedTemplateId) ?? null,
    [templateOptions, selectedTemplateId],
  );

  const editorFields = useMemo(
    () => (selectedOption ? selectedOption.fields.map(templateFieldRowToEditorField) : []),
    [selectedOption],
  );

  const fieldMappings: FieldMapping[] = useMemo(
    () =>
      (selectedOption?.fields ?? []).map((field) => ({
        field_key: field.field_key,
        label: field.label,
        is_required: field.is_required,
        columnIndex: fieldColumnMap[field.field_key] ?? null,
      })),
    [selectedOption, fieldColumnMap],
  );

  const allRequiredFieldsMapped = fieldMappings.every((m) => !m.is_required || m.columnIndex !== null);

  const validationOutcome = useMemo(() => {
    if (!parsed || emailColumnIndex === null) return null;
    return validateRows(parsed.rows, emailColumnIndex, fieldMappings);
  }, [parsed, emailColumnIndex, fieldMappings]);

  function handleSelectTemplate(templateId: string) {
    if (templateId !== selectedTemplateId) {
      setFieldColumnMap({});
      setEmailColumnIndex(null);
    }
    setSelectedTemplateId(templateId);
  }

  function applyAutoMatch(headers: string[]) {
    setEmailColumnIndex(autoMatchEmailColumn(headers));
    if (selectedOption) {
      const next: FieldColumnMap = {};
      for (const field of selectedOption.fields) {
        next[field.field_key] = autoMatchFieldColumn(headers, field.field_key, field.label);
      }
      setFieldColumnMap(next);
    }
  }

  async function handleFileSelected(selected: File) {
    setFile(selected);
    setParseStatus("parsing");
    setParseError(null);
    setParsed(null);
    setEmailColumnIndex(null);
    setFieldColumnMap({});

    const formData = new FormData();
    formData.set("file", selected);

    try {
      const response = await fetch("/api/spreadsheet/parse", { method: "POST", body: formData });
      const body = (await response.json()) as SpreadsheetParseResponse;

      if (!response.ok || !body.headers || !body.rows) {
        setParseStatus("error");
        setParseError(body.error ?? "Failed to parse the spreadsheet.");
        return;
      }

      setParsed({ headers: body.headers, rows: body.rows });
      setParseStatus("success");
      applyAutoMatch(body.headers);
    } catch {
      setParseStatus("error");
      setParseError("Failed to parse the spreadsheet. Check your connection and try again.");
    }
  }

  async function handleSave() {
    if (!selectedOption || !file || emailColumnIndex === null) return;

    setSaveState("saving");
    setSaveError(null);

    const meta = {
      templateId: selectedOption.template.id,
      campaignName: campaignName.trim() || selectedOption.template.name,
      emailColumnIndex,
      fieldMappings: fieldMappings.map((m) => ({ field_key: m.field_key, columnIndex: m.columnIndex })),
    };

    const formData = new FormData();
    formData.set("file", file);
    formData.set("meta", JSON.stringify(meta));

    try {
      const response = await fetch("/api/campaigns", { method: "POST", body: formData });
      const body = (await response.json()) as SaveCampaignResponse;

      if (!response.ok || !body.campaignId) {
        setSaveState("error");
        setSaveError(body.error ?? "Failed to save the campaign.");
        return;
      }

      setSavedCampaignId(body.campaignId);
      setSaveState("success");
    } catch {
      setSaveState("error");
      setSaveError("Failed to save the campaign. Check your connection and try again.");
    }
  }

  const canGoNext: Record<WizardStep, boolean> = {
    1: selectedTemplateId !== null,
    2: parseStatus === "success" && parsed !== null,
    3: emailColumnIndex !== null && allRequiredFieldsMapped,
    4: true,
    5: true,
    6: false,
  };

  return (
    <div className="flex flex-col gap-6">
      <Stepper currentStep={step} />

      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        <span>
          Template: <strong className="text-slate-700">{selectedOption?.template.name ?? "—"}</strong>
        </span>
        <span>
          File: <strong className="text-slate-700">{file?.name ?? "—"}</strong>
        </span>
        <span>
          Email column:{" "}
          <strong className="text-slate-700">
            {parsed && emailColumnIndex !== null ? parsed.headers[emailColumnIndex] : "—"}
          </strong>
        </span>
        <span>
          Fields mapped:{" "}
          <strong className="text-slate-700">
            {fieldMappings.filter((m) => m.columnIndex !== null).length}/{fieldMappings.length}
          </strong>
        </span>
        {validationOutcome && (
          <span>
            Validation:{" "}
            <strong className="text-slate-700">
              {validationOutcome.summary.valid} valid / {validationOutcome.summary.invalid} invalid
            </strong>
          </span>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        {step === 1 && (
          <StepSelectTemplate
            templateOptions={templateOptions}
            selectedTemplateId={selectedTemplateId}
            onSelect={handleSelectTemplate}
          />
        )}

        {step === 2 && (
          <StepUploadSpreadsheet
            file={file}
            status={parseStatus}
            error={parseError}
            parsed={parsed}
            onFileSelected={handleFileSelected}
          />
        )}

        {step === 3 && parsed && selectedOption && (
          <StepMapColumns
            headers={parsed.headers}
            emailColumnIndex={emailColumnIndex}
            onEmailColumnChange={setEmailColumnIndex}
            fields={selectedOption.fields}
            fieldColumnMap={fieldColumnMap}
            onFieldColumnChange={(fieldKey, index) =>
              setFieldColumnMap((prev) => ({ ...prev, [fieldKey]: index }))
            }
          />
        )}

        {step === 4 && validationOutcome && <StepValidate outcome={validationOutcome} />}

        {step === 5 && selectedOption && validationOutcome && (
          <StepPreview
            svg={selectedOption.svg}
            svgWidth={selectedOption.template.svg_width}
            svgHeight={selectedOption.template.svg_height}
            fields={editorFields}
            rows={validationOutcome.rows}
            currentIndex={previewIndex}
            onIndexChange={(index) => setPreviewIndex(Math.max(0, Math.min(index, validationOutcome.rows.length - 1)))}
          />
        )}

        {step === 6 && validationOutcome && (
          <StepSaveCampaign
            campaignName={campaignName}
            onCampaignNameChange={setCampaignName}
            summary={validationOutcome.summary}
            saveState={saveState}
            saveError={saveError}
            savedCampaignId={savedCampaignId}
            onSave={handleSave}
          />
        )}
      </div>

      <div className="flex justify-between">
        <Button
          variant="secondary"
          onClick={() => setStep((s) => Math.max(1, s - 1) as WizardStep)}
          disabled={step === 1 || saveState === "success"}
        >
          Back
        </Button>
        {step < 6 && (
          <Button onClick={() => setStep((s) => Math.min(6, s + 1) as WizardStep)} disabled={!canGoNext[step]}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
