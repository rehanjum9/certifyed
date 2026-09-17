import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/email/provider", () => ({ sendCertificateEmail: vi.fn() }));

import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendCertificateEmail } from "@/lib/email/provider";
import { sendTestCertificateEmail } from "./emailDelivery";

/** A stub where every chained call returns itself; the terminal read always resolves to `result`. Robust to the exact method-call sequence a real Supabase query builder uses. */
function chainable(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.select = self;
  obj.eq = self;
  obj.not = self;
  obj.order = self;
  obj.limit = self;
  obj.maybeSingle = async () => result;
  obj.single = async () => result;
  return obj;
}

function mockSupabase(campaignName: string, row: Record<string, unknown>) {
  return {
    from: (table: string) => {
      if (table === "campaigns") return chainable({ data: { id: "c1", name: campaignName }, error: null });
      return chainable({ data: row, error: null });
    },
    storage: {
      from: () => ({
        download: async () => ({
          data: { arrayBuffer: async () => new TextEncoder().encode("pdf-bytes").buffer },
          error: null,
        }),
      }),
    },
  };
}

describe("sendTestCertificateEmail subject sanitization", () => {
  beforeEach(() => {
    vi.mocked(sendCertificateEmail).mockResolvedValue({ messageId: "msg_1" });
  });

  it("reuses the same sanitized subject as a real send, prefixed with [TEST] -- never a second raw subject built from campaign.name", async () => {
    const campaignName = "Grad Ceremony\r\nBcc: evil@example.com";
    const row = {
      id: "row-1",
      pdf_path: "campaigns/c1/row-1.pdf",
      data: { name: "Ali Khan", serial_number: "CERT-101" },
      recipient_email: "ali@example.com",
    };
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase(campaignName, row) as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    await sendTestCertificateEmail({ campaignId: "c1", testEmail: "dev@example.com" });

    expect(sendCertificateEmail).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendCertificateEmail).mock.calls[0][0];

    // Same header-injection stripping renderCertificateEmail already applies to a real send.
    expect(call.subject).not.toMatch(/[\r\n]/);
    expect(call.subject).toBe("[TEST] Your certificate — Grad Ceremony Bcc: evil@example.com");
  });
});
