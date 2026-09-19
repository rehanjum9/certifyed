import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Same caveat as every other migration test in this directory: no
// live-Postgres integration harness exists here, so these are static
// assertions against the migration's SQL text -- a regression guard, not a
// substitute for actually applying this against a real Supabase project
// and exercising it (see the accompanying report's manual verification
// steps).
const MIGRATION_SQL = readFileSync(path.join(import.meta.dirname, "0011_simplify_workspace_roles.sql"), "utf8");
const CODE_ONLY = MIGRATION_SQL.replace(/--.*$/gm, "");

describe("0011 -- admin role removed safely, never guessed toward owner", () => {
  it("backfills existing role='admin' rows to 'member' on both organization_members and organization_invites, never to 'owner'", () => {
    expect(CODE_ONLY).toMatch(/update public\.organization_members set role = 'member' where role = 'admin';/);
    expect(CODE_ONLY).toMatch(/update public\.organization_invites set role = 'member' where role = 'admin';/);
    expect(CODE_ONLY).not.toMatch(/set role = 'owner' where role = 'admin'/);
  });

  it("reports the admin-row counts before converting them", () => {
    expect(CODE_ONLY).toMatch(/select count\(\*\) into admin_member_count from public\.organization_members where role = 'admin';/);
    expect(CODE_ONLY).toContain("raise notice");
  });

  it("refuses to proceed if any organization with existing members lacks exactly one owner", () => {
    expect(CODE_ONLY).toMatch(/count\(\*\) filter \(where role = 'owner'\) as owner_count/);
    expect(CODE_ONLY).toMatch(/where owner_count <> 1/);
    expect(CODE_ONLY).toContain("raise exception");
  });

  it("tightens both role CHECK constraints to owner/member only, dropping the old one defensively with IF EXISTS", () => {
    expect(CODE_ONLY).toMatch(/drop constraint if exists organization_members_role_check/);
    expect(CODE_ONLY).toMatch(/add constraint organization_members_role_check check \(role in \('owner', 'member'\)\)/);
    expect(CODE_ONLY).toMatch(/drop constraint if exists organization_invites_role_check/);
    expect(CODE_ONLY).toMatch(/add constraint organization_invites_role_check check \(role in \('owner', 'member'\)\)/);
    // Neither new CHECK constraint itself re-admits 'admin' -- the only
    // 'admin' text left anywhere in the file is STEP 1's one-time backfill
    // (converting existing admin rows away), asserted separately above.
    expect(CODE_ONLY).not.toMatch(/add constraint \w+_role_check check \([^)]*'admin'[^)]*\)/);
  });
});

describe("0011 -- exactly-one-owner is enforced at the database level via a deferred constraint trigger", () => {
  it("defines enforce_exactly_one_owner as a real function, not a plain check", () => {
    expect(CODE_ONLY).toMatch(/create or replace function public\.enforce_exactly_one_owner\(\)/);
    expect(CODE_ONLY).toMatch(/security definer/);
    expect(CODE_ONLY).toMatch(/set search_path = public/);
  });

  it("skips enforcement once the parent organization no longer exists -- the cascade-delete exception, same as 0010", () => {
    expect(CODE_ONLY).toMatch(/select exists\(select 1 from public\.organizations where id = target_org_id\) into org_still_exists;/);
    expect(CODE_ONLY).toMatch(/if not org_still_exists then\s*return null;/);
  });

  it("raises when owner_count is anything other than exactly 1", () => {
    expect(CODE_ONLY).toMatch(/if owner_count <> 1 then/);
    expect(CODE_ONLY).toContain("must have exactly one owner");
  });

  it("is a DEFERRABLE INITIALLY DEFERRED constraint trigger -- not an immediate one -- so a same-transaction promote-then-demote transfer is never rejected mid-flight", () => {
    expect(CODE_ONLY).toMatch(/create constraint trigger organization_members_exactly_one_owner/);
    expect(CODE_ONLY).toMatch(/after insert or update or delete on public\.organization_members/);
    expect(CODE_ONLY).toMatch(/deferrable initially deferred/);
  });

  it("revokes PUBLIC execute on the new enforcement function", () => {
    expect(CODE_ONLY).toMatch(/revoke all on function public\.enforce_exactly_one_owner\(\) from public;/);
  });
});

