import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// This repo has NO live-Postgres integration harness (same caveat as
// 0007/0009's own migration tests) -- these are static assertions against
// the migration's SQL text, proving the intended shape of the replaced
// trigger function is present and the old behavior it must NOT weaken
// hasn't quietly regressed. They cannot substitute for actually applying
// this migration against a real Supabase/Postgres database and exercising
// the cascade-delete path for real -- see the manual verification steps
// this migration's author reported alongside it.
const MIGRATION_SQL = readFileSync(path.join(import.meta.dirname, "0010_allow_workspace_delete_cascade.sql"), "utf8");
const CODE_ONLY = MIGRATION_SQL.replace(/--.*$/gm, "");

describe("0010 -- prevent_last_owner_removal gains a cascade-delete exception, nothing else", () => {
  it("replaces the same function name PostgreSQL already has a trigger wired to, rather than a new function + new trigger", () => {
    expect(CODE_ONLY).toMatch(/create or replace function public\.prevent_last_owner_removal\(\)/);
    // No new trigger is created -- 0007's existing
    // organization_members_prevent_last_owner_removal trigger already
    // points at this function name/OID, so replacing the function body is
    // sufficient and no `create trigger` statement should appear here.
    expect(CODE_ONLY).not.toMatch(/create trigger/);
  });

  it("keeps the security definer / search_path hardening from 0007", () => {
    expect(CODE_ONLY).toMatch(/security definer/);
    expect(CODE_ONLY).toMatch(/set search_path = public/);
  });

  it("adds the cascade-delete exception, scoped to DELETE only", () => {
    expect(CODE_ONLY).toMatch(/if tg_op = 'DELETE' and not exists \(\s*select 1 from public\.organizations where id = target_org_id\s*\)\s*then/);
  });

  it("places the new exception before the remaining-owners count, and the count/exception logic itself is unchanged", () => {
    const exceptionIndex = CODE_ONLY.indexOf("not exists (");
    const countIndex = CODE_ONLY.indexOf("select count(*) into remaining_owners");
    expect(exceptionIndex).toBeGreaterThan(-1);
    expect(countIndex).toBeGreaterThan(-1);
    expect(exceptionIndex).toBeLessThan(countIndex);

    expect(CODE_ONLY).toContain("raise exception 'Cannot remove the last owner of an organization.'");
    expect(CODE_ONLY).toMatch(/where organization_id = target_org_id\s+and role = 'owner'\s+and id <> old\.id/);
  });

  it("still short-circuits non-owner DELETEs and no-op/non-owner role UPDATEs exactly as before", () => {
    expect(CODE_ONLY).toMatch(/if tg_op = 'DELETE' and old\.role <> 'owner' then\s*return old;/);
    expect(CODE_ONLY).toMatch(/if tg_op = 'UPDATE' and old\.role = new\.role then\s*return new;/);
    expect(CODE_ONLY).toMatch(/if tg_op = 'UPDATE' and old\.role <> 'owner' then\s*return new;/);
  });

  it("never references a client-controlled flag (e.g. a force parameter) -- the exception is a pure database-level fact", () => {
    expect(CODE_ONLY.toLowerCase()).not.toContain("force");
    expect(CODE_ONLY).not.toContain("current_setting");
  });

  it("does not touch organization_members' identity-immutability trigger/function at all", () => {
    expect(CODE_ONLY).not.toContain("prevent_membership_identity_change");
  });

  it("does not touch any table other than re-stating the function's own privilege grant", () => {
    expect(CODE_ONLY).not.toMatch(/alter table/);
    expect(CODE_ONLY).not.toMatch(/create table/);
  });

  it("revokes PUBLIC execute on the replaced function, same as 0007", () => {
    expect(CODE_ONLY).toMatch(/revoke all on function public\.prevent_last_owner_removal\(\) from public;/);
  });
});
