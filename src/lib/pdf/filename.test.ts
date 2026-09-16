import { describe, expect, it } from "vitest";
import { buildCertificateFilename } from "./filename";

describe("buildCertificateFilename", () => {
  it("builds the preferred <name>-<serial>-<suffix>.pdf format", () => {
    const filename = buildCertificateFilename({
      recipientName: "Ali Khan",
      serialNumber: "CERT-001",
      rowId: "11111111-2222-3333-4444-555566667777",
    });
    expect(filename).toBe("Ali_Khan-CERT-001-66667777.pdf");
  });

  it("falls back to 'certificate' when there is no serial number", () => {
    const filename = buildCertificateFilename({
      recipientName: "Ali Khan",
      serialNumber: null,
      rowId: "11111111-2222-3333-4444-555566667777",
    });
    expect(filename).toBe("Ali_Khan-certificate-66667777.pdf");
  });

  it("falls back to 'recipient' when there is no name", () => {
    const filename = buildCertificateFilename({
      recipientName: null,
      serialNumber: "CERT-001",
      rowId: "11111111-2222-3333-4444-555566667777",
    });
    expect(filename).toBe("recipient-CERT-001-66667777.pdf");
  });

  it("strips filesystem-unsafe characters", () => {
    const filename = buildCertificateFilename({
      recipientName: 'Ali <Khan>:"weird"|name?',
      serialNumber: "CERT*001",
      rowId: "11111111-2222-3333-4444-555566667777",
    });
    expect(filename).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("neutralizes path-traversal attempts", () => {
    const filename = buildCertificateFilename({
      recipientName: "../../etc/passwd",
      serialNumber: "../secret",
      rowId: "11111111-2222-3333-4444-555566667777",
    });
    expect(filename).not.toContain("..");
    expect(filename).not.toContain("/");
  });

  it("caps the filename length", () => {
    const filename = buildCertificateFilename({
      recipientName: "A".repeat(500),
      serialNumber: "B".repeat(500),
      rowId: "11111111-2222-3333-4444-555566667777",
    });
    expect(filename.length).toBeLessThanOrEqual(154); // 150 + ".pdf"
  });

  it("produces different filenames for different rows with identical name and serial", () => {
    const a = buildCertificateFilename({
      recipientName: "Ali Khan",
      serialNumber: "CERT-001",
      rowId: "11111111-1111-1111-1111-111111111111",
    });
    const b = buildCertificateFilename({
      recipientName: "Ali Khan",
      serialNumber: "CERT-001",
      rowId: "22222222-2222-2222-2222-222222222222",
    });
    expect(a).not.toBe(b);
  });

  it("preserves accented Latin characters", () => {
    const filename = buildCertificateFilename({
      recipientName: "José García",
      serialNumber: "CERT-002",
      rowId: "11111111-2222-3333-4444-555566667777",
    });
    expect(filename).toContain("José_García");
  });
});
