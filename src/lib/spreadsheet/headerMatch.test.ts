import { describe, expect, it } from "vitest";
import { normalizeHeader, autoMatchEmailColumn, autoMatchFieldColumn } from "./headerMatch";

describe("normalizeHeader", () => {
  it("lowercases and strips punctuation/whitespace", () => {
    expect(normalizeHeader("Email Address")).toBe("emailaddress");
    expect(normalizeHeader("E-mail")).toBe("email");
    expect(normalizeHeader("  Full Name  ")).toBe("fullname");
  });
});

describe("autoMatchEmailColumn", () => {
  it.each([
    ["Email"],
    ["Email Address"],
    ["E-mail"],
    ["Recipient Email"],
  ])("matches a header that looks like an email column: %s", (header) => {
    const index = autoMatchEmailColumn(["Name", header, "Course"]);
    expect(index).toBe(1);
  });

  it("returns null when no header looks like an email column", () => {
    expect(autoMatchEmailColumn(["Name", "Course", "Grade"])).toBeNull();
  });

  it("returns null (ambiguous) when more than one header could match", () => {
    expect(autoMatchEmailColumn(["Email", "E-mail"])).toBeNull();
  });
});

describe("autoMatchFieldColumn", () => {
  it("matches known aliases for common field keys", () => {
    expect(autoMatchFieldColumn(["Full Name", "Email"], "name", "Name")).toBe(0);
    expect(autoMatchFieldColumn(["Name", "Serial No"], "serial_number", "Serial Number")).toBe(1);
    expect(autoMatchFieldColumn(["Name", "Certificate ID"], "serial_number", "Serial Number")).toBe(1);
  });

  it("matches on the field's own label when no known alias applies", () => {
    expect(autoMatchFieldColumn(["Department", "Name"], "department", "Department")).toBe(0);
  });

  it("returns null for a custom field key with no matching header", () => {
    expect(autoMatchFieldColumn(["Name", "Email"], "award_title", "Award Title")).toBeNull();
  });

  it("does not match email headers as a fallback for other fields", () => {
    expect(autoMatchFieldColumn(["Email", "Course"], "name", "Name")).toBeNull();
  });
});
