export interface EmailProgressLike {
  eligibleTotal: number;
  sent: number;
  failed: number;
  pending: number;
  emailing: number;
}

export interface EmailCompletionSummary {
  lines: string[];
  tone: "success" | "warning" | "neutral";
}

function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/**
 * The one-line-or-two summary shown once no email batch is actively
 * running, derived only from real progress counts. Never claims "emailed"
 * for rows that failed or are still pending -- see the P0-era bug this
 * replaces, which showed a blanket success message regardless of failures.
 */
export function describeEmailCompletion({ eligibleTotal, sent, failed, pending, emailing }: EmailProgressLike): EmailCompletionSummary {
  const outstanding = pending + emailing;

  if (sent === eligibleTotal && failed === 0) {
    if (eligibleTotal === 1) return { lines: ["The certificate was emailed successfully."], tone: "success" };
    return { lines: [`All ${eligibleTotal} certificates were emailed successfully.`], tone: "success" };
  }

  const doneWithAttempts = outstanding === 0;
  const lines = [
    `${sent} of ${eligibleTotal} ${pluralize(eligibleTotal, "certificate")} emailed${doneWithAttempts ? " successfully" : ""}.`,
  ];
  if (failed > 0) lines.push(`${failed} ${pluralize(failed, "email")} failed.`);
  if (outstanding > 0) lines.push(`${outstanding} pending.`);

  return { lines, tone: failed > 0 ? "warning" : "neutral" };
}
