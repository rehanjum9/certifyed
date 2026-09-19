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
