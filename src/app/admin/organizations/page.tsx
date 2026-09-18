import { notFound } from "next/navigation";
import { getAuthenticatedPageUser } from "@/lib/organizations/pageContext";
import { listAllOrganizations } from "@/lib/organizations/organizations";
import { CreateOrganizationForm } from "@/components/admin/CreateOrganizationForm";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/ui/Card";
import { formatDate } from "@/lib/format";

// Always reflects the current DB state; never statically cached.
export const dynamic = "force-dynamic";

/**
 * Platform-admin-only (architecture report, item 11). Enforced here, not
 * just by hiding the sidebar's Admin link -- a non-admin hitting this URL
 * directly gets a plain 404, identical to a route that doesn't exist,
 * rather than a page revealing that an admin area exists at all.
 *
 * Deliberately minimal: workspace name, member count, created date, and
 * the ability to create a workspace + invite its first owner. Never shows
 * recipient/certificate/template content from any workspace -- that
 * still requires real membership (see lib/organizations/organizations.ts
 * #listAllOrganizations's doc comment).
 */
export default async function AdminOrganizationsPage() {
  const user = await getAuthenticatedPageUser();
  if (!user.isPlatformAdmin) notFound();

  const organizations = await listAllOrganizations();

  return (
    <PageContainer>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-slate-900">
            <span className="text-emerald-600">&gt;</span> admin_
          </h1>
          <p className="mt-1 text-sm text-slate-500">Create workspaces and invite their first owner. Platform-admin only.</p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-sm font-semibold text-slate-900">create_workspace_</h2>
          <Card className="shadow-none">
            <div className="p-5">
              <CreateOrganizationForm />
            </div>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-sm font-semibold text-slate-900">workspaces_ ({organizations.length})</h2>
          {organizations.length === 0 ? (
            <p className="text-sm text-slate-500">No workspaces yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
              {organizations.map((org) => (
                <div key={org.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{org.name}</p>
                    <p className="text-xs text-slate-400">created {formatDate(org.created_at)}</p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-slate-500">
                    {org.memberCount} member{org.memberCount === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
