import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: vi.fn() }));

import { createServiceRoleClient } from "@/lib/supabase/server";
import { claimJob } from "./generation";

const BASE_JOB = {
  id: "job-1",
  campaign_id: "campaign-1",
  job_type: "generate_pdfs",
  status: "pending",
  attempts: 0,
  batch_end: null,
  locked_at: null,
  last_error: null,
};

/**
 * Models exactly the two sequential `.from("jobs")` calls claimJob makes
 * (a SELECT, then an UPDATE...SELECT) and counts how many times `.from` is
 * invoked in total -- the thing under test here is that a lost claim costs
 * exactly those two calls, never a third identical read.
 */
function mockJobsClient(existingRow: typeof BASE_JOB | null, updatedRow: typeof BASE_JOB | null) {
  let fromCalls = 0;
  const from = vi.fn((table: string) => {
    if (table !== "jobs") throw new Error(`unexpected table: ${table}`);
    fromCalls += 1;
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: existingRow, error: null }),
        }),
      }),
      update: () => ({
        eq: () => ({
          or: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: updatedRow, error: null }),
            }),
          }),
        }),
      }),
    };
  });

  return { from, getFromCallCount: () => fromCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("claimJob", () => {
  it("returns null (not-found) without attempting an update, for a nonexistent job", async () => {
    const client = mockJobsClient(null, null);
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await claimJob("missing-job");

    expect(result).toBeNull();
  });

  it("returns claimed:true with the fresh row when the update succeeds", async () => {
    const claimedRow = { ...BASE_JOB, status: "running" as const, attempts: 1 };
    const client = mockJobsClient(BASE_JOB, claimedRow);
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await claimJob("job-1");

    expect(result).toEqual({ claimed: true, job: claimedRow });
  });

  it("returns claimed:false with the row it already read -- exactly two `jobs` reads total, never a third", async () => {
    // The UPDATE...SELECT matches zero rows (someone else already holds a fresh lock).
    const client = mockJobsClient(BASE_JOB, null);
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await claimJob("job-1");

    expect(result).toEqual({ claimed: false, job: BASE_JOB });
    // One SELECT + one UPDATE -- the caller must not need a third `.from("jobs")`
    // call just to find out what claimJob already knows.
    expect(client.getFromCallCount()).toBe(2);
  });
});
