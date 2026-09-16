import { describe, expect, it } from "vitest";
import { computeCampaignEligibility, type CampaignRowForEligibility } from "./eligibility";
import type { FieldMapping } from "@/lib/spreadsheet/validateRows";

const nameField: Pick<FieldMapping, "field_key" | "label" | "is_required"> = {
  field_key: "name",
  label: "Name",
  is_required: true,
};
const serialField: Pick<FieldMapping, "field_key" | "label" | "is_required"> = {
  field_key: "serial_number",
  label: "Serial Number",
  is_required: true,
};

function row(overrides: Partial<CampaignRowForEligibility>): CampaignRowForEligibility {
  return { rowIndex: 0, recipientEmail: "a@example.com", data: { name: "A" }, ...overrides };
}

describe("computeCampaignEligibility", () => {
  it("two rows sharing the same valid email are BOTH ineligible", () => {
    const rows: CampaignRowForEligibility[] = [
      row({ rowIndex: 0, recipientEmail: "shared@example.com", data: { name: "Ali Khan" } }),
      row({ rowIndex: 1, recipientEmail: "shared@example.com", data: { name: "Zoe Smith" } }),
    ];
    const result = computeCampaignEligibility(rows, [nameField]);

    expect(result.get(0)?.eligible).toBe(false);
    expect(result.get(1)?.eligible).toBe(false);
    expect(result.get(0)?.errors.some((e) => e.startsWith("Duplicate email"))).toBe(true);
    expect(result.get(1)?.errors.some((e) => e.startsWith("Duplicate email"))).toBe(true);
  });

  it("two rows sharing the same serial_number are BOTH ineligible, even with distinct valid emails", () => {
    const rows: CampaignRowForEligibility[] = [
      row({
        rowIndex: 0,
        recipientEmail: "ali@example.com",
        data: { name: "Ali Khan", serial_number: "CERT-001" },
      }),
      row({
        rowIndex: 1,
        recipientEmail: "zoe@example.com",
        data: { name: "Zoe Smith", serial_number: "CERT-001" },
      }),
    ];
    const result = computeCampaignEligibility(rows, [nameField, serialField]);

    expect(result.get(0)?.eligible).toBe(false);
    expect(result.get(1)?.eligible).toBe(false);
    expect(result.get(0)?.errors.some((e) => e.startsWith("Duplicate serial number"))).toBe(true);
    expect(result.get(1)?.errors.some((e) => e.startsWith("Duplicate serial number"))).toBe(true);
  });

  it("a row that only failed generation for a transient reason (unique email/serial, all required fields present) IS eligible", () => {
    const rows: CampaignRowForEligibility[] = [
      row({
        rowIndex: 0,
        recipientEmail: "ali@example.com",
        data: { name: "Ali Khan", serial_number: "CERT-001" },
      }),
      row({
        rowIndex: 1,
        recipientEmail: "zoe@example.com",
        data: { name: "Zoe Smith", serial_number: "CERT-002" },
      }),
    ];
    const result = computeCampaignEligibility(rows, [nameField, serialField]);

    expect(result.get(0)?.eligible).toBe(true);
    expect(result.get(1)?.eligible).toBe(true);
    expect(result.get(0)?.errors).toEqual([]);
  });

  it("a missing email remains ineligible", () => {
    const rows: CampaignRowForEligibility[] = [row({ rowIndex: 0, recipientEmail: null })];
    const result = computeCampaignEligibility(rows, [nameField]);
    expect(result.get(0)?.eligible).toBe(false);
    expect(result.get(0)?.errors).toContain("Missing recipient email.");
  });

  it("an invalid email format remains ineligible", () => {
    const rows: CampaignRowForEligibility[] = [row({ rowIndex: 0, recipientEmail: "not-an-email" })];
    const result = computeCampaignEligibility(rows, [nameField]);
    expect(result.get(0)?.eligible).toBe(false);
    expect(result.get(0)?.errors).toContain("Invalid email format.");
  });

  it("a missing required field remains ineligible", () => {
    const rows: CampaignRowForEligibility[] = [row({ rowIndex: 0, data: { name: "" } })];
    const result = computeCampaignEligibility(rows, [nameField]);
    expect(result.get(0)?.eligible).toBe(false);
    expect(result.get(0)?.errors).toContain('Missing required value for "Name".');
  });

  it("duplicate detection only considers rows actually passed in this call (callers must pass the full campaign)", () => {
    // If a caller only passes ONE of the two duplicate rows, it looks
    // (incorrectly, from that narrow view) unique -- this documents why
    // retryFailedRows must always pass every row in the campaign.
    const rows: CampaignRowForEligibility[] = [
      row({ rowIndex: 0, recipientEmail: "shared@example.com", data: { name: "Ali Khan" } }),
    ];
    const result = computeCampaignEligibility(rows, [nameField]);
    expect(result.get(0)?.eligible).toBe(true);
  });

  it("ignores optional fields with no value", () => {
    const rows: CampaignRowForEligibility[] = [row({ rowIndex: 0, data: { name: "Ali Khan" } })];
    const optionalField = { field_key: "department", label: "Department", is_required: false };
    const result = computeCampaignEligibility(rows, [nameField, optionalField]);
    expect(result.get(0)?.eligible).toBe(true);
  });
});
