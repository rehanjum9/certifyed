import { describe, expect, it } from "vitest";
import { describeGenerationCompletion } from "./generationStatusCopy";

describe("describeGenerationCompletion", () => {
  it("all successful", () => {
    const summary = describeGenerationCompletion({ eligibleTotal: 3, generated: 3, failed: 0, pending: 0, generating: 0 });
    expect(summary).toEqual({ lines: ["All 3 certificates were generated successfully."], tone: "success" });
  });

  it("singular total, fully generated", () => {
    const summary = describeGenerationCompletion({ eligibleTotal: 1, generated: 1, failed: 0, pending: 0, generating: 0 });
    expect(summary).toEqual({ lines: ["The certificate was generated successfully."], tone: "success" });
  });

  it("partial failure, nothing left outstanding", () => {
    const summary = describeGenerationCompletion({ eligibleTotal: 5, generated: 4, failed: 1, pending: 0, generating: 0 });
    expect(summary).toEqual({
      lines: ["4 of 5 certificates generated successfully.", "1 certificate failed to generate."],
      tone: "warning",
    });
  });

  it("still pending, no failures -- never claims success", () => {
    const summary = describeGenerationCompletion({ eligibleTotal: 2, generated: 1, failed: 0, pending: 1, generating: 0 });
    expect(summary).toEqual({
      lines: ["1 of 2 certificates generated.", "1 pending."],
      tone: "neutral",
    });
  });
});
