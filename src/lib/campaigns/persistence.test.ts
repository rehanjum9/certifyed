import { describe, expect, it } from "vitest";
import { buildCampaignRowInserts, buildColumnMapping, resolveEmailColumnHeader } from "./persistence";
import type { RowValidationResult, FieldMapping } from "@/lib/spreadsheet/validateRows";

describe("buildCampaignRowInserts", () => {
  it("maps recipientEmail to recipient_email and never into data", () => {
    const validated: RowValidationResult[] = [
      {
        rowIndex: 0,
        recipientEmail: "ali@example.com",
        data: { name: "Ali Khan" },
        status: "valid",
        errors: [],
      },
    ];

    const [insert] = buildCampaignRowInserts("campaign-1", validated);
    expect(insert.recipient_email).toBe("ali@example.com");
    expect(insert.data).toEqual({ name: "Ali Khan" });
    expect(Object.values(insert.data as Record<string, string>)).not.toContain("ali@example.com");
  });

  it("maps valid rows to pending status with no error message", () => {
    const validated: RowValidationResult[] = [
      { rowIndex: 0, recipientEmail: "a@example.com", data: {}, status: "valid", errors: [] },
    ];
    const [insert] = buildCampaignRowInserts("c1", validated);
    expect(insert.status).toBe("pending");
    expect(insert.error_message).toBeNull();
  });

  it("maps invalid rows to failed status with a joined error message", () => {
    const validated: RowValidationResult[] = [
      {
        rowIndex: 0,
        recipientEmail: null,
        data: {},
        status: "invalid",
        errors: ["Missing recipient email.", 'Missing required value for "Name".'],
      },
    ];
    const [insert] = buildCampaignRowInserts("c1", validated);
    expect(insert.status).toBe("failed");
    expect(insert.error_message).toBe('Missing recipient email. Missing required value for "Name".');
    expect(insert.recipient_email).toBeNull();
  });

  it("preserves row_index and campaign_id", () => {
    const validated: RowValidationResult[] = [
      { rowIndex: 4, recipientEmail: "a@example.com", data: {}, status: "valid", errors: [] },
    ];
    const [insert] = buildCampaignRowInserts("campaign-xyz", validated);
    expect(insert.row_index).toBe(4);
    expect(insert.campaign_id).toBe("campaign-xyz");
  });
});

describe("buildColumnMapping", () => {
  const headers = ["Full Name", "Email", "Serial No"];

  it("maps field_key to the header text at the mapped column index", () => {
    const mappings: FieldMapping[] = [
      { field_key: "name", label: "Name", is_required: true, columnIndex: 0 },
      { field_key: "serial_number", label: "Serial Number", is_required: true, columnIndex: 2 },
    ];
    expect(buildColumnMapping(headers, mappings)).toEqual({
      name: "Full Name",
      serial_number: "Serial No",
    });
  });

  it("omits unmapped (optional) fields", () => {
    const mappings: FieldMapping[] = [
      { field_key: "name", label: "Name", is_required: true, columnIndex: 0 },
      { field_key: "department", label: "Department", is_required: false, columnIndex: null },
    ];
    expect(buildColumnMapping(headers, mappings)).toEqual({ name: "Full Name" });
  });
});

describe("resolveEmailColumnHeader", () => {
  it("returns the header text at the given index", () => {
    expect(resolveEmailColumnHeader(["Name", "Email"], 1)).toBe("Email");
  });

  it("returns null for an out-of-range index", () => {
    expect(resolveEmailColumnHeader(["Name", "Email"], 5)).toBeNull();
  });
});