describe("0011 -- atomic ownership transfer via a single RPC function", () => {
  it("defines transfer_organization_ownership with the three expected parameters", () => {
    expect(CODE_ONLY).toMatch(
      /create or replace function public\.transfer_organization_ownership\(\s*p_organization_id uuid,\s*p_current_owner_id uuid,\s*p_new_owner_id uuid\s*\)/,
    );
  });

  it("locks both rows (for update) before making any change, guarding against a concurrent race", () => {
    const forUpdateMatches = CODE_ONLY.match(/for update/g) ?? [];
    expect(forUpdateMatches.length).toBeGreaterThanOrEqual(2);
  });

  it("validates the caller-supplied current owner is genuinely the current owner before doing anything", () => {
    expect(CODE_ONLY).toMatch(/if current_owner_role is distinct from 'owner' then/);
  });

  it("validates the new owner candidate is an existing member of the same organization", () => {
    expect(CODE_ONLY).toMatch(/if new_owner_role is null then/);
  });

  it("refuses a no-op transfer to the same user", () => {
    expect(CODE_ONLY).toMatch(/if p_current_owner_id = p_new_owner_id then/);
  });

  it("promotes the new owner before demoting the current one, in that exact order", () => {
    const promoteIndex = CODE_ONLY.indexOf("set role = 'owner'\n  where organization_id = p_organization_id and user_id = p_new_owner_id;");
    const demoteIndex = CODE_ONLY.indexOf("set role = 'member'\n  where organization_id = p_organization_id and user_id = p_current_owner_id;");
    expect(promoteIndex).toBeGreaterThan(-1);
    expect(demoteIndex).toBeGreaterThan(-1);
    expect(promoteIndex).toBeLessThan(demoteIndex);
  });

  it("is never granted to authenticated or public -- only service_role can call it", () => {
    expect(CODE_ONLY).toMatch(/revoke all on function public\.transfer_organization_ownership\(uuid, uuid, uuid\) from public;/);
    expect(CODE_ONLY).toMatch(/grant execute on function public\.transfer_organization_ownership\(uuid, uuid, uuid\) to service_role;/);
    expect(CODE_ONLY).not.toMatch(/grant execute on function public\.transfer_organization_ownership.*to authenticated/);
  });
});

describe("0011 -- enforce_exactly_one_owner resolves target_org_id safely per tg_op (NEW/OLD trigger bug fix)", () => {
  it("no longer uses coalesce(new.organization_id, old.organization_id) -- that ordering evaluates NEW first, which is unassigned on DELETE", () => {
    expect(CODE_ONLY).not.toMatch(/target_org_id\s*:=\s*coalesce\(new\.organization_id,\s*old\.organization_id\)/);
  });

  it("branches explicitly on tg_op = 'DELETE': OLD for DELETE, NEW for everything else", () => {
    expect(CODE_ONLY).toMatch(/if tg_op = 'DELETE' then\s*target_org_id := old\.organization_id;\s*else\s*target_org_id := new\.organization_id;\s*end if;/);
  });
});

/**
 * A literal, hand-maintained JS port of enforce_exactly_one_owner()'s
 * tg_op branch plus its "checked only once, at commit" semantics, and of
 * transfer_organization_ownership's promote-then-demote sequence. This
 * repo has no live-Postgres harness (see this file's header caveat), so
 * this is NOT a Postgres emulator -- it exists solely to give items 1-7 of
 * the fix request real, executable proof (a thrown/not-thrown assertion,
 * not a regex match) rather than only reading the SQL text. Every branch
 * mirrored here is cross-checked against the actual SQL by the describe
 * block above and the earlier "exactly-one-owner" describe block; if the
 * SQL and this port ever diverge, only the SQL is authoritative -- this is
 * a regression guard for the LOGIC this migration intends, not a
 * substitute for applying it against a real Supabase project (see the
 * report's manual verification steps).
 */
interface OwnerModelRow {
  organizationId: string;
  userId: string;
  role: "owner" | "member";
}
type OwnerModelEvent =
  | { op: "INSERT"; row: OwnerModelRow }
  | { op: "UPDATE"; old: OwnerModelRow; new: OwnerModelRow }
  | { op: "DELETE"; old: OwnerModelRow };

/** Mirrors: `if tg_op = 'DELETE' then target_org_id := old.organization_id; else target_org_id := new.organization_id; end if;` */
function resolveTargetOrgId(event: OwnerModelEvent): string {
  if (event.op === "DELETE") return event.old.organizationId;
  if (event.op === "INSERT") return event.row.organizationId;
  return event.new.organizationId;
}

/** Mirrors the deferred constraint trigger: only evaluated once per touched organization, at "commit" -- never after each individual statement. */
function checkExactlyOneOwnerAtCommit(members: OwnerModelRow[], organizationsStillExisting: Set<string>, touchedOrgIds: Set<string>): void {
  for (const organizationId of touchedOrgIds) {
    if (!organizationsStillExisting.has(organizationId)) continue; // cascade-delete exception, mirrors 0010
    const owners = members.filter((m) => m.organizationId === organizationId && m.role === "owner");
    if (owners.length !== 1) {
      throw new Error(`Organization ${organizationId} must have exactly one owner (found ${owners.length}).`);
    }
  }
}

