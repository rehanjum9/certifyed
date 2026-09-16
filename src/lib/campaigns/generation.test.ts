import { describe, expect, it } from "vitest";
import {
  clampBatchSize,
  computeCampaignStatusAfterBatch,
  summarizeCampaignProgress,
  isLockStale,
  jobStatusAfterBatch,
  DEFAULT_BATCH_SIZE,
  MIN_BATCH_SIZE,
  MAX_BATCH_SIZE,
  JOB_STALE_LOCK_MS,
  type RowStatusForProgress,
} from "./generation";

describe("clampBatchSize", () => {
  it("returns the default when nothing is requested", () => {
    expect(clampBatchSize(undefined)).toBe(DEFAULT_BATCH_SIZE);
  });

  it("returns the default for non-finite input", () => {
    expect(clampBatchSize(Number.NaN)).toBe(DEFAULT_BATCH_SIZE);
    expect(clampBatchSize(0)).toBe(DEFAULT_BATCH_SIZE);
  });

  it("passes a value already inside the bounds through unchanged", () => {
    expect(clampBatchSize(7)).toBe(7);
  });

  it("clamps a too-large request down to the maximum", () => {
    expect(clampBatchSize(5000)).toBe(MAX_BATCH_SIZE);
  });

  it("clamps a too-small request up to the minimum", () => {
    expect(clampBatchSize(-5)).toBe(MIN_BATCH_SIZE);
  });

  it("rounds fractional input", () => {
    expect(clampBatchSize(4.6)).toBe(5);
  });
});

describe("computeCampaignStatusAfterBatch", () => {
  it("reports processing while pending rows remain", () => {
    expect(computeCampaignStatusAfterBatch(3)).toBe("processing");
  });

  it("reports completed once no pending rows remain", () => {
    expect(computeCampaignStatusAfterBatch(0)).toBe("completed");
  });
});

describe("jobStatusAfterBatch", () => {
  it("keeps the job resumable (pending) while the campaign is still processing", () => {
    expect(jobStatusAfterBatch("processing")).toBe("pending");
  });

  it("marks the job completed once the campaign is completed", () => {
    expect(jobStatusAfterBatch("completed")).toBe("completed");
  });

  it("treats any other campaign status as still-in-progress (resumable)", () => {
    expect(jobStatusAfterBatch("mapped")).toBe("pending");
    expect(jobStatusAfterBatch("failed")).toBe("pending");
  });
});

describe("isLockStale", () => {
  const now = new Date("2026-01-01T00:10:00Z").getTime();

  it("is never stale when there is no lock at all", () => {
    expect(isLockStale(null, JOB_STALE_LOCK_MS, now)).toBe(false);
  });

  it("is not stale within the threshold", () => {
    const lockedAt = new Date(now - JOB_STALE_LOCK_MS / 2).toISOString();
    expect(isLockStale(lockedAt, JOB_STALE_LOCK_MS, now)).toBe(false);
  });

  it("is stale once older than the threshold", () => {
    const lockedAt = new Date(now - JOB_STALE_LOCK_MS - 1000).toISOString();
    expect(isLockStale(lockedAt, JOB_STALE_LOCK_MS, now)).toBe(true);
  });

  it("is not stale exactly at the boundary (strictly greater-than)", () => {
    const lockedAt = new Date(now - JOB_STALE_LOCK_MS).toISOString();
    expect(isLockStale(lockedAt, JOB_STALE_LOCK_MS, now)).toBe(false);
  });
});

describe("summarizeCampaignProgress", () => {
  function row(overrides: Partial<RowStatusForProgress>): RowStatusForProgress {
    return { eligible: true, status: "pending", ...overrides };
  }

  it("excludes invalid-imported rows from eligibleTotal, reporting them separately", () => {
    const summary = summarizeCampaignProgress([
      row({ eligible: true, status: "generated" }),
      row({ eligible: false, status: "failed" }),
      row({ eligible: false, status: "failed" }),
    ]);
    expect(summary.eligibleTotal).toBe(1);
    expect(summary.invalidImportedTotal).toBe(2);
  });

  it("buckets eligible rows by status: generated, failed, generating, pending", () => {
    const summary = summarizeCampaignProgress([
      row({ status: "generated" }),
      row({ status: "generated" }),
      row({ status: "failed" }),
      row({ status: "generating" }),
      row({ status: "pending" }),
      row({ status: "pending" }),
    ]);
    expect(summary.generated).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.generating).toBe(1);
    expect(summary.pending).toBe(2);
    expect(summary.eligibleTotal).toBe(6);
  });

  it("computes an exact percentage from generated/eligibleTotal", () => {
    const summary = summarizeCampaignProgress([
      row({ status: "generated" }),
      row({ status: "generated" }),
      row({ status: "pending" }),
      row({ status: "pending" }),
    ]);
    expect(summary.progressPercent).toBe(50);
  });

  it("reports 0% (not NaN or a crash) when there are no eligible rows at all", () => {
    const summary = summarizeCampaignProgress([row({ eligible: false, status: "failed" })]);
    expect(summary.eligibleTotal).toBe(0);
    expect(summary.progressPercent).toBe(0);
  });

  it("treats sent/emailing as generated/generating for forward-compatibility with a future email phase", () => {
    const summary = summarizeCampaignProgress([row({ status: "sent" }), row({ status: "emailing" })]);
    expect(summary.generated).toBe(1);
    expect(summary.generating).toBe(1);
  });
});
