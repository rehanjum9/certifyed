"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";

export interface JobInfo {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  attempts: number;
  lastError: string | null;
}

export interface ProgressInfo {
  eligibleTotal: number;
  invalidImportedTotal: number;
  generated: number;
  failed: number;
  pending: number;
  generating: number;
  progressPercent: number;
}

interface GenerationPanelProps {
  campaignId: string;
  initialJob: JobInfo | null;
  initialProgress: ProgressInfo;
}

interface ProcessResponse {
  job?: JobInfo;
  progress?: ProgressInfo;
  error?: string;
}

interface StartResponse {
  job?: JobInfo;
  error?: string;
}

interface RetryResponse {
  requeued?: number;
  stillIneligible?: number;
  error?: string;
}

const POLL_DELAY_MS = 400;

export function GenerationPanel({ campaignId, initialJob, initialProgress }: GenerationPanelProps) {
  const router = useRouter();
  const [job, setJob] = useState<JobInfo | null>(initialJob);
  const [progress, setProgress] = useState<ProgressInfo>(initialProgress);
  const [running, setRunning] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  const loop = useCallback(
    async (jobId: string) => {
      stopRef.current = false;
      setRunning(true);
      setError(null);

      while (!stopRef.current) {
        try {
          const response = await fetch(`/api/jobs/${jobId}/process`, { method: "POST" });
          const body = (await response.json()) as ProcessResponse;

          if (!response.ok || !body.job || !body.progress) {
            setError(body.error ?? "Failed to process the generation job.");
            break;
          }

          setJob(body.job);
          setProgress(body.progress);
          router.refresh();

          if (body.job.status !== "pending") break; // completed, failed, or claimed-by-someone-else this tick
          if (stopRef.current) break;
          await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
        } catch {
          setError("Failed to process the generation job. Check your connection.");
          break;
        }
      }

      setRunning(false);
    },
    [router],
  );

  // Reopening the campaign resumes an already-active job automatically --
  // job state lives in the database, not in this component, so a page
  // refresh never loses progress.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (initialJob && (initialJob.status === "pending" || initialJob.status === "running")) {
      // Deferred to the next tick so the loop's setState calls never fire
      // synchronously within this effect's own commit.
      timer = setTimeout(() => loop(initialJob.id), 0);
    }
    return () => {
      stopRef.current = true;
      if (timer) clearTimeout(timer);
    };
    // Intentionally run only once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/generation`, { method: "POST" });
      const body = (await response.json()) as StartResponse;
      if (!response.ok || !body.job) {
        setError(body.error ?? "Failed to start generation.");
        return;
      }
      setJob(body.job);
      loop(body.job.id);
    } catch {
      setError("Failed to start generation. Check your connection.");
    } finally {
      setStarting(false);
    }
  }

  function handleContinue() {
    if (job?.id) loop(job.id);
  }

  async function handleRetryFailures() {
    setRetrying(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/retry-failed`, { method: "POST" });
      const body = (await response.json()) as RetryResponse;
      if (!response.ok) {
        setError(body.error ?? "Failed to retry generation failures.");
        return;
      }
      await handleRefresh();
    } catch {
      setError("Failed to retry generation failures. Check your connection.");
    } finally {
      setRetrying(false);
    }
  }

  async function handleRefresh() {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/generation`);
      const body = (await response.json()) as { job?: JobInfo | null; progress?: ProgressInfo };
      if (response.ok && body.progress) {
        setJob(body.job ?? null);
        setProgress(body.progress);
      }
    } catch {
      // Best-effort refresh; leave current state as-is on failure.
    }
    router.refresh();
  }

  const isActive = job?.status === "pending" || job?.status === "running";
  const remaining = Math.max(0, progress.eligibleTotal - progress.generated - progress.failed);
  const hasEligibleWork = progress.pending > 0 || progress.generating > 0;

  return (
    <div className="flex flex-col gap-4">
      {!isActive && !hasEligibleWork ? (
        progress.eligibleTotal > 0 ? (
          <Alert variant="success">Certificates generated.</Alert>
        ) : (
          <p className="text-sm text-slate-500">No eligible rows to generate yet.</p>
        )
      ) : !isActive && !job ? (
        <Button onClick={handleStart} disabled={starting}>
          {starting && <Spinner className="h-4 w-4" />}
          Generate Certificates
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-900">
              {running ? "Generating certificates..." : isActive ? "Generation paused" : "Certificates generated"}
            </span>
            <Badge variant={running ? "info" : isActive ? "neutral" : "success"} bracket={false}>
              {running ? "Processing" : isActive ? "Paused" : "Completed"}
            </Badge>
          </div>
          <ProgressBar percent={progress.progressPercent} tone="emerald" />
          <p className="font-mono text-xs text-slate-500">
            {progress.generated} / {progress.eligibleTotal} generated
            {progress.failed > 0 && ` — ${progress.failed} failed`} — {remaining} remaining —{" "}
            {progress.progressPercent}%
          </p>
          {isActive && !running && (
            <Button size="sm" onClick={handleContinue}>
              Continue processing
            </Button>
          )}
        </div>
      )}

      {!isActive && hasEligibleWork && job && (
        <Button onClick={handleStart} disabled={starting}>
          {starting && <Spinner className="h-4 w-4" />}
          Generate Certificates
        </Button>
      )}

      <div className="flex flex-wrap gap-2">
        {progress.failed > 0 && (
          <Button variant="secondary" size="sm" onClick={handleRetryFailures} disabled={retrying || running}>
            {retrying && <Spinner className="h-4 w-4" />}
            Retry generation failures ({progress.failed})
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={running}>
          Refresh status
        </Button>
      </div>

      {progress.invalidImportedTotal > 0 && (
        <p className="font-mono text-xs text-slate-500">
          Eligible rows: {progress.eligibleTotal} — Invalid imported rows: {progress.invalidImportedTotal}{" "}
          (excluded from generation; fix and re-import to include them).
        </p>
      )}

      {job?.lastError && !isActive && <Alert variant="error">Last error: {job.lastError}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}
    </div>
  );
}
