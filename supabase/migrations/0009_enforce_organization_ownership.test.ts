import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Same rationale/caveat as 0007_organizations.test.ts: this repo has no
// live-Postgres integration harness, so these are static assertions
// against the migration's SQL text -- a regression guard proving the
// expected REVOKE/GRANT/policy/trigger statements are present and the
// removed write policies don't quietly come back, not a substitute for
// testing the applied migration's actual runtime behavior against a real
// database.
const MIGRATION_SQL = readFileSync(
  path.join(import.meta.dirname, "0009_enforce_organization_ownership.sql"),
  "utf8",
);
const CODE_ONLY = MIGRATION_SQL.replace(/--.*$/gm, "");

const RESOURCE_TABLES = ["templates", "template_fields", "campaigns", "campaign_rows", "jobs", "fonts"];
/** organization_id lives directly on these three; the other three are children that inherit ownership through a parent FK. */
const OWNER_TABLES = ["templates", "campaigns", "fonts"];
const CHILD_TABLES = ["template_fields", "campaign_rows", "jobs"];

const REMOVED_WRITE_POLICIES = [
  "templates_write_member",
  "templates_update_member",
  "templates_delete_member",
  "template_fields_write_member",
  "campaigns_write_member",
  "campaigns_update_member",
  "campaigns_delete_member",
  "campaign_rows_write_member",
  "jobs_write_member",
  "fonts_write_member",
  "fonts_delete_member",
];

describe("0009 -- the opening NULL-organization_id guard and NOT NULL enforcement are preserved", () => {
  it("still refuses to continue if templates/campaigns/fonts have a NULL organization_id", () => {
    expect(CODE_ONLY).toMatch(/select 1 from public\.templates where organization_id is null/);
    expect(CODE_ONLY).toMatch(/select 1 from public\.campaigns where organization_id is null/);
    expect(CODE_ONLY).toMatch(/select 1 from public\.fonts where organization_id is null/);
    expect(CODE_ONLY).toContain("raise exception 'Refusing to enforce organization ownership");
  });

  it("still sets organization_id NOT NULL on all three owner tables", () => {
    for (const table of OWNER_TABLES) {
      expect(CODE_ONLY).toMatch(new RegExp(`alter table public\\.${table}\\s+alter column organization_id set not null;`));
    }
  });
});

describe("0009 -- authenticated resource access is read-only", () => {
  it("removed every write policy this hardening pass targeted", () => {
    for (const policyName of REMOVED_WRITE_POLICIES) {
      expect(CODE_ONLY).not.toContain(policyName);
    }
  });

  it("defines exactly one SELECT policy per resource table, and no other policy", () => {
    for (const table of RESOURCE_TABLES) {
      const policyMatches = [...CODE_ONLY.matchAll(new RegExp(`create policy (\\S+) on public\\.${table}\\b`, "g"))];
      expect(policyMatches).toHaveLength(1);
      expect(policyMatches[0][1]).toBe(`${table}_select_member`);
    }
  });

  it("every resource table's SELECT policy is declared 'for select' (never 'for all')", () => {
    for (const table of RESOURCE_TABLES) {
      const block = CODE_ONLY.match(new RegExp(`create policy ${table}_select_member on public\\.${table}[\\s\\S]*?;`));
      expect(block).not.toBeNull();
      expect(block![0]).toMatch(/for select to authenticated/);
    }
  });

  it("grants authenticated ONLY select on every resource table -- never insert/update/delete", () => {
    for (const table of RESOURCE_TABLES) {
      expect(CODE_ONLY).toContain(`grant select on table public.${table} to authenticated;`);
      const grantLines = CODE_ONLY.split("\n").filter(
        (line) => /grant /i.test(line) && new RegExp(`\\bpublic\\.${table}\\b`).test(line) && /authenticated/.test(line),
      );
      for (const line of grantLines) {
        expect(line).not.toMatch(/\binsert\b/i);
        expect(line).not.toMatch(/\bupdate\b/i);
        expect(line).not.toMatch(/\bdelete\b/i);
      }
    }
  });

  it("revokes everything from public/anon/authenticated before re-granting, for every resource table", () => {
    for (const table of RESOURCE_TABLES) {
      expect(CODE_ONLY).toContain(`revoke all on table public.${table} from public, anon, authenticated;`);
    }
  });
});

describe("0009 -- service_role retains the CRUD it needs", () => {
  it("explicitly grants service_role full CRUD on every resource table -- not left to implicit defaults", () => {
    for (const table of RESOURCE_TABLES) {
      expect(CODE_ONLY).toContain(`grant select, insert, update, delete on table public.${table} to service_role;`);
    }
  });
});

