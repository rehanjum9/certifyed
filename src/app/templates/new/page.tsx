"use client";

import { useState, useRef, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { SvgPreview } from "@/components/templates/SvgPreview";
import { MAX_SVG_UPLOAD_BYTES } from "@/lib/svg/constants";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent } from "@/components/ui/Card";
import { Label, Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

interface UploadedTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  sanitizedSvg: string;
}

interface TemplateApiResponse {
  template?: {
    id: string;
    name: string;
    svg_width: number;
    svg_height: number;
  };
  sanitizedSvg?: string;
  error?: string;
}

const MAX_SVG_UPLOAD_MB = MAX_SVG_UPLOAD_BYTES / (1024 * 1024);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function NewTemplatePage() {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadedTemplate | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError(null);
    setResult(null);
    setStatus("idle");

    if (!selected) {
      setFile(null);
      return;
    }

    if (!selected.name.toLowerCase().endsWith(".svg")) {
      setFile(null);
      setError("Only .svg files are accepted.");
      return;
    }

    if (selected.size === 0) {
      setFile(null);
      setError("That file is empty.");
      return;
    }

    if (selected.size > MAX_SVG_UPLOAD_BYTES) {
      setFile(null);
      setError(`File exceeds the ${MAX_SVG_UPLOAD_MB}MB upload limit.`);
      return;
    }

    setFile(selected);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose an SVG file first.");
      return;
    }
    if (!name.trim()) {
      setError("Give the template a name.");
      return;
    }

    setStatus("uploading");
    setError(null);

    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("file", file);

    try {
      const response = await fetch("/api/templates", { method: "POST", body: formData });
      const body = (await response.json()) as TemplateApiResponse;

      if (!response.ok || !body.template || !body.sanitizedSvg) {
        setStatus("error");
        setError(body.error ?? "Upload failed.");
        return;
      }

      setStatus("success");
      setResult({
        id: body.template.id,
        name: body.template.name,
        width: body.template.svg_width,
        height: body.template.svg_height,
        sanitizedSvg: body.sanitizedSvg,
      });
    } catch {
      setStatus("error");
      setError("Upload failed. Check your connection and try again.");
    }
  }

  return (
    <PageContainer>
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-mono text-2xl font-semibold tracking-tight text-slate-900">
          <span className="text-emerald-600">&gt;</span> new_template_
        </h1>
        <p className="mt-1 text-sm text-slate-500">Upload a Canva-exported SVG to use as a certificate design.</p>
      </div>

      <Card className="max-w-xl">
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template-name">Template name</Label>
              <Input
                id="template-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Course Completion Certificate"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template-file">SVG file (max {MAX_SVG_UPLOAD_MB}MB)</Label>
              <input
                id="template-file"
                ref={fileInputRef}
                type="file"
                accept=".svg,image/svg+xml"
                onChange={handleFileChange}
                className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-emerald-700 hover:file:bg-emerald-100"
              />
            </div>

            {file && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-medium text-slate-900">{file.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatFileSize(file.size)} - a preview isn&apos;t shown until the file has
                  been sanitized on the server.
                </p>
              </div>
            )}

            {error && <Alert variant="error">{error}</Alert>}

            <Button type="submit" disabled={status === "uploading"} className="self-start">
              {status === "uploading" && <Spinner className="h-4 w-4" />}
              {status === "uploading" ? "Uploading..." : "Upload template"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {status === "success" && result && (
        <Card className="max-w-xl border-emerald-200 bg-emerald-50/40">
          <CardContent className="flex flex-col gap-4 pt-5">
            <p className="text-sm font-medium text-emerald-800">
              Template &quot;{result.name}&quot; saved and sanitized.
            </p>
            <SvgPreview
              svg={result.sanitizedSvg}
              width={result.width}
              height={result.height}
              className="rounded-lg border border-slate-200"
            />
            <Link
              href={`/templates/${result.id}`}
              className="self-start text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              View template &rarr;
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
    </PageContainer>
  );
}
