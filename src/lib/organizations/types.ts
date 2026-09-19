import type { Database, OrganizationRole } from "@/types/database";

export type { OrganizationRole };

export type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];
export type OrganizationMemberRow = Database["public"]["Tables"]["organization_members"]["Row"];
export type OrganizationInviteRow = Database["public"]["Tables"]["organization_invites"]["Row"];

/** One organization the current user belongs to, with their role in it -- the shape every workspace-aware UI/auth check actually needs, never the raw membership row's own id. */
export interface Membership {
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
}

export interface OrganizationMemberSummary {
  userId: string;
  email: string | null;
  role: OrganizationRole;
  createdAt: string;
}
