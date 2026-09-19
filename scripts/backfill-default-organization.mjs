// One-time migration script (architecture report, Stage C): creates a
// single "default" workspace owned by an existing operator account, and
// backfills every pre-existing templates/campaigns/fonts row's
// organization_id to it.
//
// Run with:
//   node --env-file=.env.local scripts/backfill-default-organization.mjs <ownerEmail> ["Workspace Name"]
//
// Requires:
//   - 0007_organizations.sql applied (organizations/organization_members tables)
//   - 0008_organization_ownership.sql applied (nullable organization_id columns)
//   - the given ownerEmail already exists as a Supabase Auth user
//     (this is your existing single-operator account, e.g. created via
//     scripts/create-operator.mjs before this phase)
//
// Safe to re-run: if a workspace already owns all existing rows, it
// reports zero remaining and exits cleanly rather than creating a second
// workspace.
//
// This is a migration script and must never GUESS where legacy data
// belongs -- if ownerEmail already owns more than one workspace, it
// refuses to pick one (see resolveTargetOrganization below) rather than
// silently choosing the first.
//
// After this script reports zero remaining NULL organization_id rows,
// apply 0009_enforce_organization_ownership.sql to make the column
// required and turn on real per-organization RLS. Do NOT apply 0009
// before this script has run successfully -- it will refuse (its own
// guard clause checks the same thing this script verifies at the end).
import { createClient } from "@supabase/supabase-js";

const [, , ownerEmail, workspaceNameArg] = process.argv;
if (!ownerEmail) {
  console.error(
    'Usage: node --env-file=.env.local scripts/backfill-default-organization.mjs <ownerEmail> ["Workspace Name"]',
  );
  process.exit(1);
}
const workspaceName = workspaceNameArg?.trim() || "Default Workspace";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. Fill in .env.local first, then run this again.",
  );
  process.exit(1);
}

const supabase = createClient(url, secretKey, { auth: { persistSession: false } });

/** Case-insensitive: Supabase Auth emails are stored as typed, not normalized, so a plain === match would miss e.g. "Owner@Club.example" vs "owner@club.example". */
async function findUserByEmail(targetEmail) {
  const target = targetEmail.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Failed to list users: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

const owner = await findUserByEmail(ownerEmail);
if (!owner) {
  console.error(`No Supabase Auth user found with email "${ownerEmail}". Double-check the address and try again.`);
  process.exit(1);
}

/**
 * Decides which workspace this run backfills into -- reusing one this
 * user already owns (safe re-run), creating a fresh one, or refusing
 * outright if the answer is ambiguous. A migration script must never
 * guess where legacy data belongs, so ">1 owned workspace" is a hard
 * abort, not a "pick the first one" -- unlike a normal app feature, there
 * is no user in the loop here to catch a wrong guess before it silently
 * reassigns real data.
 */
async function resolveTargetOrganization() {
  const { data: existingMemberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", owner.id)
    .eq("role", "owner");

  if (membershipError) {
    console.error("Failed to check existing memberships:", membershipError.message);
    process.exit(1);
  }

  if (existingMemberships && existingMemberships.length > 1) {
    const orgIds = existingMemberships.map((m) => m.organization_id);
    const { data: orgs, error: orgsError } = await supabase.from("organizations").select("id, name").in("id", orgIds);
    if (orgsError) {
      console.error(`Failed to load the ${orgIds.length} workspaces ${ownerEmail} already owns: ${orgsError.message}`);
      process.exit(1);
    }

    console.error(
      `ABORTING: ${ownerEmail} already owns ${existingMemberships.length} workspaces as "owner". ` +
        "This script refuses to guess which one legacy data belongs to.",
    );
    for (const org of orgs ?? []) {
      console.error(`  - "${org.name}" (id: ${org.id})`);
    }
    console.error(
      "Resolve this manually first: decide which workspace should receive the legacy templates/campaigns/fonts " +
        "(and, if any of the others are unintended/duplicate workspaces, remove or reassign them), then re-run " +
        "this script once the owner unambiguously owns exactly one workspace.",
    );
    process.exit(1);
  }

  if (existingMemberships && existingMemberships.length === 1) {
    const organizationId = existingMemberships[0].organization_id;
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", organizationId)
      .maybeSingle();

    if (orgError || !org) {
      console.error(`Failed to load the existing workspace (id: ${organizationId}): ${orgError?.message ?? "not found"}`);
      process.exit(1);
    }

    console.log(`${ownerEmail} already owns exactly one workspace -- reusing it instead of creating a new one.`);
    return { organizationId: org.id, organizationName: org.name, created: false };
  }

  // Zero owned workspaces: create one.
  const { data: org, error: createOrgError } = await supabase
    .from("organizations")
    .insert({ name: workspaceName, created_by: owner.id })
    .select()
    .single();

  if (createOrgError) {
    console.error("Failed to create the workspace:", createOrgError.message);
    process.exit(1);
  }

  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({ organization_id: org.id, user_id: owner.id, role: "owner" });

  if (memberError) {
    console.error(`Failed to add ${ownerEmail} as owner of the newly-created workspace: ${memberError.message}`);
    console.error(`Attempting to clean up the partially-created workspace (id: ${org.id}) so it isn't left orphaned...`);

    const { error: cleanupError } = await supabase.from("organizations").delete().eq("id", org.id);
    if (cleanupError) {
      console.error(`Cleanup ALSO failed: ${cleanupError.message}`);
      console.error(
        `The workspace "${workspaceName}" (id: ${org.id}) was created with NO owner and could not be removed automatically -- delete it manually before re-running this script.`,
      );
    } else {
      console.error("Cleanup succeeded: the orphaned workspace was removed. No changes were left behind.");
    }
    process.exit(1);
  }

  return { organizationId: org.id, organizationName: org.name, created: true };
}

const { organizationId, organizationName, created } = await resolveTargetOrganization();
if (created) {
  console.log(`Created workspace "${organizationName}" (id: ${organizationId}) owned by ${ownerEmail}.`);
}

async function countNull(table) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).is("organization_id", null);
  if (error) throw new Error(`Failed to count ${table}: ${error.message}`);
  return count ?? 0;
}

