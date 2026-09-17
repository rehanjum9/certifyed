import { describe, expect, it } from "vitest";
import { describeEmailCompletion } from "./emailStatusCopy";

describe("describeEmailCompletion", () => {
  it("all successful", () => {
    const summary = describeEmailCompletion({ eligibleTotal: 2, sent: 2, failed: 0, pending: 0, emailing: 0 });
    expect(summary).toEqual({ lines: ["All 2 certificates were emailed successfully."], tone: "success" });
  });

  it("singular total, fully sent", () => {
    const summary = describeEmailCompletion({ eligibleTotal: 1, sent: 1, failed: 0, pending: 0, emailing: 0 });
    expect(summary).toEqual({ lines: ["The certificate was emailed successfully."], tone: "success" });
  });

  it("partial failure, nothing left outstanding", () => {
    const summary = describeEmailCompletion({ eligibleTotal: 2, sent: 1, failed: 1, pending: 0, emailing: 0 });
    expect(summary).toEqual({
      lines: ["1 of 2 certificates emailed successfully.", "1 email failed."],
      tone: "warning",
    });
  });

  it("multiple failures", () => {
    const summary = describeEmailCompletion({ eligibleTotal: 10, sent: 8, failed: 2, pending: 0, emailing: 0 });
    expect(summary).toEqual({
      lines: ["8 of 10 certificates emailed successfully.", "2 emails failed."],
      tone: "warning",
    });
  });

  it("still pending, no failures -- never claims success", () => {
    const summary = describeEmailCompletion({ eligibleTotal: 2, sent: 1, failed: 0, pending: 1, emailing: 0 });
    expect(summary).toEqual({
      lines: ["1 of 2 certificates emailed.", "1 pending."],
      tone: "neutral",
    });
  });

  it("counts rows currently emailing as outstanding, same as pending", () => {
    const summary = describeEmailCompletion({ eligibleTotal: 3, sent: 1, failed: 0, pending: 0, emailing: 2 });
    expect(summary.lines).toContain("2 pending.");
    expect(summary.tone).toBe("neutral");
  });

  it("combines a failure with still-outstanding rows", () => {
    const summary = describeEmailCompletion({ eligibleTotal: 4, sent: 1, failed: 1, pending: 2, emailing: 0 });
    expect(summary).toEqual({
      lines: ["1 of 4 certificates emailed.", "1 email failed.", "2 pending."],
      tone: "warning",
    });
  });

  it("never returns the misleading blanket success line when any failure exists", () => {
    const summary = describeEmailCompletion({ eligibleTotal: 5, sent: 4, failed: 1, pending: 0, emailing: 0 });
    expect(summary.lines.join(" ")).not.toBe("All eligible certificates have been emailed.");
    expect(summary.tone).toBe("warning");
  });
});
