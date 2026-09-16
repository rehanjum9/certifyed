import { describe, expect, it } from "vitest";
import {
  clampBatchSize,
  computeCampaignStatusAfterBatch,
  DEFAULT_BATCH_SIZE,
  MIN_BATCH_SIZE,
  MAX_BATCH_SIZE,
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
