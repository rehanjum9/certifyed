import { NextResponse } from "next/server";
import { getCampaign, getCampaignRow } from "@/lib/campaigns";
import { buildCertificateFilename } from "@/lib/pdf/filename";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage";
import { requireOrganizationContext } from "@/lib/auth/organizationGuard";

/**
 * Secure download proxy: the output bucket is private, so every download
 * goes through this server route (using the service-role key server-side
 * only) rather than a public URL or an exposed bucket. `campaignId` is
 * verified against the caller's active organization FIRST -- a row can
 * only ever be reached through a campaign that already belongs to that
 * organization (architecture report, item 24), so a foreign campaign id
 * 404s here before campaign_rows (which has no organization_id of its
 * own) is ever queried.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/campaigns/[campaignId]/rows/[rowId]/pdf">,
) {
  const guard = await requireOrganizationContext();
  if ("response" in guard) return guard.response;

  const { campaignId, rowId } = await params;

  const campaign = await getCampaign(campaignId, guard.organizationId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const row = await getCampaignRow(campaignId, rowId);

  if (!row) {
    return NextResponse.json({ error: "Row not found." }, { status: 404 });
  }
  if (!row.pdf_path) {
    return NextResponse.json({ error: "This row has not been generated yet." }, { status: 404 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage.from(STORAGE_BUCKETS.outputs).download(row.pdf_path);

  if (error || !data) {
    return NextResponse.json({ error: "Failed to load the certificate file. Please try again." }, { status: 500 });
  }

  const rowData = (row.data ?? {}) as Record<string, string>;
  const filename = buildCertificateFilename({
    recipientName: rowData.name || null,
    serialNumber: rowData.serial_number || null,
    rowId: row.id,
  });

  const buffer = Buffer.from(await data.arrayBuffer());

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
