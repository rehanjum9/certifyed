import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconSettings } from "@/components/ui/icons";

export default function SettingsPage() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <PageHeader title="Settings" description="Account and application preferences." />

        <EmptyState
          icon={<IconSettings className="h-6 w-6" />}
          title="Nothing to configure yet"
          description="Settings will be added once authentication and campaign configuration exist."
        />
      </div>
    </PageContainer>
  );
}
