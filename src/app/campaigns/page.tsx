import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { IconCampaigns } from "@/components/ui/icons";

export default function CampaignsPage() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Campaigns"
          description="Upload a roster and run a bulk certificate generation."
        />

        <EmptyState
          icon={<IconCampaigns className="h-6 w-6" />}
          title="No campaigns yet"
          description="Excel/CSV upload, column mapping, and bulk generation land in a later phase."
          action={
            <Button variant="secondary" disabled title="Coming in a later phase">
              New campaign
            </Button>
          }
        />
      </div>
    </PageContainer>
  );
}
