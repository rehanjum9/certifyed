"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LinkButton } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Alert, type AlertVariant } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { describeEmailCompletion } from "@/lib/campaigns/emailStatusCopy";

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
  /**
   * Why this workspace can't send right now, or null if it can -- from
   * getOrganizationEmailSendError (lib/email/provider.ts), computed
   * server-side from this workspace's OWN Gmail connection (or the
   * platform's Resend config). Never a hint that some other/global sender
   * could be used instead -- when this is set, the real "Send
   * Certificates" controls are replaced with this message, full stop.
   */
  emailSendBlockedReason: string | null;
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

const POLL_DELAY_MS = 500;

export function EmailDeliveryPanel({ campaignId, initialJob, initialProgress, emailSendBlockedReason }: EmailDeliveryPanelProps) {
  const router = useRouter();
  const [job, setJob] = useState<EmailJobInfo | null>(initialJob);
  const [progress, setProgress] = useState<EmailProgressInfo>(initialProgress);
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

  const isActive = job?.status === "pending" || job?.status === "running";
  const hasEmailWork = progress.pending > 0 || progress.emailing > 0;
  // Reached only when a batch already ran to the end (no row left pending
  // or mid-send) -- this is the one place allowed to declare completion,
  // and it always derives that claim from real counts (see
  // describeEmailCompletion), never a blanket "all emailed" assumption.
  const completion = !isActive && !hasEmailWork ? describeEmailCompletion(progress) : null;
  const completionAlertVariant: AlertVariant =
    completion?.tone === "success" ? "success" : completion?.tone === "warning" ? "warning" : "info";

  // Nothing generated yet takes priority over the Gmail-connection check --
  // there's nothing to send either way, so "connect Gmail" would be a
  // confusing thing to lead with.
  const nothingReadyYet = progress.eligibleTotal === 0 && !isActive;
  // Blocks only the "start a NEW send" entry points -- an already-active or
  // already-completed job's own status/history is still shown regardless
  // (e.g. Gmail was connected when a send started, then disconnected).
  const sendBlocked = !nothingReadyYet && !isActive && !job && !!emailSendBlockedReason;

  return (
    <div className="flex flex-col gap-4">
      {nothingReadyYet ? (
        <p className="text-sm text-slate-500">Generate certificates first — nothing is ready to email yet.</p>
      ) : sendBlocked ? (
        <Alert variant="warning">
          <p>{emailSendBlockedReason}</p>
          <LinkButton href="/settings" variant="secondary" size="sm" className="mt-2">
            Open Settings
          </LinkButton>
        </Alert>
      ) : completion ? (
        <Alert variant={completionAlertVariant}>
          {completion.lines.map((line, index) => (
            <p key={index} className={index > 0 ? "mt-1" : undefined}>
              {line}
            </p>
          ))}
        </Alert>
      ) : !isActive && !job ? (
        <Button onClick={handleStart} disabled={starting}>
          {starting && <Spinner className="h-4 w-4" />}
          Send Certificates
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-900">
              {running ? "Sending certificates..." : isActive ? "Sending paused" : "More certificates to send"}
            </span>
            <Badge variant={running ? "info" : "neutral"} bracket={false}>
              {running ? "Sending" : isActive ? "Paused" : "Pending"}
            </Badge>
          </div>
          <ProgressBar percent={progress.progressPercent} tone="sky" />
          <p className="font-mono text-xs text-slate-500">
            {progress.sent} / {progress.eligibleTotal} sent
            {progress.failed > 0 && ` — ${progress.failed} failed`} — {progress.pending} pending —{" "}
            {progress.progressPercent}%
          </p>
          {isActive && !running && (
            <Button size="sm" onClick={handleContinue}>
              Continue sending
            </Button>
          )}
        </div>
      )}

      {!isActive && hasEmailWork && job && !emailSendBlockedReason && (
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
    </div>
  );
}
