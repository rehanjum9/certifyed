import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// This repo has no live-Postgres integration harness (every other test
// exercises the TypeScript application layer against a mocked Supabase
// client -- see e.g. src/lib/organizations/organizations.test.ts). RLS
// policies, GRANT/REVOKE privileges, and trigger bodies can only be
// verified for real against an actual Postgres instance -- run the manual
// checklist in the migration hardening report against a staging Supabase
// project before relying on this migration as a security boundary.
//
// What these tests DO prove: the SQL text of 0007_organizations.sql
// actually contains the specific REVOKE/GRANT/policy/trigger statements
// this hardening pass requires, and does NOT contain the broad policy this
// pass removed. This is a regression guard -- it catches someone
// accidentally re-adding organization_members_write_admin, or dropping one
// of the REVOKE statements, in a future edit -- not a substitute for
// testing the applied migration's actual runtime behavior.
const MIGRATION_SQL = readFileSync(
  path.join(import.meta.dirname, "0007_organizations.sql"),
  "utf8",
);

/** Strips SQL line comments so a check can't accidentally match a statement described only in a comment (e.g. "-- do not grant update"). */
const CODE_ONLY = MIGRATION_SQL.replace(/--.*$/gm, "");

describe("0007_organizations.sql -- organization_members is not directly writable by authenticated clients", () => {
  it("keeps the SELECT member policy", () => {
    expect(CODE_ONLY).toMatch(
      /create policy organization_members_select_member on public\.organization_members\s+for select to authenticated\s+using \(public\.is_organization_member\(organization_id\)\)/,
    );
  });

  it("does not define the broad admin write-all policy anymore", () => {
    expect(CODE_ONLY).not.toContain("organization_members_write_admin");
    expect(CODE_ONLY).not.toMatch(/for all to authenticated[\s\S]*?organization_members/);
  });

  it("revokes everything from authenticated/anon/public before re-granting, rather than relying on defaults", () => {
    expect(CODE_ONLY).toContain(
      "revoke all on table public.organization_members from public, anon, authenticated;",
    );
  });

  it("grants ONLY select to authenticated -- never insert/update/delete", () => {
    expect(CODE_ONLY).toContain("grant select on table public.organization_members to authenticated;");
    // No grant statement mentioning organization_members + authenticated may
    // include insert/update/delete.
    const grantLines = CODE_ONLY.split("\n").filter(
      (line) => /grant /i.test(line) && /organization_members/.test(line) && /authenticated/.test(line),
    );
    for (const line of grantLines) {
      expect(line).not.toMatch(/\binsert\b/i);
      expect(line).not.toMatch(/\bupdate\b/i);
      expect(line).not.toMatch(/\bdelete\b/i);
    }
  });

  it("explicitly grants service_role full CRUD -- not left to implicit defaults", () => {
    expect(CODE_ONLY).toContain(
      "grant select, insert, update, delete on table public.organization_members to service_role;",
    );
  });
});

describe("0007_organizations.sql -- organizations is read-only for authenticated clients", () => {
  it("keeps the SELECT member policy", () => {
    expect(CODE_ONLY).toMatch(
      /create policy organizations_select_member on public\.organizations\s+for select to authenticated\s+using \(public\.is_organization_member\(id\)\)/,
    );
  });

  it("does not define an authenticated update policy anymore", () => {
    expect(CODE_ONLY).not.toContain("organizations_update_admin");
  });

  it("revokes everything from authenticated/anon/public before re-granting", () => {
    expect(CODE_ONLY).toContain("revoke all on table public.organizations from public, anon, authenticated;");
  });

  it("grants ONLY select to authenticated -- never insert/update/delete", () => {
    expect(CODE_ONLY).toContain("grant select on table public.organizations to authenticated;");
    const grantLines = CODE_ONLY.split("\n").filter(
      (line) => /grant /i.test(line) && /\borganizations\b/.test(line) && /authenticated/.test(line),
    );
    for (const line of grantLines) {
      expect(line).not.toMatch(/\binsert\b/i);
      expect(line).not.toMatch(/\bupdate\b/i);
      expect(line).not.toMatch(/\bdelete\b/i);
    }
  });

  it("explicitly grants service_role full CRUD -- not left to implicit defaults", () => {
    expect(CODE_ONLY).toContain("grant select, insert, update, delete on table public.organizations to service_role;");
  });
});

