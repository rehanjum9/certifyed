"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { Input, Label } from "@/components/ui/Input";

export interface EmailJobInfo {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  attempts: number;
  lastError: string | null;
}

export interface EmailProgressInfo {
  eligibleTotal: number;
  sent: number;
  pending: number;
  failed: number;
  emailing: number;
  progressPercent: number;
}

interface EmailDeliveryPanelProps {
  campaignId: string;
  initialJob: EmailJobInfo | null;
  initialProgress: EmailProgressInfo;
}

interface ProcessResponse {
  job?: EmailJobInfo;
  progress?: EmailProgressInfo;
  error?: string;
}

interface StartResponse {
  job?: EmailJobInfo;
  error?: string;
}

interface RetryResponse {
  requeued?: number;
  notRetriable?: number;
  error?: string;
}

interface TestEmailResponse {
  messageId?: string;
  error?: string;
}

const POLL_DELAY_MS = 500;

export function EmailDeliveryPanel({ campaignId, initialJob, initialProgress }: EmailDeliveryPanelProps) {
  const router = useRouter();
  const [job, setJob] = useState<EmailJobInfo | null>(initialJob);
  const [progress, setProgress] = useState<EmailProgressInfo>(initialProgress);
  const [running, setRunning] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
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
            setError(body.error ?? "Failed to process the email job.");
            break;
          }

          setJob(body.job);
          setProgress(body.progress);
          router.refresh();

          if (body.job.status !== "pending") break; // completed, failed, or claimed-by-someone-else this tick
          if (stopRef.current) break;
          await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
        } catch {
          setError("Failed to process the email job. Check your connection.");
          break;
        }
      }

      setRunning(false);
    },
    [router],
  );

  // Reopening the campaign resumes an already-active job automatically --
  // job state lives in the database, not in this component.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (initialJob && (initialJob.status === "pending" || initialJob.status === "running")) {
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
      const response = await fetch(`/api/campaigns/${campaignId}/email`, { method: "POST" });
      const body = (await response.json()) as StartResponse;
      if (!response.ok || !body.job) {
        setError(body.error ?? "Failed to start sending certificates.");
        return;
      }
      setJob(body.job);
      loop(body.job.id);
    } catch {
      setError("Failed to start sending certificates. Check your connection.");
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
      const response = await fetch(`/api/campaigns/${campaignId}/retry-failed-emails`, { method: "POST" });
      const body = (await response.json()) as RetryResponse;
      if (!response.ok) {
        setError(body.error ?? "Failed to retry failed emails.");
        return;
      }
      await handleRefresh();
    } catch {
      setError("Failed to retry failed emails. Check your connection.");
    } finally {
      setRetrying(false);
    }
  }

  async function handleRefresh() {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/email`);
      const body = (await response.json()) as { job?: EmailJobInfo | null; progress?: EmailProgressInfo };
      if (response.ok && body.progress) {
        setJob(body.job ?? null);
        setProgress(body.progress);
      }
    } catch {
      // Best-effort refresh; leave current state as-is on failure.
    }
    router.refresh();
  }

  async function handleSendTest() {
    setTestSending(true);
    setTestError(null);
    setTestResult(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/test-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testEmail: testEmail || undefined }),
      });
      const body = (await response.json()) as TestEmailResponse;
      if (!response.ok || !body.messageId) {
        setTestError(body.error ?? "Failed to send test email.");
        return;
      }
      setTestResult(`Test email sent (message id: ${body.messageId}). This did not mark any recipient row as sent.`);
    } catch {
      setTestError("Failed to send test email. Check your connection.");
    } finally {
      setTestSending(false);
    }
  }

  const isActive = job?.status === "pending" || job?.status === "running";
  const hasEmailWork = progress.pending > 0 || progress.emailing > 0;

  return (
    <div className="flex flex-col gap-4">
      {progress.eligibleTotal === 0 && !isActive ? (
        <p className="text-sm text-slate-500">Generate certificates first — nothing is ready to email yet.</p>
      ) : !isActive && !hasEmailWork ? (
        <Alert variant="success">All eligible certificates have been emailed.</Alert>
      ) : !isActive && !job ? (
        <Button onClick={handleStart} disabled={starting}>
          {starting && <Spinner className="h-4 w-4" />}
          Send Certificates
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-slate-900">
            {running ? "Sending certificates..." : isActive ? "Sending paused" : "Sending complete"}
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-emerald-600 transition-all"
              style={{ width: `${progress.progressPercent}%` }}
            />
          </div>
          <p className="text-sm text-slate-600">
            {progress.sent} / {progress.eligibleTotal} sent
            {progress.failed > 0 && ` – ${progress.failed} failed`} – {progress.pending} pending –{" "}
            {progress.progressPercent}%
          </p>
          {isActive && !running && (
            <Button size="sm" onClick={handleContinue}>
              Continue sending
            </Button>
          )}
        </div>
      )}

      {!isActive && hasEmailWork && job && (
        <Button onClick={handleStart} disabled={starting}>
          {starting && <Spinner className="h-4 w-4" />}
          Send Certificates
        </Button>
      )}

      <div className="flex flex-wrap gap-2">
        {progress.failed > 0 && (
          <Button variant="secondary" size="sm" onClick={handleRetryFailures} disabled={retrying || running}>
            {retrying && <Spinner className="h-4 w-4" />}
            Retry failed emails ({progress.failed})
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={running}>
          Refresh status
        </Button>
      </div>

      {job?.lastError && !isActive && <Alert variant="error">Last error: {job.lastError}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}

      <div className="rounded-lg border border-dashed border-slate-300 p-3">
        <p className="mb-2 text-xs font-medium text-slate-500">Send a test email before bulk sending</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <Label htmlFor="test-email-input">Test recipient (optional if a dev address is configured)</Label>
            <Input
              id="test-email-input"
              type="email"
              placeholder="you@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
          </div>
          <Button variant="secondary" size="sm" onClick={handleSendTest} disabled={testSending}>
            {testSending && <Spinner className="h-4 w-4" />}
            Send Test Email
          </Button>
        </div>
        {testResult && <p className="mt-2 text-xs text-emerald-700">{testResult}</p>}
        {testError && <p className="mt-2 text-xs text-red-700">{testError}</p>}
      </div>
    </div>
  );
}
