import { describe, expect, it } from "vitest";
import { validateRows, type FieldMapping } from "./validateRows";

// Columns: [0]=Name [1]=Email [2]=Serial Number [3]=Department (optional)
const nameField: FieldMapping = { field_key: "name", label: "Name", is_required: true, columnIndex: 0 };
const serialField: FieldMapping = {
  field_key: "serial_number",
  label: "Serial Number",
  is_required: true,
  columnIndex: 2,
};
const departmentField: FieldMapping = {
  field_key: "department",
  label: "Department",
  is_required: false,
  columnIndex: 3,
};

describe("validateRows", () => {
  it("marks a fully valid row as valid with no errors", () => {
    const outcome = validateRows(
      [["Ali Khan", "ali@example.com", "CERT-001", "Engineering"]],
      1,
      [nameField, serialField, departmentField],
    );
    expect(outcome.rows[0].status).toBe("valid");
    expect(outcome.rows[0].errors).toEqual([]);
    expect(outcome.summary).toEqual({ total: 1, valid: 1, invalid: 0, warnings: 0 });
  });

  it("never puts the email into the data object", () => {
    const outcome = validateRows([["Ali Khan", "ali@example.com", "CERT-001", ""]], 1, [nameField, serialField]);
    expect(outcome.rows[0].data).toEqual({ name: "Ali Khan", serial_number: "CERT-001" });
    expect(Object.values(outcome.rows[0].data)).not.toContain("ali@example.com");
    expect(outcome.rows[0].recipientEmail).toBe("ali@example.com");
  });

  it("flags a missing email", () => {
    const outcome = validateRows([["Ali Khan", "", "CERT-001", ""]], 1, [nameField, serialField]);
    expect(outcome.rows[0].status).toBe("invalid");
    expect(outcome.rows[0].errors).toContain("Missing recipient email.");
    expect(outcome.rows[0].recipientEmail).toBeNull();
  });

  it("flags an invalid email format", () => {
    const outcome = validateRows([["Ali Khan", "not-an-email", "CERT-001", ""]], 1, [nameField, serialField]);
    expect(outcome.rows[0].status).toBe("invalid");
    expect(outcome.rows[0].errors).toContain("Invalid email format.");
  });

  it("flags duplicate emails on both rows, case-insensitively", () => {
    const outcome = validateRows(
      [
        ["Ali Khan", "ali@example.com", "CERT-001", ""],
        ["Ali K.", "ALI@EXAMPLE.COM", "CERT-002", ""],
      ],
      1,
      [nameField, serialField],
    );
    expect(outcome.rows[0].errors.some((e) => e.startsWith("Duplicate email"))).toBe(true);
    expect(outcome.rows[1].errors.some((e) => e.startsWith("Duplicate email"))).toBe(true);
  });

  it("flags a missing required field value", () => {
    const outcome = validateRows([["", "ali@example.com", "CERT-001", ""]], 1, [nameField, serialField]);
    expect(outcome.rows[0].errors).toContain('Missing required value for "Name".');
  });

  it("allows an optional field to be blank without an error", () => {
    const outcome = validateRows(
      [["Ali Khan", "ali@example.com", "CERT-001", ""]],
      1,
      [nameField, serialField, departmentField],
    );
    expect(outcome.rows[0].status).toBe("valid");
  });

  it("treats a fully blank row as invalid with a single clear error", () => {
    const outcome = validateRows([["", "", "", ""]], 1, [nameField, serialField]);
    expect(outcome.rows[0].status).toBe("invalid");
    expect(outcome.rows[0].errors).toEqual(["Blank row."]);
  });

  it("flags duplicate serial numbers only when a serial_number field is mapped", () => {
    const withSerial = validateRows(
      [
        ["Ali Khan", "ali@example.com", "CERT-001", ""],
        ["Zoe Smith", "zoe@example.com", "CERT-001", ""],
      ],
      1,
      [nameField, serialField],
    );
    expect(withSerial.rows[0].errors.some((e) => e.startsWith("Duplicate serial number"))).toBe(true);
    expect(withSerial.rows[1].errors.some((e) => e.startsWith("Duplicate serial number"))).toBe(true);

    const withoutSerialField = validateRows(
      [
        ["Ali Khan", "ali@example.com", "CERT-001", ""],
        ["Zoe Smith", "zoe@example.com", "CERT-001", ""],
      ],
      1,
      [nameField],
    );
    expect(withoutSerialField.rows[0].status).toBe("valid");
    expect(withoutSerialField.rows[1].status).toBe("valid");
  });

  it("computes an accurate summary across mixed valid/invalid rows", () => {
    const outcome = validateRows(
      [
        ["Ali Khan", "ali@example.com", "CERT-001", ""],
        ["", "", "", ""],
        ["Zoe Smith", "not-an-email", "CERT-002", ""],
      ],
      1,
      [nameField, serialField],
    );
    expect(outcome.summary).toEqual({ total: 3, valid: 1, invalid: 2, warnings: 0 });
  });
});
