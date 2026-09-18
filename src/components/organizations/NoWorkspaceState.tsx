import { LogoutButton } from "@/components/auth/LogoutButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/ui/Card";

/**
 * Rendered by every authenticated page when the signed-in user belongs to
 * no organization at all (see lib/organizations/pageContext.ts). A real,
 * intentional state -- not an error -- for someone whose invite was
 * revoked, or a platform admin who hasn't been added to any workspace
 * (architecture report, item 2: platform admin status never implies
 * automatic workspace access).
 */
export function NoWorkspaceState() {
  return (
    <PageContainer>
      <div className="mx-auto max-w-md py-16 text-center">
        <Card className="shadow-none">
          <div className="flex flex-col gap-3 p-6">
            <p className="font-mono text-xs font-semibold uppercase tracking-wide text-emerald-600">&gt; no_workspace_</p>
            <h1 className="text-lg font-semibold text-slate-900">You don&apos;t belong to a workspace yet</h1>
            <p className="text-sm text-slate-500">
              Ask a platform administrator to invite you to your club&apos;s workspace. Once accepted, it will appear
              here automatically.
            </p>
            <div className="mt-2 border-t border-slate-100 pt-4">
              <LogoutButton />
            </div>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
