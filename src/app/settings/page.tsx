import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconSettings } from "@/components/ui/icons";

export default function SettingsPage() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-slate-900">
            <span className="text-emerald-600">&gt;</span> settings_
          </h1>
          <p className="mt-1 text-sm text-slate-500">Account and application preferences.</p>
        </div>

        <EmptyState
          icon={<IconSettings className="h-6 w-6" />}
          title="Nothing to configure yet"
          description="Settings will be added once authentication and campaign configuration exist."
        />
      </div>
    </PageContainer>
  );
}