describe("0009 -- organization_id is immutable on templates/campaigns/fonts", () => {
  it("defines the shared prevent_organization_id_change() trigger function, firing on UPDATE, rejecting a changed value", () => {
    const fnMatch = CODE_ONLY.match(/create or replace function public\.prevent_organization_id_change\(\)[\s\S]*?\$\$;/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(/if new\.organization_id <> old\.organization_id then\s+raise exception/);
  });

  it("does not interfere with INSERT -- the trigger only fires before UPDATE", () => {
    const triggerBlocks = [...CODE_ONLY.matchAll(/create trigger \S+_prevent_organization_id_change\s+before (\w+) on public\.\w+/g)];
    expect(triggerBlocks.length).toBeGreaterThan(0);
    for (const match of triggerBlocks) {
      expect(match[1]).toBe("update");
    }
  });

  it.each(OWNER_TABLES)("attaches the immutability trigger to %s", (table) => {
    expect(CODE_ONLY).toMatch(
      new RegExp(`create trigger ${table}_prevent_organization_id_change\\s+before update on public\\.${table}\\s+for each row execute function public\\.prevent_organization_id_change\\(\\);`),
    );
  });

  it("does NOT attach the immutability trigger to any child table (they have no organization_id column at all)", () => {
    for (const table of CHILD_TABLES) {
      expect(CODE_ONLY).not.toContain(`${table}_prevent_organization_id_change`);
    }
  });

  it("revokes PUBLIC execute on the trigger function (trigger firing needs no such grant)", () => {
    expect(CODE_ONLY).toContain("revoke all on function public.prevent_organization_id_change() from public;");
    expect(CODE_ONLY).not.toMatch(/grant execute on function public\.prevent_organization_id_change\(\)/);
  });
});

describe("0009 -- cross-org SELECT stays blocked for owner tables", () => {
  it.each(OWNER_TABLES)("%s's SELECT policy checks organization membership via is_organization_member", (table) => {
    const block = CODE_ONLY.match(new RegExp(`create policy ${table}_select_member on public\\.${table}[\\s\\S]*?;`));
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/using \(public\.is_organization_member\(organization_id\)\)/);
  });
});

describe("0009 -- child tables still inherit ownership through their parent correctly", () => {
  it("template_fields' SELECT policy joins to templates and checks the parent's organization membership", () => {
    const block = CODE_ONLY.match(/create policy template_fields_select_member on public\.template_fields[\s\S]*?;/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/from public\.templates t/);
    expect(block![0]).toMatch(/t\.id = template_fields\.template_id/);
    expect(block![0]).toMatch(/is_organization_member\(t\.organization_id\)/);
  });

  it("campaign_rows' SELECT policy joins to campaigns and checks the parent's organization membership", () => {
    const block = CODE_ONLY.match(/create policy campaign_rows_select_member on public\.campaign_rows[\s\S]*?;/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/from public\.campaigns c/);
    expect(block![0]).toMatch(/c\.id = campaign_rows\.campaign_id/);
    expect(block![0]).toMatch(/is_organization_member\(c\.organization_id\)/);
  });

  it("jobs' SELECT policy joins to campaigns and checks the parent's organization membership", () => {
    const block = CODE_ONLY.match(/create policy jobs_select_member on public\.jobs[\s\S]*?;/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/from public\.campaigns c/);
    expect(block![0]).toMatch(/c\.id = jobs\.campaign_id/);
    expect(block![0]).toMatch(/is_organization_member\(c\.organization_id\)/);
  });

  it("no child table gained its own organization_id column or a redundant policy", () => {
    for (const table of CHILD_TABLES) {
      expect(CODE_ONLY).not.toMatch(new RegExp(`alter table public\\.${table}\\s+add column organization_id`));
    }
  });
});

describe("0009 -- platform admin status never bypasses workspace membership", () => {
  it("no policy in this migration references is_platform_admin", () => {
    expect(CODE_ONLY).not.toContain("is_platform_admin");
  });

  it("every SELECT policy's predicate is membership-based (is_organization_member), with no OR'd-in bypass", () => {
    for (const table of RESOURCE_TABLES) {
      const block = CODE_ONLY.match(new RegExp(`create policy ${table}_select_member on public\\.${table}[\\s\\S]*?;`));
      expect(block).not.toBeNull();
      expect(block![0]).not.toMatch(/\bor\b/i);
    }
  });
});