describe("0011 -- enforce_exactly_one_owner behavioral proof (hand-ported model, see comment above)", () => {
  it("1. INSERT resolves target_org_id from NEW, and the event carries no OLD at all to accidentally read", () => {
    const event: OwnerModelEvent = { op: "INSERT", row: { organizationId: "org-1", userId: "owner-1", role: "owner" } };
    expect(resolveTargetOrgId(event)).toBe("org-1");
    expect("old" in event).toBe(false);
  });

  it("2. DELETE resolves target_org_id from OLD, and the event carries no NEW at all to accidentally read", () => {
    const event: OwnerModelEvent = { op: "DELETE", old: { organizationId: "org-1", userId: "member-1", role: "member" } };
    expect(resolveTargetOrgId(event)).toBe("org-1");
    expect("new" in event).toBe(false);
  });

  it("3. UPDATE resolves target_org_id from NEW (both OLD and NEW are valid for UPDATE, but the row's organization_id is immutable -- 0009's own trigger -- so NEW is always the correct, current one)", () => {
    const event: OwnerModelEvent = {
      op: "UPDATE",
      old: { organizationId: "org-1", userId: "owner-1", role: "owner" },
      new: { organizationId: "org-1", userId: "owner-1", role: "member" },
    };
    expect(resolveTargetOrgId(event)).toBe("org-1");
  });

  it("4. deleting a normal member leaves exactly one owner -- no exception at commit", () => {
    const members: OwnerModelRow[] = [{ organizationId: "org-1", userId: "owner-1", role: "owner" }];
    const orgs = new Set(["org-1"]);
    expect(() => checkExactlyOneOwnerAtCommit(members, orgs, new Set(["org-1"]))).not.toThrow();
  });

  it("5. deleting the whole workspace (0010's cascade) skips enforcement entirely once the organization no longer exists", () => {
    // All members, including the owner, are gone -- and so is the org.
    const members: OwnerModelRow[] = [];
    const orgsStillExisting = new Set<string>(); // org-1 deleted
    expect(() => checkExactlyOneOwnerAtCommit(members, orgsStillExisting, new Set(["org-1"]))).not.toThrow();
  });

  it("6. ownership transfer (promote new owner, then demote old owner) commits with exactly one owner, even though it was briefly two mid-transaction", () => {
    const members: OwnerModelRow[] = [
      { organizationId: "org-1", userId: "owner-1", role: "owner" },
      { organizationId: "org-1", userId: "member-1", role: "member" },
    ];

    // Step 1: promote (mirrors transfer_organization_ownership's first UPDATE).
    members.find((m) => m.userId === "member-1")!.role = "owner";
    // Transiently TWO owners here -- not checked yet, because the deferred
    // trigger only evaluates once, at commit (mirrored by not calling
    // checkExactlyOneOwnerAtCommit between these two steps).
    expect(members.filter((m) => m.role === "owner")).toHaveLength(2);

    // Step 2: demote (mirrors the second UPDATE).
    members.find((m) => m.userId === "owner-1")!.role = "member";

    expect(() => checkExactlyOneOwnerAtCommit(members, new Set(["org-1"]), new Set(["org-1"]))).not.toThrow();
    const owners = members.filter((m) => m.role === "owner");
    expect(owners).toHaveLength(1);
    expect(owners[0].userId).toBe("member-1");
  });

  it("7. a second owner that is never corrected within the same transaction cannot persist -- the commit-time check throws", () => {
    const members: OwnerModelRow[] = [
      { organizationId: "org-1", userId: "owner-1", role: "owner" },
      { organizationId: "org-1", userId: "member-1", role: "member" },
    ];

    // A stray promotion with no compensating demotion -- e.g. a bug, or a
    // raw SQL edit bypassing the application's own transferOrganizationOwnership.
    members.find((m) => m.userId === "member-1")!.role = "owner";

    expect(() => checkExactlyOneOwnerAtCommit(members, new Set(["org-1"]), new Set(["org-1"]))).toThrow(/must have exactly one owner \(found 2\)/);
  });
});

describe("0011 -- leaves platform admin and unrelated schema completely untouched", () => {
  it("never references platform_admins", () => {
    expect(CODE_ONLY).not.toContain("platform_admins");
  });

  it("never touches templates/campaigns/fonts/organizations table structure", () => {
    expect(CODE_ONLY).not.toMatch(/alter table public\.(templates|campaigns|fonts|organizations)\b/);
  });

  it("does not modify 0007's prevent_last_owner_removal or 0010's cascade-delete logic -- this migration only adds new objects plus the two role-check replacements", () => {
    expect(CODE_ONLY).not.toContain("prevent_last_owner_removal");
  });
});
