export interface GenerationProgressLike {
  eligibleTotal: number;
  generated: number;
  failed: number;
  pending: number;
  generating: number;
}

export interface GenerationCompletionSummary {
  lines: string[];
  tone: "success" | "warning" | "neutral";
}

function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/**
 * Mirrors describeEmailCompletion's shape for the generation panel -- the
 * same "never claim a blanket success while a failure or pending row
 * exists" fix, applied to certificate generation instead of email delivery.
 */
export function describeGenerationCompletion({
  eligibleTotal,
  generated,
  failed,
  pending,
  generating,
}: GenerationProgressLike): GenerationCompletionSummary {
  const outstanding = pending + generating;

  if (generated === eligibleTotal && failed === 0) {
    if (eligibleTotal === 1) return { lines: ["The certificate was generated successfully."], tone: "success" };
    return { lines: [`All ${eligibleTotal} certificates were generated successfully.`], tone: "success" };
  }

  const doneWithAttempts = outstanding === 0;
  const lines = [
    `${generated} of ${eligibleTotal} ${pluralize(eligibleTotal, "certificate")} generated${doneWithAttempts ? " successfully" : ""}.`,
  ];
  if (failed > 0) lines.push(`${failed} ${pluralize(failed, "certificate")} failed to generate.`);
  if (outstanding > 0) lines.push(`${outstanding} pending.`);

  return { lines, tone: failed > 0 ? "warning" : "neutral" };
}