describe("0007_organizations.sql -- membership identity (organization_id, user_id) is immutable", () => {
  it("defines the identity-change guard trigger, firing on every UPDATE", () => {
    expect(CODE_ONLY).toMatch(
      /create trigger organization_members_prevent_identity_change\s+before update on public\.organization_members/,
    );
  });

  it("the trigger function rejects a changed organization_id", () => {
    expect(CODE_ONLY).toMatch(/if new\.organization_id <> old\.organization_id then\s+raise exception/);
  });

  it("the trigger function rejects a changed user_id", () => {
    expect(CODE_ONLY).toMatch(/if new\.user_id <> old\.user_id then\s+raise exception/);
  });

  it("does not restrict role changes -- only identity columns", () => {
    // The identity-guard function body must not itself block role changes;
    // only prevent_last_owner_removal is allowed to reject a role change.
    const fnMatch = CODE_ONLY.match(
      /create or replace function public\.prevent_membership_identity_change\(\)[\s\S]*?\$\$;/,
    );
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).not.toMatch(/new\.role/);
  });
});

describe("0007_organizations.sql -- last-owner protection is intact", () => {
  it("still defines prevent_last_owner_removal, firing on DELETE or a role-changing UPDATE", () => {
    expect(CODE_ONLY).toMatch(
      /create trigger organization_members_prevent_last_owner_removal\s+before delete or update of role on public\.organization_members/,
    );
  });

  it("still raises when the last owner would be removed", () => {
    expect(CODE_ONLY).toContain("raise exception 'Cannot remove the last owner of an organization.';");
  });

  it("the identity-immutability trigger is named to run before the last-owner trigger (Postgres fires same-event triggers in alphabetical name order)", () => {
    // "...identity_change" < "...last_owner_removal" alphabetically, so if
    // an UPDATE ever tried to change organization_id/role together, the
    // identity guard aborts the statement before the last-owner check's
    // own logic runs at all.
    expect("organization_members_prevent_identity_change" < "organization_members_prevent_last_owner_removal").toBe(true);
  });
});

describe("0007_organizations.sql -- trigger functions are not directly callable by application roles", () => {
  it("revokes PUBLIC execute on prevent_last_owner_removal", () => {
    expect(CODE_ONLY).toContain("revoke all on function public.prevent_last_owner_removal() from public;");
  });

  it("revokes PUBLIC execute on prevent_membership_identity_change", () => {
    expect(CODE_ONLY).toContain("revoke all on function public.prevent_membership_identity_change() from public;");
  });

  it("never grants authenticated or service_role direct EXECUTE on either trigger function (trigger firing needs no such grant)", () => {
    expect(CODE_ONLY).not.toMatch(/grant execute on function public\.prevent_last_owner_removal\(\)/);
    expect(CODE_ONLY).not.toMatch(/grant execute on function public\.prevent_membership_identity_change\(\)/);
  });
});

describe("0007_organizations.sql -- RLS helper functions remain correctly locked down", () => {
  it("is_organization_member and is_organization_admin are SECURITY DEFINER with an explicit search_path", () => {
    for (const fn of ["is_organization_member", "is_organization_admin"]) {
      const fnMatch = CODE_ONLY.match(new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?\\$\\$;`));
      expect(fnMatch).not.toBeNull();
      expect(fnMatch![0]).toMatch(/security definer/);
      expect(fnMatch![0]).toMatch(/set search_path = public/);
    }
  });

  it("revokes PUBLIC execute before granting to authenticated/service_role", () => {
    for (const fn of ["is_organization_member(uuid)", "is_organization_admin(uuid)", "is_platform_admin()"]) {
      expect(CODE_ONLY).toContain(`revoke all on function public.${fn} from public;`);
      expect(CODE_ONLY).toContain(`grant execute on function public.${fn} to authenticated, service_role;`);
    }
  });
});