const before = {
  templates: await countNull("templates"),
  campaigns: await countNull("campaigns"),
  fonts: await countNull("fonts"),
};

// Pre-flight summary -- printed before anything is written. Never includes
// secrets (no keys/tokens; only the owner's own email, which they supplied
// on the command line, and workspace/row counts).
console.log("");
console.log("--- Backfill plan --------------------------------------------");
console.log(`Owner:      ${ownerEmail}`);
console.log(`Workspace:  "${organizationName}" (id: ${organizationId})`);
console.log(`Templates missing an organization: ${before.templates}`);
console.log(`Campaigns missing an organization: ${before.campaigns}`);
console.log(`Fonts missing an organization:      ${before.fonts}`);
console.log("----------------------------------------------------------------");
console.log("");

async function backfillTable(table) {
  const { data, error } = await supabase
    .from(table)
    .update({ organization_id: organizationId })
    .is("organization_id", null)
    .select("id");

  if (error) throw new Error(`Failed to backfill ${table}: ${error.message}`);
  return data?.length ?? 0;
}

const templatesUpdated = await backfillTable("templates");
const campaignsUpdated = await backfillTable("campaigns");
const fontsUpdated = await backfillTable("fonts");

console.log(`Backfilled ${templatesUpdated} template(s), ${campaignsUpdated} campaign(s), ${fontsUpdated} font(s) to this workspace.`);

const remaining = {
  templates: await countNull("templates"),
  campaigns: await countNull("campaigns"),
  fonts: await countNull("fonts"),
};
const totalRemaining = remaining.templates + remaining.campaigns + remaining.fonts;

console.log(
  `Verification -- rows still missing an organization_id: templates=${remaining.templates}, campaigns=${remaining.campaigns}, fonts=${remaining.fonts}`,
);

if (totalRemaining === 0) {
  console.log("All existing data now has an organization. You may apply 0009_enforce_organization_ownership.sql.");
} else {
  console.error("Some rows still have no organization_id -- do NOT apply 0009_enforce_organization_ownership.sql yet. Investigate and re-run this script.");
  process.exit(1);
}
