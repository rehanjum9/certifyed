import { describe, expect, it } from "vitest";
import { buildActivityEntries } from "./dashboard";

describe("buildActivityEntries", () => {
  it("never includes an '@' character anywhere in any entry's text (no email address can leak in)", () => {
    const entries = buildActivityEntries({
      generatedRows: [{ updated_at: "2026-01-01T00:00:00Z" }],
      sentRows: [{ emailed_at: "2026-01-02T00:00:00Z" }],
      completedCampaigns: [{ name: "Spring Cohort", updated_at: "2026-01-03T00:00:00Z" }],
      newTemplates: [{ name: "Course Certificate", created_at: "2026-01-04T00:00:00Z" }],
    });

    for (const entry of entries) {
      expect(entry.text).not.toContain("@");
    }
  });

  it("uses generic, non-identifying text for generated/sent certificates", () => {
    const entries = buildActivityEntries({
      generatedRows: [{ updated_at: "2026-01-01T00:00:00Z" }],
      sentRows: [{ emailed_at: "2026-01-02T00:00:00Z" }],
      completedCampaigns: [],
      newTemplates: [],
    });

    expect(entries.find((e) => e.kind === "generated")?.text).toBe("Certificate generated");
    expect(entries.find((e) => e.kind === "sent")?.text).toBe("Certificate sent");
  });

  it("skips a sent row with no emailed_at rather than fabricating a timestamp", () => {
    const entries = buildActivityEntries({
      generatedRows: [],
      sentRows: [{ emailed_at: null }],
      completedCampaigns: [],
      newTemplates: [],
    });
    expect(entries.find((e) => e.kind === "sent")).toBeUndefined();
  });

  it("sorts all entry kinds together by timestamp, most recent first", () => {
    const entries = buildActivityEntries({
      generatedRows: [{ updated_at: "2026-01-01T00:00:00Z" }],
      sentRows: [{ emailed_at: "2026-01-05T00:00:00Z" }],
      completedCampaigns: [{ name: "Old Campaign", updated_at: "2026-01-02T00:00:00Z" }],
      newTemplates: [{ name: "New Template", created_at: "2026-01-03T00:00:00Z" }],
    });

    const timestamps = entries.map((e) => e.timestamp);
    const sorted = [...timestamps].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    expect(timestamps).toEqual(sorted);
  });

  it("still names the campaign/template itself (not recipient data) for completed/uploaded entries", () => {
    const entries = buildActivityEntries({
      generatedRows: [],
      sentRows: [],
      completedCampaigns: [{ name: "Spring Cohort", updated_at: "2026-01-01T00:00:00Z" }],
      newTemplates: [{ name: "Course Certificate", created_at: "2026-01-02T00:00:00Z" }],
    });

    expect(entries.find((e) => e.kind === "campaign_completed")?.text).toBe("Campaign completed: Spring Cohort");
    expect(entries.find((e) => e.kind === "template_created")?.text).toBe("Template uploaded: Course Certificate");
  });
});
